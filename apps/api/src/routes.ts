import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { discoverProject } from "@ostack/discovery";
import type { EvidencePack } from "@ostack/evidence";
import { KnowledgeGraph, type SerializedGraph } from "@ostack/graph";
import { SqliteRunRepository } from "@ostack/sqlite";

export interface ApiResult {
  status: number;
  body: unknown;
}

// Read-only local API. The Verification Center (§29) exposes only what the
// proof layer actually produced — no fabricated health percentages: an absent
// artifact is reported as absent, never invented.
export async function handleApiRequest(root: string, method: string, path: string): Promise<ApiResult> {
  if (method !== "GET") return { status: 404, body: notFound() };
  switch (path) {
    case "/api/health":
      return { status: 200, body: { status: "ok", service: "ostack-api", version: "0.1.0" } };
    case "/api/agents": {
      const catalog = JSON.parse(await readFile(join(root, "agents/catalog.json"), "utf8")) as { agents: unknown[] };
      return { status: 200, body: { data: catalog.agents, meta: { count: catalog.agents.length } } };
    }
    case "/api/workflows": {
      const workflow = JSON.parse(await readFile(join(root, "workflows/software-lifecycle.json"), "utf8"));
      return { status: 200, body: { data: [workflow], meta: { count: 1 } } };
    }
    case "/api/runs": {
      const config = JSON.parse(await readFile(join(root, ".ostack/config.json"), "utf8")) as { project: { id: string } };
      const repository = new SqliteRunRepository(join(root, ".ostack/ostack.db"));
      try {
        const runs = await repository.list(config.project.id, 50);
        return { status: 200, body: { data: runs, meta: { count: runs.length } } };
      } finally { repository.close(); }
    }
    case "/api/discovery":
      return { status: 200, body: { data: await discoverProject(root) } };
    case "/api/evidence": {
      const packs = await readJsonDirectory<EvidencePack>(join(root, ".ostack/evidence"));
      return {
        status: 200,
        body: {
          data: packs.map((pack) => ({
            taskId: pack.taskId, feature: pack.feature, intentId: pack.intentId ?? null,
            verified: pack.verified, releaseRecommendation: pack.releaseRecommendation,
            confidence: pack.confidence.overall, definitionOfDone: pack.definitionOfDone.status,
            blockingReasons: pack.blockingReasons, contentHash: pack.contentHash
          })),
          meta: { count: packs.length }
        }
      };
    }
    case "/api/verification":
      return { status: 200, body: { data: await verificationCenter(root) } };
    default:
      return { status: 404, body: notFound() };
  }
}

// Engineering readiness from real artifacts only (§29).
async function verificationCenter(root: string): Promise<unknown> {
  const stateDirectory = join(root, ".ostack");
  const packs = await readJsonDirectory<EvidencePack>(join(stateDirectory, "evidence"));
  const drafts = await readJsonDirectory<{ $todo?: string[] }>(join(stateDirectory, "evidence/drafts"));
  const intents = await readJsonDirectory<{ id: string; invariants: unknown[] }>(join(stateDirectory, "intents"));
  const deliberations = await readJsonDirectory<{ challenges?: Array<{ blocking?: boolean }> }>(join(stateDirectory, "deliberations"));

  const recommendations: Record<string, number> = {};
  for (const pack of packs) recommendations[pack.releaseRecommendation] = (recommendations[pack.releaseRecommendation] ?? 0) + 1;

  let graphSummary: unknown = null;
  try {
    const serialized = JSON.parse(await readFile(join(stateDirectory, "graph.json"), "utf8")) as SerializedGraph;
    const graph = KnowledgeGraph.fromJSON(serialized);
    const nodesByKind: Record<string, number> = {};
    for (const node of graph.allNodes()) nodesByKind[node.kind] = (nodesByKind[node.kind] ?? 0) + 1;
    graphSummary = {
      nodes: serialized.nodes.length,
      edges: serialized.edges.length,
      nodesByKind,
      unverified: graph.unverified().map((node) => ({ id: node.id, kind: node.kind, label: node.label }))
    };
  } catch { /* no graph yet — reported as null, never invented */ }

  return {
    evidencePacks: {
      total: packs.length,
      verified: packs.filter((pack) => pack.verified).length,
      recommendations,
      latest: packs.slice(-10).reverse().map((pack) => ({
        taskId: pack.taskId, feature: pack.feature, verified: pack.verified,
        releaseRecommendation: pack.releaseRecommendation, confidence: pack.confidence.overall
      }))
    },
    drafts: {
      pending: drafts.length,
      openTodos: drafts.reduce((sum, draft) => sum + (draft.$todo?.length ?? 0), 0)
    },
    intents: { total: intents.length, invariants: intents.reduce((sum, intent) => sum + intent.invariants.length, 0) },
    deliberations: {
      total: deliberations.length,
      blockingChallenges: deliberations.reduce(
        (sum, record) => sum + (record.challenges?.filter((challenge) => challenge.blocking === true).length ?? 0), 0
      )
    },
    graph: graphSummary
  };
}

function notFound(): unknown {
  return { error: { code: "NOT_FOUND", message: "Resource not found" } };
}

async function readJsonDirectory<T>(directory: string): Promise<T[]> {
  let names: string[];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  } catch { return []; }
  const documents: T[] = [];
  for (const name of names) {
    try { documents.push(JSON.parse(await readFile(join(directory, name), "utf8")) as T); }
    catch { /* unreadable artifact: skipped, not fabricated */ }
  }
  return documents;
}
