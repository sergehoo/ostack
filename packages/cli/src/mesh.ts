import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, MockProvider, auditEntry, type ModelProvider } from "@ostack/core";
import { ModelMesh, type ModelCandidate, type SerializedMesh, type TaskRoute } from "@ostack/mesh";
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
  statsPath: string;
}

export async function buildMesh(cwd: string, settings: MeshSettings): Promise<LoadedMesh> {
  const mesh = new ModelMesh(settings.candidates, settings.routes);
  const statsPath = join(configDirectory(cwd), "mesh.json");
  try { mesh.loadStats(JSON.parse(await readFile(statsPath, "utf8")) as SerializedMesh); }
  catch { /* no stats yet — selection uses declared order */ }
  const providers = new Map<string, ModelProvider>();
  for (const candidate of settings.candidates) providers.set(candidate.id, instantiate(candidate));
  return { mesh, providers, statsPath };
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
    default:
      throw new Error(`Unknown mesh subcommand '${subcommand}'. Use routes | stats | record`);
  }
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
