import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDiagnosed, buildTimeline, markDiagnosed, recordExperiment, type DiagnosisReport } from "../src/index.js";

function draft(): DiagnosisReport {
  return {
    schemaVersion: 1,
    incidentId: "INC-1",
    symptom: "L'inscription au cours échoue avec 500",
    observedAt: "2026-07-11T10:00:00Z",
    components: ["api/enrollment", "db"],
    timeline: [],
    hypotheses: [
      { id: "h1", cause: "endpoint appelé avant création de l'enrollment", likelihood: "high", minimalExperiment: "rejouer la requête en traçant l'ordre des appels" },
      { id: "h2", cause: "contrainte d'unicité en base", likelihood: "low", minimalExperiment: "inspecter les logs SQL" }
    ],
    contributingFactors: [],
    status: "draft"
  };
}

test("timeline is built from audit lines within the window, sorted chronologically", () => {
  const lines = [
    { timestamp: "2026-07-11T10:05:00Z", actorId: "api", action: "enroll", outcome: "failed" },
    { timestamp: "2026-07-11T09:00:00Z", actorId: "api", action: "login", outcome: "succeeded" },
    { timestamp: "2026-07-11T10:02:00Z", actorId: "api", action: "create-order", outcome: "succeeded" }
  ];
  const timeline = buildTimeline(lines, { since: "2026-07-11T10:00:00Z" });
  assert.equal(timeline.length, 2, "the 09:00 event is outside the window");
  assert.deepEqual(timeline.map((event) => event.action), ["create-order", "enroll"]);
});

test("a report cannot be diagnosed without an executed, conclusive, supporting experiment (§36.7)", () => {
  const report = draft();
  const missing = assertDiagnosed(report);
  assert.ok(missing.includes("rootCause absent"));
  assert.ok(missing.some((entry) => entry.includes("nonRegressionCheck")));
  assert.ok(missing.some((entry) => entry.includes("hypothèse confirmée")));
  assert.throws(() => markDiagnosed(report), /n'est pas démontré/);
});

test("recording an experiment and completing causes promotes to diagnosed", () => {
  let report = recordExperiment(draft(), "h1", { executedAt: "2026-07-11T10:30:00Z", observation: "l'endpoint est bien appelé avant la création", conclusive: true, supportsHypothesis: true });
  report = {
    ...report,
    directCause: "l'appel enroll précède create-order",
    rootCause: "ordre des étapes inversé dans le contrôleur",
    correction: "réordonner: créer l'enrollment puis appeler l'endpoint",
    prevention: "test d'intégration garantissant l'ordre",
    nonRegressionCheck: "npm test -- enrollment.order"
  };
  assert.deepEqual(assertDiagnosed(report), []);
  assert.equal(markDiagnosed(report).status, "diagnosed");
});

test("an inconclusive experiment does not count as confirmation", () => {
  const report = recordExperiment(draft(), "h1", { executedAt: "2026-07-11T10:30:00Z", observation: "indéterminé", conclusive: false, supportsHypothesis: true });
  assert.ok(assertDiagnosed(report).some((entry) => entry.includes("hypothèse confirmée")));
  assert.throws(() => recordExperiment(report, "ghost", { executedAt: "x", observation: "y", conclusive: true, supportsHypothesis: true }), /Unknown hypothesis/);
});
