import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelProvider } from "@ostack/core";
import { arbitrate, challengeProposal, parseChallenges, type DeliberationRecord } from "../src/index.js";

function record(overrides: Partial<DeliberationRecord> = {}): DeliberationRecord {
  return {
    taskId: "T1",
    objective: "Corriger l'inscription aux cours",
    proposals: [
      { id: "A", author: "builder-1", content: "Corriger l'ordre des appels", claims: [{ id: "A1", statement: "les tests passent" }] },
      { id: "B", author: "builder-2", content: "Réécrire le module entier, solution élégante et convaincante", claims: [{ id: "B1", statement: "les tests passent" }] }
    ],
    challenges: [],
    evidence: [],
    ...overrides
  };
}

test("no evidence at all means insufficient_evidence, never a winner", () => {
  const verdict = arbitrate(record());
  assert.equal(verdict.decision, "insufficient_evidence");
  assert.equal(verdict.selectedProposalId, undefined);
  assert.match(verdict.rationale, /escalade humaine/);
});

test("the arbiter picks the proposal with evidence, not the most persuasive prose", () => {
  const verdict = arbitrate(record({
    evidence: [{ id: "e1", claimId: "A1", kind: "unit_test", status: "passed", summary: "17 tests verts" }]
  }));
  assert.equal(verdict.decision, "selected");
  assert.equal(verdict.selectedProposalId, "A", "B is wordier but has zero evidence");
});

test("a failed evidence item disqualifies a proposal", () => {
  const verdict = arbitrate(record({
    evidence: [
      { id: "e1", claimId: "A1", kind: "unit_test", status: "failed", summary: "2 échecs" },
      { id: "e2", claimId: "B1", kind: "unit_test", status: "passed", summary: "ok" }
    ]
  }));
  assert.equal(verdict.selectedProposalId, "B");
});

test("an unresolved blocking challenge disqualifies; a resolved one does not; disagreements are preserved", () => {
  const blocked = arbitrate(record({
    challenges: [{ proposalId: "A", challenger: "adversarial", message: "contournement de permission possible", blocking: true }],
    evidence: [{ id: "e1", claimId: "A1", kind: "unit_test", status: "passed", summary: "ok" }]
  }));
  assert.equal(blocked.decision, "all_rejected");
  assert.equal(blocked.preservedDisagreements.length, 1);

  const resolved = arbitrate(record({
    challenges: [{ proposalId: "A", challenger: "adversarial", message: "contournement de permission possible", blocking: true, resolvedByEvidenceId: "e2" }],
    evidence: [
      { id: "e1", claimId: "A1", kind: "unit_test", status: "passed", summary: "ok" },
      { id: "e2", claimId: "A1", kind: "permission_test", status: "passed", summary: "bypass refusé" }
    ]
  }));
  assert.equal(resolved.decision, "selected");
  assert.equal(resolved.preservedDisagreements.length, 0);
});

test("arbitration is deterministic with a stable tie-break", () => {
  const base = record({
    evidence: [
      { id: "e1", claimId: "A1", kind: "unit_test", status: "passed", summary: "ok" },
      { id: "e2", claimId: "B1", kind: "unit_test", status: "passed", summary: "ok" }
    ]
  });
  assert.equal(arbitrate(base).selectedProposalId, "A");
  assert.equal(arbitrate(base).selectedProposalId, arbitrate(base).selectedProposalId);
});

test("challenger output is untrusted: JSON parsed and capped, prose rejected", async () => {
  const provider: ModelProvider = {
    id: "fake", isAvailable: async () => true,
    complete: async () => ({
      content: '```json\n{"challenges": [{"message": "le rollback n\'est pas testé", "blocking": true}, {"message": "hypothèse non validée"}]}\n```',
      model: "m", provider: "fake"
    })
  };
  const challenges = await challengeProposal(
    { id: "A", author: "builder", content: "plan", claims: [] }, "objectif", "adversarial", provider
  );
  assert.equal(challenges.length, 2);
  assert.equal(challenges[0]?.blocking, true);
  assert.equal(challenges[1]?.blocking, false, "blocking must be explicitly true");
  assert.throws(() => parseChallenges("je pense que tout va bien", "A", "critic"), /JSON/);
});
