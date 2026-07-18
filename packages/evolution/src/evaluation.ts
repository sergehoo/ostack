// Skill self-evaluation (§22) — a candidate evolution is measured against the
// current baseline on the SAME benchmark before promotion. Non-negotiable rule:
// an evolution is never promoted just because it "seems relevant" — it must
// demonstrate a measured improvement or fix a proven defect, and it must
// introduce ZERO regressions. All deterministic given the two metric sets.

export interface SkillMetrics {
  verifiedSuccessRate: number;          // 0..1, primary signal
  medianExecutionSeconds?: number;
  regressions?: number;                 // defects the candidate introduced
  costPerVerifiedResultUsd?: number;
  attempts?: number;
  falsePositives?: number;
  falseNegatives?: number;
}

export interface EvaluationOptions {
  // Minimum absolute gain in verified success rate to count as an improvement.
  minSuccessImprovement?: number;       // default 0.01
  // Set when the candidate is meant to fix a specific, already-proven defect.
  fixesProvenDefect?: boolean;
}

export interface EvaluationResult {
  recommendation: "promote" | "reject" | "inconclusive";
  regressions: number;
  deltas: {
    verifiedSuccessRate: number;
    medianExecutionSeconds?: number;
    costPerVerifiedResultUsd?: number;
  };
  reasons: string[];
}

export function evaluateCandidate(baseline: SkillMetrics, candidate: SkillMetrics, options: EvaluationOptions = {}): EvaluationResult {
  const minImprovement = options.minSuccessImprovement ?? 0.01;
  const regressions = candidate.regressions ?? 0;
  const successDelta = round(candidate.verifiedSuccessRate - baseline.verifiedSuccessRate);
  const deltas: EvaluationResult["deltas"] = { verifiedSuccessRate: successDelta };
  if (baseline.medianExecutionSeconds !== undefined && candidate.medianExecutionSeconds !== undefined) {
    deltas.medianExecutionSeconds = round(candidate.medianExecutionSeconds - baseline.medianExecutionSeconds);
  }
  if (baseline.costPerVerifiedResultUsd !== undefined && candidate.costPerVerifiedResultUsd !== undefined) {
    deltas.costPerVerifiedResultUsd = round(candidate.costPerVerifiedResultUsd - baseline.costPerVerifiedResultUsd);
  }

  const reasons: string[] = [];

  // Reject: any introduced regression, or a degraded verified success rate.
  if (regressions > 0) {
    reasons.push(`${regressions} régression(s) introduite(s) — rejet (§22: une évolution ne doit pas introduire de défaut)`);
    return { recommendation: "reject", regressions, deltas, reasons };
  }
  if (successDelta < 0) {
    reasons.push(`taux de réussite vérifié dégradé (${fmt(successDelta)}) — rejet`);
    return { recommendation: "reject", regressions, deltas, reasons };
  }

  // Promote: a measured success improvement, or a proven-defect fix with no
  // regression and no degradation.
  if (successDelta >= minImprovement) {
    reasons.push(`amélioration mesurée du taux de réussite vérifié (${fmt(successDelta)})`);
    if ((deltas.medianExecutionSeconds ?? 0) < 0) reasons.push(`et exécution plus rapide (${deltas.medianExecutionSeconds}s)`);
    return { recommendation: "promote", regressions, deltas, reasons };
  }
  if (options.fixesProvenDefect) {
    reasons.push("corrige un défaut prouvé, sans régression ni dégradation du taux de réussite");
    return { recommendation: "promote", regressions, deltas, reasons };
  }

  // Otherwise: not demonstrated. Never promote on relevance alone.
  reasons.push("aucune amélioration démontrée ni défaut prouvé corrigé — ne pas promouvoir sur la seule pertinence (§22)");
  return { recommendation: "inconclusive", regressions, deltas, reasons };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fmt(value: number): string {
  return `${value >= 0 ? "+" : ""}${round(value)}`;
}
