import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { discoverProject } from "@ostack/discovery";
import { KnowledgeGraph, type SerializedGraph } from "@ostack/graph";
import { buildTwin, detectDrift } from "@ostack/twin";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack drift` (§6) — rebuild the digital twin from the knowledge graph, then
// compare it with the observed project. `--gate` exits non-zero on high drift.
export async function runDrift(context: CommandContext): Promise<unknown> {
  const gate = context.args.includes("--gate");
  const config = await loadConfig(context.cwd);
  const graphPath = join(configDirectory(context.cwd), "graph.json");
  let graph: KnowledgeGraph;
  try { graph = KnowledgeGraph.fromJSON(JSON.parse(await readFile(graphPath, "utf8")) as SerializedGraph); }
  catch { throw new Error("No knowledge graph found. Run 'ostack graph rebuild' first."); }

  const twin = buildTwin(graph);
  const [existingFiles, discovery] = await Promise.all([
    observeFiles(context.cwd, twin.declaredFiles),
    discoverProject(context.cwd)
  ]);
  const drifts = detectDrift(twin, graph, { existingFiles, entryPoints: discovery.entryPoints });

  const twinPath = join(configDirectory(context.cwd), "twin.json");
  await writeFile(twinPath, `${JSON.stringify(twin, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "drift.detect", projectId: config.project.id,
    outcome: drifts.some((drift) => drift.severity === "high") ? "denied" : "succeeded",
    details: { drifts: drifts.length, byKind: countBy(drifts.map((drift) => drift.kind)) }
  }));

  const high = drifts.filter((drift) => drift.severity === "high");
  if (gate && high.length > 0) {
    throw new Error(`Drift gate failed: ${high.length} high-severity drift(s) — ${high.map((drift) => drift.subject).join(", ")}`);
  }
  return {
    status: drifts.length === 0 ? "aligned" : "drift_detected",
    twin: { features: twin.features.length, declaredFiles: twin.declaredFiles.length, savedTo: ".ostack/twin.json" },
    drifts,
    summary: countBy(drifts.map((drift) => `${drift.kind}:${drift.severity}`))
  };
}

async function observeFiles(root: string, declared: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const file of declared) {
    try { await access(join(root, file)); existing.push(file); } catch { /* missing = drift */ }
  }
  return existing;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
