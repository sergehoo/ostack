import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeConfig } from "../src/config.js";
import { runExecute, runInspect, runList } from "../src/command-runtime.js";
import { runInstall } from "../src/install.js";
import { runAllSkills } from "../src/run-all.js";

test("assistant installations expose the same canonical commands to the runtime", async () => {
  for (const assistant of ["claude", "cursor", "codex"]) {
    const root = await mkdtemp(join(tmpdir(), `ostack-cli-runtime-${assistant}-`));
    await initializeConfig(root, `Runtime ${assistant}`);
    await runInstall({ cwd: root, args: ["--assistant", assistant], json: true });
    const listed = await runList({ cwd: root, args: [], json: true }) as { total: number };
    assert.ok(listed.total >= 14, `${assistant} must install canonical commands`);
    assert.match(await readFile(join(root, ".ostack/commands/run-all.md"), "utf8"), /ostack run-all/);
    assert.match(await readFile(join(root, ".ostack/skills/ostack-method.md"), "utf8"), /Verified Engineering/);
  }
});

test("CLI run-all previews all project skills and executes them in one provider call", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-run-all-"));
  await initializeConfig(root, "Runtime All Skills");
  await mkdir(join(root, ".ostack/skills"), { recursive: true });
  await writeFile(join(root, ".ostack/skills/method.md"), "---\nname: method\n---\n# Method\nVerify the result.");
  await writeFile(join(root, ".ostack/skills/security.md"), "---\nname: security\n---\n# Security\nProtect secrets.");

  const secret = "all-skills-private-objective";
  const preview = await runAllSkills({
    cwd: root,
    args: ["--input", secret],
    json: true
  }) as {
    status: string;
    totalSkills: number;
    context: { objective: { value: string }; skills: Array<{ name: string }> };
  };
  assert.equal(preview.status, "dry_run");
  assert.equal(preview.totalSkills, 2);
  assert.equal(preview.context.objective.value, secret);
  assert.deepEqual(preview.context.skills.map((skill) => skill.name), ["method", "security"]);

  const executed = await runAllSkills({
    cwd: root,
    args: ["--input", "Review the project", "--execute", "--provider", "mock"],
    json: true
  }) as { status: string; mode: string; provider: string; totalSkills: number; output: string };
  assert.equal(executed.status, "succeeded");
  assert.equal(executed.mode, "all_skills");
  assert.equal(executed.provider, "mock");
  assert.equal(executed.totalSkills, 2);
  assert.match(executed.output, /Mock response/);

  const journal = await readFile(join(root, ".ostack/runs/commands.jsonl"), "utf8");
  assert.match(journal, /"command":"run-all"/);
  assert.doesNotMatch(journal, new RegExp(secret));
  const audit = await readFile(join(root, ".ostack/audit.jsonl"), "utf8");
  assert.match(audit, /skills\.run_all/);
});

test("CLI run-all makes domain skills explicit and validates execution options", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-run-all-domain-"));
  await initializeConfig(root, "Runtime All Skills Domain");
  await mkdir(join(root, ".ostack/skills"), { recursive: true });
  await mkdir(join(root, "domain-packs/finance/skills"), { recursive: true });
  await writeFile(join(root, ".ostack/skills/method.md"), "---\nname: method\n---\n# Method");
  await writeFile(join(root, "domain-packs/finance/skills/money.md"), "---\nname: money\n---\n# Money");

  const selected = await runAllSkills({
    cwd: root,
    args: ["--input", "Review", "--domain", "finance"],
    json: true
  }) as { totalSkills: number; selectedDomains: string[] };
  assert.equal(selected.totalSkills, 2);
  assert.deepEqual(selected.selectedDomains, ["finance"]);

  await assert.rejects(
    runAllSkills({ cwd: root, args: ["--input", "Review", "--provider", "mock"], json: true }),
    /--provider requires --execute/
  );
  await assert.rejects(
    runAllSkills({ cwd: root, args: ["--input", "Review", "--execute", "--dry-run"], json: true }),
    /cannot be used together/
  );
  await assert.rejects(
    runAllSkills({ cwd: root, args: [], json: true }),
    /Usage: ostack run-all/
  );
});

