// OStack Autonomous Verification Loop (§11) — hypothesis → implementation →
// execution → observation → comparison → diagnosis → targeted correction →
// re-verification. The loop NEVER wanders: attempts, time and cost are hard
// budgets; repeated or oscillating corrections stop it; evidence-free attempts
// stop it; every exit that is not a verified success escalates to a human with
// the full history.

export interface LoopBudget {
  maxAttempts: number;
  maxDurationMs: number;
  maxCostUsd?: number;
  maxEvidencelessAttempts?: number;
}

export interface AttemptOutcome {
  hypothesis: string;
  correction: string;
  observations: Array<{ summary: string; status: "passed" | "failed" | "observed" }>;
  verified: boolean;
  costUsd?: number;
}

export interface AttemptRecord extends AttemptOutcome {
  attempt: number;
  durationMs: number;
}

export type LoopExitReason =
  | "verified"
  | "attempts_exhausted"
  | "time_budget_exceeded"
  | "cost_budget_exceeded"
  | "repeated_correction"
  | "oscillating_corrections"
  | "insufficient_evidence"
  | "executor_error";

export interface LoopResult {
  status: "verified" | "escalated";
  reason: LoopExitReason;
  detail: string;
  attempts: AttemptRecord[];
  totalCostUsd: number;
  totalDurationMs: number;
}

export type AttemptExecutor = (attempt: number, history: AttemptRecord[]) => Promise<AttemptOutcome>;

export async function runVerificationLoop(
  executor: AttemptExecutor,
  budget: LoopBudget,
  clock: () => number
): Promise<LoopResult> {
  if (budget.maxAttempts < 1) throw new Error("The loop requires at least one attempt");
  const startedAt = clock();
  const history: AttemptRecord[] = [];
  let totalCostUsd = 0;
  const maxEvidenceless = budget.maxEvidencelessAttempts ?? 2;
  let evidencelessStreak = 0;

  const escalate = (reason: LoopExitReason, detail: string): LoopResult => ({
    status: "escalated", reason, detail, attempts: history,
    totalCostUsd, totalDurationMs: Math.round(clock() - startedAt)
  });

  for (let attempt = 1; attempt <= budget.maxAttempts; attempt++) {
    if (clock() - startedAt > budget.maxDurationMs) {
      return escalate("time_budget_exceeded", `Budget de temps dépassé après ${history.length} tentative(s)`);
    }
    const attemptStart = clock();
    let outcome: AttemptOutcome;
    try {
      outcome = await executor(attempt, [...history]);
    } catch (error) {
      history.push({
        attempt, hypothesis: "(exception)", correction: "(aucune)", observations: [],
        verified: false, durationMs: Math.round(clock() - attemptStart)
      });
      return escalate("executor_error", error instanceof Error ? error.message : String(error));
    }
    const record: AttemptRecord = { ...outcome, attempt, durationMs: Math.round(clock() - attemptStart) };
    history.push(record);
    totalCostUsd += outcome.costUsd ?? 0;

    if (outcome.verified) {
      if (outcome.observations.length === 0) {
        return escalate("insufficient_evidence", `La tentative ${attempt} se déclare vérifiée sans aucune observation; une réussite sans preuve est refusée (§36.6)`);
      }
      return {
        status: "verified", reason: "verified",
        detail: `Vérifié à la tentative ${attempt} avec ${outcome.observations.length} observation(s)`,
        attempts: history, totalCostUsd, totalDurationMs: Math.round(clock() - startedAt)
      };
    }

    if (budget.maxCostUsd !== undefined && totalCostUsd > budget.maxCostUsd) {
      return escalate("cost_budget_exceeded", `Coût cumulé ${totalCostUsd.toFixed(4)}$ au-delà du budget ${budget.maxCostUsd}$`);
    }

    // Random-walk detection. The A→B→A flip-flop is checked first: it is the
    // more specific signal (contradictory corrections), the plain duplicate
    // check would otherwise shadow it.
    const signature = normalize(outcome.correction);
    const previous = history.slice(0, -1).map((entry) => normalize(entry.correction));
    if (history.length >= 3) {
      const [a, b, c] = history.slice(-3).map((entry) => normalize(entry.correction));
      if (a === c && a !== b) {
        return escalate("oscillating_corrections", "Corrections contradictoires détectées (A → B → A); diagnostic humain requis");
      }
    }
    if (previous.includes(signature)) {
      return escalate("repeated_correction", `La correction « ${outcome.correction} » a déjà été tentée (tentative ${previous.indexOf(signature) + 1}); poursuivre serait une modification au hasard`);
    }

    evidencelessStreak = outcome.observations.length === 0 ? evidencelessStreak + 1 : 0;
    if (evidencelessStreak >= maxEvidenceless) {
      return escalate("insufficient_evidence", `${evidencelessStreak} tentative(s) consécutive(s) sans aucune observation exploitable`);
    }
  }
  return escalate("attempts_exhausted", `${budget.maxAttempts} tentative(s) épuisée(s) sans vérification`);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
