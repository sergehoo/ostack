import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import type { EvidencePack } from "@ostack/evidence";
import {
  deriveLessons, emptyBase, mergeLessons, recall, recordReference, summarize,
  type AuditLine, type KnowledgeBase
} from "@ostack/learning";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack learn` — apprentissage institutionnel automatique (§24).
//   ostack learn observe [--global] [--quiet]   reconstruit la base projet depuis
//                                                les artefacts réels (idempotent)
//   ostack learn recall "<query>" [--global]     rappelle les faits accumulés
//   ostack learn record "<fait>" --source <s>     enregistre une référence sourcée
//
// La base PROJET est un instantané déterministe des artefacts du projet (rejouer
// observe ne gonfle rien). La base GLOBALE (~/.ostack/knowledge) est l'union
// vivante des instantanés de tous les projets: OStack s'enrichit progressivement
// au fil des projets auxquels il participe, sans jamais inventer ni dupliquer.
export async function runLearn(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const global = rest.includes("--global") || context.args.includes("--global");
  const quiet = context.args.includes("--quiet");
  const config = await loadConfig(context.cwd);
  const project = config.project.id;
  const now = new Date().toISOString();
  const projectBasePath = join(configDirectory(context.cwd), "knowledge", "base.json");
  const globalSnapshotPath = join(homedir(), ".ostack", "knowledge", "projects", `${project}.json`);

  switch (subcommand ?? "observe") {
    case "observe": {
      const derived = deriveLessons({
        project, now,
        auditLines: await readAudit(join(configDirectory(context.cwd), "audit.jsonl")),
        evidencePacks: await readJsonDir<EvidencePack>(join(configDirectory(context.cwd), "evidence")),
        deliberations: await readJsonDir(join(configDirectory(context.cwd), "deliberations")),
        intents: await readJsonDir(join(configDirectory(context.cwd), "intents"))
      });
      // Rebuild from scratch → idempotent snapshot of this project.
      const base = mergeLessons(emptyBase(), derived, project, now);
      await writeJson(projectBasePath, base);
      await writeJson(globalSnapshotPath, base);   // publish snapshot to the global union
      await appendAudit(context, project, "learn.observe", { lessons: base.lessons.length });
      const result = { status: "observed", project, knowledge: summarize(base), savedTo: ".ostack/knowledge/base.json" };
      return quiet ? { status: "observed", lessons: base.lessons.length } : result;
    }
    case "recall": {
      const query = rest.filter((argument) => !argument.startsWith("--")).join(" ");
      if (!query) throw new Error('Usage: ostack learn recall "<query>" [--global]');
      const base = global ? await loadGlobalUnion(now) : await readJson(projectBasePath) ?? emptyBase();
      const hits = recall(base, query);
      return {
        scope: global ? "global" : "project", query, total: base.lessons.length,
        matches: hits.map((hit) => ({
          statement: hit.lesson.statement, kind: hit.lesson.kind,
          occurrences: hit.lesson.occurrences, projects: hit.lesson.projects,
          sources: hit.lesson.sources, matchedTerms: hit.matchedTerms
        }))
      };
    }
    case "record": {
      const statement = rest.filter((argument) => !argument.startsWith("--")).join(" ");
      const sources = collectFlags(rest, "--source");
      if (!statement) throw new Error('Usage: ostack learn record "<fait>" --source <url|réf> [--source …]');
      const base = await readJson(projectBasePath) ?? emptyBase();
      const updated = recordReference(base, statement, sources, project, now);
      await writeJson(projectBasePath, updated);
      await writeJson(globalSnapshotPath, updated);
      await appendAudit(context, project, "learn.record", { sources: sources.length });
      return { status: "recorded", scope: "project+global", lessons: updated.lessons.length };
    }
    default:
      throw new Error(`Unknown learn subcommand '${subcommand}'. Use observe | recall | record`);
  }
}

async function loadGlobalUnion(now: string): Promise<KnowledgeBase> {
  const directory = join(homedir(), ".ostack", "knowledge", "projects");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); } catch { return emptyBase(); }
  let union = emptyBase();
  for (const name of names.sort()) {
    const snapshot = await readJson(join(directory, name));
    if (!snapshot) continue;
    const project = name.replace(/\.json$/, "");
    // Re-merge each project's authoritative snapshot: sums occurrences, unions projects.
    union = mergeLessons(union, snapshot.lessons.map((lesson) => ({
      kind: lesson.kind, key: lesson.key, count: lesson.occurrences, statement: lesson.statement, sources: lesson.sources
    })), project, now);
  }
  return union;
}

async function readAudit(path: string): Promise<AuditLine[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as AuditLine);
  } catch { return []; }
}

async function readJsonDir<T>(directory: string): Promise<T[]> {
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); } catch { return []; }
  const documents: T[] = [];
  for (const name of names.sort()) {
    try { documents.push(JSON.parse(await readFile(join(directory, name), "utf8")) as T); } catch { /* skip */ }
  }
  return documents;
}

async function readJson(path: string): Promise<KnowledgeBase | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as KnowledgeBase; } catch { return undefined; }
}

async function writeJson(path: string, base: KnowledgeBase): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(base, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function collectFlags(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flag && args[index + 1]) values.push(args[++index]!);
  }
  return values;
}

async function appendAudit(context: CommandContext, projectId: string, action: string, details: Record<string, unknown>): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action, projectId, outcome: "succeeded", details
  }));
}
