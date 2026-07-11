import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initializeConfig } from "../src/config.js";
import { runInstall } from "../src/install.js";

interface InstallResult { status: string; assistant: string; installed: string[]; skipped?: string[]; agentsFile: string; }

test("install refuses a non-initialized project", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-install-none-"));
  await assert.rejects(runInstall({ cwd: root, args: ["--assistant", "claude"], json: true }), /ostack init/);
});

test("install deposits commands, agents, skill, standards and workflows for Claude Code", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-install-claude-"));
  await initializeConfig(root, "Test");
  const result = await runInstall({ cwd: root, args: ["--assistant", "claude"], json: true }) as InstallResult;
  assert.equal(result.status, "installed");
  assert.ok(result.installed.length >= 25, `attendu ≥25 fichiers, obtenu ${result.installed.length}`);

  const commands = await readdir(join(root, ".claude/commands/ostack"));
  assert.ok(commands.includes("prove.md") && commands.includes("intent-compile.md"));
  const agents = await readdir(join(root, ".claude/agents"));
  assert.ok(agents.includes("adversarial-reviewer.md") && agents.includes("release-arbiter.md"));
  assert.ok((await readdir(join(root, ".claude/skills/ostack"))).includes("ostack-method.md"));
  assert.ok((await readdir(join(root, ".ostack/standards"))).length >= 3);

  const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /OStack — Verified Engineering/);
});

test("re-running is idempotent: files skipped, preamble not duplicated; --force overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-install-idem-"));
  await initializeConfig(root, "Test");
  await runInstall({ cwd: root, args: ["--assistant", "claude"], json: true });
  const second = await runInstall({ cwd: root, args: ["--assistant", "claude"], json: true }) as InstallResult;
  assert.equal(second.installed.length, 0);
  assert.ok((second.skipped?.length ?? 0) >= 25);
  const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8");
  assert.equal(claudeMd.match(/OStack — Verified Engineering/g)?.length, 1, "préambule ajouté une seule fois");

  const forced = await runInstall({ cwd: root, args: ["--assistant", "claude", "--force"], json: true }) as InstallResult;
  assert.ok(forced.installed.length >= 25, "--force réécrit les fichiers");
});

test("the codex target uses AGENTS.md and .ostack/, not .claude/", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-install-codex-"));
  await initializeConfig(root, "Test");
  const result = await runInstall({ cwd: root, args: ["--assistant", "codex"], json: true }) as InstallResult;
  assert.equal(result.agentsFile, "AGENTS.md");
  assert.ok((await readdir(join(root, ".ostack/commands"))).includes("prove.md"));
  await assert.rejects(readdir(join(root, ".claude")), /ENOENT/);
});

test("an unknown assistant is rejected; an existing AGENTS.md is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-install-x-"));
  await initializeConfig(root, "Test");
  await assert.rejects(runInstall({ cwd: root, args: ["--assistant", "vim"], json: true }), /claude, cursor ou codex/);
  await writeFile(join(root, "AGENTS.md"), "# Mes règles à moi\n", "utf8");
  await runInstall({ cwd: root, args: ["--assistant", "codex"], json: true });
  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Mes règles à moi/, "le contenu existant est conservé");
  assert.match(agents, /OStack — Verified Engineering/, "le préambule est ajouté");
});
