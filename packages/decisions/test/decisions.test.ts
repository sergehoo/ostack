import assert from "node:assert/strict";
import { test } from "node:test";
import { redactSecrets, sanitizeRecord, searchDecisions, type DecisionRecord } from "../src/index.js";

function record(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    schemaVersion: 1,
    id: "DEC-1",
    problem: "Requêtes N+1 sur la liste des cours",
    context: "Endpoint GET /api/courses lent en production",
    optionsTried: [{ option: "cache applicatif", result: "invalidation complexe, abandonné" }],
    chosenSolution: "prefetch_related sur l'ORM",
    reason: "supprime les requêtes répétées sans cache à invalider",
    reuseConditions: ["ORM Django", "relation one-to-many chargée en liste"],
    tags: ["performance", "orm", "n+1"],
    recordedBy: "serge",
    recordedAt: "2026-07-11T10:00:00Z",
    ...overrides
  };
}

test("secrets are redacted before a decision record is accepted (§24)", () => {
  assert.equal(redactSecrets("token=abcd1234secret").redacted, true);
  assert.match(redactSecrets("Authorization: Bearer abc.def.ghi").text, /Bearer \[REDACTED\]/);
  const { record: clean, redactions } = sanitizeRecord(record({ reason: "utiliser api_key=sk-abcdefghijklmnop pour l'appel" }));
  assert.ok(redactions >= 1);
  assert.doesNotMatch(clean.reason, /sk-abcdefghijklmnop/);
});

test("search ranks by weighted term matches and explains via matched terms", () => {
  const records = [
    record(),
    record({ id: "DEC-2", problem: "Fuite mémoire dans le worker", tags: ["memory", "worker"], chosenSolution: "libérer les handles", reason: "évite l'accumulation", reuseConditions: [], optionsTried: [] })
  ];
  const results = searchDecisions(records, "performance n+1 orm");
  assert.equal(results[0]?.record.id, "DEC-1");
  assert.ok(results[0]!.score >= 6, "problem+tags matches are weighted heavily");
  assert.ok(results[0]!.matchedTerms.includes("performance"));
  assert.equal(searchDecisions(records, "mémoire worker")[0]?.record.id, "DEC-2");
});

test("a query with no meaningful match returns nothing, not a false positive", () => {
  assert.deepEqual(searchDecisions([record()], "kubernetes ingress tls"), []);
  assert.deepEqual(searchDecisions([record()], "a"), [], "sub-3-char tokens are ignored");
});
