// Defensive web-risk catalog (§7-11). Each entry is knowledge a Blue/Purple
// Team uses to DETECT a weakness and PROVE it is controlled: how the weakness
// shows up, the controls that close it, and a non-regression test that keeps it
// closed. There are deliberately NO exploitation procedures, payloads, or
// step-by-step attack instructions here — detection signals and defenses only.

export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface WebRisk {
  id: string;
  title: string;
  category: string;
  /** Observable, defensive signals that the weakness may be present. */
  detection: string[];
  /** Controls that close the weakness. */
  controls: string[];
  /** A test that fails if the control regresses. */
  nonRegressionTest: string;
  riskLevel: RiskLevel;
  reference: string;
}

export const WEB_RISKS: readonly WebRisk[] = [
  {
    id: "broken-access-control",
    title: "Contrôle d'accès défaillant (IDOR / élévation)",
    category: "access-control",
    detection: [
      "Identifiants d'objets exposés dans l'URL sans vérification de propriété côté serveur",
      "Décision d'autorisation prise côté client uniquement",
      "Endpoints d'administration accessibles sans contrôle de rôle",
    ],
    controls: [
      "Vérifier la propriété de la ressource côté serveur à chaque requête",
      "Politique deny-by-default; autorisation centralisée et testée",
      "Références indirectes ou contrôle systématique rôle × ressource × propriétaire",
    ],
    nonRegressionTest: "Test: un utilisateur A reçoit 403/404 en accédant à une ressource de l'utilisateur B (matrice de permissions).",
    riskLevel: "critical",
    reference: "OWASP A01:2021",
  },
  {
    id: "injection-sql",
    title: "Injection SQL",
    category: "injection",
    detection: [
      "Concaténation de saisies utilisateur dans une requête SQL",
      "Absence de requêtes paramétrées / ORM dans les chemins de données",
      "Messages d'erreur SQL renvoyés au client",
    ],
    controls: [
      "Requêtes paramétrées / préparées systématiques",
      "Validation et typage stricts des entrées; principe du moindre privilège sur le compte DB",
      "Journalisation des erreurs côté serveur sans fuite vers le client",
    ],
    nonRegressionTest: "Test: une entrée contenant des métacaractères SQL est stockée/rejetée comme donnée littérale, jamais interprétée.",
    riskLevel: "critical",
    reference: "OWASP A03:2021",
  },
  {
    id: "xss",
    title: "Cross-Site Scripting (XSS)",
    category: "injection",
    detection: [
      "Rendu de contenu utilisateur sans échappement contextuel",
      "Usage de innerHTML / dangerouslySetInnerHTML sur des données non fiables",
      "Absence de Content-Security-Policy",
    ],
    controls: [
      "Échappement contextuel à la sortie; templating auto-échappant",
      "Content-Security-Policy restrictive; attributs sûrs par défaut",
      "Sanitization des HTML riches via une bibliothèque maintenue",
    ],
    nonRegressionTest: "Test: une charge <script> soumise en entrée est rendue comme texte inerte et n'exécute aucun code.",
    riskLevel: "high",
    reference: "OWASP A03:2021",
  },
  {
    id: "ssrf",
    title: "Server-Side Request Forgery (SSRF)",
    category: "request-forgery",
    detection: [
      "Le serveur récupère une URL fournie par l'utilisateur sans allowlist",
      "Accès possible aux adresses internes / métadonnées cloud depuis une entrée",
    ],
    controls: [
      "Allowlist stricte des destinations; refus des IP privées et lien-local",
      "Résolution DNS contrôlée; pas de suivi de redirection vers des cibles internes",
      "Segmentation réseau; jeton d'identité pour le service de métadonnées",
    ],
    nonRegressionTest: "Test: une requête vers une IP privée/métadonnées est refusée (allowlist).",
    riskLevel: "high",
    reference: "OWASP A10:2021",
  },
  {
    id: "csrf",
    title: "Cross-Site Request Forgery (CSRF)",
    category: "request-forgery",
    detection: [
      "Mutations d'état acceptées sur cookie de session seul",
      "Absence de jeton anti-CSRF ou de SameSite sur les cookies",
    ],
    controls: [
      "Jeton anti-CSRF synchronisé; cookies SameSite=Lax/Strict",
      "Vérification d'origine/référent pour les requêtes sensibles",
    ],
    nonRegressionTest: "Test: une mutation sans jeton anti-CSRF valide est rejetée (403).",
    riskLevel: "high",
    reference: "OWASP A01:2021",
  },
  {
    id: "auth-weakness",
    title: "Authentification faible",
    category: "authentication",
    detection: [
      "Absence de limitation de tentatives / MFA sur les comptes sensibles",
      "Stockage de mots de passe sans hachage fort et salé",
      "Sessions sans expiration ni rotation après authentification",
    ],
    controls: [
      "Hachage fort (argon2/bcrypt); MFA; politique de mots de passe robustes",
      "Limitation de débit et verrouillage progressif sur l'authentification",
      "Rotation et expiration des sessions; invalidation à la déconnexion",
    ],
    nonRegressionTest: "Test: après N échecs, l'authentification est temporisée/limitée; les hachages ne sont jamais réversibles.",
    riskLevel: "high",
    reference: "OWASP A07:2021",
  },
  {
    id: "sensitive-data-exposure",
    title: "Exposition de données sensibles",
    category: "data-protection",
    detection: [
      "Données sensibles transmises en clair ou journalisées",
      "Absence de chiffrement au repos pour les données réglementées",
      "Secrets en clair dans le dépôt ou les variables d'environnement exposées",
    ],
    controls: [
      "TLS partout; chiffrement au repos; minimisation des données",
      "Gestion des secrets dédiée; jamais de secret en dépôt (scanner)",
      "Masquage des données sensibles dans les journaux",
    ],
    nonRegressionTest: "Test: le scanner de secrets ne trouve aucun secret; les journaux ne contiennent pas de PII en clair.",
    riskLevel: "critical",
    reference: "OWASP A02:2021",
  },
  {
    id: "security-misconfiguration",
    title: "Mauvaise configuration de sécurité",
    category: "configuration",
    detection: [
      "Fonctionnalités de débogage actives en production",
      "En-têtes de sécurité manquants; CORS trop permissif (origine *)",
      "Comptes/ports/services par défaut exposés",
    ],
    controls: [
      "Durcissement par défaut; en-têtes de sécurité (HSTS, X-Content-Type-Options, etc.)",
      "CORS restreint à des origines connues; débogage désactivé en prod",
      "Revue de configuration reproductible et versionnée",
    ],
    nonRegressionTest: "Test: les en-têtes de sécurité attendus sont présents; CORS refuse une origine inconnue.",
    riskLevel: "high",
    reference: "OWASP A05:2021",
  },
  {
    id: "vulnerable-dependencies",
    title: "Composants vulnérables et obsolètes",
    category: "supply-chain",
    detection: [
      "Dépendances avec CVE connues (audit)",
      "Absence de verrouillage des versions; provenance non vérifiée",
    ],
    controls: [
      "Audit régulier (npm audit / SCA); mise à jour priorisée par gravité",
      "Verrouillage des versions; vérification d'intégrité; SBOM",
    ],
    nonRegressionTest: "Test: l'audit des dépendances ne rapporte aucune vulnérabilité haute/critique non traitée.",
    riskLevel: "high",
    reference: "OWASP A06:2021",
  },
  {
    id: "path-traversal",
    title: "Traversée de répertoire",
    category: "injection",
    detection: [
      "Construction de chemins fichiers à partir d'entrées utilisateur",
      "Absence de normalisation/validation des chemins",
    ],
    controls: [
      "Normaliser puis vérifier que le chemin résolu reste dans le répertoire autorisé",
      "Allowlist de noms de fichiers; refus des séquences de remontée",
    ],
    nonRegressionTest: "Test: une entrée contenant une séquence de remontée est refusée et ne sort pas du répertoire racine.",
    riskLevel: "high",
    reference: "OWASP A01:2021",
  },
  {
    id: "insecure-deserialization",
    title: "Désérialisation non sécurisée",
    category: "data-integrity",
    detection: [
      "Désérialisation de données non fiables en objets exécutables",
      "Absence de contrôle d'intégrité sur les données sérialisées",
    ],
    controls: [
      "Formats de données sans exécution (JSON strict); schémas validés",
      "Signature/intégrité des données; allowlist de types",
    ],
    nonRegressionTest: "Test: une charge sérialisée falsifiée est rejetée à la validation de schéma/intégrité.",
    riskLevel: "high",
    reference: "OWASP A08:2021",
  },
  {
    id: "insufficient-logging",
    title: "Journalisation et supervision insuffisantes",
    category: "detection",
    detection: [
      "Événements de sécurité non journalisés (échecs d'auth, accès refusés)",
      "Absence d'alerte sur comportements anormaux",
    ],
    controls: [
      "Journaliser les événements de sécurité de façon non sensible et corrélable",
      "Alertes sur seuils; conservation et intégrité des journaux",
    ],
    nonRegressionTest: "Test: un échec d'authentification et un accès refusé produisent chacun un événement journalisé.",
    riskLevel: "medium",
    reference: "OWASP A09:2021",
  },
  {
    id: "open-redirect",
    title: "Redirection ouverte",
    category: "request-forgery",
    detection: [
      "Redirection vers une URL fournie par l'utilisateur sans validation",
    ],
    controls: [
      "Allowlist des destinations de redirection; chemins relatifs uniquement",
    ],
    nonRegressionTest: "Test: une redirection vers une origine externe non listée est refusée.",
    riskLevel: "medium",
    reference: "OWASP A01:2021",
  },
  {
    id: "rate-limiting",
    title: "Absence de limitation de débit",
    category: "availability",
    detection: [
      "Endpoints coûteux ou sensibles sans limitation de débit",
      "Absence de protection contre l'énumération",
    ],
    controls: [
      "Limitation de débit par identité/IP; quotas; back-pressure",
      "Réponses uniformes pour empêcher l'énumération",
    ],
    nonRegressionTest: "Test: au-delà du seuil, l'endpoint répond 429 de façon déterministe.",
    riskLevel: "medium",
    reference: "OWASP API4:2023",
  },
];

export function webRiskCatalog(): readonly WebRisk[] {
  return WEB_RISKS;
}

export function webRisksByLevel(level: RiskLevel): WebRisk[] {
  return WEB_RISKS.filter((risk) => risk.riskLevel === level);
}

export function findWebRisk(id: string): WebRisk | undefined {
  return WEB_RISKS.find((risk) => risk.id === id);
}
