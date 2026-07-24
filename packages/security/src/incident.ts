// Incident-response scaffold (§19). Produces a structured, defensive incident
// record: the phases to work through, which actions need human approval before
// they run, and the actions that are always forbidden during an incident. It is
// advisory — it never claims a step is done; each is confirmed with evidence.

import type { Severity } from "./evidence.js";

export interface IncidentInput {
  title: string;
  severity?: Severity;
  summary?: string;
  detectedVia?: string[];
}

export interface IncidentStep {
  phase: "detect" | "contain" | "eradicate" | "recover" | "capitalize";
  action: string;
  reversible: boolean;
  requiresHumanApproval: boolean;
}

export interface IncidentRecord {
  title: string;
  severity: Severity;
  status: "open";
  summary: string;
  detectedVia: string[];
  steps: IncidentStep[];
  forbiddenActions: string[];
  evidenceRequired: string;
}

const STEPS: IncidentStep[] = [
  { phase: "detect", action: "Rassembler les preuves observables (journaux, alertes, audit) et qualifier la gravité sans supposition.", reversible: true, requiresHumanApproval: false },
  { phase: "contain", action: "Limiter la propagation par des actions réversibles et autorisées (révoquer un jeton, isoler un service, activer une limitation de débit).", reversible: true, requiresHumanApproval: false },
  { phase: "contain", action: "Toute action de confinement irréversible exige une approbation humaine explicite; préserver les preuves (ne pas écraser les journaux).", reversible: false, requiresHumanApproval: true },
  { phase: "eradicate", action: "Corriger la cause racine (analyse de cause), pas seulement le symptôme; chaque correctif porte une preuve et un test de non-régression.", reversible: true, requiresHumanApproval: false },
  { phase: "recover", action: "Rétablir le service depuis un état sain vérifié; confirmer par des tests exécutés, jamais par supposition.", reversible: true, requiresHumanApproval: true },
  { phase: "capitalize", action: "Consigner la décision et l'invariant défensif appris; ne jamais stocker de secret, d'identifiant, de donnée personnelle ni de détail de cible (§24).", reversible: true, requiresHumanApproval: false },
];

const FORBIDDEN = [
  "Aucune contre-attaque, aucun accès à un système tiers, aucune tentative de « pirater en retour ».",
  "Aucune suppression de preuve, aucune altération de journaux.",
  "Aucune communication publique non approuvée.",
  "Aucune donnée sensible (secret, identifiant, PII) stockée dans le dossier d'incident.",
];

export function scaffoldIncident(input: IncidentInput): IncidentRecord {
  if (!input.title?.trim()) throw new Error("incident: un intitulé est requis.");
  return {
    title: input.title.trim(),
    severity: input.severity ?? "high",
    status: "open",
    summary: input.summary?.trim() ?? "",
    detectedVia: input.detectedVia ?? [],
    steps: STEPS.map((step) => ({ ...step })),
    forbiddenActions: [...FORBIDDEN],
    evidenceRequired: "Chaque étape n'est « faite » qu'adossée à une preuve exécutée; l'incident reste ouvert tant qu'un constat critique/haut n'est pas résolu.",
  };
}
