import { createHash } from "node:crypto";
import type {
  CompiledIntent,
  ExpectedEvidence,
  IntentDraft,
  Invariant,
  RequiredTestKind,
  TechnicalControl,
  TestableProperty
} from "./types.js";

const CONTROLS_BY_KIND: Record<Invariant["kind"], TechnicalControl[]> = {
  prohibition: ["endpoint_protection", "status_validation"],
  permission: ["authentication", "object_permission", "endpoint_protection"],
  obligation: ["audit_log"],
  consistency: ["input_validation", "data_integrity_check"]
};

const TESTS_BY_KIND: Record<Invariant["kind"], RequiredTestKind[]> = {
  prohibition: ["functional_test", "e2e_test"],
  permission: ["permission_test", "integration_test"],
  obligation: ["integration_test"],
  consistency: ["unit_test", "property_test"]
};

export function compileIntent(draft: IntentDraft): CompiledIntent {
  assertDraft(draft);
  const properties = draft.invariants.flatMap(deriveProperties);
  const controls = orderedUnique(draft.invariants.flatMap((invariant) => [
    ...CONTROLS_BY_KIND[invariant.kind],
    ...(invariant.auditRequired ? (["audit_log"] as TechnicalControl[]) : [])
  ]));
  const requiredTests = orderedUnique(draft.invariants.flatMap((invariant) => TESTS_BY_KIND[invariant.kind]));
  const expectedEvidence: ExpectedEvidence[] = draft.invariants.flatMap((invariant) =>
    TESTS_BY_KIND[invariant.kind].map((kind) => ({
      invariantId: invariant.id,
      kind,
      description: `${labelFor(kind)} proving: ${invariant.statement}`
    }))
  );

  const body: Omit<CompiledIntent, "contentHash"> = {
    schemaVersion: 1,
    id: draft.id,
    request: draft.request,
    functionalIntent: draft.functionalIntent,
    actors: draft.actors,
    invariants: draft.invariants,
    properties,
    controls,
    requiredTests,
    acceptanceCriteria: draft.invariants.map((invariant) => invariant.statement),
    expectedEvidence
  };
  return { ...body, contentHash: createHash("sha256").update(stableStringify(body)).digest("hex") };
}

function deriveProperties(invariant: Invariant): TestableProperty[] {
  const base = `Given ${invariant.given}\nWhen ${invariant.when}`;
  switch (invariant.kind) {
    case "prohibition":
      return [
        property(invariant, "holds", `L'issue interdite ne se produit pas`, `${base}\nThen ${negate(invariant.outcome)}${auditLine(invariant)}`, false),
        property(invariant, "adversarial", `Une tentative directe de provoquer l'issue interdite est refusée`, `${base} en tentant délibérément de provoquer "${invariant.outcome}"\nThen la tentative est refusée\nAnd ${negate(invariant.outcome)}`, true)
      ];
    case "permission":
      return [
        property(invariant, "allowed", `L'acteur autorisé peut agir`, `${base}\nThen ${invariant.outcome}${auditLine(invariant)}`, false),
        property(invariant, "denied", `Un acteur non autorisé est refusé`, `Given ${invariant.given}\nWhen un acteur non autorisé tente la même action\nThen l'action est refusée\nAnd aucun changement n'est appliqué${auditLine(invariant)}`, true)
      ];
    case "obligation":
      return [
        property(invariant, "holds", `L'obligation est respectée`, `${base}\nThen ${invariant.outcome}${auditLine(invariant)}`, false)
      ];
    case "consistency":
      return [
        property(invariant, "holds", `La cohérence est préservée`, `${base}\nThen ${invariant.outcome}`, false),
        property(invariant, "generative", `La cohérence tient sur des données générées`, `Given de nombreux jeux de données générés pour ${invariant.given}\nWhen ${invariant.when}\nThen ${invariant.outcome} pour chaque jeu de données`, true)
      ];
  }
}

function property(invariant: Invariant, suffix: string, title: string, gherkin: string, adversarial: boolean): TestableProperty {
  return { id: `${invariant.id}-${suffix}`, invariantId: invariant.id, title, gherkin, adversarial };
}

function auditLine(invariant: Invariant): string {
  return invariant.auditRequired ? `\nAnd une entrée d'audit est créée` : "";
}

function negate(outcome: string): string {
  return `il est vérifié que « ${outcome} » ne s'est pas produit`;
}

function labelFor(kind: RequiredTestKind): string {
  const labels: Record<RequiredTestKind, string> = {
    unit_test: "Test unitaire",
    integration_test: "Test d'intégration",
    functional_test: "Test fonctionnel",
    e2e_test: "Test E2E",
    permission_test: "Test de permission (incluant tentative de contournement)",
    property_test: "Test fondé sur les propriétés"
  };
  return labels[kind];
}

function assertDraft(draft: IntentDraft): void {
  if (draft.schemaVersion !== 1) throw new Error("Unsupported intent draft schema version");
  if (!draft.id || !draft.request) throw new Error("Intent draft requires an id and the original request");
  if (draft.invariants.length === 0) throw new Error("Intent draft must declare at least one invariant");
  const ids = new Set(draft.invariants.map((invariant) => invariant.id));
  if (ids.size !== draft.invariants.length) throw new Error("Invariant ids must be unique");
}

function orderedUnique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
