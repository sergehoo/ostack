import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { applyUpdate, checkForUpdates, createRestorePoint, isClean, rollbackTo } from "../src/index.js";

const run = promisify(execFile);

async function commit(cwd: string, file: string, content: string, message: string): Promise<string> {
  await mkdir(dirname(join(cwd, file)), { recursive: true });
  await writeFile(join(cwd, file), content);
  await run("git", ["add", file], { cwd });
  await run("git", ["-c", "user.name=T", "-c", "user.email=t@e.org", "commit", "-m", message], { cwd });
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

// A publisher clone pushes updates to a bare remote; the "installation" clone
// checks, updates and rolls back — real git, no network.
async function setup(): Promise<{ install: string; publisher: string }> {
  const remote = await mkdtemp(join(tmpdir(), "ostack-upd-remote-"));
  await run("git", ["init", "--bare", "-b", "main", remote], { cwd: remote });
  const publisher = await mkdtemp(join(tmpdir(), "ostack-upd-pub-"));
  await run("git", ["clone", remote, publisher], { cwd: publisher });
  await run("git", ["config", "user.name", "P"], { cwd: publisher });
  await run("git", ["config", "user.email", "p@e.org"], { cwd: publisher });
  await commit(publisher, "VERSION", "0.1.0\n", "v0.1.0");
  await run("git", ["push", "-u", "origin", "main"], { cwd: publisher });
  const install = await mkdtemp(join(tmpdir(), "ostack-upd-inst-"));
  await run("git", ["clone", remote, install], { cwd: install });
  return { install, publisher };
}

test("check detects an available update after the publisher pushes", async () => {
  const { install, publisher } = await setup();
  assert.equal((await checkForUpdates(install)).updatesAvailable, false);
  await commit(publisher, "VERSION", "0.2.0\n", "v0.2.0");
  await run("git", ["push", "origin", "main"], { cwd: publisher });
  const check = await checkForUpdates(install);
  assert.equal(check.updatesAvailable, true);
  assert.equal(check.behind, 1);
});

test("update fast-forwards, and rollback restores the exact restore point", async () => {
  const { install, publisher } = await setup();
  const restorePoint = await createRestorePoint(install);
  await commit(publisher, "skills/new.md", "# new\n", "add skill");
  await run("git", ["push", "origin", "main"], { cwd: publisher });

  const result = await applyUpdate(install);
  assert.equal(result.applied, true);
  assert.notEqual(result.to, restorePoint);
  const { stdout: afterFiles } = await run("git", ["ls-files"], { cwd: install });
  assert.match(afterFiles, /skills\/new\.md/);

  // Rollback to the recorded restore point removes the update.
  await rollbackTo(install, restorePoint);
  assert.equal((await run("git", ["rev-parse", "HEAD"], { cwd: install })).stdout.trim(), restorePoint);
  const { stdout: rolledFiles } = await run("git", ["ls-files"], { cwd: install });
  assert.doesNotMatch(rolledFiles, /skills\/new\.md/);
});

test("a dirty working tree blocks the update; rollback refuses an unknown commit", async () => {
  const { install } = await setup();
  await writeFile(join(install, "VERSION"), "tampered\n");
  assert.equal(await isClean(install), false);
  await assert.rejects(applyUpdate(install), /non propre/);
  await assert.rejects(rollbackTo(install, "deadbeef"), /introuvable/);
  await assert.rejects(rollbackTo(install, "zzz"), /invalide/);
});
