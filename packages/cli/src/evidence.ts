import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, PermissionEngine, auditEntry } from "@ostack/core";
import { assembleEvidencePack, type EvidenceInput, type EvidencePack } from "@ostack/evidence";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadPack(context: CommandContext): Promise<{ pack: EvidencePack; projectId: string; inputPath: string }> {
  const options = parseOptions(context.args);
  if (!options.inputPath) throw new Error("Usage: ostack <prove|verify|confidence> <evidence-input.json> [--gate]");
  const config = await loadConfig(context.cwd);
  const inputPath = containedPath(context.cwd, options.inputPath);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as EvidenceInput;
  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/evidence-input.schema.json"), "utf8"));
  const validation = new SchemaValidator().validate(schema, input);
  if (!validation.valid) throw new Error(`Invalid evidence input: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  return { pack: assembleEvidencePack(input), projectId: config.project.id, inputPath };
}

// `ostack prove` — assemble and persist the full Evidence Pack (§3), audited.
export async function runProve(context: CommandContext): Promise<unknown> {
  const { pack, projectId } = await loadPack(context);
  const actor = { id: process.env.USER ?? "cli-user", kind: "human" as const, roles: ["local-writer"] };
  const directory = join(configDirectory(context.cwd), "evidence");
  const path = join(directory, `${sanitize(pack.taskId)}-${pack.contentHash.slice(0, 12)}.json`);
  new PermissionEngine().assert({ id: crypto.randomUUID(), action: "evidence.persist", level: 2, actor, projectId, resource: path });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(pack, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: actor.id, action: "evidence.persist", projectId, outcome: "succeeded",
    details: { taskId: pack.taskId, contentHash: pack.contentHash, recommendation: pack.releaseRecommendation, verified: pack.verified }
  }));
  return { evidencePack: pack, savedTo: relative(context.cwd, path) };
}

// `ostack verify` — concise operational verdict first (§9). With --gate, a non-approval exits non-zero.
export async function runVerify(context: CommandContext): Promise<unknown> {
  const { pack } = await loadPack(context);
  const verdict = {
    status: pack.definitionOfDone.status,
    recommendation: pack.releaseRecommendation,
    verified: pack.verified,
    confidence: pack.confidence.overall,
    budgetWithinLimits: pack.budget.withinBudget,
    blockingReasons: pack.blockingReasons,
    uncertainty: pack.confidence.uncertainty,
    contentHash: pack.contentHash
  };
  if (parseOptions(context.args).gate && pack.releaseRecommendation !== "APPROVE" && pack.releaseRecommendation !== "APPROVE_WITH_OBSERVATIONS") {
    throw new Error(`Release gate failed (${pack.releaseRecommendation}): ${pack.blockingReasons.join("; ") || "definition of done not reached"}`);
  }
  return verdict;
}

// `ostack confidence` — the multidimensional confidence report only (§25).
export async function runConfidence(context: CommandContext): Promise<unknown> {
  const { pack } = await loadPack(context);
  return pack.confidence;
}

function parseOptions(args: string[]): { inputPath?: string; gate: boolean } {
  const result: { inputPath?: string; gate: boolean } = { gate: false };
  for (const value of args) {
    if (value === "--gate") result.gate = true;
    else if (!result.inputPath) result.inputPath = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Evidence input must be inside the project");
  return absolute;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}
