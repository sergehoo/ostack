import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelMesh, type ModelCandidate, type TaskRoute } from "../src/index.js";

const CANDIDATES: ModelCandidate[] = [
  { id: "local/private-model", provider: "local", model: "private-model", local: true },
  { id: "provider-a/model-1", provider: "provider-a", model: "model-1", local: false },
  { id: "provider-b/model-2", provider: "provider-b", model: "model-2", local: false },
  { id: "provider-a/model-3", provider: "provider-a", model: "model-3", local: false }
];

const ROUTES: TaskRoute[] = [
  { taskType: "architecture", strategy: "quality_first", candidates: ["provider-a/model-1", "provider-b/model-2"] },
  { taskType: "refactoring", strategy: "cost_per_verified_result", candidates: ["local/private-model", "provider-a/model-1"] },
  { taskType: "sensitive_analysis", strategy: "privacy_first", candidates: ["provider-a/model-1", "local/private-model"] },
  { taskType: "security_review", strategy: "independent_consensus", candidates: ["provider-a/model-1", "provider-a/model-3", "provider-b/model-2"], requiredIndependentModels: 2 },
  { taskType: "impossible_consensus", strategy: "independent_consensus", candidates: ["provider-a/model-1", "provider-a/model-3"], requiredIndependentModels: 2 }
];

function mesh(): ModelMesh { return new ModelMesh(CANDIDATES, ROUTES); }

test("the primary metric is cost per VERIFIED result, not cost per token", () => {
  const m = mesh();
  // model-1: cheap per call but never verified. local: pricier per call but verified.
  m.record("refactoring", "provider-a/model-1", { verified: false, costUsd: 0.01, latencyMs: 900 });
  m.record("refactoring", "provider-a/model-1", { verified: false, costUsd: 0.01, latencyMs: 900 });
  m.record("refactoring", "local/private-model", { verified: true, costUsd: 0.05, latencyMs: 3000 });
  assert.equal(m.metrics("refactoring", "provider-a/model-1").costPerVerifiedResultUsd, null);
  assert.equal(m.metrics("refactoring", "local/private-model").costPerVerifiedResultUsd, 0.05);
  assert.equal(m.select("refactoring").ranked[0], "local/private-model", "unverified cheapness never wins");
});

test("quality_first ranks by first-pass verified rate", () => {
  const m = mesh();
  m.record("architecture", "provider-a/model-1", { verified: false, costUsd: 0.2, latencyMs: 1000 });
  m.record("architecture", "provider-a/model-1", { verified: true, costUsd: 0.2, latencyMs: 1000 });
  m.record("architecture", "provider-b/model-2", { verified: true, costUsd: 0.9, latencyMs: 4000 });
  m.record("architecture", "provider-b/model-2", { verified: true, costUsd: 0.9, latencyMs: 4000 });
  assert.equal(m.select("architecture").ranked[0], "provider-b/model-2", "100% first-pass beats 50% even if pricier");
});

test("privacy_first never falls back to a remote model", () => {
  const selection = mesh().select("sensitive_analysis");
  assert.deepEqual(selection.ranked, ["local/private-model"]);
  const noLocal = new ModelMesh(CANDIDATES, [{ taskType: "leaky", strategy: "privacy_first", candidates: ["provider-a/model-1"] }]);
  assert.throws(() => noLocal.select("leaky"), /no local candidate/);
});

test("independent_consensus requires distinct providers", () => {
  const selection = mesh().select("security_review");
  assert.deepEqual(selection.consensusSet, ["provider-a/model-1", "provider-b/model-2"], "same-provider models are not independent");
  assert.throws(() => mesh().select("impossible_consensus"), /independent providers/);
});

test("stats survive serialization and selection stays deterministic", () => {
  const m = mesh();
  m.record("architecture", "provider-b/model-2", { verified: true, costUsd: 0.5, latencyMs: 2000 });
  const restored = mesh();
  restored.loadStats(m.toJSON());
  assert.deepEqual(restored.select("architecture"), m.select("architecture"));
  assert.equal(restored.metrics("architecture", "provider-b/model-2").verified, 1);
});

test("unknown routes and candidates are rejected", () => {
  assert.throws(() => mesh().select("unknown"), /No route/);
  assert.throws(() => mesh().record("architecture", "ghost/model", { verified: true, costUsd: 0, latencyMs: 0 }), /Unknown candidate/);
  assert.throws(() => new ModelMesh(CANDIDATES, [{ taskType: "x", strategy: "quality_first", candidates: ["ghost"] }]), /unknown candidate/);
});
