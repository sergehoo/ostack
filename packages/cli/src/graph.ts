import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import type { EvidencePack } from "@ostack/evidence";
import type { CompiledIntent } from "@ostack/intent";
import { KnowledgeGraph, ingestCompiledIntent, ingestEvidencePack, type SerializedGraph } from "@ostack/graph";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack graph` (§5) — rebuild traceability from persisted intents and evidence
// packs, then answer engineering questions from explicit relations.
//
//   ostack graph rebuild
//   ostack graph why <node-id>
//   ostack graph impact <node-id>
//   ostack graph coverage <node-id>
//   ostack graph unverified
//   ostack graph nodes [kind]
export async function runGraph(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const graphPath = join(configDirectory(context.cwd), "graph.json");

  if (!subcommand || subcommand === "rebuild") {
    const graph = new KnowledgeGraph();
    const intents = await readJsonDirectory<CompiledIntent>(join(configDirectory(context.cwd), "intents"));
    const packs = await readJsonDirectory<EvidencePack>(join(configDirectory(context.cwd), "evidence"));
    for (const intent of intents) ingestCompiledIntent(graph, intent);
    for (const pack of packs) ingestEvidencePack(graph, pack);
    const serialized = graph.toJSON();
    await mkdir(configDirectory(context.cwd), { recursive: true, mode: 0o700 });
    await writeFile(graphPath, `${JSON.stringify(serialized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action: "graph.rebuild", projectId: config.project.id, outcome: "succeeded",
      details: { intents: intents.length, evidencePacks: packs.length, nodes: serialized.nodes.length, edges: serialized.edges.length }
    }));
    return {
      status: "rebuilt",
      sources: { intents: intents.length, evidencePacks: packs.length },
      nodes: serialized.nodes.length,
      edges: serialized.edges.length,
      unverified: graph.unverified().map(describe),
      savedTo: ".ostack/graph.json"
    };
  }

  const graph = KnowledgeGraph.fromJSON(JSON.parse(await readFile(graphPath, "utf8")) as SerializedGraph);
  switch (subcommand) {
    case "why": {
      const id = requireId(rest, "why");
      return { node: describe(mustNode(graph, id)), justifiedBy: graph.whyExists(id).map(describe) };
    }
    case "impact": {
      const id = requireId(rest, "impact");
      return { node: describe(mustNode(graph, id)), impacted: graph.impact(id).map(describe) };
    }
    case "coverage": {
      const id = requireId(rest, "coverage");
      return { node: describe(mustNode(graph, id)), coveredBy: graph.coverage(id).map(describe) };
    }
    case "unverified":
      return { unverified: graph.unverified().map(describe) };
    case "nodes": {
      const kind = rest[0];
      const nodes = graph.allNodes(kind as never);
      return { count: nodes.length, nodes: nodes.map(describe) };
    }
    default:
      throw new Error(`Unknown graph subcommand '${subcommand}'. Use rebuild | why | impact | coverage | unverified | nodes`);
  }
}

function describe(node: { id: string; kind: string; label: string; metadata?: Record<string, unknown> }): Record<string, unknown> {
  return { id: node.id, kind: node.kind, label: node.label, ...(node.metadata ? { metadata: node.metadata } : {}) };
}

function requireId(rest: string[], name: string): string {
  const id = rest[0];
  if (!id) throw new Error(`Usage: ostack graph ${name} <node-id>`);
  return id;
}

function mustNode(graph: KnowledgeGraph, id: string) {
  const node = graph.node(id);
  if (!node) throw new Error(`Unknown node: ${id}. Run 'ostack graph nodes' to list ids.`);
  return node;
}

async function readJsonDirectory<T>(directory: string): Promise<T[]> {
  let entries: string[];
  try { entries = await readdir(directory); } catch { return []; }
  const documents: T[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    try { documents.push(JSON.parse(await readFile(join(directory, entry), "utf8")) as T); }
    catch { /* skip unreadable artifacts; rebuild reports only what it can trace */ }
  }
  return documents;
}
