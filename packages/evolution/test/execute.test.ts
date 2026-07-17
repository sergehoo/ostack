import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { applyLocalCommit, isGitRepo, pushBranch } from "../src/index.js";

const run = promisify(execFile);

async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ostack-evo-git-"));
  await run("git", ["init", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.name", "Test"], { cwd: root });
  await run("git", ["config", "user.email", "test@example.org"], { cwd: root });
  await writeFile(join(root, "README.md"), "# seed\n");
  await run("git", ["add", "README.md"], { cwd: root });
  await run("git", ["-c", "user.name=Seed", "-c", "user.email=seed@example.org", "commit", "-m", "seed"], { cwd: root });
  return root;
}

test("applyLocalCommit creates the evolution branch and commits only explicit paths, with the bot identity", async () => {
  const root = await tempRepo();
  await mkdir(join(root, "skills", "cli"), { recursive: true });
  await writeFile(join(root, "skills/cli/idempotent.md"), "# skill\n");
  await writeFile(join(root, "untouched.txt"), "should not be committed\n");

  const result = await applyLocalCommit({
    cwd: root,
    branch: "ostack/evolution/les-1",
    changedPaths: ["skills/cli/idempotent.md"],
    commitMessage: "feat(skill): add idempotent skill\n\nbody\n\nOStack-Evolution-ID: LES-1"
  });
  assert.equal(result.branch, "ostack/evolution/les-1");
  assert.equal(result.commit.length, 40);

  // On the new branch
  const { stdout: branch } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
  assert.equal(branch.trim(), "ostack/evolution/les-1");
  // Only the explicit file is committed; the untracked file stays untracked
  const { stdout: files } = await run("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: root });
  assert.match(files, /skills\/cli\/idempotent\.md/);
  assert.doesNotMatch(files, /untouched\.txt/);
  // Committed by the bot identity
  const { stdout: author } = await run("git", ["show", "--format=%an <%ae>", "--no-patch", "HEAD"], { cwd: root });
  assert.match(author.trim(), /OStack Evolution Bot <ostack-bot@users\.noreply\.github\.com>/);
});

test("refuses non-evolution branch names, empty paths, and non-repos", async () => {
  const root = await tempRepo();
  await assert.rejects(applyLocalCommit({ cwd: root, branch: "main", changedPaths: ["x"], commitMessage: "m" }), /invalide/);
  await assert.rejects(applyLocalCommit({ cwd: root, branch: "ostack/evolution/x", changedPaths: [], commitMessage: "m" }), /Aucun chemin/);
  await assert.rejects(applyLocalCommit({ cwd: root, branch: "ostack/evolution/x", changedPaths: ["../escape"], commitMessage: "m" }), /Aucun chemin/);
  const empty = await mkdtemp(join(tmpdir(), "ostack-norepo-"));
  assert.equal(await isGitRepo(empty), false);
});

test("pushBranch refuses protected branches before any network call", async () => {
  const root = await tempRepo();
  await assert.rejects(pushBranch(root, "main"), /main/);
});
