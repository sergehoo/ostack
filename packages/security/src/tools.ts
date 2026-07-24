// Tool detection (§14). OStack NEVER fabricates a scanner's result. This module
// only records which known security tools are actually present on the host (the
// caller supplies the PATH-resolved list). If a tool is absent, its checks are
// reported as `not_run` — never as "passed". Absence of evidence is not evidence
// of security.

export interface SecurityTool {
  name: string;
  purpose: string;
  category: "sast" | "secrets" | "sca" | "container" | "iac" | "dast" | "audit";
}

export const KNOWN_TOOLS: readonly SecurityTool[] = [
  { name: "semgrep", purpose: "Analyse statique (SAST) multi-langages", category: "sast" },
  { name: "bandit", purpose: "Analyse statique Python", category: "sast" },
  { name: "gitleaks", purpose: "Détection de secrets dans le dépôt", category: "secrets" },
  { name: "trufflehog", purpose: "Détection de secrets et vérification", category: "secrets" },
  { name: "npm", purpose: "Audit des dépendances npm (npm audit)", category: "audit" },
  { name: "osv-scanner", purpose: "Vulnérabilités des dépendances (OSV)", category: "sca" },
  { name: "grype", purpose: "Vulnérabilités d'images/paquets", category: "sca" },
  { name: "syft", purpose: "Génération de SBOM", category: "sca" },
  { name: "trivy", purpose: "Vulnérabilités conteneurs et IaC", category: "container" },
  { name: "hadolint", purpose: "Lint de Dockerfile", category: "container" },
  { name: "checkov", purpose: "Analyse de configuration IaC", category: "iac" },
  { name: "tfsec", purpose: "Analyse de sécurité Terraform", category: "iac" },
];

export interface ToolDetection {
  name: string;
  purpose: string;
  category: SecurityTool["category"];
  present: boolean;
}

/**
 * Map the known catalog against the tools actually available on the host.
 * `available` is the honest, PATH-resolved list gathered by the caller.
 */
export function detectTools(available: readonly string[]): ToolDetection[] {
  const set = new Set(available.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return KNOWN_TOOLS.map((tool) => ({
    name: tool.name,
    purpose: tool.purpose,
    category: tool.category,
    present: set.has(tool.name),
  }));
}

export interface ToolCoverage {
  detections: ToolDetection[];
  present: string[];
  missing: string[];
  /** Categories with no available tool — their checks must be reported `not_run`. */
  uncoveredCategories: SecurityTool["category"][];
}

export function toolCoverage(available: readonly string[]): ToolCoverage {
  const detections = detectTools(available);
  const present = detections.filter((detection) => detection.present).map((detection) => detection.name);
  const missing = detections.filter((detection) => !detection.present).map((detection) => detection.name);
  const coveredCategories = new Set(detections.filter((detection) => detection.present).map((detection) => detection.category));
  const uncoveredCategories = [...new Set(KNOWN_TOOLS.map((tool) => tool.category))].filter(
    (category) => !coveredCategories.has(category),
  );
  return { detections, present, missing, uncoveredCategories };
}
