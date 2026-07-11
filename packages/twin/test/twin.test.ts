import assert from "node:assert/strict";
import { test } from "node:test";
import { KnowledgeGraph } from "@ostack/graph";
import { buildTwin, detectDrift } from "../src/index.js";

function seededGraph(): KnowledgeGraph {
  const graph = new KnowledgeGraph();
  graph.upsertNode({ id: "need:gen", kind: "need", label: "Générer une formation IA sans publication automatique" });
  graph.upsertNode({ id: "feature:gen", kind: "feature", label: "Génération IA en brouillon" });
  graph.upsertNode({ id: "invariant:gen:draft", kind: "invariant", label: "La génération reste en brouillon" });
  graph.upsertNode({ id: "permission:gen:owner", kind: "permission", label: "Seul le propriétaire génère" });
  graph.upsertNode({ id: "file:backend/ai.py", kind: "file", label: "backend/ai.py" });
  graph.upsertNode({ id: "evidence:e1", kind: "evidence", label: "pack", metadata: { verified: true } });
  graph.link("feature:gen", "implements", "need:gen");
  graph.link("feature:gen", "declares", "invariant:gen:draft");
  graph.link("feature:gen", "protected_by", "permission:gen:owner");
  graph.link("feature:gen", "touches", "file:backend/ai.py");
  graph.link("feature:gen", "verified_by", "evidence:e1");
  graph.link("invariant:gen:draft", "verified_by", "evidence:e1");
  graph.link("permission:gen:owner", "verified_by", "evidence:e1");
  return graph;
}

test("twin derives features, files, invariants and verification from the graph", () => {
  const twin = buildTwin(seededGraph());
  assert.equal(twin.features.length, 1);
  const feature = twin.features[0]!;
  assert.equal(feature.need, "Générer une formation IA sans publication automatique");
  assert.deepEqual(feature.files, ["backend/ai.py"]);
  assert.equal(feature.verified, true);
  assert.equal(feature.invariants[0]?.verified, true);
});

test("no drift when observed reality matches the twin", () => {
  const graph = seededGraph();
  const drifts = detectDrift(buildTwin(graph), graph, {
    existingFiles: ["backend/ai.py"],
    entryPoints: ["backend/ai.py"]
  });
  assert.deepEqual(drifts, []);
});

test("a deleted file is functional drift, an untraced entry point is architectural drift", () => {
  const graph = seededGraph();
  const drifts = detectDrift(buildTwin(graph), graph, {
    existingFiles: [],
    entryPoints: ["scripts/mystery.py"]
  });
  const kinds = drifts.map((drift) => drift.kind).sort();
  assert.deepEqual(kinds, ["architectural", "functional"]);
  assert.equal(drifts.find((d) => d.kind === "functional")?.severity, "high");
});

test("lost coverage becomes documentary and permission drift", () => {
  const graph = new KnowledgeGraph();
  graph.upsertNode({ id: "feature:x", kind: "feature", label: "x" });
  graph.upsertNode({ id: "invariant:x:i", kind: "invariant", label: "règle sans preuve" });
  graph.upsertNode({ id: "permission:x:p", kind: "permission", label: "permission sans preuve" });
  graph.link("feature:x", "declares", "invariant:x:i");
  graph.link("feature:x", "protected_by", "permission:x:p");
  const drifts = detectDrift(buildTwin(graph), graph, { existingFiles: [], entryPoints: [] });
  assert.ok(drifts.some((d) => d.kind === "documentary" && d.subject === "invariant:x:i"));
  assert.ok(drifts.some((d) => d.kind === "permissions" && d.severity === "high"));
});
