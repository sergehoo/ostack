import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { deriveLessons } from "@ostack/learning";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack improve` — méthode d'amélioration continue (Kaizen vérifié).
// Un CYCLE, en LECTURE SEULE (aucune mutation) : agrège les faits réels du
// projet, priorise les problèmes récurrents, rappelle ce qui a été prouvé, et
// propose la prochaine amélioration à plus fort levier — avec les commandes
// OStack exactes pour l'exécuter et la prouver. Déterministe et sourcé : ne
// propose jamais une amélioration « parce qu'elle semble pertinente » (§22).
export async function runImprove(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const state = configDirectory(context.cwd);
  const now = new Date().toISOString();

  const derived = deriveLessons({
    project: config.project.id, now,
    evidencePacks: await readJsonDir(join(state, "evidence")),
    deliberations: await readJsonDir(join(state, "deliberations")),
    intents: await readJsonDir(join(state, "intents"))
  });

  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  const problems = derived.filter((l) => l.kind === "blocking_challenge" || l.kind === "residual_risk").sort(byCount);
  const strengths = derived.filter((l) => l.kind === "verified_pattern").sort(byCount);
  const ledger = await readLedger(join(state, "evolution", "ledger.jsonl"));
  const openCandidates = ledger.filter((e) => e.status === "CANDIDATE");
  const promoted = new Set(ledger.filter((e) => e.status === "PROMOTED").map((e) => e.key ?? e.lesson));

  // Prochaine action : le problème récurrent le plus fréquent pas encore traité.
  const topUntreated = problems.find((p) => !promoted.has(p.key));
  const nextStep = topUntreated
    ? {
        target: topUntreated.statement,
        why: `récurrence ${topUntreated.count}`,
        how: topUntreated.kind === "blocking_challenge"
          ? "Adressez le défi bloquant, puis prouvez-le : ostack challenge --from … puis ostack prove …"
          : "Réduisez le risque résiduel et mesurez : implémentez le contrôle, puis ostack prove … + ostack verify --gate"
      }
    : { target: null, why: "aucun problème récurrent non traité détecté", how: "Consolidez : ostack evolve collect puis ostack evolve promote sur un candidat reproduit" };

  await new JsonLinesAuditStore(join(state, "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "improve.cycle", projectId: config.project.id, outcome: "succeeded",
    details: { problems: problems.length, strengths: strengths.length, openCandidates: openCandidates.length }
  }));

  return {
    cycle: "continuous-improvement",
    measured: { problems: problems.length, provenPatterns: strengths.length, openCandidates: openCandidates.length },
    backlog: problems.slice(0, 5).map((p) => ({ kind: p.kind, occurrences: p.count, statement: p.statement, treated: promoted.has(p.key) })),
    provenPatterns: strengths.slice(0, 5).map((s) => ({ occurrences: s.count, statement: s.statement })),
    nextStep,
    method: "Mesurer (learn) → prioriser (ce backlog) → agir (evolve/challenge) → prouver (prove/verify) → évaluer (evolve evaluate) → promouvoir si amélioration mesurée (§22). Rien n'est promu sans preuve.",
    note: "Lecture seule : cette commande ne modifie rien. Relancez-la à chaque itération."
  };
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

interface LedgerEntry { status?: string; key?: string; lesson?: string }
async function readLedger(path: string): Promise<LedgerEntry[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as LedgerEntry);
  } catch { return []; }
}
