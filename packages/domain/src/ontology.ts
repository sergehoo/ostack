// OStack Universal Business Ontology (§4) — the common concepts every domain
// specializes. OStack never claims to know a business: it maps the business's
// own vocabulary onto these concepts, with sources.

export const UNIVERSAL_CONCEPTS = [
  "organization", "department", "site",
  "user", "role", "responsibility",
  "customer", "supplier", "partner",
  "product", "service", "resource", "asset",
  "case_file", "contract", "document", "form",
  "transaction", "payment",
  "task", "workflow", "validation", "approval", "decision",
  "event", "notification", "deadline",
  "risk", "incident", "control", "audit",
  "indicator", "objective",
  "business_rule", "exception",
  "status", "transition", "authorization",
  "sensitive_data"
] as const;

export type UniversalConcept = (typeof UNIVERSAL_CONCEPTS)[number];

export function isUniversalConcept(value: string): value is UniversalConcept {
  return (UNIVERSAL_CONCEPTS as readonly string[]).includes(value);
}

// Domain Adaptation Layer (§11): a domain speaks its own language; the mapping
// makes universal capabilities reusable without erasing the local vocabulary.
export interface ConceptMapping {
  universalConcept: UniversalConcept;
  localTerms: string[];
}

// The essential discovery questions (§3) asked whenever information is missing.
export const ESSENTIAL_QUESTIONS = [
  "Quel est l'objectif métier principal ?",
  "Qui exécute ce processus ?",
  "Qui valide cette action ?",
  "Quelles données sont obligatoires ?",
  "Quelles erreurs doivent bloquer le processus ?",
  "Quelles exceptions sont autorisées ?",
  "Quels documents sont produits ?",
  "Quels délais doivent être respectés ?",
  "Quels indicateurs mesurent la réussite ?",
  "Quelles actions sont irréversibles ?",
  "Quelles exigences réglementaires s'appliquent ?"
] as const;
