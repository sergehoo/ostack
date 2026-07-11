import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembleEvidencePack, type EvidenceInput } from "@ostack/evidence";
import { KnowledgeGraph, ingestCompiledIntent, ingestEvidencePack } from "@ostack/graph";
import { compileIntent, type IntentDraft } from "@ostack/intent";
import { handleApiRequest } from "../src/routes.js";

const NOW = "2026-07-11T12:00:00Z";

function draft(): IntentDraft {
  return {
    schemaVersion: 1, id: "demo-feature", request: "Une fonctionnalité de démonstration vérifiée.",
    functionalIntent: ["Démonstration"], actors: ["utilisateur"],
    invariants: [
      { id: "audited", statement: "Chaque action est journalisée", kind: "obligation", given: "une action", when: "elle aboutit", outcome: "une entrée d'audit existe", auditRequired: true },
      { id: "owner-only", statement: "Seul le propriétaire agit", kind: "permission", given: "une ressource possédée", when: "le propriétaire agit", outcome: "l'action réussit" }
    ]
  };
}

function verifiedInput(criteria: string[]): EvidenceInput {
  return {
    taskId: "OST-API-1", feature: "Demo feature", intentId: "demo-feature", request: "démo",
    specification: { summary: "spec", coverage: 95 }, assumptions: [], acceptanceCriteria: criteria,
    changedFiles: ["src/demo.ts"],
    tests: { unit: { passed: 5, failed: 0 }, integration: { passed: 2, failed: 0 }, functional: { passed: 1, failed: 0 }, e2e: { passed: 1, failed: 0 }, permission: { passed: 1, failed: 0 } },
    security: { critical: 0, high: 0, medium: 0, threatModelUpdated: true },
    metrics: { documentationDrift: 0 },
    permissionMatrixVerified: true, rollback: { defined: true, tested: true },
    humanApprovals: [{ approver: "arbiter", reason: "ok", approvedAt: NOW }],
    confidence: ["requirements_understanding", "implementation_correctness", "test_strength", "security_assurance", "performance_assurance", "documentation_consistency", "rollback_readiness"].map((dimension) => ({ dimension: dimension as never, score: 90 })),
    evidenceItems: [
      { id: "l", kind: "lint", dimension: "implementation_correctness", status: "passed", summary: "lint" },
      { id: "t", kind: "typecheck", dimension: "implementation_correctness", status: "passed", summary: "tsc" },
      { id: "b", kind: "build", dimension: "implementation_correctness", status: "passed", summary: "build" },
      { id: "u", kind: "unit_test", dimension: "test_strength", status: "passed", summary: "unit" },
      { id: "r", kind: "trace", dimension: "requirements_understanding", status: "observed", summary: "trace" },
      { id: "s", kind: "security_scan", dimension: "security_assurance", status: "passed", summary: "scan" },
      { id: "p", kind: "performance_measurement", dimension: "performance_assurance", status: "observed", summary: "perf" },
      { id: "d", kind: "trace", dimension: "documentation_consistency", status: "observed", summary: "docs" },
      { id: "rb", kind: "human_review", dimension: "rollback_readiness", status: "approved", summary: "rollback" }
    ]
  };
}

async function seededRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ostack-api-"));
  const state = join(root, ".ostack");
  await mkdir(join(state, "evidence/drafts"), { recursive: true });
  await mkdir(join(state, "intents"), { recursive: true });
  await mkdir(join(state, "deliberations"), { recursive: true });

  const compiled = compileIntent(draft());
  await writeFile(join(state, "intents/demo.json"), JSON.stringify(compiled));
  const pack = assembleEvidencePack(verifiedInput(compiled.acceptanceCriteria), { now: NOW });
  await writeFile(join(state, "evidence/pack.json"), JSON.stringify(pack));
  await writeFile(join(state, "evidence/drafts/run-1.json"), JSON.stringify({ $todo: ["compléter les tests", "mesurer la performance"] }));
  await writeFile(join(state, "deliberations/run-1.json"), JSON.stringify({
    challenges: [{ challenger: "adversarial", blocking: true, message: "rollback non testé" }, { challenger: "critic", blocking: false, message: "nommage" }]
  }));
  const graph = new KnowledgeGraph();
  ingestCompiledIntent(graph, compiled);
  ingestEvidencePack(graph, pack);
  await writeFile(join(state, "graph.json"), JSON.stringify(graph.toJSON()));
  return root;
}

test("verification center aggregates only real artifacts", async () => {
  const root = await seededRoot();
  const result = await handleApiRequest(root, "GET", "/api/verification");
  assert.equal(result.status, 200);
  const data = (result.body as { data: Record<string, never> }).data as {
    evidencePacks: { total: number; verified: number; recommendations: Record<string, number>; latest: Array<{ taskId: string }> };
    drafts: { pending: number; openTodos: number };
    intents: { total: number; invariants: number };
    deliberations: { total: number; blockingChallenges: number };
    graph: { nodes: number; edges: number; unverified: unknown[] } | null;
  };
  assert.equal(data.evidencePacks.total, 1);
  assert.equal(data.evidencePacks.verified, 1);
  assert.equal(data.evidencePacks.latest[0]?.taskId, "OST-API-1");
  assert.equal(data.drafts.pending, 1);
  assert.equal(data.drafts.openTodos, 2);
  assert.equal(data.intents.invariants, 2);
  assert.equal(data.deliberations.blockingChallenges, 1);
  assert.ok(data.graph);
  assert.equal(data.graph.unverified.length, 0, "verified pack proves the invariants");
});

test("an empty project reports absence, never fabricated numbers", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-api-empty-"));
  const result = await handleApiRequest(root, "GET", "/api/verification");
  assert.equal(result.status, 200);
  const data = (result.body as { data: { evidencePacks: { total: number }; graph: null; deliberations: { total: number } } }).data;
  assert.equal(data.evidencePacks.total, 0);
  assert.equal(data.deliberations.total, 0);
  assert.equal(data.graph, null);
});

test("evidence listing is compact and faithful; unknown routes 404; writes rejected", async () => {
  const root = await seededRoot();
  const list = await handleApiRequest(root, "GET", "/api/evidence");
  const items = (list.body as { data: Array<{ verified: boolean; releaseRecommendation: string; confidence: number }> }).data;
  assert.equal(items.length, 1);
  assert.equal(items[0]?.verified, true);
  assert.ok(items[0]!.confidence > 0);

  assert.equal((await handleApiRequest(root, "GET", "/api/nope")).status, 404);
  assert.equal((await handleApiRequest(root, "POST", "/api/evidence")).status, 404);
  assert.equal((await handleApiRequest(root, "GET", "/api/health")).status, 200);
});
