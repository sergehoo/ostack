import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertGitOperationAllowed, classifyRisk, touchesProtectedPath } from "@ostack/evolution";

const execFileAsync = promisify(execFile);

// Network execution of the evolution flow (§7, §13, §16). Uses the GitHub CLI
// (`gh`) so the token never touches OStack — gh handles auth via the system's
// secure credential store. Everything stays gated: PRs only from evolution
// branches to a non-protected base is never bypassed, and auto-merge is
// enabled ONLY for low-risk changes that touch no guardrail path. GitHub's own
// branch protection + required checks are the final gate (§16).

async function ghAvailable(): Promise<boolean> {
  try { await execFileAsync("gh", ["--version"], { timeout: 10_000 }); return true; }
  catch { return false; }
}

function assertGhOrExplain(available: boolean): void {
  if (!available) {
    throw new Error(
      "GitHub CLI (`gh`) introuvable ou non authentifié. Installez-le et lancez `gh auth login` (le token reste géré par gh, OStack ne le voit jamais). " +
      "Puis appliquez la protection de branche: bash scripts/setup-branch-protection.sh <owner/repo>."
    );
  }
}

export interface PrInput {
  cwd: string;
  branch: string;
  base: string;
  title: string;
  bodyFile: string;
}

export async function createPullRequest(input: PrInput): Promise<{ url: string }> {
  assertGhOrExplain(await ghAvailable());
  if (!/^ostack\/(evolution|knowledge|fix|skill|benchmark)\//.test(input.branch)) {
    throw new Error(`Une PR d'évolution ne part que d'une branche d'évolution: ${input.branch}`);
  }
  // The head branch must have been pushed first; pushing is guarded elsewhere.
  const { stdout } = await execFileAsync("gh", [
    "pr", "create", "--base", input.base, "--head", input.branch,
    "--title", input.title, "--body-file", input.bodyFile
  ], { cwd: input.cwd, timeout: 60_000 });
  return { url: stdout.trim().split("\n").pop() ?? "" };
}

export interface MergeInput {
  cwd: string;
  pr: string;
  branch: string;
  changedPaths: string[];
  confidence: number;
  confidenceMinimum: number;
}

export interface MergeOutcome {
  enabled: boolean;
  refused?: string;
}

// Enables GitHub auto-merge (squash) ONLY for a low-risk change with no
// guardrail path and sufficient confidence. GitHub then merges after required
// checks pass and branch protection is satisfied — never before (§16). Never a
// direct merge to a protected branch, never a force.
export async function enableAutoMerge(input: MergeInput): Promise<MergeOutcome> {
  const risk = classifyRisk(input.changedPaths);
  if (touchesProtectedPath(input.changedPaths)) return { enabled: false, refused: "touche les garde-fous d'évolution: validation humaine obligatoire (§32)" };
  if (risk !== "low") return { enabled: false, refused: `risque ${risk}: pas d'auto-merge (§15)` };
  if (input.confidence < input.confidenceMinimum) return { enabled: false, refused: `confiance ${input.confidence} < ${input.confidenceMinimum}` };
  // Defensive: never operate on a protected branch as the HEAD of the PR.
  assertGitOperationAllowed({ command: "push", branch: input.branch });

  assertGhOrExplain(await ghAvailable());
  // --auto: GitHub merges only once required status checks pass (branch
  // protection is the real gate). --squash keeps a clean history. No force.
  await execFileAsync("gh", ["pr", "merge", input.pr, "--auto", "--squash"], { cwd: input.cwd, timeout: 60_000 });
  return { enabled: true };
}
