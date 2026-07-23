import { join } from "node:path";
import {
  CommandTimeoutError,
  JsonLinesCommandRunJournal,
  buildAllSkillsContext,
  discoverSkills,
  executeAllSkills,
  hashText,
  safeError,
  validateAllSkillsObjective,
  type CommandRunRecord
} from "@ostack/command-runtime";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import type { CommandContext } from "./commands.js";
import { resolveRuntimeInput, validateRuntimeTimeout } from "./command-runtime.js";
import { configDirectory, loadConfig } from "./config.js";
import { selectProvider } from "./feature.js";

interface RunAllOptions {
  input: string;
  execute: boolean;
  includeDomains: boolean;
  domains: string[];
  provider?: string;
  timeoutMs?: number;
}

export async function runAllSkills(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const options = parseRunAllOptions(context.args);
  const objective = await resolveRuntimeInput(context.cwd, options.input);
  validateAllSkillsObjective(objective, config.execution?.maxInputChars ?? 1_000_000);
  const catalog = await discoverSkills(context.cwd, {
    includeDomains: options.includeDomains,
    domains: options.domains
  });
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const selectedDomains = [...new Set(catalog.skills
    .map((skill) => skill.namespace)
    .filter((value): value is string => value !== undefined))].sort();
  const executionContext = buildAllSkillsContext({
    runId,
    project: config.project,
    objective,
    skills: catalog.skills,
    domains: selectedDomains,
    now: startedAt
  });
  const timeoutMs = validateRuntimeTimeout(options.timeoutMs ?? config.execution?.timeoutMs ?? 120_000);
  const journal = new JsonLinesCommandRunJournal(join(configDirectory(context.cwd), "runs", "commands.jsonl"));

  if (!options.execute) {
    const record = buildRecord({
      runId,
      projectId: config.project.id,
      status: "dry_run",
      startedAt,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      objective
    });
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record, catalog.skills.length, selectedDomains);
    return {
      status: "dry_run",
      mode: "all_skills",
      runId,
      timeoutMs,
      totalSkills: catalog.skills.length,
      selectedDomains,
      availableDomains: catalog.availableDomains,
      duplicates: catalog.duplicates,
      context: executionContext,
      nextStep: "Review this context, then add --execute to call the configured provider once."
    };
  }

  let providerId: string | undefined;
  try {
    const provider = await selectProvider(
      config.ai.preferredProviders,
      options.provider,
      config.ai.models,
      config.ai.defaultModel
    );
    providerId = provider.id;
    const result = await executeAllSkills(executionContext, provider, timeoutMs);
    const record = buildRecord({
      runId,
      projectId: config.project.id,
      status: "succeeded",
      provider: result.response.provider,
      model: result.response.model,
      startedAt,
      durationMs: result.durationMs,
      objective,
      output: result.response.content,
      usage: result.response.usage
    });
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record, catalog.skills.length, selectedDomains);
    return {
      status: "succeeded",
      mode: "all_skills",
      runId,
      totalSkills: catalog.skills.length,
      selectedDomains,
      provider: result.response.provider,
      model: result.response.model,
      durationMs: result.durationMs,
      usage: result.response.usage ?? null,
      output: result.response.content
    };
  } catch (error) {
    const record = buildRecord({
      runId,
      projectId: config.project.id,
      status: error instanceof CommandTimeoutError ? "timed_out" : "failed",
      ...(providerId !== undefined ? { provider: providerId } : {}),
      startedAt,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      objective,
      error: safeError(error)
    });
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record, catalog.skills.length, selectedDomains);
    throw error;
  }
}

function parseRunAllOptions(args: string[]): RunAllOptions {
  const result: {
    input?: string;
    execute: boolean;
    dryRun: boolean;
    includeDomains: boolean;
    domains: string[];
    provider?: string;
    timeoutMs?: number;
  } = { execute: false, dryRun: false, includeDomains: false, domains: [] };
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value) continue;
    if (value === "--execute") {
      result.execute = true;
      continue;
    }
    if (value === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (value === "--include-domains") {
      result.includeDomains = true;
      continue;
    }
    if (["--input", "--provider", "--timeout", "--domain"].includes(value)) {
      const next = args[++index];
      if (next === undefined) throw new Error(`Missing value for ${value}`);
      if (value === "--input") result.input = next;
      else if (value === "--provider") result.provider = next;
      else if (value === "--domain") result.domains.push(next);
      else {
        const timeout = Number(next);
        if (!Number.isSafeInteger(timeout)) throw new Error("--timeout must be an integer in milliseconds");
        result.timeoutMs = timeout;
      }
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    throw new Error(`Unexpected argument: ${value}. Use --input <value>.`);
  }
  if (result.execute && result.dryRun) throw new Error("--execute and --dry-run cannot be used together");
  if (result.provider !== undefined && !result.execute) {
    throw new Error("--provider requires --execute");
  }
  if (result.input === undefined) {
    throw new Error("Usage: ostack run-all --input <value|@file> [--execute] [--domain <id>] [--include-domains] [--provider <id>] [--timeout <ms>]");
  }
  return {
    input: result.input,
    execute: result.execute,
    includeDomains: result.includeDomains,
    domains: result.domains,
    ...(result.provider !== undefined ? { provider: result.provider } : {}),
    ...(result.timeoutMs !== undefined ? { timeoutMs: result.timeoutMs } : {})
  };
}

function buildRecord(options: {
  runId: string;
  projectId: string;
  status: CommandRunRecord["status"];
  provider?: string;
  model?: string;
  startedAt: string;
  durationMs: number;
  objective: string;
  output?: string;
  usage?: CommandRunRecord["usage"];
  error?: string;
}): CommandRunRecord {
  return {
    schemaVersion: 1,
    runId: options.runId,
    projectId: options.projectId,
    command: "run-all",
    status: options.status,
    ...(options.provider !== undefined ? { provider: options.provider } : {}),
    ...(options.model !== undefined ? { model: options.model } : {}),
    startedAt: options.startedAt,
    completedAt: new Date().toISOString(),
    durationMs: options.durationMs,
    inputChars: options.objective.length,
    inputHash: hashText(options.objective),
    ...(options.output !== undefined ? {
      outputChars: options.output.length,
      outputHash: hashText(options.output)
    } : {}),
    ...(options.usage !== undefined ? { usage: options.usage } : {}),
    ...(options.error !== undefined ? { error: options.error } : {})
  };
}

async function appendAudit(
  root: string,
  projectId: string,
  record: CommandRunRecord,
  totalSkills: number,
  domains: string[]
): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(root), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user",
    action: "skills.run_all",
    projectId,
    outcome: record.status === "failed" || record.status === "timed_out" ? "failed" : "succeeded",
    correlationId: record.runId,
    details: {
      status: record.status,
      totalSkills,
      domains,
      provider: record.provider ?? null,
      model: record.model ?? null,
      durationMs: record.durationMs,
      inputChars: record.inputChars,
      inputHash: record.inputHash,
      outputHash: record.outputHash ?? null
    }
  }));
}
