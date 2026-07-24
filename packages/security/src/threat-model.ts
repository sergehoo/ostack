// Threat-model scaffold (§18). Produces a structured, STRIDE-oriented skeleton a
// team fills in — assets, trust boundaries, entry points, threats and controls.
// It is advisory: it proposes the questions, never invents that a control exists.

export interface ThreatModelInput {
  system: string;
  assets?: string[];
  actors?: string[];
  entryPoints?: string[];
  trustBoundaries?: string[];
}

export interface ThreatEntry {
  category: "spoofing" | "tampering" | "repudiation" | "information_disclosure" | "denial_of_service" | "elevation_of_privilege";
  question: string;
  suggestedControls: string[];
}

export interface ThreatModel {
  system: string;
  assets: string[];
  actors: string[];
  entryPoints: string[];
  trustBoundaries: string[];
  threats: ThreatEntry[];
  residualRisksToConfirm: string[];
}

const STRIDE: ThreatEntry[] = [
  { category: "spoofing", question: "Comment une identité peut-elle être usurpée à cette frontière ?", suggestedControls: ["Authentification forte", "MFA", "Rotation des sessions"] },
  { category: "tampering", question: "Quelles données peuvent être altérées en transit ou au repos ?", suggestedControls: ["Intégrité (signatures/hash)", "TLS", "Contrôles d'accès en écriture"] },
  { category: "repudiation", question: "Quelles actions doivent être imputables et journalisées ?", suggestedControls: ["Journaux d'audit non sensibles", "Horodatage fiable"] },
  { category: "information_disclosure", question: "Quelles données sensibles pourraient fuiter ?", suggestedControls: ["Chiffrement", "Minimisation", "Masquage des journaux"] },
  { category: "denial_of_service", question: "Quels chemins peuvent être saturés ou épuisés ?", suggestedControls: ["Limitation de débit", "Quotas", "Back-pressure"] },
  { category: "elevation_of_privilege", question: "Comment un acteur pourrait-il obtenir plus de droits ?", suggestedControls: ["Deny-by-default", "Moindre privilège", "Vérification rôle × ressource"] },
];

export function scaffoldThreatModel(input: ThreatModelInput): ThreatModel {
  if (!input.system?.trim()) throw new Error("threat-model: le système à modéliser est requis.");
  return {
    system: input.system.trim(),
    assets: input.assets ?? [],
    actors: input.actors ?? [],
    entryPoints: input.entryPoints ?? [],
    trustBoundaries: input.trustBoundaries ?? [],
    threats: STRIDE.map((threat) => ({ ...threat, suggestedControls: [...threat.suggestedControls] })),
    residualRisksToConfirm: [
      "Chaque menace ci-dessus doit être confirmée présente/absente par un humain avec preuve.",
      "Les contrôles suggérés doivent être vérifiés réellement en place, jamais supposés.",
    ],
  };
}
