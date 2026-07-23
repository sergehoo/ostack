import { realpath, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  CommandTimeoutError,
  JsonLinesCommandRunJournal,
  buildExecutionContext,
  discoverCommands,
  executeCommand,
  hashText,
  loadAssociatedResources,
  resolveCommand,
  safeError,
  validateCommandInput,
  type CommandDefinition,
  type CommandRunRecord
} from "@ostack/command-runtime";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";
import { selectProvider } from "./feature.js";

export async function runList(context: CommandContext): Promise<unknown> {
  if (context.args.length > 0) throw new Error(`Unexpected argument: ${context.args[0]}`);
  await loadConfig(context.cwd);
  const catalog = await discoverCommands(context.cwd);
  return {
    status: "ok",
    total: catalog.commands.length,
    commands: catalog.commands.map((command) => ({
      name: command.name,
      description: command.description,
      aliases: command.aliases,
      scope: command.scope,
      namespace: command.namespace ?? null,
      source: command.sourcePath
    })),
    collisions: catalog.collisions
  };
}

export async function runInspect(context: CommandContext): Promise<unknown> {
  if (!context.args[0]) throw new Error("Usage: ostack inspect <command>");
  if (context.args.length > 1) throw new Error(`Unexpected argument: ${context.args[1]}`);
  await loadConfig(context.cwd);
  const catalog = await discoverCommands(context.cwd);
  const command = resolveCommand(catalog, context.args[0]);
  const resources = await loadAssociatedResources(context.cwd, command);
  return {
    status: "ok",
    command: publicDefinition(command),
    resources
  };
}

export async function runExecute(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const options = parseRunOptions(context.args);
  const catalog = await discoverCommands(context.cwd);
  const command = resolveCommand(catalog, options.command);
  const input = await resolveRuntimeInput(context.cwd, options.input ?? "");
  const globalMaxChars = config.execution?.maxInputChars ?? 1_000_000;
  validateCommandInput(command, input, globalMaxChars);
  const resources = await loadAssociatedResources(context.cwd, command);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const executionContext = buildExecutionContext({
    runId,
    project: config.project,
    command,
    input,
    resources,
    now: startedAt
  });
  const journal = new JsonLinesCommandRunJournal(join(configDirectory(context.cwd), "runs", "commands.jsonl"));

  if (options.dryRun) {
    const completedAt = new Date().toISOString();
    const record: CommandRunRecord = {
      schemaVersion: 1,
      runId,
      projectId: config.project.id,
      command: command.name,
      status: "dry_run",
      startedAt,
      completedAt,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      inputChars: input.length,
      inputHash: hashText(input)
    };
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record);
    return {
      status: "dry_run",
      runId,
      command: command.name,
      timeoutMs: effectiveTimeout(command, options.timeoutMs, config.execution?.timeoutMs),
      context: executionContext
    };
  }

  let providerId: string | undefined;
  try {
    const provider = await selectProvider(config.ai.preferredProviders, options.provider, config.ai.models, config.ai.defaultModel);
    providerId = provider.id;
    const timeoutMs = effectiveTimeout(command, options.timeoutMs, config.execution?.timeoutMs);
    const result = await executeCommand(executionContext, provider, timeoutMs);
    const completedAt = new Date().toISOString();
    const record: CommandRunRecord = {
      schemaVersion: 1,
      runId,
      projectId: config.project.id,
      command: command.name,
      status: "succeeded",
      provider: result.response.provider,
      model: result.response.model,
      startedAt,
      completedAt,
      durationMs: result.durationMs,
      inputChars: input.length,
      inputHash: hashText(input),
      outputChars: result.response.content.length,
      outputHash: hashText(result.response.content),
      ...(result.response.usage !== undefined ? { usage: result.response.usage } : {})
    };
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record);
    return {
      status: "succeeded",
      runId,
      command: command.name,
      provider: result.response.provider,
      model: result.response.model,
      durationMs: result.durationMs,
      usage: result.response.usage ?? null,
      output: result.response.content
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const record: CommandRunRecord = {
      schemaVersion: 1,
      runId,
      projectId: config.project.id,
      command: command.name,
      status: error instanceof CommandTimeoutError ? "timed_out" : "failed",
      ...(providerId !== undefined ? { provider: providerId } : {}),
      startedAt,
      completedAt,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      inputChars: input.length,
      inputHash: hashText(input),
      error: safeError(error)
    };
    await journal.append(record);
    await appendAudit(context.cwd, config.project.id, record);
    throw error;
  }
}

