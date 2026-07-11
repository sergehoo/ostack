import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ChangeEngine, type ChangePlan, type ExecutedChange } from "@ostack/changes";
import type { Approval } from "@ostack/core";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function runChange(context: CommandContext): Promise<unknown> {
  const options = parseOptions(context.args);
  if (!options.planPath) throw new Error("Usage: ostack change <plan.json> [--confirm <hash> --reason <reason>]");
  const config = await loadConfig(context.cwd);
  const planPath = containedPlanPath(context.cwd, options.planPath);
  const plan = JSON.parse(await readFile(planPath, "utf8")) as ChangePlan;
  const [schema] = await Promise.all([readJson(join(frameworkRoot, "schemas/change-plan.schema.json"))]);
  const validation = new SchemaValidator().validate(schema as object, plan);
  if (!validation.valid) throw new Error(`Invalid change plan: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  const qualityCommands = config.quality?.commands ?? [];
  const actor = { id: process.env.USER ?? "cli-user", kind: "human" as const, roles: ["local-writer"] };
  const engine = new ChangeEngine(context.cwd, config.project.id, actor, qualityCommands);
  const prepared = await engine.prepare(plan);
  if (!options.confirm) return { status: "preview", ...prepared, message: `Review every diff, then rerun with --confirm ${prepared.confirmationHash} --reason "<reason>"` };
  if (options.confirm !== prepared.confirmationHash) throw new Error("Confirmation hash does not match the current preview");
  if (!options.reason) throw new Error("--reason is required with --confirm");
  const approval: Approval = {
    requestId: prepared.approvalRequestId,
    approver: actor,
    approvedAt: new Date().toISOString(),
    reason: options.reason
  };
  const result = await engine.execute(plan, options.confirm, approval);
  await recordResult(context.cwd, config.project.id, plan, result, actor.id, options.reason);
  return {
    ...result,
    message: result.status === "succeeded"
      ? "Changes applied and all quality commands succeeded"
      : "The isolated quality checks failed; the real project was not modified"
  };
}

function parseOptions(args: string[]): { planPath?: string; confirm?: string; reason?: string } {
  const result: { planPath?: string; confirm?: string; reason?: string } = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === "--confirm" || value === "--reason") {
      const next = args[++index];
      if (!next) throw new Error(`Missing value for ${value}`);
      if (value === "--confirm") result.confirm = next;
      else result.reason = next;
    } else if (value && !result.planPath) result.planPath = value;
    else if (value) throw new Error(`Unexpected argument: ${value}`);
  }
  return result;
}

function containedPlanPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Change plan must be inside the project");
  if (/(^|\/)\.env(?:\.|$)/.test(relation) || /\.(pem|key|p12|pfx)$/i.test(relation)) throw new Error("Protected plan path");
  return absolute;
}

async function recordResult(root: string, projectId: string, plan: ChangePlan, result: ExecutedChange, actorId: string, reason: string): Promise<void> {
  const directory = join(configDirectory(root), "changes");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const record = { planId: plan.id, description: plan.description, actorId, reason, recordedAt: new Date().toISOString(), ...result };
  await writeFile(join(directory, `${plan.id}-${Date.now()}.json`), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await new JsonLinesAuditStore(join(configDirectory(root), "audit.jsonl")).append(auditEntry({
    actorId, action: "change.execute", projectId,
    outcome: result.status === "succeeded" ? "succeeded" : "failed",
    details: { planId: plan.id, confirmationHash: result.confirmationHash, qualityCommands: result.qualityResults.map((item) => ({ command: item.command, success: item.success })) }
  }));
}

async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }
