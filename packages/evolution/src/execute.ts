// Local git executor for the evolution engine. Executes ONLY the safe,
// reversible, local-scope operations: create a branch, stage EXPLICIT paths
// (never `git add .`, §11), commit with the OStack bot identity applied
// per-invocation (§26 — never overwrites the user's global git identity).
// Network operations (push) are gated separately and guarded by
// assertGitOperationAllowed; nothing here can force-push or touch main.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertGitOperationAllowed } from "./git.js";

const execFileAsync = promisify(execFile);

const BOT_NAME = "OStack Evolution Bot";
const BOT_EMAIL = "ostack-bot@users.noreply.github.com";

async function git(cwd: string, args: string[], input?: string): Promise<string> {
  const child = execFileAsync("git", args, { cwd, maxBuffer: 4_000_000, timeout: 60_000 });
  if (input !== undefined && child.child.stdin) { child.child.stdin.end(input); }
  const { stdout } = await child;
  return stdout.trim();
}

export interface ApplyLocalInput {
  cwd: string;
  branch: string;
  changedPaths: string[];
  commitMessage: string;
}

export interface ApplyLocalResult {
  branch: string;
  commit: string;
  stagedPaths: string[];
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try { await git(cwd, ["rev-parse", "--is-inside-work-tree"]); return true; } catch { return false; }
}

// Creates the evolution branch and commits ONLY the given paths, locally.
// No network. Reversible: the branch can be deleted, the commit reset.
export async function applyLocalCommit(input: ApplyLocalInput): Promise<ApplyLocalResult> {
  if (!(await isGitRepo(input.cwd))) throw new Error("Pas de dépôt git ici; 'ostack evolve apply' exige un dépôt initialisé");
  if (!/^ostack\/(evolution|knowledge|fix|skill|benchmark)\//.test(input.branch)) {
    throw new Error(`Nom de branche d'évolution invalide: ${input.branch}`);
  }
  const staged = input.changedPaths.filter((path) => !path.includes("..") && !path.startsWith("/"));
  if (staged.length === 0) throw new Error("Aucun chemin explicite à ajouter (jamais 'git add .', §11)");

  // Create the branch from the current HEAD; fail if it already exists.
  await git(input.cwd, ["checkout", "-b", input.branch]);
  // Stage ONLY the explicit paths.
  await git(input.cwd, ["add", "--", ...staged]);
  // Commit with the bot identity applied only to this commit.
  const commit = await git(input.cwd, [
    "-c", `user.name=${BOT_NAME}`, "-c", `user.email=${BOT_EMAIL}`,
    "commit", "-F", "-"
  ], input.commitMessage).then(() => git(input.cwd, ["rev-parse", "HEAD"]));

  return { branch: input.branch, commit: commit.slice(0, 40), stagedPaths: staged };
}

// Push is opt-in and guarded. Never force, never a protected branch.
export async function pushBranch(cwd: string, branch: string, remote = "origin"): Promise<void> {
  assertGitOperationAllowed({ command: "push", branch });
  await git(cwd, ["push", "-u", remote, branch]);
}
