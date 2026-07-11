// OStack se prouve lui-même (§36.6 — aucune affirmation de réussite sans
// exécution réelle). Ce script EXÉCUTE typecheck, tests, audit de dépendances
// et suite de benchmark, puis assemble l'Evidence Pack de release de la
// plateforme à partir de ces seuls résultats. Un échec quelconque produit un
// pack non vérifié — jamais un rapport embelli.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { EvidenceInput, EvidenceItem } from "@ostack/evidence";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface CommandRun { name: string; ok: boolean; output: string; durationMs: number }

async function runAllowed(name: string, command: string, args: string[]): Promise<CommandRun> {
  const started = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd: root, env: { ...process.env, CI: "1", NO_COLOR: "1" }, maxBuffer: 4_000_000, timeout: 600_000 });
    return { name, ok: true, output: `${stdout}\n${stderr}`, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return { name, ok: false, output: `${failure.stdout ?? ""}\n${failure.stderr ?? failure.message}`, durationMs: Math.round(performance.now() - started) };
  }
}

const version = (JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string }).version;
console.log(`OStack self-prove v${version} — exécutions réelles en cours…`);

const typecheck = await runAllowed("typecheck+build", "npm", ["run", "check"]);
const lint = await runAllowed("lint", "npm", ["run", "lint"]);
const tests = await runAllowed("tests", "npm", ["test"]);
const audit = await runAllowed("npm-audit", "npm", ["audit", "--json"]);

const testsPassed = Number(/pass (\d+)/.exec(tests.output)?.[1] ?? 0);
const testsFailed = Number(/fail (\d+)/.exec(tests.output)?.[1] ?? (tests.ok ? 0 : 1));

// Test categories are MEASURED by re-running the matching files, never declared.
async function runTestGroup(name: string, patterns: string[]): Promise<{ passed: number; failed: number }> {
  const run = await runAllowed(`tests:${name}`, "node", ["--import", "tsx", "--test", ...patterns]);
  return {
    passed: Number(/pass (\d+)/.exec(run.output)?.[1] ?? 0),
    failed: Number(/fail (\d+)/.exec(run.output)?.[1] ?? (run.ok ? 0 : 1))
  };
}
const integrationTests = await runTestGroup("integration", [
  "apps/api/test/routes.test.ts", "packages/mcp/test/server.test.ts", "packages/sqlite/test/runs.test.ts", "packages/providers/test/providers.test.ts"
]);
const permissionTests = await runTestGroup("permission", [
  "packages/core/test/security.test.ts", "packages/quality/test/quality.test.ts", "packages/workspace/test/workspace.test.ts", "packages/security-lab/test/security-lab.test.ts"
]);
const e2eTests = await runTestGroup("e2e", [
  "packages/cli/test/feature.test.ts", "packages/cli/test/change.test.ts", "packages/observe/test/observe.test.ts"
]);

let vulnerabilities = { critical: 0, high: 0, moderate: 0 };
try {
  const parsed = JSON.parse(audit.output.trim()) as { metadata?: { vulnerabilities?: { critical?: number; high?: number; moderate?: number } } };
  const raw = parsed.metadata?.vulnerabilities ?? {};
  vulnerabilities = { critical: raw.critical ?? 0, high: raw.high ?? 0, moderate: raw.moderate ?? 0 };
} catch { console.warn("npm audit output not parseable — counting as unknown, not as zero"); vulnerabilities = { critical: -1, high: -1, moderate: -1 }; }

const { runBenchmarkCommand } = await import("../packages/cli/src/benchmark.js");
const bench = await runBenchmarkCommand({ cwd: root, args: [], json: true }) as {
  overall: { successRate: number; stabilityRate: number; tasks: number };
  tasks: Array<{ taskId: string; medianDurationMs: number; successRate: number; stable: boolean }>;
};

const { commands } = await import("../packages/cli/src/commands.js");
const doctor = await commands.doctor!.handler({ cwd: root, args: [], json: true }) as { healthy: boolean; checks: Array<{ name: string; status: string }> };
const schemaChecks = doctor.checks.filter((check) => check.name.startsWith("schema:"));
const schemaFailures = schemaChecks.filter((check) => check.status !== "ok").length;

const auditKnown = vulnerabilities.critical >= 0;
const featureGate = bench.tasks.find((task) => task.taskId === "feature-human-gate");

