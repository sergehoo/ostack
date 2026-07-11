import assert from "node:assert/strict";
import { test } from "node:test";
import { runVerificationLoop, type AttemptOutcome } from "../src/index.js";

const clock = () => { let t = 0; return () => (t += 100); };

function outcome(overrides: Partial<AttemptOutcome> = {}): AttemptOutcome {
  return {
    hypothesis: "l'endpoint est appelé avant la création",
    correction: "réordonner les appels",
    observations: [{ summary: "test rejoué", status: "failed" }],
    verified: false,
    ...overrides
  };
}

test("a verified attempt with observations succeeds; without observations it is refused (§36.6)", async () => {
  const ok = await runVerificationLoop(async () => outcome({ verified: true, observations: [{ summary: "17 tests verts", status: "passed" }] }), { maxAttempts: 3, maxDurationMs: 10_000 }, clock());
  assert.equal(ok.status, "verified");

  const hollow = await runVerificationLoop(async () => outcome({ verified: true, observations: [] }), { maxAttempts: 3, maxDurationMs: 10_000 }, clock());
  assert.equal(hollow.status, "escalated");
  assert.equal(hollow.reason, "insufficient_evidence");
});

test("budgets are hard: attempts, time, cost", async () => {
  const attempts = await runVerificationLoop(async (n) => outcome({ correction: `correction ${n}` }), { maxAttempts: 2, maxDurationMs: 10_000 }, clock());
  assert.equal(attempts.reason, "attempts_exhausted");
  assert.equal(attempts.attempts.length, 2);

  const time = await runVerificationLoop(async (n) => outcome({ correction: `c${n}` }), { maxAttempts: 100, maxDurationMs: 250 }, clock());
  assert.equal(time.reason, "time_budget_exceeded");

  const cost = await runVerificationLoop(async (n) => outcome({ correction: `c${n}`, costUsd: 0.4 }), { maxAttempts: 100, maxDurationMs: 100_000, maxCostUsd: 1 }, clock());
  assert.equal(cost.reason, "cost_budget_exceeded");
  assert.ok(cost.totalCostUsd > 1);
});

test("a repeated correction stops the loop: no random-walk fixing (§11)", async () => {
  const result = await runVerificationLoop(async (n) => outcome({ correction: n === 2 ? "Réordonner  les appels" : "réordonner les appels" }), { maxAttempts: 10, maxDurationMs: 100_000 }, clock());
  assert.equal(result.reason, "repeated_correction");
  assert.equal(result.attempts.length, 2, "stopped at the second attempt, not after 10");
});

test("A→B→A oscillation is detected as contradictory corrections, before the duplicate check", async () => {
  const corrections = ["activer le cache", "désactiver le cache", "activer le cache"];
  const result = await runVerificationLoop(async (n) => outcome({ correction: corrections[n - 1]! }), { maxAttempts: 10, maxDurationMs: 100_000 }, clock());
  assert.equal(result.reason, "oscillating_corrections");
  assert.equal(result.attempts.length, 3);
});

test("consecutive evidence-free attempts escalate; an executor crash escalates with history", async () => {
  const blind = await runVerificationLoop(async (n) => outcome({ correction: `c${n}`, observations: [] }), { maxAttempts: 10, maxDurationMs: 100_000 }, clock());
  assert.equal(blind.reason, "insufficient_evidence");
  assert.equal(blind.attempts.length, 2, "default tolerance is 2 blind attempts");

  const crash = await runVerificationLoop(async (n) => { if (n === 2) throw new Error("sandbox down"); return outcome({ correction: `c${n}` }); }, { maxAttempts: 5, maxDurationMs: 100_000 }, clock());
  assert.equal(crash.reason, "executor_error");
  assert.equal(crash.attempts.length, 2, "the failed attempt is kept in history for the human");
});
