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
  scaffoldIncident,
  parseHadolint,
  parseTrivy,
  SCANNERS,
  type RiskLevel,
  type SecurityCheck,
  type SecurityFinding,
  type SecurityEvidenceInput,
  type IncidentInput,
} from "@ostack/security";
import { evaluateMatrix, type MatrixRule, type MatrixObservation } from "@ostack/functional";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const run = promisify(execFile);

// Per-scanner wall-clock cap so `review` stays responsive. A scanner that
// exceeds it is reported `not_run` (no verdict), never a fabricated pass.
const SCANNER_TIMEOUT_MS = Number(process.env.OSTACK_SCANNER_TIMEOUT_MS ?? 45_000);

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
    case "permissions":
      return permissions(context, rest);
    case "containers":
      return containers(context);
    case "evidence":
      return evidenceFromFile(context, rest);
    case "retest":
      return retest(context, rest);
    default:
      throw new Error(
        "Usage: ostack security <review|dependencies|threat-model|catalog|permissions|containers|evidence|retest>\n" +
          "  review               audit défensif local (outils détectés, dépendances, secrets, scanners) → Evidence Pack\n" +
          "  dependencies         audit des dépendances (npm audit si présent)\n" +
          "  threat-model <sys>   squelette de modèle de menaces STRIDE\n" +
          "  catalog [niveau]     catalogue défensif des risques web\n" +
          "  permissions <f.json> évalue une matrice Rôle × Ressource × État (violations, cellules non testées)\n" +
          "  containers           lint des Dockerfiles / IaC (hadolint, trivy) si présents\n" +
          "  evidence <fic.json>  assemble un Security Evidence Pack depuis un fichier\n" +
          "  retest <fic.json>    réassemble l'Evidence Pack en revérifiant l'état des constats\n" +
          "Pour un test actif autorisé et borné dans le temps: ostack security-lab.",
      );
  }
}

// `ostack incident <intitulé>` — squelette de réponse à incident (§19).
export async function runIncident(context: CommandContext): Promise<unknown> {
  const first = context.args[0];
  if (first && (await fileExists(isAbsolute(first) ? first : resolve(context.cwd, first)))) {
    const input = JSON.parse(await readFile(isAbsolute(first) ? first : resolve(context.cwd, first), "utf8")) as IncidentInput;
    return scaffoldIncident(input);
  }
  const title = context.args.join(" ").trim();
  if (!title) throw new Error("Usage: ostack incident <intitulé de l'incident> | <fichier.json>");
  return scaffoldIncident({ title });
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
      ({ stdout } = await run(scanner.tool, scanner.args, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: SCANNER_TIMEOUT_MS }));
    } catch (error) {
      // A scanner killed by the timeout produced no verdict: honestly not_run (§14).
      if ((error as { killed?: boolean }).killed) {
        checks.push({ name: scanner.check, status: "not_run", detail: `${scanner.tool} a dépassé ${SCANNER_TIMEOUT_MS / 1000}s; lancez-le directement pour un scan complet` });
        continue;
      }
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

function containedFile(cwd: string, path: string): string {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  const relation = relative(cwd, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Le fichier doit être dans le projet");
  return absolute;
}

// Permission matrix (§16): a declared Rôle × Ressource × État × Résultat is
// checked against observed outcomes. A violation is a high finding; a cell that
// was never exercised is a coverage gap (medium) — never a silent pass.
async function permissions(context: CommandContext, rest: string[]): Promise<unknown> {
  const path = rest[0];
  if (!path) throw new Error("Usage: ostack security permissions <matrice.json>  (champs: rules[], observations[])");
  const input = JSON.parse(await readFile(containedFile(context.cwd, path), "utf8")) as { rules?: MatrixRule[]; observations?: MatrixObservation[] };
  const rules = input.rules ?? [];
  const observations = input.observations ?? [];
  if (rules.length === 0) throw new Error("La matrice doit déclarer au moins une règle (rules[]).");
  const report = evaluateMatrix(rules, observations);

  const findings: SecurityFinding[] = [];
  for (const violation of report.violations) {
    findings.push({
      id: `perm:${violation.feature}:${violation.role}:${violation.state}`,
      title: `Violation de permission: ${violation.feature} × ${violation.role} × ${violation.state}`,
      severity: "high",
      evidence: `Attendu ${violation.expected}, observé ${violation.observed} (matrice évaluée).`,
      remediation: "Corriger la décision d'autorisation côté serveur pour cette cellule; re-tester.",
      nonRegressionTest: `${violation.feature} × ${violation.role} × ${violation.state} observe ${violation.expected}.`,
      status: "open",
    });
  }
  for (const cell of report.untested) {
    findings.push({
      id: `perm-untested:${cell.feature}:${cell.role}:${cell.state}`,
      title: `Permission non testée: ${cell.feature} × ${cell.role} × ${cell.state}`,
      severity: "medium",
      evidence: "Cellule déclarée mais jamais exercée: une permission non testée est un contournement potentiel.",
      remediation: "Ajouter une observation réelle pour cette cellule.",
      status: "open",
    });
  }

  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: "local", production: false }, findings });
  return {
    scope: "permission matrix (§16)",
    recommendation: pack.recommendation,
    violations: report.violations.length,
    untested: report.untested.length,
    unexpectedObservations: report.unexpectedObservations.length,
    passed: report.summary.passed,
    blockers: pack.blockers,
    contentHash: pack.contentHash,
  };
}

