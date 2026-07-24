import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import {
  assembleSecurityEvidence,
  toolCoverage,
  webRiskCatalog,
  webRisksByLevel,
  scaffoldThreatModel,
  SCANNERS,
  type RiskLevel,
  type SecurityCheck,
  type SecurityFinding,
  type SecurityEvidenceInput,
} from "@ostack/security";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const run = promisify(execFile);

// `ostack security <sub>` — strictly DEFENSIVE. Every path here is passive and
// non-destructive: it inspects the local project, never tests a live third
// party. Active testing of a real target goes exclusively through
// `ostack security-lab` (authorized, time-boxed manifest).
export async function runSecurity(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  switch (subcommand) {
    case "review":
      return review(context);
    case "dependencies":
      return dependencies(context);
    case "threat-model":
      return threatModel(rest);
    case "catalog":
      return catalog(rest);
    case "evidence":
      return evidenceFromFile(context, rest);
    default:
      throw new Error(
        "Usage: ostack security <review|dependencies|threat-model|catalog|evidence>\n" +
          "  review               audit défensif local (outils détectés, dépendances, secrets) → Evidence Pack\n" +
          "  dependencies         audit des dépendances (npm audit si présent)\n" +
          "  threat-model <sys>   squelette de modèle de menaces STRIDE\n" +
          "  catalog [niveau]     catalogue défensif des risques web\n" +
          "  evidence <fic.json>  assemble un Security Evidence Pack depuis un fichier\n" +
          "Pour un test actif autorisé et borné dans le temps: ostack security-lab.",
      );
  }
}

async function detectHostTools(): Promise<string[]> {
  const candidates = ["semgrep", "bandit", "gitleaks", "trufflehog", "npm", "osv-scanner", "grype", "syft", "trivy", "hadolint", "checkov", "tfsec"];
  const present: string[] = [];
  await Promise.all(
    candidates.map(async (tool) => {
      try {
        await run(process.platform === "win32" ? "where" : "which", [tool]);
        present.push(tool);
      } catch {
        // Absent tool: never recorded as present (§14).
      }
    }),
  );
  return present;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// npm audit, honestly: parse real JSON, never invent counts if npm is absent.
async function runNpmAudit(cwd: string): Promise<{ status: SecurityCheck["status"]; detail: string; critical: number; high: number }> {
  if (!(await fileExists(join(cwd, "package.json")))) return { status: "not_run", detail: "aucun package.json", critical: 0, high: 0 };
  try {
    const { stdout } = await run("npm", ["audit", "--json"], { cwd, maxBuffer: 20 * 1024 * 1024 });
    return parseAudit(stdout);
  } catch (error) {
    // npm audit exits non-zero when vulnerabilities exist; stdout still holds JSON.
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === "string" && stdout.trim().startsWith("{")) return parseAudit(stdout);
    return { status: "not_run", detail: "npm audit indisponible", critical: 0, high: 0 };
  }
}

function parseAudit(stdout: string): { status: SecurityCheck["status"]; detail: string; critical: number; high: number } {
  const report = JSON.parse(stdout) as { metadata?: { vulnerabilities?: Record<string, number> } };
  const vulns = report.metadata?.vulnerabilities ?? {};
  const critical = vulns.critical ?? 0;
  const high = vulns.high ?? 0;
  const status: SecurityCheck["status"] = critical + high > 0 ? "failed" : (vulns.moderate ?? 0) + (vulns.low ?? 0) > 0 ? "warning" : "passed";
  return { status, detail: `critical=${critical} high=${high} moderate=${vulns.moderate ?? 0} low=${vulns.low ?? 0}`, critical, high };
}

async function runSecretScan(cwd: string): Promise<SecurityCheck> {
  const script = join(cwd, "scripts/scan-secrets.mjs");
  if (!(await fileExists(script))) return { name: "secret-scan", status: "not_run", detail: "scanner de secrets absent du projet" };
  try {
    await run("node", [script], { cwd, maxBuffer: 20 * 1024 * 1024 });
    return { name: "secret-scan", status: "passed", detail: "aucun secret détecté" };
  } catch (error) {
    return { name: "secret-scan", status: "failed", detail: (error as { stdout?: string }).stdout?.slice(0, 400) ?? "secret potentiel détecté" };
  }
}

