// OStack Intent-to-Proof Compiler — contracts.
// A natural-language request is first drafted into a structured IntentDraft
// (model-assisted or hand-written), then compiled deterministically into
// testable properties, technical controls and expected evidence. The compiler
// itself never depends on a model: same draft, same compiled intent, same hash.

export type InvariantKind = "prohibition" | "permission" | "obligation" | "consistency";

export interface Invariant {
  id: string;
  statement: string;
  kind: InvariantKind;
  given: string;
  when: string;
  outcome: string;
  auditRequired?: boolean;
}

export interface IntentDraft {
  schemaVersion: 1;
  id: string;
  request: string;
  functionalIntent: string[];
  actors: string[];
  invariants: Invariant[];
}

export type TechnicalControl =
  | "authentication"
  | "object_permission"
  | "endpoint_protection"
  | "status_validation"
  | "input_validation"
  | "audit_log"
  | "data_integrity_check";

export type RequiredTestKind =
  | "unit_test"
  | "integration_test"
  | "functional_test"
  | "e2e_test"
  | "permission_test"
  | "property_test";

export interface TestableProperty {
  id: string;
  invariantId: string;
  title: string;
  gherkin: string;
  adversarial: boolean;
}

export interface ExpectedEvidence {
  invariantId: string;
  kind: RequiredTestKind;
  description: string;
}

export interface CompiledIntent {
  schemaVersion: 1;
  id: string;
  request: string;
  functionalIntent: string[];
  actors: string[];
  invariants: Invariant[];
  properties: TestableProperty[];
  controls: TechnicalControl[];
  requiredTests: RequiredTestKind[];
  acceptanceCriteria: string[];
  expectedEvidence: ExpectedEvidence[];
  contentHash: string;
}
