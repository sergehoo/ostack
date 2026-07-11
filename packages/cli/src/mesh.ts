import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, MockProvider, auditEntry, type ModelProvider, type ModelRequest, type ModelResponse } from "@ostack/core";
import { ModelMesh, estimateCostUsd, type ModelCandidate, type SerializedMesh, type TaskRoute } from "@ostack/mesh";
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from "@ostack/providers";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// Adaptive Model Mesh wiring (§8). The mesh SELECTS the provider per task type;
// it never invents outcomes: statistics only move through explicit `record`
// calls carrying real cost and latency. No recorded cost, no ranking claim.

export interface MeshSettings {
  candidates: ModelCandidate[];
  routes: TaskRoute[];
}

export interface LoadedMesh {
  mesh: ModelMesh;
  providers: Map<string, ModelProvider>;
  candidates: Map<string, ModelCandidate>;
  statsPath: string;
}

export async function buildMesh(cwd: string, settings: MeshSettings): Promise<LoadedMesh> {
  const mesh = new ModelMesh(settings.candidates, settings.routes);
  const statsPath = join(configDirectory(cwd), "mesh.json");
  try { mesh.loadStats(JSON.parse(await readFile(statsPath, "utf8")) as SerializedMesh); }
  catch { /* no stats yet — selection uses declared order */ }
  const providers = new Map<string, ModelProvider>();
  const candidates = new Map<string, ModelCandidate>();
  for (const candidate of settings.candidates) {
    providers.set(candidate.id, instantiate(candidate));
    candidates.set(candidate.id, candidate);
  }
  return { mesh, providers, candidates, statsPath };
}

// Wraps a provider to accumulate real token usage across a step's calls.
export interface UsageSink { inputTokens: number; outputTokens: number; calls: number }

export function meteredProvider(provider: ModelProvider, sink: UsageSink): ModelProvider {
  return {
    id: provider.id,
    isAvailable: () => provider.isAvailable(),
    complete: async (request: ModelRequest): Promise<ModelResponse> => {
      const response = await provider.complete(request);
      sink.calls += 1;
      if (response.usage) {
        sink.inputTokens += response.usage.inputTokens;
        sink.outputTokens += response.usage.outputTokens;
      }
      return response;
    }
  };
}

// Execution ledger (§8): the workflow measures latency and real cost at run
// time; VERIFICATION is settled later against the evidence pack. Until then
// nothing enters the routing statistics.
export interface LedgerEntry {
  runId: string;
  stepId: string;
  taskType: string;
  candidateId: string;
  latencyMs: number;
  costUsd?: number;
  usage: { inputTokens: number; outputTokens: number; calls: number };
}

const ledgerPath = (cwd: string) => join(configDirectory(cwd), "mesh-ledger.jsonl");

export async function appendLedger(cwd: string, entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await appendFile(ledgerPath(cwd), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
}

export function ledgerCost(loaded: LoadedMesh, candidateId: string, usage: { inputTokens: number; outputTokens: number }): number | undefined {
  const candidate = loaded.candidates.get(candidateId);
  return candidate ? estimateCostUsd(candidate, usage) : undefined;
}

async function readLedger(cwd: string): Promise<LedgerEntry[]> {
  try {
    const content = await readFile(ledgerPath(cwd), "utf8");
    return content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as LedgerEntry);
  } catch { return []; }
}

function instantiate(candidate: ModelCandidate): ModelProvider {
  switch (candidate.provider) {
    case "ollama": return new OllamaProvider({ defaultModel: candidate.model });
    case "openai": return new OpenAIProvider({ defaultModel: candidate.model });
    case "anthropic": return new AnthropicProvider({ defaultModel: candidate.model });
    case "mock": return new MockProvider();
    default: throw new Error(`Unknown mesh provider '${candidate.provider}' for candidate '${candidate.id}'`);
  }
}

export interface StepSelection {
  provider: ModelProvider;
  candidateId?: string;
  strategy?: string;
}

// First available candidate in the strategy's ranking; the session provider is
// the explicit fallback so a mesh misconfiguration never blocks a workflow.
export async function selectForTask(loaded: LoadedMesh | null, taskType: string, fallback: ModelProvider): Promise<StepSelection> {
  if (!loaded) return { provider: fallback };
  let ranked: string[];
  let strategy: string;
  try {
    const selection = loaded.mesh.select(taskType);
    ranked = selection.strategy === "independent_consensus" ? selection.consensusSet ?? selection.ranked : selection.ranked;
    strategy = selection.strategy;
  } catch { return { provider: fallback }; }
  for (const candidateId of ranked) {
    const provider = loaded.providers.get(candidateId);
    if (provider && await provider.isAvailable()) return { provider, candidateId, strategy };
  }
  return { provider: fallback };
}

