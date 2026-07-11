import assert from "node:assert/strict";
import { test } from "node:test";
import { compileIntent, type IntentDraft } from "@ostack/intent";
import { evaluateMatrix, evaluateScenarios, missingCells, scenariosFromIntent, type MatrixRule } from "../src/index.js";

function draft(): IntentDraft {
  return {
    schemaVersion: 1,
    id: "ai-course-generator",
    request: "Génération IA de formation sans publication automatique.",
    functionalIntent: ["Génération en brouillon"],
    actors: ["formateur"],
    invariants: [
      { id: "no-auto-publish", statement: "Jamais de publication automatique", kind: "prohibition", given: "un brouillon", when: "une génération est demandée", outcome: "un statut publié est appliqué", auditRequired: true },
      { id: "owner-only", statement: "Seul le propriétaire génère", kind: "permission", given: "une formation possédée", when: "le propriétaire génère", outcome: "la proposition est enregistrée en brouillon" }
    ]
  };
}

// The exact §13 example: Publier un cours × role × state → expected.
const MATRIX: MatrixRule[] = [
  { feature: "Publier un cours", role: "Formateur propriétaire", state: "Validé", expected: "allowed" },
  { feature: "Publier un cours", role: "Autre formateur", state: "Validé", expected: "denied" },
  { feature: "Publier un cours", role: "Apprenant", state: "Brouillon", expected: "denied" },
  { feature: "Publier un cours", role: "Administrateur", state: "Validé", expected: "allowed" }
];

test("scenarios are generated from the compiled intent, adversarial ones included", () => {
  const scenarios = scenariosFromIntent(compileIntent(draft()));
  assert.equal(scenarios.length, 4, "prohibition and permission each yield 2 properties");
  assert.ok(scenarios.some((scenario) => scenario.adversarial));
  assert.match(scenarios[0]!.gherkin, /^Given /);
});

test("scenario evaluation reports passed, failed and — crucially — never-executed scenarios", () => {
  const scenarios = scenariosFromIntent(compileIntent(draft()));
  const report = evaluateScenarios(scenarios, [
    { scenarioId: scenarios[0]!.id, status: "passed" },
    { scenarioId: scenarios[1]!.id, status: "failed", detail: "publication observée" }
  ]);
  assert.deepEqual(report.summary, { passed: 1, failed: 1 });
  assert.equal(report.missing.length, 2, "unexecuted scenarios are not silent passes");
  assert.equal(report.evidenceItems.filter((item) => item.status === "failed").length, 1);
  assert.throws(() => evaluateScenarios(scenarios, [{ scenarioId: "ghost", status: "passed" }]), /unknown scenarios/);
});

test("the permission matrix detects violations and untested cells", () => {
  const report = evaluateMatrix(MATRIX, [
    { feature: "Publier un cours", role: "Formateur propriétaire", state: "Validé", observed: "allowed" },
    { feature: "Publier un cours", role: "Autre formateur", state: "Validé", observed: "allowed" },
    { feature: "Publier un cours", role: "Apprenant", state: "Brouillon", observed: "denied" }
  ]);
  assert.deepEqual(report.summary, { passed: 2, failed: 1 });
  assert.equal(report.violations[0]?.role, "Autre formateur", "a bypass is a violation");
  assert.equal(report.untested[0]?.role, "Administrateur", "an unexercised cell is reported");
  assert.ok(report.evidenceItems.every((item) => item.kind === "permission_test"));
});

test("observations outside the matrix are surfaced, duplicates rejected", () => {
  const report = evaluateMatrix(MATRIX, [
    { feature: "Supprimer un cours", role: "Apprenant", state: "Validé", observed: "allowed" }
  ]);
  assert.equal(report.unexpectedObservations.length, 1, "an unreviewed action that succeeded must be visible");
  assert.throws(() => evaluateMatrix([...MATRIX, MATRIX[0]!], []), /Duplicate matrix cell/);
});

test("missingCells demands an explicit expectation for every role", () => {
  const missing = missingCells(MATRIX, ["Formateur propriétaire", "Autre formateur", "Apprenant", "Administrateur"]);
  // "Validé" has no Apprenant cell; "Brouillon" covers only Apprenant.
  assert.ok(missing.some((cell) => cell.state === "Validé" && cell.role === "Apprenant"));
  assert.ok(missing.some((cell) => cell.state === "Brouillon" && cell.role === "Administrateur"));
});