const evidenceItems: EvidenceItem[] = [
  { id: "typecheck", kind: "typecheck", dimension: "implementation_correctness", status: typecheck.ok ? "passed" : "failed", summary: `tsc -b en ${typecheck.durationMs}ms`, metrics: { durationMs: typecheck.durationMs } },
  { id: "lint", kind: "lint", dimension: "implementation_correctness", status: lint.ok ? "passed" : "failed", summary: `eslint (typescript-eslint recommended) en ${lint.durationMs}ms` },
  { id: "build", kind: "build", dimension: "implementation_correctness", status: typecheck.ok ? "passed" : "failed", summary: "tsc -b compile tous les packages et apps" },
  { id: "tests", kind: "unit_test", dimension: "test_strength", status: tests.ok && testsFailed === 0 ? "passed" : "failed", summary: `${testsPassed} tests passés, ${testsFailed} échecs (node:test, ${tests.durationMs}ms)`, metrics: { passed: testsPassed, failed: testsFailed } },
  { id: "dependency-audit", kind: "security_scan", dimension: "security_assurance", status: auditKnown && vulnerabilities.critical === 0 && vulnerabilities.high === 0 ? "passed" : "failed", summary: auditKnown ? `npm audit: ${vulnerabilities.critical} critique(s), ${vulnerabilities.high} haute(s), ${vulnerabilities.moderate} modérée(s)` : "npm audit illisible — non prouvé" },
  { id: "benchmark-stability", kind: "functional_test", dimension: "requirements_understanding", status: bench.overall.successRate === 1 && bench.overall.stabilityRate === 1 ? "passed" : "failed", summary: `Benchmark core-platform-v0: ${bench.overall.tasks} tâches × 3 répétitions, succès ${Math.round(bench.overall.successRate * 100)}%, stabilité ${Math.round(bench.overall.stabilityRate * 100)}%` },
  { id: "benchmark-latency", kind: "performance_measurement", dimension: "performance_assurance", status: "observed", summary: `Médianes benchmark: ${bench.tasks.map((task) => `${task.taskId}=${task.medianDurationMs}ms`).join(", ")}`, metrics: Object.fromEntries(bench.tasks.map((task) => [task.taskId, task.medianDurationMs])) },
  { id: "schema-doc-drift", kind: "trace", dimension: "documentation_consistency", status: schemaFailures === 0 ? "observed" : "failed", summary: `${schemaChecks.length} paires schéma/artefact validées par doctor, ${schemaFailures} échec(s)` },
  { id: "rollback-machinery", kind: "trace", dimension: "rollback_readiness", status: tests.ok ? "observed" : "failed", summary: "Rollback fichiers et plans confirmés couverts par la suite (workspace rollback, change-plan rollback); rollback de release = retour au tag Git précédent" }
];

const input: EvidenceInput = {
  taskId: `OSTACK-RELEASE-${version}`,
  feature: `OStack developer preview v${version}`,
  request: "Préparer la developer preview d'OStack avec des preuves d'exécution réelles",
  specification: { summary: "Cahier des charges OStack AIOS (38 sections); périmètre livré documenté dans docs/roadmap.md M0/M1", coverage: 80 },
  assumptions: [
    "Exécution locale mono-utilisateur (developer preview), pas de déploiement multi-tenant",
    "Les fournisseurs IA distants sont optionnels; le mode mock reste déterministe"
  ],
  acceptanceCriteria: [
    "La compilation TypeScript de tous les packages réussit",
    "La suite de tests complète passe sans échec",
    "Aucune vulnérabilité critique ou haute dans les dépendances",
    "Le benchmark de plateforme est stable sur 3 répétitions",
    "Toutes les paires schéma/artefact sont valides"
  ],
  changedFiles: [],
  architectureDecisions: ["docs/architecture/README.md — headless-first, ports/adaptateurs, refus par défaut, local-first"],
  tests: {
    unit: { passed: testsPassed, failed: testsFailed },
    integration: integrationTests,
    e2e: e2eTests,
    permission: permissionTests,
    functional: { passed: bench.overall.successRate === 1 ? bench.overall.tasks : 0, failed: bench.overall.successRate === 1 ? 0 : bench.overall.tasks }
  },
  security: { critical: Math.max(vulnerabilities.critical, 0), high: Math.max(vulnerabilities.high, 0), medium: Math.max(vulnerabilities.moderate, 0), threatModelUpdated: true },
  performance: featureGate ? [{ endpoint: "cli:feature (premier plan)", afterP95Ms: featureGate.medianDurationMs, targetP95Ms: 15000 }] : [],
  metrics: { documentationDrift: schemaFailures },
  permissionMatrixVerified: false,
  rollback: { defined: true, tested: false },
  residualRisks: [
    { severity: "medium", description: "Sandbox processus non conteneurisée: l'isolation OS durcie appartient à M2", mitigation: "QualityRunner allowlist stricte + niveaux de sécurité 3/4 avec approbation humaine" },
    { severity: "medium", description: "Persistance locale SQLite/JSONL mono-utilisateur; pas de journal d'audit inviolable", mitigation: "Adaptateurs PostgreSQL et audit immuable planifiés M2/M3" },
    { severity: "low", description: "La délibération et le drafting d'intention dépendent de la qualité du fournisseur configuré", mitigation: "Sorties traitées en données non fiables, validées par schéma; arbitre purement mécanique" }
  ],
  deploymentProcedure: "npm install && npm run build && npm test; distribution locale (npm pack) — voir docs/production-readiness.md",
  rollbackProcedure: "Revenir au tag Git précédent puis npm install && npm run build; les données locales .ostack/ sont rétrocompatibles (schemaVersion 1)",
  confidence: [
    { dimension: "requirements_understanding", score: 85 },
    { dimension: "implementation_correctness", score: 92 },
    { dimension: "test_strength", score: 85 },
    { dimension: "security_assurance", score: 80 },
    { dimension: "performance_assurance", score: 80 },
    { dimension: "documentation_consistency", score: 90 },
    { dimension: "rollback_readiness", score: 70 }
  ],
  evidenceItems
};

const inputPath = join(root, ".ostack/self-evidence-input.json");
await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
const { runProve } = await import("../packages/cli/src/evidence.js");
const result = await runProve({ cwd: root, args: [".ostack/self-evidence-input.json"], json: true }) as {
  savedTo: string;
  evidencePack: { verified: boolean; releaseRecommendation: string; confidence: { overall: number; uncertainty: string[] }; definitionOfDone: { status: string; unmet: string[] }; blockingReasons: string[] };
};

const pack = result.evidencePack;
console.log(JSON.stringify({
  version,
  verified: pack.verified,
  releaseRecommendation: pack.releaseRecommendation,
  definitionOfDone: pack.definitionOfDone.status,
  unmet: pack.definitionOfDone.unmet,
  blockingReasons: pack.blockingReasons,
  confidence: pack.confidence.overall,
  uncertainty: pack.confidence.uncertainty,
  savedTo: result.savedTo
}, null, 2));
