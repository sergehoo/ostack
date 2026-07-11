// OStack Continuous Digital Twin (§6) — the expected shape of the software,
// derived from the knowledge graph, compared against what is actually observed.
// The twin is never hand-maintained prose: it is rebuilt from validated
// artifacts, so "expected vs observed" is always a mechanical comparison.

import { KnowledgeGraph } from "@ostack/graph";

export interface TwinFeature {
  id: string;
  label: string;
  need?: string;
  files: string[];
  permissions: string[];
  invariants: Array<{ id: string; statement: string; verified: boolean }>;
  verified: boolean;
  residualRisks: Array<{ label: string; severity: string }>;
}

export interface TwinModel {
  schemaVersion: 1;
  features: TwinFeature[];
  declaredFiles: string[];
}

export type DriftKind = "functional" | "architectural" | "permissions" | "documentary";

export interface Drift {
  kind: DriftKind;
  severity: "low" | "medium" | "high";
  subject: string;
  description: string;
}

export interface TwinObservation {
  existingFiles: string[];
  entryPoints: string[];
}

export function buildTwin(graph: KnowledgeGraph): TwinModel {
  const features: TwinFeature[] = graph.allNodes("feature").map((feature) => {
    const need = graph.outgoing(feature.id, "implements").map((edge) => graph.node(edge.to)?.label).find((label) => label !== undefined);
    const invariants = graph.outgoing(feature.id, "declares").map((edge) => {
      const node = graph.node(edge.to)!;
      return { id: node.id, statement: node.label, verified: graph.coverage(node.id).length > 0 };
    });
    const entry: TwinFeature = {
      id: feature.id,
      label: feature.label,
      files: graph.outgoing(feature.id, "touches").map((edge) => edge.to.replace(/^file:/, "")).sort(),
      permissions: graph.outgoing(feature.id, "protected_by").map((edge) => edge.to),
      invariants,
      verified: graph.coverage(feature.id).some((node) => node.kind === "evidence" && node.metadata?.verified === true),
      residualRisks: graph.outgoing(feature.id, "carries").map((edge) => {
        const risk = graph.node(edge.to)!;
        return { label: risk.label, severity: String(risk.metadata?.severity ?? "unknown") };
      })
    };
    if (need !== undefined) entry.need = need;
    return entry;
  }).sort((a, b) => a.id.localeCompare(b.id));

  const declaredFiles = [...new Set(features.flatMap((feature) => feature.files))].sort();
  return { schemaVersion: 1, features, declaredFiles };
}

export function detectDrift(twin: TwinModel, graph: KnowledgeGraph, observation: TwinObservation): Drift[] {
  const drifts: Drift[] = [];
  const existing = new Set(observation.existingFiles);

  // Functional drift: the twin says a feature lives in a file that no longer exists.
  for (const feature of twin.features) {
    for (const file of feature.files) {
      if (!existing.has(file)) {
        drifts.push({
          kind: "functional",
          severity: "high",
          subject: file,
          description: `La fonctionnalité '${feature.id}' déclare le fichier '${file}' qui n'existe plus`
        });
      }
    }
    // Documentary drift: a feature marked verified whose invariants lost coverage.
    for (const invariant of feature.invariants) {
      if (!invariant.verified) {
        drifts.push({
          kind: "documentary",
          severity: "medium",
          subject: invariant.id,
          description: `L'invariant « ${invariant.statement} » n'est couvert par aucune preuve`
        });
      }
    }
  }

  // Permission drift: declared permissions with no verifying evidence.
  for (const permission of graph.unverified().filter((node) => node.kind === "permission")) {
    drifts.push({
      kind: "permissions",
      severity: "high",
      subject: permission.id,
      description: `La permission « ${permission.label} » n'est vérifiée par aucune preuve`
    });
  }

  // Architectural drift: observed entry points traced to no feature (§36.13 —
  // every piece of software must be linked to a need).
  const declared = new Set(twin.declaredFiles);
  for (const entryPoint of observation.entryPoints) {
    if (!declared.has(entryPoint)) {
      drifts.push({
        kind: "architectural",
        severity: "low",
        subject: entryPoint,
        description: `Le point d'entrée observé '${entryPoint}' n'est relié à aucune fonctionnalité tracée`
      });
    }
  }

  return drifts;
}
