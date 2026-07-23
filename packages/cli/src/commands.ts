import { access, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProject } from "@ostack/discovery";
import { JsonLinesAuditStore, PermissionEngine, auditEntry } from "@ostack/core";
import { initializeConfig, loadConfig } from "./config.js";
import { configDirectory } from "./config.js";
import { validateBuiltIns } from "./validation.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface CommandContext { cwd: string; args: string[]; json: boolean; }
export type CommandHandler = (context: CommandContext) => Promise<unknown>;

const notYetAutomated = (name: string, workflow: string): CommandHandler => async ({ cwd, args }) => {
  const config = await loadConfig(cwd);
  return { command: name, status: "ready", project: config.project.id, workflow, input: args.join(" "), message: `Workflow '${workflow}' is configured; execution requires an AI provider adapter.` };
};

export const commands: Record<string, { description: string; handler: CommandHandler }> = {
  init: { description: "Initialiser OStack dans le projet", handler: async ({ cwd, args }) => ({ status: "initialized", config: await initializeConfig(cwd, args.join(" ") || basename(cwd)) }) },
  doctor: { description: "Diagnostiquer l’installation et la configuration", handler: doctor },
  install: { description: "Installer le framework OStack dans le projet (Claude Code, Cursor, Codex)", handler: async (context) => (await import("./install.js")).runInstall(context) },
  list: { description: "Lister les commandes déclaratives installées et leurs alias", handler: async (context) => (await import("./command-runtime.js")).runList(context) },
  inspect: { description: "Inspecter une commande et ses ressources associées", handler: async (context) => (await import("./command-runtime.js")).runInspect(context) },
  run: { description: "Exécuter une commande déclarative via le fournisseur IA configuré", handler: async (context) => (await import("./command-runtime.js")).runExecute(context) },
  "run-all": { description: "Orchestrer tous les skills OStack sélectionnés dans un cycle IA unique", handler: async (context) => (await import("./run-all.js")).runAllSkills(context) },
  discover: { description: "Comprendre le code, la documentation et le métier", handler: discover },
  feature: { description: "Concevoir et développer une fonctionnalité", handler: async (context) => (await import("./feature.js")).runFeature(context) },
  bug: { description: "Diagnostiquer et corriger un défaut", handler: notYetAutomated("bug", "bug-resolution") },
  audit: { description: "Lancer un audit transverse", handler: notYetAutomated("audit", "quality-gate") },
  architecture: {
    description: "Vérifier les frontières d’architecture (check) ou réviser l’architecture",
    handler: async (context) => context.args[0] === "check"
      ? (await import("./architecture.js")).runArchitectureCheck({ ...context, args: context.args.slice(1) })
      : notYetAutomated("architecture", "architecture-review")(context)
  },
  design: { description: "Concevoir l’expérience et l’interface", handler: notYetAutomated("design", "design-review") },
  security: { description: "Lancer l’audit de sécurité", handler: notYetAutomated("security", "security-audit") },
  qa: { description: "Exécuter l’assurance qualité", handler: notYetAutomated("qa", "quality-gate") },
  document: { description: "Générer ou mettre à jour la documentation", handler: notYetAutomated("document", "documentation") },
  release: { description: "Préparer une livraison contrôlée", handler: notYetAutomated("release", "release") },
  change: { description: "Prévisualiser et appliquer un plan de changement contrôlé", handler: async (context) => (await import("./change.js")).runChange(context) },
  "intent-compile": { description: "Compiler une demande en invariants, propriétés testables et preuves attendues", handler: async (context) => (await import("./intent.js")).runIntentCompile(context) },
  prove: { description: "Assembler et sceller l’Evidence Pack d’une tâche", handler: async (context) => (await import("./evidence.js")).runProve(context) },
  verify: { description: "Rendre un verdict de release fondé sur les preuves", handler: async (context) => (await import("./evidence.js")).runVerify(context) },
  confidence: { description: "Afficher le score de confiance multidimensionnel", handler: async (context) => (await import("./evidence.js")).runConfidence(context) },
  graph: { description: "Reconstruire et interroger le graphe de traçabilité", handler: async (context) => (await import("./graph.js")).runGraph(context) },
  drift: { description: "Comparer le jumeau numérique au projet observé", handler: async (context) => (await import("./drift.js")).runDrift(context) },
  challenge: { description: "Soumettre une proposition aux agents critique et adversarial", handler: async (context) => (await import("./challenge.js")).runChallenge(context) },
  observe: { description: "Sonder l’application en fonctionnement et produire des preuves", handler: async (context) => (await import("./observe.js")).runObserve(context) },
  "security-lab": { description: "Valider une autorisation de test de sécurité défensif", handler: async (context) => (await import("./security-lab.js")).runSecurityLab(context) },
  mesh: { description: "Afficher le routage des modèles et enregistrer des résultats vérifiés", handler: async (context) => (await import("./mesh.js")).runMeshCommand(context) },
  benchmark: { description: "Exécuter la suite de benchmark et mesurer la stabilité", handler: async (context) => (await import("./benchmark.js")).runBenchmarkCommand(context) },
  domain: { description: "Créer, scorer, valider et interroger les Domain Packs métier", handler: async (context) => (await import("./domain.js")).runDomain(context) },
  performance: { description: "Établir une baseline de performance et détecter les régressions", handler: async (context) => (await import("./performance.js")).runPerformance(context) },
  "root-cause": { description: "Analyse de cause racine structurée sur le journal d’audit", handler: async (context) => (await import("./diagnosis.js")).runRootCause(context) },
  decision: { description: "Mémoire des décisions d’ingénierie (record, search)", handler: async (context) => (await import("./decisions.js")).runDecision(context) },
  learn: { description: "Apprentissage institutionnel: enrichit la base de connaissance (observe, recall, record)", handler: async (context) => (await import("./learn.js")).runLearn(context) },
  improve: { description: "Amélioration continue: un cycle de mesure et de priorisation (lecture seule)", handler: async (context) => (await import("./improve.js")).runImprove(context) },
  evolve: { description: "Autonomous Evolution Engine: ledger, classification de risque et plan Git (status, record, classify, propose)", handler: async (context) => (await import("./evolve.js")).runEvolve(context) },
  sync: { description: "Synchronise le dépôt de connaissances (status, pull, push, verify)", handler: async (context) => (await import("./sync.js")).runSync(context) },
  update: { description: "Mettre à jour le framework OStack avec point de restauration et rollback", handler: async (context) => (await import("./update.js")).runUpdate(context) }
};

