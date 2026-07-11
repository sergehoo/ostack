import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeCrossDomain, analyzeDecisionTable, assertDomainActionAllowed, assessMaturity,
  computeDomainConfidence, confirmRule, evaluateAction, evaluateDecisionTable,
  evaluateRule, applicableRules, generateRuleScenarios,
  type BusinessRule, type DomainPack
} from "../src/index.js";

const NOW = "2026-07-11T12:00:00Z";

function creditRule(overrides: Partial<BusinessRule> = {}): BusinessRule {
  return {
    id: "br-credit-042",
    statement: "Un dossier ne peut être décaissé sans validation finale",
    kind: "internal_rule",
    when: { action: "dossier.decaissement" },
    conditions: [{ path: "dossier.validationFinale", equals: true }],
    otherwise: { block: true, message: "La validation finale est requise avant décaissement" },
    status: "confirmed",
    sources: ["procedure-credit-v4"],
    validatedBy: [{ expert: "responsable_credit", reason: "Procédure v4 §3.2", validatedAt: NOW }],
    ...overrides
  };
}

function pack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    schemaVersion: 1, id: "credit-ci", name: "Crédit bancaire", sector: "banque", country: "CI", language: "fr", version: "1.0.0",
    sources: [{ id: "procedure-credit-v4", title: "Procédure crédit v4", kind: "document", date: "2026-01-01" }],
    experts: [{ name: "responsable_credit", role: "Responsable crédit" }],
    glossary: [
      { term: "décaissement", definition: "Mise à disposition des fonds", concept: "transaction", status: "confirmed", sources: ["procedure-credit-v4"] },
      { term: "dossier de crédit", definition: "Dossier client de demande de prêt", concept: "case_file", status: "confirmed", sources: ["procedure-credit-v4"] },
      { term: "validation finale", definition: "Approbation du comité", concept: "approval", status: "extracted", sources: ["procedure-credit-v4"] }
    ],
    actors: [{ id: "conseiller", name: "Conseiller", roles: ["instruction"], status: "confirmed", sources: ["procedure-credit-v4"] }],
    workflows: [{
      id: "souscription", name: "Souscription", status: "extracted", sources: ["procedure-credit-v4"],
      steps: [{ id: "demande", name: "Demande" }, { id: "decaissement", name: "Décaissement", irreversible: true }]
    }],
    rules: [creditRule()],
    decisionTables: [],
    kpis: [{ name: "taux-traitement-delais", objective: "Respect des délais", formula: "dossiers_dans_delai / dossiers_total * 100", dataSources: ["cases"], frequency: "weekly", owner: "operations_manager", threshold: { target: 95, warning: 90 } }],
    mappings: [{ universalConcept: "customer", localTerms: ["emprunteur"] }],
    openQuestions: [],
    ...overrides
  };
}

test("a confirmed blocking rule blocks; the same rule merely assumed escalates to a human", () => {
  const context = { dossier: { validationFinale: false } };
  const confirmed = evaluateRule(creditRule(), "dossier.decaissement", context);
  assert.equal(confirmed.decision, "blocked");
  assert.match(confirmed.explanation, /validation finale/i);

  const assumed = evaluateRule(creditRule({ status: "assumed", validatedBy: [] }), "dossier.decaissement", context);
  assert.equal(assumed.decision, "needs_human_review", "an unconfirmed rule never blocks nor passes silently (§26)");

  const ok = evaluateAction([creditRule()], "dossier.decaissement", { dossier: { validationFinale: true } });
  assert.equal(ok.decision, "allowed");
});

test("the same mechanics serve another sector unchanged (§15)", () => {
  const delivery: BusinessRule = {
    id: "require-payment-before-delivery", statement: "Le paiement doit être validé avant livraison", kind: "internal_rule",
    when: { action: "order.delivery" }, conditions: [{ path: "payment.status", equals: "validated" }],
    otherwise: { block: true }, status: "confirmed", sources: ["s1"], validatedBy: [{ expert: "resp", reason: "ok", validatedAt: NOW }]
  };
  assert.equal(evaluateRule(delivery, "order.delivery", { payment: { status: "pending" } }).decision, "blocked");
  assert.equal(evaluateRule(delivery, "order.delivery", { payment: { status: "validated" } }).decision, "allowed");
});

test("no source, no confirmation; a regulatory rule must be localized and dated (§33)", () => {
  const unsourced = creditRule({ status: "extracted", sources: [], validatedBy: [] });
  assert.throws(() => confirmRule(unsourced, { expert: "x", reason: "r", validatedAt: NOW }), /aucune source/);

  const regulatory = creditRule({ id: "reg-1", kind: "regulatory_obligation", status: "extracted", validatedBy: [] });
  assert.throws(() => confirmRule(regulatory, { expert: "x", reason: "r", validatedAt: NOW }), /localisée.*datée|jurisdiction/i);
  const localized = confirmRule({ ...regulatory, jurisdiction: "CI", effectiveFrom: "2026-01-01" }, { expert: "conformite", reason: "loi bancaire", validatedAt: NOW });
  assert.equal(localized.status, "confirmed");
});

