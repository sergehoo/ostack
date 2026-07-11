import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelProvider } from "@ostack/core";
import { compileIntent, draftIntent, extractJson, normalizeDraft, type IntentDraft } from "../src/index.js";

function pilotDraft(): IntentDraft {
  return {
    schemaVersion: 1,
    id: "ai-course-generator",
    request: "Permettre au formateur de générer une formation avec l'IA, mais empêcher sa publication automatique.",
    functionalIntent: [
      "Le formateur peut demander une génération",
      "L'IA produit une proposition modifiable",
      "La proposition reste en brouillon"
    ],
    actors: ["formateur", "apprenant", "administrateur"],
    invariants: [
      {
        id: "no-auto-publish",
        statement: "Une génération IA ne peut jamais publier directement une formation",
        kind: "prohibition",
        given: "une formation au statut brouillon",
        when: "le formateur demande une génération IA",
        outcome: "un statut publié est appliqué",
        auditRequired: true
      },
      {
        id: "owner-only-generation",
        statement: "Seul un utilisateur autorisé peut générer du contenu pour sa formation",
        kind: "permission",
        given: "une formation appartenant à un formateur",
        when: "le formateur propriétaire demande une génération IA",
        outcome: "les contenus proposés sont enregistrés en brouillon",
        auditRequired: true
      },
      {
        id: "audit-everything",
        statement: "Toute génération ou validation doit être journalisée",
        kind: "obligation",
        given: "une génération IA terminée",
        when: "le résultat est enregistré",
        outcome: "une entrée d'audit est créée"
      },
      {
        id: "quiz-section-consistency",
        statement: "Les quiz générés sont associés aux bonnes sections",
        kind: "consistency",
        given: "une proposition générée contenant sections et quiz",
        when: "la proposition est enregistrée",
        outcome: "chaque quiz référence une section existante de la même formation"
      }
    ]
  };
}

test("compilation derives properties, controls, tests and evidence from invariants", () => {
  const compiled = compileIntent(pilotDraft());
  assert.equal(compiled.invariants.length, 4);
  // prohibition and permission both yield an adversarial property
  assert.ok(compiled.properties.some((p) => p.invariantId === "no-auto-publish" && p.adversarial));
  assert.ok(compiled.properties.some((p) => p.invariantId === "owner-only-generation" && p.adversarial));
  // controls include permission and audit machinery
  for (const control of ["object_permission", "endpoint_protection", "status_validation", "audit_log"]) {
    assert.ok(compiled.controls.includes(control as never), `missing control ${control}`);
  }
  // permission invariant demands a permission (bypass) test
  assert.ok(compiled.requiredTests.includes("permission_test"));
  assert.ok(compiled.requiredTests.includes("property_test"));
  // acceptance criteria are exactly the invariant statements — Evidence Pack ready
  assert.deepEqual(compiled.acceptanceCriteria, pilotDraft().invariants.map((i) => i.statement));
  assert.ok(compiled.expectedEvidence.length >= compiled.invariants.length);
});

test("compilation is deterministic: same draft, same content hash", () => {
  assert.equal(compileIntent(pilotDraft()).contentHash, compileIntent(pilotDraft()).contentHash);
  const altered = pilotDraft();
  altered.invariants[0]!.statement = "changed";
  assert.notEqual(compileIntent(pilotDraft()).contentHash, compileIntent(altered).contentHash);
});

test("gherkin properties carry Given/When/Then and audit lines", () => {
  const compiled = compileIntent(pilotDraft());
  const holds = compiled.properties.find((p) => p.id === "no-auto-publish-holds");
  assert.ok(holds);
  assert.match(holds.gherkin, /^Given une formation au statut brouillon/);
  assert.match(holds.gherkin, /When le formateur demande une génération IA/);
  assert.match(holds.gherkin, /ne s'est pas produit/);
  assert.match(holds.gherkin, /entrée d'audit/);
  const denied = compiled.properties.find((p) => p.id === "owner-only-generation-denied");
  assert.ok(denied?.gherkin.includes("acteur non autorisé"));
});

test("a draft without invariants is rejected", () => {
  const draft = { ...pilotDraft(), invariants: [] };
  assert.throws(() => compileIntent(draft), /at least one invariant/);
});

test("model output is treated as untrusted data: fenced JSON accepted, prose rejected", async () => {
  const payload = {
    functionalIntent: ["Le formateur peut demander une génération"],
    actors: ["formateur"],
    invariants: [{
      id: "No Auto Publish!", statement: "Jamais de publication automatique", kind: "prohibition",
      given: "un brouillon", when: "une génération est demandée", outcome: "publication automatique", auditRequired: true
    }]
  };
  const fenced: ModelProvider = {
    id: "fake", isAvailable: async () => true,
    complete: async () => ({ content: "```json\n" + JSON.stringify(payload) + "\n```", model: "m", provider: "fake" })
  };
  const draft = await draftIntent("demo", "demande", fenced);
  assert.equal(draft.invariants[0]?.id, "no-auto-publish-");
  assert.equal(draft.invariants[0]?.auditRequired, true);

  assert.throws(() => extractJson("Voici ma réponse sans JSON"), /JSON/);
  assert.throws(() => normalizeDraft("x", "r", { invariants: [{ kind: "creative" }] }), /unknown kind/);
});
