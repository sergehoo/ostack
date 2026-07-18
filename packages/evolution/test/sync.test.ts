import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { pullFastForward, pushResources, syncStatus } from "../src/index.js";

const run = promisify(execFile);

async function commit(cwd: string, file: string, content: string, message: string): Promise<void> {
  await mkdir(dirname(join(cwd, file)), { recursive: true });
  await writeFile(join(cwd, file), content);
  await run("git", ["add", file], { cwd });
  await run("git", ["-c", "user.name=T", "-c", "user.email=t@e.org", "commit", "-m", message], { cwd });
}

// A bare remote + two clones simulates real pull/push without any network.
async function setup(): Promise<{ remote: string; a: string; b: string }> {
  const remote = await mkdtemp(join(tmpdir(), "ostack-know-remote-"));
  await run("git", ["init", "--bare", "-b", "main", remote], { cwd: remote });
  const a = await mkdtemp(join(tmpdir(), "ostack-know-a-"));
  await run("git", ["clone", remote, a], { cwd: a });
  await run("git", ["config", "user.name", "A"], { cwd: a });
  await run("git", ["config", "user.email", "a@e.org"], { cwd: a });
  await commit(a, "patterns/seed.md", "# seed\n", "seed");
  await run("git", ["push", "-u", "origin", "main"], { cwd: a });
  const b = await mkdtemp(join(tmpdir(), "ostack-know-b-"));
  await run("git", ["clone", remote, b], { cwd: b });
  return { remote, a, b };
}

test("status reports branch, cleanliness and ahead/behind against upstream", async () => {
  const { a } = await setup();
  const status = await syncStatus(a);
  assert.equal(status.isRepo, true);
  assert.equal(status.branch, "main");
  assert.equal(status.clean, true);
  assert.equal(status.ahead, 0);
});

test("pull is fast-forward-only: picks up remote commits, never merges a divergence", async () => {
  const { a, b } = await setup();
  // A publishes a new lesson
  await commit(a, "lessons/l1.md", "# lesson\n", "add lesson");
  await pushResources(a, "main");
  // B pulls it fast-forward
  const pulled = await pullFastForward(b, "origin", "main");
  assert.equal(pulled.pulled, true);
  const behind = (await syncStatus(b)).behind;
  assert.equal(behind, 0);

  // Now both diverge: A and B each commit; B cannot fast-forward
  await commit(a, "lessons/l2.md", "# a2\n", "a2");
  await pushResources(a, "main");
  await commit(b, "lessons/l3.md", "# b3\n", "b3");
  const diverged = await pullFastForward(b, "origin", "main");
  assert.equal(diverged.pulled, false, "diverged branch is not silently merged");
  assert.match(diverged.note ?? "", /fast-forward/);
});

test("knowledge push targets the configured branch (may be main of the dedicated repo); malformed names refused, never force", async () => {
  const { a } = await setup();
  await commit(a, "patterns/p.md", "# p\n", "add pattern");
  await pushResources(a, "main"); // the knowledge repo's own main is the intended target (§20)
  assert.equal((await syncStatus(a)).ahead, 0);
  await assert.rejects(pushResources(a, "--force"), /invalide/);
  await assert.rejects(pushResources(a, "refs/heads/x;rm"), /invalide/);
});

test("pull refuses a dirty working tree rather than clobbering local changes", async () => {
  const { b } = await setup();
  await writeFile(join(b, "patterns/seed.md"), "# locally modified\n");
  const result = await pullFastForward(b, "origin", "main");
  assert.equal(result.pulled, false);
  assert.match(result.note ?? "", /non propre/);
});
