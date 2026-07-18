// Resource synchronization (§19-20) — the knowledge repository is a dedicated
// git repo whose resources OStack pulls at session start and pushes verified
// learnings to. Same guardrails as evolution: pull is FAST-FORWARD ONLY (never
// a silent merge), push is guarded (never force, never a protected branch).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 4_000_000, timeout: 60_000 });
  return stdout.trim();
}

export interface SyncStatus {
  isRepo: boolean;
  branch?: string;
  clean?: boolean;
  ahead?: number;
  behind?: number;
  hasUpstream?: boolean;
}

export async function syncStatus(cwd: string): Promise<SyncStatus> {
  try { await git(cwd, ["rev-parse", "--is-inside-work-tree"]); }
  catch { return { isRepo: false }; }
  const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const clean = (await git(cwd, ["status", "--porcelain"])).length === 0;
  const status: SyncStatus = { isRepo: true, branch, clean, hasUpstream: false };
  try {
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
    const parts = counts.split(/\s+/).map(Number);
    status.behind = parts[0] ?? 0;
    status.ahead = parts[1] ?? 0;
    status.hasUpstream = true;
  } catch { /* no upstream configured */ }
  return status;
}

// Fast-forward only: refuses to create a merge commit. If the local branch has
// diverged, it reports rather than silently merging (§35.18 — complete history).
export async function pullFastForward(cwd: string, remote = "origin", branch?: string): Promise<{ pulled: boolean; note?: string }> {
  const status = await syncStatus(cwd);
  if (!status.isRepo) throw new Error("Le dépôt de connaissances local n'est pas un dépôt git");
  if (!status.clean) return { pulled: false, note: "arbre de travail non propre; commit ou stash avant de synchroniser" };
  const target = branch ?? status.branch!;
  try {
    await git(cwd, ["pull", "--ff-only", remote, target]);
    return { pulled: true };
  } catch (error) {
    return { pulled: false, note: `fast-forward impossible (branche divergée ?): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  }
}

// Knowledge-repo push (§20): pushes verified learnings to the configured branch
// (which may legitimately be `main` of the DEDICATED knowledge repo). Never a
// force push, ever. Shared-branch protection is enforced remotely by GitHub
// branch protection / required PRs (§16) — the real gate lives on the server,
// not in a local block that would defeat pushOnVerifiedLearning.
export async function pushResources(cwd: string, branch: string, remote = "origin"): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) throw new Error(`Nom de branche invalide: ${branch}`);
  // No --force, no --force-with-lease, never. A plain, fast-forward push only.
  await git(cwd, ["push", remote, branch]);
}
