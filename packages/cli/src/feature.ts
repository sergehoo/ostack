import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentOrchestrator, DefaultAgentRunner, EventBus, JsonLinesAuditStore, MockProvider, PermissionEngine, ProviderRegistry, WorkflowEngine, auditEntry,
  type AgentDefinition, type Approval, type ModelProvider, type WorkflowDefinition, type WorkflowRun
} from "@ostack/core";
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from "@ostack/providers";
import { SqliteRunRepository } from "@ostack/sqlite";
import { discoverProject, type ProjectDiscoveryReport } from "@ostack/discovery";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function runFeature(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const options = parseOptions(context.args);
  const objective = options.positionals.join(" ");
  const repository = new SqliteRunRepository(join(configDirectory(context.cwd), "ostack.db"));
  try {
    const existingRun = options.resume ? await repository.get(options.resume) : undefined;
    if (options.resume && !existingRun) throw new Error(`Unknown run: ${options.resume}`);
    const storedObjective = existingRun?.outputs.__objective;
    const effectiveObjective = objective || (typeof storedObjective === "string" ? storedObjective : "");
    if (!effectiveObjective) throw new Error("A feature description is required (or use --resume <run-id>)");

    const provider = await selectProvider(config.ai.preferredProviders, options.provider, config.ai.models, config.ai.defaultModel);
    // §8 — the mesh routes each step to the best candidate for its task type;
    // the session provider stays the explicit fallback.
    const { buildMesh, selectForTask } = await import("./mesh.js");
    const loadedMesh = config.mesh ? await buildMesh(context.cwd, config.mesh) : null;
    const stepProviders: Record<string, string> = {};
    const [workflow, agents, freshDiscovery] = await Promise.all([loadWorkflow(), loadAgents(), existingRun ? Promise.resolve(undefined) : discoverProject(context.cwd)]);
    const approvals = buildApprovals(options, existingRun);
    const events = new EventBus();
    const audit = new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl"));
    events.on("*", async (event) => audit.append(auditEntry({
      actorId: "workflow-engine",
      action: event.type,
      projectId: config.project.id,
      outcome: event.type.includes("approval_required") ? "denied" : event.type.includes("completed") ? "succeeded" : "allowed",
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      details: { eventId: event.id, source: event.source }
    })));
    const engine = new WorkflowEngine(new PermissionEngine(), events);
    const baseRun = existingRun ?? undefined;
    if (baseRun && baseRun.outputs.__objective === undefined) baseRun.outputs.__objective = effectiveObjective;
    const discovery = (baseRun?.outputs.__discovery as ProjectDiscoveryReport | undefined) ?? freshDiscovery;

    const run = await engine.run(workflow, config.project.id, async (step, currentRun) => {
      if (!step.agent) {
        if (step.command === "intent:compile") {
          const steps = await import("./feature-steps.js");
          const selection = await selectForTask(loadedMesh, "intent_drafting", provider);
          stepProviders[step.id] = selection.candidateId ?? selection.provider.id;
          return steps.executeIntentStep(context.cwd, config.project.id, effectiveObjective, selection.provider, options.intent);
        }
        if (step.command === "deliberation:challenge") {
          const steps = await import("./feature-steps.js");
          const selection = await selectForTask(loadedMesh, "deliberation", provider);
          stepProviders[step.id] = selection.candidateId ?? selection.provider.id;
          return steps.executeChallengeStep(context.cwd, currentRun, effectiveObjective, selection.provider);
        }
        if (step.command === "evidence:scaffold") {
          const steps = await import("./feature-steps.js");
          return steps.executeEvidenceScaffoldStep(context.cwd, currentRun, effectiveObjective);
        }
        const approval = approvals.find((item) => item.requestId === `${currentRun.id}:${step.id}`);
        return {
          command: step.command,
          approval: approval ? { approverId: approval.approver.id, approvedAt: approval.approvedAt, reason: approval.reason } : null
        };
      }
      const agent = agents.find((item) => item.id === step.agent);
      if (!agent) throw new Error(`Agent not found: ${step.agent}`);
      const selection = await selectForTask(loadedMesh, agent.category, provider);
      stepProviders[step.id] = selection.candidateId ?? selection.provider.id;
      const orchestrator = new AgentOrchestrator([agent], new DefaultAgentRunner(), events);
      const results = await orchestrator.execute({
        id: `${currentRun.id}:${step.id}`,
        objective: `${step.name}\n\nFeature request: ${effectiveObjective}`,
        context: { project: config.project, discovery: summarizeDiscovery(discovery), previousOutputs: compactOutputs(currentRun.outputs) },
        requiredCapabilities: [agent.category],
        securityLevel: step.securityLevel
      }, selection.provider);
      return orchestrator.aggregate(results);
    }, {
      ...(approvals.length ? { approvals } : {}),
      ...(baseRun ? { existingRun: baseRun } : {}),
      onCheckpoint: async (checkpoint) => {
        checkpoint.outputs.__objective ??= effectiveObjective;
        if (discovery) checkpoint.outputs.__discovery ??= discovery;
        await repository.save(checkpoint);
      }
    });

    return summarizeRun(run, provider.id, loadedMesh ? stepProviders : undefined);
  } finally { repository.close(); }
}

