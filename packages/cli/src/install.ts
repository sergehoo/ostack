import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

type Assistant = "claude" | "cursor" | "codex";

interface Manifest {
  version: string;
  targets: Record<Assistant, {
    description: string;
    map: Array<{ from: string; to: string; glob: string }>;
    agentsFile: string;
  }>;
  agentsPreamble: string;
}

// `ostack install [--assistant claude|cursor|codex] [--force]` — installe le
// framework OStack DANS le projet courant: commandes, agents, skill, standards,
// workflows et politiques, au format attendu par l'assistant choisi. C'est ce
// qui fait d'OStack un framework léger posé dans le projet, pas une app externe.
export async function runInstall(context: CommandContext): Promise<unknown> {
  const assistant = readAssistant(context.args);
  const force = context.args.includes("--force");
  const manifest = JSON.parse(await readFile(join(frameworkRoot, "framework/manifest.json"), "utf8")) as Manifest;
  const target = manifest.targets[assistant];

  // La config projet doit exister — l'installeur agit sur un projet initialisé.
  try { await loadConfig(context.cwd); }
  catch { throw new Error("Aucun projet OStack ici. Lancez d'abord 'ostack init \"<nom>\"'."); }

  const installed: string[] = [];
  const skipped: string[] = [];
  for (const entry of target.map) {
    const sourceDir = join(frameworkRoot, entry.from);
    let files: string[];
    try { files = (await readdir(sourceDir)).filter((name) => matchesGlob(name, entry.glob)); }
    catch { continue; }
    const destDir = join(context.cwd, entry.to);
    await mkdir(destDir, { recursive: true });
    for (const file of files.sort()) {
      const destPath = join(destDir, file);
      if (!force && await exists(destPath)) { skipped.push(relative(context.cwd, destPath)); continue; }
      await writeFile(destPath, await readFile(join(sourceDir, file), "utf8"), { encoding: "utf8" });
      installed.push(relative(context.cwd, destPath));
    }
  }

  // Ajoute (idempotent) le préambule OStack au fichier d'instructions de l'assistant.
  const agentsPath = join(context.cwd, target.agentsFile);
  const marker = "## OStack — Verified Engineering";
  let agentsUpdated = false;
  const existing = await readFileOrEmpty(agentsPath);
  if (!existing.includes(marker)) {
    await writeFile(agentsPath, `${existing ? existing.trimEnd() + "\n\n" : ""}${manifest.agentsPreamble}\n`, { encoding: "utf8" });
    agentsUpdated = true;
  }

  // Apprentissage automatique (§24): pour Claude Code, pose un hook `Stop` qui
  // enrichit la base de connaissance après chaque session. Fusion prudente d'un
  // settings.json existant; idempotent; ne remplace jamais des hooks présents.
  let learningHook = false;
  if (assistant === "claude") learningHook = await installLearningHook(context.cwd);
  if (assistant === "claude") await installUpdateHook(context.cwd);

  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "framework.install", projectId: (await loadConfig(context.cwd)).project.id, outcome: "succeeded",
    details: { assistant, version: manifest.version, installed: installed.length, skipped: skipped.length, learningHook }
  }));

  return {
    learningHook,
    status: "installed",
    assistant,
    frameworkVersion: manifest.version,
    installed,
    skipped: skipped.length > 0 ? skipped : undefined,
    agentsFile: agentsUpdated ? target.agentsFile : `${target.agentsFile} (préambule déjà présent)`,
    note: skipped.length > 0 ? "Des fichiers existaient déjà; relancez avec --force pour les écraser." : undefined,
    nextStep: assistant === "claude"
      ? "Ouvrez Claude Code dans ce projet: les commandes /ostack:* et les agents sont disponibles."
      : "Votre assistant lira les définitions installées et le fichier d'instructions du projet."
  };
}

// Best-effort, reversible: add a Stop hook running `ostack learn observe`
// unless the project already declares one. Never clobbers existing hooks.
async function installLearningHook(cwd: string): Promise<boolean> {
  const path = join(cwd, ".claude", "settings.json");
  let settings: { hooks?: Record<string, unknown[]> } = {};
  const existing = await readFileOrEmpty(path);
  if (existing.trim()) {
    try { settings = JSON.parse(existing); } catch { return false; }
  }
  settings.hooks = settings.hooks ?? {};
  const stop = Array.isArray(settings.hooks.Stop) ? settings.hooks.Stop : [];
  const command = "ostack learn observe --global --quiet";
  const already = JSON.stringify(stop).includes("ostack learn observe");
  if (already) return false;
  stop.push({ hooks: [{ type: "command", command }] });
  settings.hooks.Stop = stop;
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8" });
  return true;
}

// Hook SessionStart: chaque session tire les mises à jour de ressources (§21).
async function installUpdateHook(cwd: string): Promise<boolean> {
  const path = join(cwd, ".claude", "settings.json");
  let settings: { hooks?: Record<string, unknown[]> } = {};
  const existing = await readFileOrEmpty(path);
  if (existing.trim()) { try { settings = JSON.parse(existing); } catch { return false; } }
  settings.hooks = settings.hooks ?? {};
  const start = Array.isArray(settings.hooks.SessionStart) ? settings.hooks.SessionStart : [];
  if (JSON.stringify(start).includes("ostack update --auto")) return false;
  start.push({ hooks: [{ type: "command", command: "ostack update --auto --quiet" }] });
  settings.hooks.SessionStart = start;
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8" });
  return true;
}

function readAssistant(args: string[]): Assistant {
  const index = args.indexOf("--assistant");
  const value = index === -1 ? "claude" : args[index + 1];
  if (value !== "claude" && value !== "cursor" && value !== "codex") {
    throw new Error("--assistant doit être claude, cursor ou codex");
  }
  return value;
}

function matchesGlob(name: string, glob: string): boolean {
  if (glob === "*") return true;
  if (glob.startsWith("*.")) return name.endsWith(glob.slice(1));
  return name === glob;
}

async function exists(path: string): Promise<boolean> {
  try { await readFile(path); return true; } catch { return false; }
}

async function readFileOrEmpty(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}