test("canonical command installation can be rolled back without deleting pre-existing project files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-runtime-rollback-"));
  await initializeConfig(root, "Runtime Rollback");
  await mkdir(join(root, ".ostack/commands"), { recursive: true });
  await writeFile(join(root, ".ostack/commands/project-owned.md"), "# Project-owned command\n");
  await writeFile(join(root, "AGENTS.md"), "# Project instructions\n");
  const beforeAgents = await readFile(join(root, "AGENTS.md"), "utf8");

  const installed = await runInstall({
    cwd: root,
    args: ["--assistant", "codex"],
    json: true
  }) as { installed: string[] };
  assert.ok(installed.installed.includes(".ostack/commands/prove.md"));

  for (const path of [...installed.installed].reverse()) {
    await rm(join(root, path), { force: true });
  }
  await writeFile(join(root, "AGENTS.md"), beforeAgents);

  assert.equal(
    await readFile(join(root, ".ostack/commands/project-owned.md"), "utf8"),
    "# Project-owned command\n"
  );
  await assert.rejects(readFile(join(root, ".ostack/commands/prove.md"), "utf8"), /ENOENT/);
  assert.equal(await readFile(join(root, "AGENTS.md"), "utf8"), beforeAgents);
  assert.match(await readFile(join(root, ".ostack/config.json"), "utf8"), /runtime-rollback/);
});

test("CLI lists, inspects, dry-runs and executes installed commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-runtime-"));
  await initializeConfig(root, "Runtime CLI");
  await mkdir(join(root, ".ostack/commands"), { recursive: true });
  await mkdir(join(root, ".ostack/policies"), { recursive: true });
  await writeFile(join(root, ".ostack/policies/security.json"), JSON.stringify({ version: "1", rules: [] }));
  await writeFile(join(root, ".ostack/commands/review.md"), `---
description: Review a project
aliases: [check-project]
policies: [security]
input-required: true
---
# Review
Review the supplied objective.
`);

  const listed = await runList({ cwd: root, args: [], json: true }) as { total: number; commands: Array<{ name: string }> };
  assert.equal(listed.total, 1);
  assert.equal(listed.commands[0]?.name, "review");

  const inspected = await runInspect({ cwd: root, args: ["check-project"], json: true }) as {
    command: { name: string };
    resources: Array<{ kind: string }>;
  };
  assert.equal(inspected.command.name, "review");
  assert.equal(inspected.resources[0]?.kind, "policies");

  const dry = await runExecute({
    cwd: root,
    args: ["review", "--input", "Keep compatibility", "--dry-run"],
    json: true
  }) as { status: string; context: { input: { value: string } } };
  assert.equal(dry.status, "dry_run");
  assert.equal(dry.context.input.value, "Keep compatibility");

  const secret = "private-runtime-input";
  const executed = await runExecute({
    cwd: root,
    args: ["check-project", "--input", secret, "--provider", "mock"],
    json: true
  }) as { status: string; provider: string; output: string };
  assert.equal(executed.status, "succeeded");
  assert.equal(executed.provider, "mock");
  assert.match(executed.output, /Mock response/);

  const journal = await readFile(join(root, ".ostack/runs/commands.jsonl"), "utf8");
  assert.match(journal, /dry_run/);
  assert.match(journal, /succeeded/);
  assert.doesNotMatch(journal, new RegExp(secret));
  const audit = await readFile(join(root, ".ostack/audit.jsonl"), "utf8");
  assert.match(audit, /command\.run/);
});

test("CLI validates required input, rejects unknown options and contains @file input", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-runtime-validation-"));
  await initializeConfig(root, "Runtime Validation");
  await mkdir(join(root, ".ostack/commands"), { recursive: true });
  await writeFile(join(root, ".ostack/commands/required.md"), `---
input-required: true
---
# Required
`);
  await assert.rejects(
    runExecute({ cwd: root, args: ["required", "--dry-run"], json: true }),
    /requires --input/
  );
  await assert.rejects(
    runExecute({ cwd: root, args: ["required", "--unknown"], json: true }),
    /Unknown option/
  );
  await assert.rejects(
    runExecute({ cwd: root, args: ["required", "--input", "@/etc/hosts", "--dry-run"], json: true }),
    /inside the project/
  );
});