test("rules from another jurisdiction are excluded, never silently applied (§18)", () => {
  const rules = [creditRule(), creditRule({ id: "fr-only", jurisdiction: "FR" })];
  const result = applicableRules(rules, "CI");
  assert.deepEqual(result.applicable.map((rule) => rule.id), ["br-credit-042"]);
  assert.deepEqual(result.excluded, [{ id: "fr-only", jurisdiction: "FR" }]);
});

test("domain confidence is computed from sources and validations, never declared", () => {
  const full = computeDomainConfidence(pack());
  assert.ok(full.terminology > 50, "sourced glossary scores");
  assert.equal(full.expertValidation, 100, "the only rule is expert-validated");
  assert.ok(full.assumed.length === 0);

  const weak = computeDomainConfidence(pack({
    glossary: [{ term: "x", definition: "d", status: "assumed", sources: [] }],
    rules: [creditRule({ status: "assumed", sources: [], validatedBy: [] })]
  }));
  assert.ok(weak.terminology < 50);
  assert.equal(weak.expertValidation, 0);
  assert.ok(weak.assumed.length >= 2, "assumptions are listed, not hidden (§26.5)");
});

test("maturity ladder: empty=0, critical action gated with an explicit reason (§30)", () => {
  const empty = pack({ glossary: [], actors: [], workflows: [], rules: [], kpis: [], mappings: [], experts: [] });
  assert.equal(assessMaturity(empty).level, 0);
  assert.throws(() => assertDomainActionAllowed(empty, "generer-contrat", "critical"), /niveau 0.*niveau 4 requis/s);

  const operational = assessMaturity(pack());
  assert.equal(operational.level, 4);
  assert.equal(assertDomainActionAllowed(pack(), "generer-contrat", "critical").level, 4);

  const unvalidated = pack({ rules: [creditRule({ status: "extracted", validatedBy: [] })] });
  assert.equal(assessMaturity(unvalidated).level, 2, "unconfirmed blocking rules cap maturity at modelled");
  assert.throws(() => assertDomainActionAllowed(unvalidated, "decaisser", "high"), /non confirmées/);
});

test("the §16 decision table evaluates, explains, and surfaces uncovered cases", () => {
  const table = {
    id: "validation-credit", name: "Validation requise", status: "confirmed" as const, sources: ["procedure-credit-v4"],
    inputs: [
      { name: "montant", values: ["faible", "moyen", "eleve", "tres-eleve"] },
      { name: "profil", values: ["standard", "sensible"] }
    ],
    rows: [
      { conditions: { montant: "faible", profil: "*" }, outcome: "automatique" },
      { conditions: { montant: "moyen", profil: "standard" }, outcome: "responsable" },
      { conditions: { montant: "eleve", profil: "sensible" }, outcome: "comite" },
      { conditions: { montant: "tres-eleve", profil: "sensible" }, outcome: "direction-generale" }
    ]
  };
  const decision = evaluateDecisionTable(table, { montant: "eleve", profil: "sensible" });
  assert.equal(decision.outcome, "comite");
  assert.match(decision.explanation, /Ligne 3/);

  const analysis = analyzeDecisionTable(table);
  assert.equal(analysis.conflicts.length, 0);
  assert.ok(analysis.uncovered.some((input) => input.montant === "moyen" && input.profil === "sensible"), "uncovered combination is reported");

  const conflicting = { ...table, rows: [...table.rows, { conditions: { montant: "eleve", profil: "sensible" }, outcome: "responsable" }] };
  assert.ok(analyzeDecisionTable(conflicting).conflicts.length > 0);
  assert.equal(evaluateDecisionTable(conflicting, { montant: "eleve", profil: "sensible" }).outcome, undefined, "a conflict never resolves silently");
});

test("universal test scenarios are generated from the rule (§23)", () => {
  const scenarios = generateRuleScenarios(creditRule());
  assert.equal(scenarios.length, 3);
  assert.ok(scenarios.some((scenario) => scenario.kind === "blocked" && /bloquée/.test(scenario.gherkin)));
  assert.ok(scenarios.some((scenario) => scenario.kind === "missing_data" && /silencieusement/.test(scenario.gherkin)));
});

test("cross-domain analysis reports shared concepts and blocking overlaps (§19)", () => {
  const finance = pack();
  const commercial = pack({
    id: "commercial", name: "Commercial", sector: "commerce",
    mappings: [{ universalConcept: "customer", localTerms: ["prospect"] }],
    rules: [creditRule({ id: "com-1", when: { action: "dossier.decaissement" } })],
    actors: [{ id: "conseiller", name: "Conseiller", roles: ["vente"], status: "confirmed", sources: ["procedure-credit-v4"] }]
  });
  const analysis = analyzeCrossDomain([finance, commercial]);
  assert.equal(analysis.sharedConcepts[0]?.universalConcept, "customer");
  assert.equal(analysis.ruleOverlaps[0]?.action, "dossier.decaissement");
  assert.equal(analysis.ruleOverlaps[0]?.requiresCrossValidation, true);
  assert.deepEqual(analysis.sharedActors[0]?.domains, ["commercial", "credit-ci"]);
});
