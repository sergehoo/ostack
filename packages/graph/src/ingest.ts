import type { EvidencePack } from "@ostack/evidence";
import type { CompiledIntent } from "@ostack/intent";
import { KnowledgeGraph } from "./graph.js";

// Ingestors keep the graph alive (§5): every validated artifact — a compiled
// intent, an evidence pack — updates traceability automatically. Node ids are
// deterministic so repeated ingestion is idempotent.

export function ingestCompiledIntent(graph: KnowledgeGraph, intent: CompiledIntent): void {
  const needId = `need:${intent.id}`;
  const featureId = `feature:${intent.id}`;
  graph.upsertNode({ id: needId, kind: "need", label: intent.request });
  graph.upsertNode({
    id: featureId, kind: "feature", label: intent.functionalIntent[0] ?? intent.id,
    metadata: { intentHash: intent.contentHash }
  });
  graph.link(featureId, "implements", needId);

  for (const invariant of intent.invariants) {
    const invariantId = `invariant:${intent.id}:${invariant.id}`;
    graph.upsertNode({ id: invariantId, kind: "invariant", label: invariant.statement, metadata: { kind: invariant.kind } });
    graph.link(featureId, "declares", invariantId);
    if (invariant.kind === "permission") {
      const permissionId = `permission:${intent.id}:${invariant.id}`;
      graph.upsertNode({ id: permissionId, kind: "permission", label: invariant.statement });
      graph.link(featureId, "protected_by", permissionId);
    }
  }
}

export function ingestEvidencePack(graph: KnowledgeGraph, pack: EvidencePack, intentId?: string): void {
  const evidenceId = `evidence:${pack.taskId}:${pack.contentHash.slice(0, 12)}`;
  graph.upsertNode({
    id: evidenceId, kind: "evidence", label: `${pack.feature} — ${pack.releaseRecommendation}`,
    metadata: { verified: pack.verified, recommendation: pack.releaseRecommendation, confidence: pack.confidence.overall }
  });

  const linkedIntent = intentId ?? pack.intentId;
  const featureId = linkedIntent ? `feature:${linkedIntent}` : findFeatureByCriteria(graph, pack);
  if (featureId && graph.node(featureId)) {
    graph.link(featureId, "verified_by", evidenceId);
    for (const path of pack.changedFiles) {
      const fileId = `file:${path}`;
      graph.upsertNode({ id: fileId, kind: "file", label: path });
      graph.link(featureId, "touches", fileId);
    }
    // An acceptance criterion equal to an invariant statement proves that invariant.
    const criteria = new Set(pack.generatedFrom.acceptanceCriteria);
    for (const edge of graph.outgoing(featureId, "declares")) {
      const invariant = graph.node(edge.to);
      if (invariant && criteria.has(invariant.label) && pack.verified) {
        graph.link(invariant.id, "verified_by", evidenceId);
      }
    }
    for (const edge of graph.outgoing(featureId, "protected_by")) {
      const permission = graph.node(edge.to);
      if (permission && pack.permissionMatrixVerified && pack.verified) {
        graph.link(permission.id, "verified_by", evidenceId);
      }
    }
    for (const risk of pack.residualRisks) {
      const riskId = `risk:${pack.taskId}:${hashLabel(risk.description)}`;
      graph.upsertNode({ id: riskId, kind: "risk", label: risk.description, metadata: { severity: risk.severity } });
      graph.link(featureId, "carries", riskId);
    }
  }
}

function findFeatureByCriteria(graph: KnowledgeGraph, pack: EvidencePack): string | undefined {
  const criteria = new Set(pack.generatedFrom.acceptanceCriteria);
  for (const feature of graph.allNodes("feature")) {
    const declared = graph.outgoing(feature.id, "declares").map((edge) => graph.node(edge.to)?.label);
    if (declared.some((statement) => statement !== undefined && criteria.has(statement))) return feature.id;
  }
  return undefined;
}

function hashLabel(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(16);
}