async function doctor({ cwd }: CommandContext): Promise<unknown> {
  const checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> = [];
  try { const config = await loadConfig(cwd); checks.push({ name: "configuration", status: "ok", detail: `Project ${config.project.id}` }); }
  catch { checks.push({ name: "configuration", status: "error", detail: "Run 'ostack init'" }); }
  checks.push({ name: "node", status: Number(process.versions.node.split(".")[0]) >= 22 ? "ok" : "error", detail: process.versions.node });
  for (const file of ["README.md", "AGENTS.md"]) {
    try { await access(join(cwd, file)); checks.push({ name: file, status: "ok", detail: "found" }); }
    catch { checks.push({ name: file, status: "warning", detail: "not found" }); }
  }
  const files = await countFiles(cwd);
  checks.push({ name: "project", status: "ok", detail: `${files} files visible` });
  try {
    const validations = await validateBuiltIns(frameworkRoot);
    for (const validation of validations) checks.push({
      name: `schema:${validation.name}`,
      status: validation.valid ? "ok" : "error",
      detail: validation.valid ? "valid" : validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")
    });
  } catch (error) { checks.push({ name: "schemas", status: "error", detail: error instanceof Error ? error.message : String(error) }); }
  return { healthy: checks.every((check) => check.status !== "error"), checks };
}

async function discover({ cwd, args }: CommandContext): Promise<unknown> {
  const config = await loadConfig(cwd);
  const save = args.includes("--save");
  const report = await discoverProject(cwd);
  if (save) {
    new PermissionEngine().assert({
      id: crypto.randomUUID(), action: "discovery.save", level: 2,
      actor: { id: process.env.USER ?? "cli-user", kind: "human", roles: ["local-writer"] }, projectId: config.project.id,
      resource: join(configDirectory(cwd), "discovery.json")
    });
    const path = join(configDirectory(cwd), "discovery.json");
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await new JsonLinesAuditStore(join(configDirectory(cwd), "audit.jsonl")).append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action: "discovery.save", projectId: config.project.id, outcome: "succeeded",
      details: { fingerprint: report.fingerprint, files: report.inventory.files }
    }));
  }
  return { ...report, saved: save };
}

async function countFiles(directory: string, depth = 0): Promise<number> {
  if (depth > 3) return 0;
  let count = 0;
  for (const entry of await readdir(directory)) {
    if (["node_modules", ".git", "dist"].includes(entry)) continue;
    const path = join(directory, entry);
    const info = await stat(path);
    count += info.isDirectory() ? await countFiles(path, depth + 1) : 1;
  }
  return count;
}