// Containers/IaC: run hadolint on Dockerfiles and trivy config, ONLY if present.
async function containers(context: CommandContext): Promise<unknown> {
  const available = await detectHostTools();
  const present = new Set(available);
  const checks: SecurityCheck[] = [];
  const findings: SecurityFinding[] = [];

  const dockerfiles = ["Dockerfile", "dockerfile", "docker/Dockerfile"].filter(() => true);
  if (present.has("hadolint")) {
    let ran = false;
    for (const candidate of dockerfiles) {
      const path = join(context.cwd, candidate);
      if (!(await fileExists(path))) continue;
      ran = true;
      try {
        const { stdout } = await run("hadolint", ["--format", "json", candidate], { cwd: context.cwd, maxBuffer: 20 * 1024 * 1024 });
        findings.push(...parseHadolint(JSON.parse(stdout)));
      } catch (error) {
        const captured = (error as { stdout?: string }).stdout;
        if (typeof captured === "string" && captured.trim().startsWith("[")) findings.push(...parseHadolint(JSON.parse(captured)));
        else checks.push({ name: `containers:hadolint:${candidate}`, status: "not_run", detail: "sortie hadolint non exploitable" });
      }
    }
    if (!ran) checks.push({ name: "containers:hadolint", status: "not_run", detail: "aucun Dockerfile trouvé" });
  } else {
    checks.push({ name: "containers:hadolint", status: "not_run", detail: "hadolint absent (§14)" });
  }

  if (present.has("trivy")) {
    try {
      const { stdout } = await run("trivy", ["config", "--quiet", "--format", "json", "."], { cwd: context.cwd, maxBuffer: 50 * 1024 * 1024, timeout: SCANNER_TIMEOUT_MS });
      findings.push(...parseTrivy(JSON.parse(stdout)));
    } catch (error) {
      if ((error as { killed?: boolean }).killed) checks.push({ name: "containers:trivy-config", status: "not_run", detail: `trivy a dépassé ${SCANNER_TIMEOUT_MS / 1000}s` });
      else {
        const captured = (error as { stdout?: string }).stdout;
        if (typeof captured === "string" && captured.trim().startsWith("{")) findings.push(...parseTrivy(JSON.parse(captured)));
        else checks.push({ name: "containers:trivy-config", status: "not_run", detail: "sortie trivy non exploitable" });
      }
    }
  } else {
    checks.push({ name: "containers:trivy-config", status: "not_run", detail: "trivy absent (§14)" });
  }

  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: "local", production: false }, checks, findings });
  return {
    scope: "containers / IaC (hadolint, trivy config)",
    recommendation: pack.recommendation,
    blockers: pack.blockers,
    checkResults: checks.map((check) => ({ name: check.name, status: check.status, detail: check.detail })),
    findings: findings.map((finding) => ({ id: finding.id, title: finding.title, severity: finding.severity })),
    contentHash: pack.contentHash,
    note: "Outil absent ⇒ not_run, jamais passed (§14).",
  };
}

// Retest (§21): re-assemble an Evidence Pack from an updated findings file,
// honouring each finding's current status (fixed findings drop out of the count).
async function retest(context: CommandContext, rest: string[]): Promise<unknown> {
  const path = rest[0];
  if (!path) throw new Error("Usage: ostack security retest <fichier.json>  (mêmes champs qu'evidence, statut mis à jour)");
  const input = JSON.parse(await readFile(containedFile(context.cwd, path), "utf8")) as SecurityEvidenceInput;
  const pack = assembleSecurityEvidence(input);
  const findings = input.findings ?? [];
  return {
    scope: "retest (§21)",
    recommendation: pack.recommendation,
    open: findings.filter((finding) => finding.status === "open").length,
    fixed: findings.filter((finding) => finding.status === "fixed").length,
    accepted: findings.filter((finding) => finding.status === "accepted").length,
    blockers: pack.blockers,
    contentHash: pack.contentHash,
  };
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