// Run each real scanner that is actually present on PATH. A tool that is absent
// is skipped entirely; a tool that fails to run or emit parseable JSON becomes a
// `not_run` check — never a fabricated pass (§14).
async function runScanners(cwd: string, available: readonly string[]): Promise<{ checks: SecurityCheck[]; findings: SecurityFinding[] }> {
  const present = new Set(available);
  const checks: SecurityCheck[] = [];
  const findings: SecurityFinding[] = [];
  for (const scanner of SCANNERS) {
    if (!present.has(scanner.tool)) continue;
    let stdout: string;
    try {
      ({ stdout } = await run(scanner.tool, scanner.args, { cwd, maxBuffer: 50 * 1024 * 1024 }));
    } catch (error) {
      // Most scanners exit non-zero when they find issues; the JSON is still on stdout.
      const captured = (error as { stdout?: string }).stdout;
      if (typeof captured === "string" && captured.trim().length > 0) {
        stdout = captured;
      } else {
        checks.push({ name: scanner.check, status: "not_run", detail: `${scanner.tool} n'a produit aucune sortie exploitable` });
        continue;
      }
    }
    let parsed: SecurityFinding[];
    try {
      parsed = scanner.parse(JSON.parse(stdout));
    } catch {
      checks.push({ name: scanner.check, status: "not_run", detail: `sortie de ${scanner.tool} non analysable` });
      continue;
    }
    const blocking = parsed.some((finding) => finding.severity === "critical" || finding.severity === "high");
    checks.push({ name: scanner.check, status: blocking ? "failed" : parsed.length > 0 ? "warning" : "passed", detail: `${parsed.length} constat(s)` });
    findings.push(...parsed);
  }
  return { checks, findings };
}

async function review(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const available = await detectHostTools();
  const coverage = toolCoverage(available);

  const audit = await runNpmAudit(context.cwd);
  const secretScan = await runSecretScan(context.cwd);
  const scanners = await runScanners(context.cwd, available);

  const checks: SecurityCheck[] = [
    { name: "dependency-audit", status: audit.status, detail: audit.detail },
    secretScan,
    ...scanners.checks,
    { name: "tooling-coverage", status: coverage.uncoveredCategories.length > 0 ? "warning" : "passed", detail: `présents: ${coverage.present.join(", ") || "aucun"}; catégories sans outil: ${coverage.uncoveredCategories.join(", ") || "aucune"}` },
  ];

  const findings: SecurityFinding[] = [...scanners.findings];
  if (audit.critical + audit.high > 0) {
    findings.push({
      id: "dep-vulns",
      title: `Dépendances vulnérables (${audit.critical} critiques, ${audit.high} hautes)`,
      severity: audit.critical > 0 ? "critical" : "high",
      evidence: `npm audit --json: ${audit.detail}`,
      remediation: "Mettre à jour ou remplacer les paquets affectés; relancer npm audit.",
      nonRegressionTest: "npm audit ne rapporte plus de vulnérabilité haute/critique.",
      status: "open",
    });
  }

  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: config.project.id ?? "local", production: false }, checks, findings });

  const store = new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl"));
  await store.append(auditEntry({ actorId: process.env.USER ?? "cli-user", action: "security.review", projectId: config.project.id, outcome: pack.recommendation === "BLOCKED" ? "denied" : "succeeded", details: { recommendation: pack.recommendation, blockers: pack.blockers.length } }));

  return {
    scope: "local defensive review (passive, non-destructive)",
    recommendation: pack.recommendation,
    blockers: pack.blockers,
    checkResults: checks.map((check) => ({ name: check.name, status: check.status, detail: check.detail })),
    toolsPresent: coverage.present,
    uncoveredCategories: coverage.uncoveredCategories,
    findings: findings.map((finding) => ({ id: finding.id, title: finding.title, severity: finding.severity })),
    contentHash: pack.contentHash,
    note: "Outils absents = vérifications 'not_run', jamais 'passed' (§14). Test actif ⇒ ostack security-lab.",
  };
}

async function dependencies(context: CommandContext): Promise<unknown> {
  const audit = await runNpmAudit(context.cwd);
  return { check: "dependency-audit", status: audit.status, detail: audit.detail };
}

function threatModel(rest: string[]): unknown {
  const system = rest.join(" ").trim();
  if (!system) throw new Error("Usage: ostack security threat-model <nom du système>");
  return scaffoldThreatModel({ system });
}

function catalog(rest: string[]): unknown {
  const level = rest[0] as RiskLevel | undefined;
  const risks = level ? webRisksByLevel(level) : webRiskCatalog();
  return risks.map((risk) => ({ id: risk.id, title: risk.title, riskLevel: risk.riskLevel, detection: risk.detection, controls: risk.controls, nonRegressionTest: risk.nonRegressionTest, reference: risk.reference }));
}

async function evidenceFromFile(context: CommandContext, rest: string[]): Promise<unknown> {
  const path = rest[0];
  if (!path) throw new Error("Usage: ostack security evidence <fichier.json>");
  const absolute = isAbsolute(path) ? path : resolve(context.cwd, path);
  const relation = relative(context.cwd, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Le fichier doit être dans le projet");
  const input = JSON.parse(await readFile(absolute, "utf8")) as SecurityEvidenceInput;
  return assembleSecurityEvidence(input);
}
