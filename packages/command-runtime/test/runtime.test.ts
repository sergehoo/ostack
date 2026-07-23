import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MockProvider, type ModelProvider } from "@ostack/core";
import {
  CommandTimeoutError,
  JsonLinesCommandRunJournal,
  buildExecutionContext,
  discoverCommands,
  executeCommand,
  hashText,
  loadAssociatedResources,
  resolveCommand,
  validateCommandInput
} from "../src/index.js";

test("discovers project and domain-pack commands and resolves aliases without hiding collisions", async () => {
  const root = await project();
  await command(root, ".ostack/commands/review.md", `---
description: Project review
aliases: [project-check]
---
# Review
Inspect the project.
`);
  await command(root, "domain-packs/finance/commands/review.md", `---
description: Finance review
aliases: [portfolio-check]
---
# Finance review
Inspect finance invariants.
`);

  const catalog = await discoverCommands(root);
  assert.deepEqual(catalog.commands.map((item) => item.name), ["finance:review", "review"]);
  assert.equal(resolveCommand(catalog, "project-check").name, "review");
  assert.equal(resolveCommand(catalog, "/ostack:portfolio-check").name, "finance:review");
  assert.equal(resolveCommand(catalog, "finance:review").scope, "domain-pack");
  assert.ok(catalog.collisions.some((collision) => collision.query === "review"));
  assert.throws(() => resolveCommand(catalog, "review"), /Ambiguous/);
});

test("preserves bracketed assistant argument hints as text", async () => {
  const root = await project();
  await command(root, ".ostack/commands/gate.md", `---
description: Gate
argument-hint: [--gate]
---
# Gate
`);
  const definition = resolveCommand(await discoverCommands(root), "gate");
  assert.equal(definition.argumentHint, "[--gate]");
});

test("loads explicitly associated resources from the command pack and project fallback", async () => {
  const root = await project();
  await command(root, ".ostack/domains/payments/commands/verify.md", `---
agents: [reviewer]
standards: [money]
policies: [security]
workflows: [settlement]
input-required: true
input-max-chars: 20
input-pattern: ^PAY-
---
# Verify payment
Verify the supplied payment identifier.
`);
  await file(root, ".ostack/domains/payments/agents/reviewer.md", "# Reviewer");
  await file(root, ".ostack/standards/money.json", JSON.stringify({ id: "money" }));
  await file(root, ".ostack/policies/security.json", JSON.stringify({ id: "security" }));
  await file(root, ".ostack/workflows/settlement.json", JSON.stringify({ id: "settlement" }));

  const definition = resolveCommand(await discoverCommands(root), "payments:verify");
  const resources = await loadAssociatedResources(root, definition);
  assert.equal(resources.length, 4);
  assert.deepEqual(resources.map((item) => item.kind), ["agents", "standards", "policies", "workflows"]);
  validateCommandInput(definition, "PAY-123");
  assert.throws(() => validateCommandInput(definition, ""), /requires --input/);
  assert.throws(() => validateCommandInput(definition, "BAD-123"), /declared pattern/);
});

test("rejects invalid metadata and missing resources", async () => {
  const root = await project();
  await command(root, ".ostack/commands/unsafe.md", `---
agents: [../secret]
---
Unsafe
`);
  await assert.rejects(discoverCommands(root), /Invalid agents resource/);

  const second = await project();
  await command(second, ".ostack/commands/missing.md", `---
policies: [missing]
---
Missing
`);
  const definition = resolveCommand(await discoverCommands(second), "missing");
  await assert.rejects(loadAssociatedResources(second, definition), /was not found/);

  const third = await project();
  await command(third, ".ostack/commands/extension.md", `---
agents: [credentials.env]
---
Extension
`);
  const unsafeExtension = resolveCommand(await discoverCommands(third), "extension");
  await assert.rejects(loadAssociatedResources(third, unsafeExtension), /Unsupported agents resource extension/);
});

test("builds a structured context and executes through the provider port", async () => {
  const root = await project();
  await command(root, ".ostack/commands/explain.md", "# Explain\nExplain the input.");
  const definition = resolveCommand(await discoverCommands(root), "explain");
  const context = buildExecutionContext({
    runId: "run-1",
    project: { id: "test", name: "Test", root: "." },
    command: definition,
    input: "hello",
    resources: [],
    now: "2026-01-01T00:00:00.000Z"
  });
  const result = await executeCommand(context, new MockProvider(), 1_000);
  assert.equal(result.response.provider, "mock");
  assert.match(result.response.content, /explain/);
});

test("bounds execution with a runtime timeout", async () => {
  let providerSignal: AbortSignal | undefined;
  const provider: ModelProvider = {
    id: "never",
    async isAvailable() { return true; },
    async complete(request) {
      providerSignal = request.signal;
      return new Promise(() => undefined);
    }
  };
  const root = await project();
  await command(root, ".ostack/commands/wait.md", "# Wait");
  const definition = resolveCommand(await discoverCommands(root), "wait");
  const context = buildExecutionContext({
    runId: "run-timeout",
    project: { id: "test", name: "Test", root: "." },
    command: definition,
    input: "",
    resources: []
  });
  await assert.rejects(executeCommand(context, provider, 100), CommandTimeoutError);
  assert.equal(providerSignal?.aborted, true);
});

test("journals hashes and sanitized metadata without persisting command input", async () => {
  const root = await project();
  const path = join(root, ".ostack/runs/commands.jsonl");
  const journal = new JsonLinesCommandRunJournal(path);
  await journal.append({
    schemaVersion: 1,
    runId: "run-journal",
    projectId: "project",
    command: "review",
    status: "failed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1_000,
    inputChars: 16,
    inputHash: hashText("top-secret-value"),
    error: "Bearer token-sensitive-value"
  });
  const raw = await readFile(path, "utf8");
  assert.doesNotMatch(raw, /top-secret-value/);
  assert.doesNotMatch(raw, /token-sensitive-value/);
  assert.match(raw, /REDACTED/);
  assert.equal((await journal.list())[0]?.status, "failed");
});

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ostack-command-runtime-"));
}

async function command(root: string, path: string, content: string): Promise<void> {
  return file(root, path, content);
}

async function file(root: string, path: string, content: string): Promise<void> {
  const absolute = join(root, path);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content, "utf8");
}