function parseOptions(args: string[]): { positionals: string[]; provider?: string; resume?: string; approve?: string; reason?: string; intent?: string } {
  const result: { positionals: string[]; provider?: string; resume?: string; approve?: string; reason?: string; intent?: string } = { positionals: [] };
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (["--provider", "--resume", "--approve", "--reason", "--intent"].includes(current)) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      if (current === "--provider") result.provider = value;
      if (current === "--resume") result.resume = value;
      if (current === "--approve") result.approve = value;
      if (current === "--reason") result.reason = value;
      if (current === "--intent") result.intent = value;
    } else result.positionals.push(current);
  }
  return result;
}

export async function selectProvider(
  preferred: string[], requested?: string,
  models?: { openai?: string; anthropic?: string; ollama?: string }, legacyDefaultModel?: string
): Promise<ModelProvider> {
  const registry = new ProviderRegistry();
  const openAIModel = models?.openai ?? legacyDefaultModel;
  registry.register(new OllamaProvider({ ...(models?.ollama ? { defaultModel: models.ollama } : {}) }));
  registry.register(new OpenAIProvider({ ...(openAIModel ? { defaultModel: openAIModel } : {}) }));
  registry.register(new AnthropicProvider({ ...(models?.anthropic ? { defaultModel: models.anthropic } : {}) }));
  registry.register(new MockProvider());
  if (requested === "mock") return registry.get("mock");
  const candidates = requested ? [requested] : preferred.filter((id) => ["ollama", "openai", "anthropic"].includes(id));
  try { return await registry.select(candidates); }
  catch { throw new Error(`No configured AI provider is available. Start Ollama, set OPENAI_API_KEY or ANTHROPIC_API_KEY, or use --provider mock for a dry run.`); }
}

function compactOutputs(outputs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(outputs).filter(([key]) => !key.startsWith("__")).slice(-2).map(([key, value]) => {
    if (value && typeof value === "object" && "summary" in value && typeof (value as { summary: unknown }).summary === "string") {
      return [key, { summary: (value as { summary: string }).summary.slice(0, 1200) }];
    }
    return [key, JSON.stringify(value).slice(0, 1000)];
  }));
}

function summarizeDiscovery(report?: ProjectDiscoveryReport): unknown {
  if (!report) return undefined;
  return {
    fingerprint: report.fingerprint,
    inventory: report.inventory,
    languages: report.languages.slice(0, 8),
    frameworks: report.frameworks,
    infrastructure: report.infrastructure,
    entryPoints: report.entryPoints.slice(0, 20),
    git: report.git,
    warnings: report.warnings
  };
}

function buildApprovals(options: { approve?: string; reason?: string }, run?: WorkflowRun): Approval[] {
  if (!options.approve) return [];
  if (!options.reason) throw new Error("--reason is required with --approve");
  if (!run?.pendingApprovalRequestId) throw new Error("The run is not waiting for approval");
  if (options.approve !== run.pendingApprovalRequestId) throw new Error("Approval id does not match the pending request");
  return [{
    requestId: options.approve,
    approver: { id: process.env.USER ?? "cli-user", kind: "human", roles: ["workflow-approver"] },
    approvedAt: new Date().toISOString(),
    reason: options.reason
  }];
}

async function loadWorkflow(): Promise<WorkflowDefinition> {
  return JSON.parse(await readFile(join(frameworkRoot, "workflows/feature-delivery.json"), "utf8")) as WorkflowDefinition;
}

interface Catalog { agents: Array<[string, string, string, string]>; defaults: Omit<AgentDefinition, "id" | "name" | "category" | "role">; }
async function loadAgents(): Promise<AgentDefinition[]> {
  const catalog = JSON.parse(await readFile(join(frameworkRoot, "agents/catalog.json"), "utf8")) as Catalog;
  return catalog.agents.map(([id, name, category, role]) => ({ id, name, category, role, ...catalog.defaults }));
}

function summarizeRun(run: WorkflowRun, provider: string, stepProviders?: Record<string, string>): unknown {
  return {
    runId: run.id, workflow: run.workflowId, status: run.status, provider,
    ...(stepProviders ? { stepProviders } : {}),
    completedSteps: run.completedSteps,
    pendingApprovalRequestId: run.pendingApprovalRequestId ?? null,
    message: run.status === "waiting_approval"
      ? `Review the generated outputs, then resume with --resume ${run.id} --approve ${run.pendingApprovalRequestId} --reason "<reason>"`
      : run.status === "succeeded" ? "Feature workflow completed" : `Feature workflow ${run.status}`,
    outputs: run.outputs
  };
}