export async function runMeshCommand(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const settings = (config as { mesh?: MeshSettings }).mesh;
  if (!settings) {
    return {
      status: "not_configured",
      message: "Déclarez mesh.candidates et mesh.routes dans .ostack/config.json. Exemple: candidates [{id:'ollama/qwen3',provider:'ollama',model:'qwen3',local:true}], routes [{taskType:'engineering',strategy:'cost_per_verified_result',candidates:['ollama/qwen3']}]"
    };
  }
  const loaded = await buildMesh(context.cwd, settings);

  switch (subcommand ?? "routes") {
    case "routes":
      return {
        routes: settings.routes.map((route) => {
          const selection = loaded.mesh.select(route.taskType);
          return { taskType: route.taskType, strategy: route.strategy, ranked: selection.ranked, ...(selection.consensusSet ? { consensusSet: selection.consensusSet } : {}) };
        })
      };
    case "stats":
      return {
        stats: settings.routes.map((route) => ({
          taskType: route.taskType,
          candidates: route.candidates.map((candidateId) => loaded.mesh.metrics(route.taskType, candidateId))
        }))
      };
    case "record": {
      const options = parseRecordOptions(rest);
      loaded.mesh.record(options.taskType, options.candidateId, {
        verified: options.verified, costUsd: options.costUsd, latencyMs: options.latencyMs
      });
      await writeFile(loaded.statsPath, `${JSON.stringify(loaded.mesh.toJSON(), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "mesh.record", projectId: config.project.id, outcome: "succeeded",
        details: { taskType: options.taskType, candidateId: options.candidateId, verified: options.verified, costUsd: options.costUsd, latencyMs: options.latencyMs }
      }));
      return { status: "recorded", metrics: loaded.mesh.metrics(options.taskType, options.candidateId) };
    }
    case "settle": {
      // Converts the run's ledger entries into routing statistics once the
      // verdict is known — from the evidence pack of that run (automatic) or
      // an explicit --verified/--failed flag (human).
      const runId = rest.find((argument) => !argument.startsWith("--"));
      if (!runId) throw new Error("Usage: ostack mesh settle <runId> [--verified|--failed] — sans drapeau, le verdict est lu depuis l'Evidence Pack du run");
      let verified: boolean | undefined;
      if (rest.includes("--verified")) verified = true;
      if (rest.includes("--failed")) verified = false;
      if (verified === undefined) {
        verified = await verdictFromEvidence(context.cwd, runId);
        if (verified === undefined) throw new Error(`Aucun Evidence Pack trouvé pour le run ${runId}; fournissez --verified ou --failed (ou lancez 'ostack prove' d'abord)`);
      }
      const ledger = await readLedger(context.cwd);
      const matching = ledger.filter((entry) => entry.runId === runId);
      if (matching.length === 0) throw new Error(`Aucune entrée de ledger pour le run ${runId}`);
      for (const entry of matching) {
        loaded.mesh.record(entry.taskType, entry.candidateId, {
          verified, latencyMs: entry.latencyMs,
          ...(entry.costUsd !== undefined ? { costUsd: entry.costUsd } : {})
        });
      }
      const remaining = ledger.filter((entry) => entry.runId !== runId);
      await writeFile(ledgerPath(context.cwd), remaining.map((entry) => JSON.stringify(entry)).join("\n") + (remaining.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 });
      await writeFile(loaded.statsPath, `${JSON.stringify(loaded.mesh.toJSON(), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "mesh.settle", projectId: config.project.id, outcome: "succeeded",
        details: { runId, verified, entries: matching.length, costKnown: matching.filter((entry) => entry.costUsd !== undefined).length }
      }));
      return {
        status: "settled", runId, verified,
        entries: matching.map((entry) => ({ stepId: entry.stepId, taskType: entry.taskType, candidateId: entry.candidateId, latencyMs: entry.latencyMs, costUsd: entry.costUsd ?? null }))
      };
    }
    case "ledger":
      return { pending: await readLedger(context.cwd) };
    default:
      throw new Error(`Unknown mesh subcommand '${subcommand}'. Use routes | stats | record | settle | ledger`);
  }
}

async function verdictFromEvidence(cwd: string, runId: string): Promise<boolean | undefined> {
  const { readdir } = await import("node:fs/promises");
  const directory = join(configDirectory(cwd), "evidence");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); } catch { return undefined; }
  for (const name of names.sort().reverse()) {
    try {
      const pack = JSON.parse(await readFile(join(directory, name), "utf8")) as { taskId?: string; verified?: boolean };
      if (pack.taskId === runId && typeof pack.verified === "boolean") return pack.verified;
    } catch { /* skip unreadable */ }
  }
  return undefined;
}

function parseRecordOptions(args: string[]): { taskType: string; candidateId: string; verified: boolean; costUsd: number; latencyMs: number } {
  const positionals: string[] = [];
  let verified: boolean | undefined;
  let costUsd: number | undefined;
  let latencyMs: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (current === "--verified") verified = true;
    else if (current === "--failed") verified = false;
    else if (current === "--cost" || current === "--latency") {
      const value = Number(args[++index]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${current} requires a non-negative number`);
      if (current === "--cost") costUsd = value;
      else latencyMs = value;
    } else positionals.push(current);
  }
  const [taskType, candidateId] = positionals;
  if (!taskType || !candidateId || verified === undefined || costUsd === undefined || latencyMs === undefined) {
    throw new Error("Usage: ostack mesh record <taskType> <candidateId> --verified|--failed --cost <usd> --latency <ms> — le coût et la latence réels sont obligatoires; aucune statistique n'est inventée");
  }
  return { taskType, candidateId, verified, costUsd, latencyMs };
}
