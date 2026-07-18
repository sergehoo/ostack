// Self-update (§21) — updates the OStack framework from its git remote with a
// RESTORE POINT and rollback on failure. Safe by construction: updates are
// fast-forward only (an update never rewrites local work silently), rollback
// targets only a previously-recorded commit of the SAME repo, and a dirty
// working tree blocks the update rather than clobbering it.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 8_000_000, timeout: 120_000 });
  return stdout.trim();
}

export interface UpdateCheck {
  current: string;
  target: string;
  behind: number;
  updatesAvailable: boolean;
}

export async function checkForUpdates(cwd: string, remote = "origin", branch = "main"): Promise<UpdateCheck> {
  await git(cwd, ["fetch", "--quiet", remote, branch]);
  const current = await git(cwd, ["rev-parse", "HEAD"]);
  const target = await git(cwd, ["rev-parse", "FETCH_HEAD"]);
  const behind = current === target ? 0 : Number(await git(cwd, ["rev-list", "--count", `${current}..${target}`]));
  return { current, target, behind, updatesAvailable: behind > 0 };
}

export async function isClean(cwd: string): Promise<boolean> {
  return (await git(cwd, ["status", "--porcelain"])).length === 0;
}

// Records the current HEAD so the caller can roll back to exactly this state.
export async function createRestorePoint(cwd: string): Promise<string> {
  return git(cwd, ["rev-parse", "HEAD"]);
}

export interface UpdateResult {
  from: string;
  to: string;
  applied: boolean;
}

// Fast-forward only: refuses to merge or rewrite. A dirty tree blocks.
export async function applyUpdate(cwd: string, remote = "origin", branch = "main"): Promise<UpdateResult> {
  if (!(await isClean(cwd))) throw new Error("Arbre de travail non propre; commit ou stash avant 'ostack update'");
  const from = await git(cwd, ["rev-parse", "HEAD"]);
  await git(cwd, ["fetch", "--quiet", remote, branch]);
  try {
    await git(cwd, ["merge", "--ff-only", "FETCH_HEAD"]);
  } catch (error) {
    throw new Error(`Mise à jour fast-forward impossible (dépôt local divergé ?): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  const to = await git(cwd, ["rev-parse", "HEAD"]);
  return { from, to, applied: from !== to };
}

// Rollback to a previously-recorded commit of THIS repo. The commit must exist;
// an unknown ref is refused rather than guessed.
export async function rollbackTo(cwd: string, commit: string): Promise<void> {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`Empreinte de commit invalide: ${commit}`);
  try { await git(cwd, ["cat-file", "-e", `${commit}^{commit}`]); }
  catch { throw new Error(`Le commit de restauration ${commit} est introuvable dans ce dépôt`); }
  await git(cwd, ["reset", "--hard", commit]);
}
