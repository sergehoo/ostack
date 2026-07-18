import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCandidate } from "../src/index.js";

test("the §22 example: measured improvement with zero regressions → promote", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.81, medianExecutionSeconds: 94 },
    { verifiedSuccessRate: 0.89, medianExecutionSeconds: 78, regressions: 0 }
  );
  assert.equal(result.recommendation, "promote");
  assert.equal(result.deltas.verifiedSuccessRate, 0.08);
  assert.equal(result.deltas.medianExecutionSeconds, -16);
  assert.ok(result.reasons.some((r) => /plus rapide/.test(r)));
});

test("any introduced regression rejects, even if the success rate rose", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.81 },
    { verifiedSuccessRate: 0.95, regressions: 1 }
  );
  assert.equal(result.recommendation, "reject");
  assert.ok(result.reasons.some((r) => /régression/.test(r)));
});

test("a degraded verified success rate rejects", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.9 },
    { verifiedSuccessRate: 0.85, regressions: 0 }
  );
  assert.equal(result.recommendation, "reject");
});

test("no improvement and no proven-defect fix is inconclusive, never promoted on relevance alone", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.85 },
    { verifiedSuccessRate: 0.85, regressions: 0 }
  );
  assert.equal(result.recommendation, "inconclusive");
  assert.ok(result.reasons.some((r) => /pertinence/.test(r)));
});

test("a proven-defect fix with no regression and equal success promotes", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.85 },
    { verifiedSuccessRate: 0.85, regressions: 0 },
    { fixesProvenDefect: true }
  );
  assert.equal(result.recommendation, "promote");
  assert.ok(result.reasons.some((r) => /défaut prouvé/.test(r)));
});

test("cost delta is reported when both sides provide it", () => {
  const result = evaluateCandidate(
    { verifiedSuccessRate: 0.8, costPerVerifiedResultUsd: 0.1 },
    { verifiedSuccessRate: 0.9, costPerVerifiedResultUsd: 0.06, regressions: 0 }
  );
  assert.equal(result.recommendation, "promote");
  assert.equal(result.deltas.costPerVerifiedResultUsd, -0.04);
});
