import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { GENERIC_ROLES, instantiateTeam, renderAgentMarkdown, type DomainPack } from "@ostack/domain";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack domain agents <pack.json> [--out <dir>]` (§12) — instancie l'équipe
// d'experts métier depuis un Domain Pack. 10 rôles génériques × N packs =
// experts illimités, sans agent codé en dur. `--out` matérialise les
// définitions de subagents (.md) installables par l'assistant.
export async function runDomainAgents(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const packPath = context.args.find((argument) => !argument.startsWith("--"));
  if (!packPath) throw new Error("Usage: ostack domain agents <pack.json> [--out <dir>]");
  const pack = await loadPack(context.cwd, packPath);
  const team = instantiateTeam(pack);

  const outIndex = context.args.indexOf("--out");
  if (outIndex !== -1) {
    const outDir = containedPath(context.cwd, context.args[outIndex + 1] ?? "");
    await mkdir(outDir, { recursive: true });
    for (const agent of team) {
      await writeFile(join(outDir, `${agent.name}.md`), renderAgentMarkdown(agent), { encoding: "utf8" });
    }
    await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action: "domain.agents_materialized", projectId: config.project.id, outcome: "succeeded",
      details: { domainPack: pack.id, agents: team.length }
    }));
    return { status: "materialized", domainPack: pack.id, agents: team.length, out: relative(context.cwd, outDir) };
  }

  return {
    domainPack: pack.id,
    genericRoles: GENERIC_ROLES.length,
    experts: team.length,
    scalingNote: `${GENERIC_ROLES.length} rôles génériques × N Domain Packs = ${GENERIC_ROLES.length}×N experts (5 packs → ${GENERIC_ROLES.length * 5}, 8 packs → ${GENERIC_ROLES.length * 8}) sans agent codé en dur.`,
    team: team.map((agent) => ({ name: agent.name, title: agent.title, access: agent.access, restrictions: agent.restrictions, maturityLevel: agent.maturityLevel }))
  };
}

async function loadPack(root: string, input: string): Promise<DomainPack> {
  const path = containedPath(root, input);
  const pack = JSON.parse(await readFile(path, "utf8")) as DomainPack;
  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/domain-pack.schema.json"), "utf8"));
  const validation = new SchemaValidator().validate(schema, pack);
  if (!validation.valid) throw new Error(`Invalid domain pack: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  return pack;
}

function containedPath(root: string, input: string): string {
  if (!input) throw new Error("Chemin requis");
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Le chemin doit être dans le projet");
  return absolute;
}