function parseRunOptions(args: string[]): {
  command: string;
  input?: string;
  provider?: string;
  timeoutMs?: number;
  dryRun: boolean;
} {
  const result: { command?: string; input?: string; provider?: string; timeoutMs?: number; dryRun: boolean } = { dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value) continue;
    if (value === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (["--input", "--provider", "--timeout"].includes(value)) {
      const next = args[++index];
      if (next === undefined) throw new Error(`Missing value for ${value}`);
      if (value === "--input") result.input = next;
      else if (value === "--provider") result.provider = next;
      else {
        const timeout = Number(next);
        if (!Number.isSafeInteger(timeout)) throw new Error("--timeout must be an integer in milliseconds");
        result.timeoutMs = timeout;
      }
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    if (result.command !== undefined) throw new Error(`Unexpected argument: ${value}. Use --input <value>.`);
    result.command = value;
  }
  if (!result.command) throw new Error("Usage: ostack run <command> [--input <value|@file>] [--provider <id>] [--timeout <ms>] [--dry-run]");
  return {
    command: result.command,
    dryRun: result.dryRun,
    ...(result.input !== undefined ? { input: result.input } : {}),
    ...(result.provider !== undefined ? { provider: result.provider } : {}),
    ...(result.timeoutMs !== undefined ? { timeoutMs: result.timeoutMs } : {})
  };
}

export async function resolveRuntimeInput(projectRoot: string, input: string): Promise<string> {
  if (!input.startsWith("@")) return input;
  const requested = input.slice(1);
  if (!requested) throw new Error("--input @file requires a path");
  const path = isAbsolute(requested) ? requested : resolve(projectRoot, requested);
  const [rootReal, pathReal, info] = await Promise.all([realpath(projectRoot), realpath(path), stat(path)]);
  const relation = relative(rootReal, pathReal);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error("Input file must be inside the project");
  }
  if (!info.isFile()) throw new Error("Input path must reference a file");
  if (info.size > 1_000_000) throw new Error("Input file exceeds 1 MB");
  return readFile(pathReal, "utf8");
}

export function validateRuntimeTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 600_000) {
    throw new Error("Execution timeout must be an integer between 100 and 600000 ms");
  }
  return value;
}

function effectiveTimeout(command: CommandDefinition, cli?: number, configured?: number): number {
  return validateRuntimeTimeout(cli ?? command.timeoutMs ?? configured ?? 120_000);
}

function publicDefinition(command: CommandDefinition): unknown {
  return {
    name: command.name,
    shortName: command.shortName,
    description: command.description,
    argumentHint: command.argumentHint ?? null,
    aliases: command.aliases,
    source: command.sourcePath,
    scope: command.scope,
    namespace: command.namespace ?? null,
    input: command.input,
    timeoutMs: command.timeoutMs ?? null,
    associations: command.resources,
    instructions: command.instructions,
    metadata: command.metadata
  };
}

async function appendAudit(root: string, projectId: string, record: CommandRunRecord): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(root), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user",
    action: "command.run",
    projectId,
    outcome: record.status === "failed" || record.status === "timed_out" ? "failed" : "succeeded",
    correlationId: record.runId,
    details: {
      command: record.command,
      status: record.status,
      provider: record.provider ?? null,
      model: record.model ?? null,
      durationMs: record.durationMs,
      inputChars: record.inputChars,
      inputHash: record.inputHash,
      outputHash: record.outputHash ?? null
    }
  }));
}
