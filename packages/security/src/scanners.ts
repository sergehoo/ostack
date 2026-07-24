// Real-scanner adapters (§14, §24). These are PURE parsers: they turn a
// scanner's actual JSON output into defensive findings. They never invent a
// result — the CLI only calls them when the tool truly ran, and if a tool is
// absent or its output cannot be parsed, its checks stay `not_run`. The secrets
// parser REDACTS every secret value: OStack never stores a credential (§24).

import type { SecurityFinding, Severity } from "./evidence.js";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// ── Semgrep (SAST): `semgrep scan --json` ──────────────────────────────────
function mapSemgrepSeverity(severity: string): Severity {
  switch (severity.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}

export function parseSemgrep(output: unknown): SecurityFinding[] {
  const results = asArray((output as { results?: unknown })?.results);
  return results.map((raw, index) => {
    const result = raw as { check_id?: unknown; path?: unknown; start?: { line?: unknown }; extra?: { message?: unknown; severity?: unknown } };
    const path = str(result.path);
    const line = num(result.start?.line);
    const checkId = str(result.check_id) || `semgrep-${index}`;
    const message = str(result.extra?.message) || "Motif à risque détecté par Semgrep.";
    const location = path ? `${path}${line ? `:${line}` : ""}` : "emplacement inconnu";
    const finding: SecurityFinding = {
      id: `semgrep:${checkId}:${location}`,
      title: `Semgrep: ${checkId}`,
      severity: mapSemgrepSeverity(str(result.extra?.severity)),
      evidence: `${checkId} @ ${location} — ${message}`,
      remediation: `Corriger le motif signalé par la règle ${checkId} (${message}).`,
      status: "open",
    };
    if (path) finding.file = line ? `${path}:${line}` : path;
    return finding;
  });
}

// ── Gitleaks (secrets): `gitleaks detect --report-format json` ─────────────
// Output is an array of leaks. The secret value is NEVER kept (§24).
export function parseGitleaks(output: unknown): SecurityFinding[] {
  return asArray(output).map((raw, index) => {
    const leak = raw as { RuleID?: unknown; File?: unknown; StartLine?: unknown; Description?: unknown };
    const rule = str(leak.RuleID) || `gitleaks-${index}`;
    const file = str(leak.File) || "fichier inconnu";
    const line = num(leak.StartLine);
    const location = `${file}${line ? `:${line}` : ""}`;
    return {
      id: `gitleaks:${rule}:${location}`,
      title: `Secret potentiel: ${rule}`,
      severity: "critical",
      file: line ? `${file}:${line}` : file,
      // Deliberately no Secret/Match field: the value is redacted, never stored.
      evidence: `Secret potentiel (${rule}) détecté à ${location}. Valeur rédigée (non stockée, §24).`,
      remediation: "Révoquer et faire tourner le secret; le retirer de l'historique Git; utiliser un gestionnaire de secrets.",
      nonRegressionTest: "Le scanner de secrets ne rapporte plus aucune fuite dans le dépôt.",
      status: "open",
    };
  });
}

// ── Trivy (dépendances, IaC, conteneurs): `trivy fs --format json` ─────────
function mapTrivySeverity(severity: string): Severity {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "info";
  }
}

export function parseTrivy(output: unknown): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const rawResult of asArray((output as { Results?: unknown })?.Results)) {
    const result = rawResult as { Target?: unknown; Vulnerabilities?: unknown; Misconfigurations?: unknown };
    const target = str(result.Target) || "cible inconnue";
    for (const rawVuln of asArray(result.Vulnerabilities)) {
      const vuln = rawVuln as { VulnerabilityID?: unknown; PkgName?: unknown; InstalledVersion?: unknown; FixedVersion?: unknown; Severity?: unknown; Title?: unknown };
      const id = str(vuln.VulnerabilityID) || "VULN";
      const pkg = str(vuln.PkgName) || "paquet inconnu";
      const installed = str(vuln.InstalledVersion);
      const fixed = str(vuln.FixedVersion);
      findings.push({
        id: `trivy:${id}:${pkg}`,
        title: `${id} — ${pkg}`,
        severity: mapTrivySeverity(str(vuln.Severity)),
        file: target,
        evidence: `${id} dans ${pkg}${installed ? `@${installed}` : ""} (${target})${str(vuln.Title) ? ` — ${str(vuln.Title)}` : ""}.`,
        remediation: fixed ? `Mettre à jour ${pkg} vers ${fixed} ou une version corrigée.` : `Mettre à jour ou remplacer ${pkg}; suivre l'avis ${id}.`,
        nonRegressionTest: "Le scan des dépendances ne rapporte plus cette vulnérabilité.",
        status: "open",
      });
    }
    for (const rawMisc of asArray(result.Misconfigurations)) {
      const misc = rawMisc as { ID?: unknown; Title?: unknown; Severity?: unknown; Description?: unknown; Resolution?: unknown };
      const id = str(misc.ID) || "MISCONFIG";
      findings.push({
        id: `trivy:${id}:${target}`,
        title: `${id} — ${str(misc.Title) || "mauvaise configuration"}`,
        severity: mapTrivySeverity(str(misc.Severity)),
        file: target,
        evidence: `${id} (${target})${str(misc.Description) ? ` — ${str(misc.Description)}` : ""}.`,
        remediation: str(misc.Resolution) || "Corriger la configuration selon l'avis; durcir par défaut.",
        status: "open",
      });
    }
  }
  return findings;
}

export interface ScannerSpec {
  tool: string;
  args: string[];
  check: string;
  parse: (output: unknown) => SecurityFinding[];
  category: "sast" | "secrets" | "sca";
}

// How each scanner is invoked and parsed. The CLI runs these ONLY for tools it
// has confirmed present on PATH; absence keeps the check `not_run` (§14).
export const SCANNERS: readonly ScannerSpec[] = [
  { tool: "semgrep", args: ["scan", "--json", "--quiet", "--error", "."], check: "sast:semgrep", parse: parseSemgrep, category: "sast" },
  { tool: "gitleaks", args: ["detect", "--no-git", "--report-format", "json", "--report-path", "-"], check: "secrets:gitleaks", parse: parseGitleaks, category: "secrets" },
  { tool: "trivy", args: ["fs", "--quiet", "--format", "json", "."], check: "sca:trivy", parse: parseTrivy, category: "sca" },
];
