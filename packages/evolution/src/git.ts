// Git Evolution Workflow (§10-16, §31) — plans branches, structured commits and
// PRs, and enforces the hard guardrails. This module PLANS and DECIDES; it never
// shells out. Forbidden operations (force push, push to protected branches) are
// rejected here so no caller can perform them by accident.

import type { RiskLevel } from "./risk.js";
import { classifyRisk, touchesProtectedPath } from "./risk.js";

export type GitAutonomy = "observe" | "local-commit" | "pull-request" | "controlled-auto-merge";

export interface EvolutionProposal {
  evolutionId: string;
  taskId: string;
  title: string;
  kind: "feat" | "fix" | "test" | "docs" | "knowledge" | "chore";
  scopeLabel: string;
  summary: string;
  changedPaths: string[];
  evidencePack: string;
  confidence: number;
}

const PROTECTED_BRANCHES = new Set(["main", "master", "develop", "release"]);

// §12 — force push and direct pushes to protected branches are never allowed,
// automatically or otherwise.
export function assertGitOperationAllowed(op: { command: "push"; branch: string; force?: boolean }): void {
  if (op.force) throw new Error("git push --force est interdit pour l'évolution automatique (§12, §35.6)");
  if (PROTECTED_BRANCHES.has(op.branch.toLowerCase())) {
    throw new Error(`Push direct automatique sur '${op.branch}' interdit (§12, §35.7); passe par une branche d'évolution + Pull Request`);
  }
}

export function branchName(proposal: EvolutionProposal): string {
  const slug = proposal.evolutionId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const kind = proposal.kind === "knowledge" ? "knowledge" : proposal.kind === "fix" ? "fix" : "evolution";
  return `ostack/${kind}/${slug}`;
}

// §11 — Conventional Commit with OStack trailers. Body never contains secrets.
export function commitMessage(proposal: EvolutionProposal): string {
  const header = `${proposal.kind}(${proposal.scopeLabel}): ${proposal.title}`.slice(0, 100);
  const trailers = [
    `OStack-Evolution-ID: ${proposal.evolutionId}`,
    `OStack-Task-ID: ${proposal.taskId}`,
    `Evidence-Pack: ${proposal.evidencePack}`,
    `Confidence: ${Math.round(proposal.confidence * 100)}`,
    "Generated-By: OStack Autonomous Evolution Engine"
  ];
  return `${header}\n\n${proposal.summary}\n\n${trailers.join("\n")}`;
}

export interface Checks {
  evidencePack: boolean;
  testsPassed: boolean;
  securityPassed: boolean;
  lintPassed: boolean;
  buildPassed: boolean;
  signedCommit: boolean;
  noSecretsDetected: boolean;
  noPolicyViolations: boolean;
  independentVerification: boolean;
}

export interface AutoMergePolicy {
  enabled: boolean;
  allowedRiskLevels: RiskLevel[];
  confidenceMinimum: number;
}

export interface MergeDecision {
  risk: RiskLevel;
  decision: "AUTO_MERGE" | "PULL_REQUEST" | "REQUIRE_HUMAN";
  autoMergeEligible: boolean;
  reasons: string[];
}

// §15-16, §32 — auto-merge only for low risk, all checks green, confidence high,
// and NEVER when the change touches the evolution guardrails themselves.
export function decideMerge(proposal: EvolutionProposal, checks: Checks, policy: AutoMergePolicy): MergeDecision {
  const risk = classifyRisk(proposal.changedPaths);
  const reasons: string[] = [];

  if (touchesProtectedPath(proposal.changedPaths)) {
    reasons.push("touche les garde-fous d'évolution: validation humaine obligatoire (§32)");
    return { risk, decision: "REQUIRE_HUMAN", autoMergeEligible: false, reasons };
  }
  if (risk === "critical" || risk === "high") {
    reasons.push(`risque ${risk}: aucune fusion automatique (§15)`);
    return { risk, decision: "REQUIRE_HUMAN", autoMergeEligible: false, reasons };
  }

  const requirements: Array<[keyof Checks, string]> = [
    ["evidencePack", "Evidence Pack manquant"], ["testsPassed", "tests non réussis"],
    ["securityPassed", "sécurité non validée"], ["lintPassed", "lint non réussi"],
    ["buildPassed", "build non réussi"], ["signedCommit", "commit non signé"],
    ["noSecretsDetected", "secrets détectés"], ["noPolicyViolations", "violation de politique"],
    ["independentVerification", "vérification indépendante manquante"]
  ];
  for (const [key, message] of requirements) if (!checks[key]) reasons.push(message);
  if (proposal.confidence < policy.confidenceMinimum) reasons.push(`confiance ${proposal.confidence} < ${policy.confidenceMinimum}`);
  if (!policy.enabled) reasons.push("auto-merge désactivé par la politique");
  if (!policy.allowedRiskLevels.includes(risk)) reasons.push(`risque ${risk} hors des niveaux auto-merge autorisés`);

  if (risk === "low" && reasons.length === 0) {
    return { risk, decision: "AUTO_MERGE", autoMergeEligible: true, reasons: ["risque faible, tous les contrôles réussis"] };
  }
  return { risk, decision: "PULL_REQUEST", autoMergeEligible: false, reasons };
}

export function pullRequestBody(proposal: EvolutionProposal, merge: MergeDecision): string {
  return [
    `## Evolution`, "", proposal.summary, "",
    `## Origine`, "",
    `- Task: ${proposal.taskId}`, `- Evolution: ${proposal.evolutionId}`, "",
    `## Modifications`, "",
    ...proposal.changedPaths.map((path) => `- ${path}`), "",
    `## Portée`, "", proposal.scopeLabel, "",
    `## Risque`, "", merge.risk, "",
    `## Décision proposée`, "", merge.decision,
    "", `Confidence: ${Math.round(proposal.confidence * 100)} % · Evidence: ${proposal.evidencePack}`,
    "", "🤖 Generated with OStack Autonomous Evolution Engine"
  ].join("\n");
}

// §14/§31 — an autonomy level authorizes only up to a point; anything beyond
// requires escalation. Returns the git actions permitted at this level.
export function permittedActions(autonomy: GitAutonomy): string[] {
  switch (autonomy) {
    case "observe": return ["collect_experience", "extract_lessons"];
    case "local-commit": return ["create_branch", "commit"];
    case "pull-request": return ["create_branch", "commit", "push_branch", "create_pull_request"];
    case "controlled-auto-merge": return ["create_branch", "commit", "push_branch", "create_pull_request", "auto_merge_low_risk"];
  }
}
