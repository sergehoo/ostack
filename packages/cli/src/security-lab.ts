import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { assertOperationAuthorized, validateAuthorization, type SecurityAuthorization, type TestCategory } from "@ostack/security-lab";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack security-lab` (§15) — defensive authorization gate.
//   ostack security-lab validate-authorization <manifest.json>
//   ostack security-lab check <manifest.json> --target <host> --category <category>
export async function runSecurityLab(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  if (subcommand !== "validate-authorization" && subcommand !== "check") {
    throw new Error("Usage: ostack security-lab <validate-authorization|check> <manifest.json> [--target <host> --category <categorie>]");
  }
  const options = parseOptions(rest);
  if (!options.manifestPath) throw new Error("A manifest path is required");
  const path = containedPath(context.cwd, options.manifestPath);
  const manifest = JSON.parse(await readFile(path, "utf8")) as SecurityAuthorization;

  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/security-authorization.schema.json"), "utf8"));
  const schemaResult = new SchemaValidator().validate(schema, manifest);
  const issues = [
    ...schemaResult.errors.map((error) => ({ field: error.path, message: error.message })),
    ...(schemaResult.valid ? validateAuthorization(manifest) : [])
  ];

  const audit = new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl"));
  if (subcommand === "validate-authorization") {
    await audit.append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action: "security_lab.validate_authorization", projectId: config.project.id,
      outcome: issues.length === 0 ? "succeeded" : "denied",
      details: { authorizationId: manifest.authorizationId ?? "unknown", issues: issues.length }
    }));
    return issues.length === 0
      ? { status: "valid", authorizationId: manifest.authorizationId, window: { startAt: manifest.startAt, expiresAt: manifest.expiresAt }, allowedTargets: manifest.allowedTargets, manifest: relative(context.cwd, path) }
      : { status: "invalid", issues };
  }

  if (!options.target || !options.category) throw new Error("check requires --target and --category");
  let outcome: "allowed" | "refused" = "allowed";
  let reason = "operation is inside the authorized scope, window and categories";
  try {
    assertOperationAuthorized(manifest, { target: options.target, category: options.category as TestCategory, at: new Date().toISOString() });
  } catch (error) {
    outcome = "refused";
    reason = error instanceof Error ? error.message : String(error);
  }
  await audit.append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "security_lab.check_operation", projectId: config.project.id,
    outcome: outcome === "allowed" ? "allowed" : "denied",
    details: { authorizationId: manifest.authorizationId ?? "unknown", target: options.target, category: options.category }
  }));
  if (outcome === "refused") throw new Error(`Operation refused: ${reason}`);
  return { status: "allowed", authorizationId: manifest.authorizationId, target: options.target, category: options.category, reason };
}

function parseOptions(args: string[]): { manifestPath?: string; target?: string; category?: string } {
  const result: { manifestPath?: string; target?: string; category?: string } = {};
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (current === "--target" || current === "--category") {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      if (current === "--target") result.target = value;
      else result.category = value;
    } else if (!result.manifestPath) result.manifestPath = current;
    else throw new Error(`Unexpected argument: ${current}`);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Manifest must be inside the project");
  return absolute;
}
