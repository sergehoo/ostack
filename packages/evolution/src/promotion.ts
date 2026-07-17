// Knowledge Promotion Pipeline (§8) + scope classification (§9).
// A single observation never becomes a global rule: promotion is a deterministic
// function of observations, project diversity, reproduction, confidence and the
// absence of contradiction. Project-scoped knowledge can never auto-promote to
// universal.

import type { PromotionStatus } from "./ledger.js";

export type ScopeType = "project" | "organization" | "domain" | "technology" | "universal";

export interface Scope {
  type: ScopeType;
  domain?: string;
  technology?: string;
}

export interface PromotionSignals {
  observations: number;
  distinctProjects: number;
  reproduced: boolean;
  confidence: number;
  hasEvidence: boolean;
  contradicted: boolean;
  independentVerification: boolean;
}

export interface PromotionPolicy {
  minimumConfidence: number;
  minimumObservations: number;
  requireReproduction: boolean;
  requireEvidence: boolean;
  requireIndependentVerification: boolean;
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minimumConfidence: 0.9,
  minimumObservations: 2,
  requireReproduction: true,
  requireEvidence: true,
  requireIndependentVerification: true
};

export interface PromotionDecision {
  current: PromotionStatus;
  next: PromotionStatus;
  eligibleForPromotion: boolean;
  blockers: string[];
}

const ORDER: PromotionStatus[] = ["OBSERVED", "CANDIDATE", "REPRODUCED", "VALIDATED", "PROMOTED", "DEPRECATED"];

export function evaluatePromotion(current: PromotionStatus, scope: Scope, signals: PromotionSignals, policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY): PromotionDecision {
  const blockers: string[] = [];
  if (signals.contradicted) blockers.push("contradiction détectée avec une connaissance existante");
  if (signals.confidence < policy.minimumConfidence) blockers.push(`confiance ${signals.confidence} < ${policy.minimumConfidence}`);
  if (signals.observations < policy.minimumObservations) blockers.push(`observations ${signals.observations} < ${policy.minimumObservations}`);
  if (policy.requireReproduction && !signals.reproduced) blockers.push("non reproduit");
  if (policy.requireEvidence && !signals.hasEvidence) blockers.push("aucune preuve rattachée");
  if (policy.requireIndependentVerification && !signals.independentVerification) blockers.push("vérification indépendante manquante");

  // Universal knowledge demands the highest bar: seen across several projects.
  if (scope.type === "universal" && signals.distinctProjects < 2) {
    blockers.push("portée universelle exigée mais vue dans un seul projet (§9: une observation unique ne devient jamais une règle globale)");
  }

  const eligible = blockers.length === 0 && current !== "PROMOTED" && current !== "DEPRECATED";
  let next = current;
  if (current === "OBSERVED") next = signals.observations >= 1 ? "CANDIDATE" : "OBSERVED";
  if (current === "CANDIDATE" && signals.reproduced) next = "REPRODUCED";
  if (current === "REPRODUCED" && signals.hasEvidence && signals.confidence >= policy.minimumConfidence) next = "VALIDATED";
  if (current === "VALIDATED" && eligible) next = "PROMOTED";
  return { current, next, eligibleForPromotion: eligible && next === "PROMOTED", blockers };
}

// §9 rules encoded: a project practice never silently becomes universal; a
// business rule never becomes a technical standard.
export function assertScopeTransition(from: Scope, to: Scope): void {
  if (from.type === "project" && to.type === "universal") {
    throw new Error("Une pratique de projet ne peut pas devenir universelle sans revalidation explicite (§9)");
  }
  if (from.type === "domain" && to.type === "technology") {
    throw new Error("Une règle métier ne peut pas être déplacée vers les standards techniques (§9)");
  }
}

export function orderIndex(status: PromotionStatus): number {
  return ORDER.indexOf(status);
}
