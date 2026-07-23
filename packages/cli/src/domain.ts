import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import {
  ESSENTIAL_QUESTIONS, analyzeCrossDomain, assessMaturity, computeDomainConfidence,
  confirmRule, evaluateAction, applicableRules, generateRuleScenarios,
  type DomainPack
} from "@ostack/domain";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack domain` — Universal Domain Intelligence (§Extension).
//   ostack domain create --name <id> [--sector s] [--country c] [--sources <dir>]
//   ostack domain score <pack.json>
//   ostack domain validate <pack.json> --rule <id> --expert <nom> --reason "<raison>"
//   ostack domain check <pack.json> --action <action> --context <contexte.json> [--jurisdiction <j>]
//   ostack domain scenarios <pack.json> [--rule <id>]
//   ostack domain cross <pack1.json> <pack2.json> [...]
// Honesty first: `create` scaffolds and inventories sources — it never claims
// to have extracted knowledge it did not; the confidence score is computed.
export async function runDomain(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const audit = new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl"));

  switch (subcommand) {
    case "create": {
      const options = parseFlags(rest);
      const name = options.flags.name;
      if (!name || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) throw new Error("Usage: ostack domain create --name <id-kebab-case> [--sector s] [--country c] [--language l] [--sources <dir>]");
      const sources: DomainPack["sources"] = [];
      if (options.flags.sources) {
        const directory = containedPath(context.cwd, options.flags.sources);
        for (const entry of (await readdir(directory)).sort()) {
          const info = await stat(join(directory, entry));
          if (info.isFile()) sources.push({ id: slugify(entry), title: entry, kind: "document", uri: relative(context.cwd, join(directory, entry)) });
        }
      }
      const pack: DomainPack = {
        schemaVersion: 1, id: name, name,
        sector: options.flags.sector ?? "a-renseigner",
        ...(options.flags.country ? { country: options.flags.country } : {}),
        language: options.flags.language ?? "fr",
        version: "0.1.0",
        sources, experts: [], glossary: [], actors: [], workflows: [], rules: [],
        decisionTables: [], kpis: [], mappings: [],
        openQuestions: [...ESSENTIAL_QUESTIONS]
      };
      const directory = join(context.cwd, "domain-packs", name);
      await mkdir(directory, { recursive: true });
      const path = join(directory, "domain-pack.json");
      await writeFile(path, `${JSON.stringify(pack, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await audit.append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "domain.create", projectId: config.project.id, outcome: "succeeded",
        details: { domainId: name, sources: sources.length }
      }));
      const maturity = assessMaturity(pack);
      return {
        status: "created", savedTo: relative(context.cwd, path),
        maturity, sourcesInventoried: sources.length,
        message: `Le pack est au niveau ${maturity.level} (${maturity.label}): ${sources.length} source(s) inventoriée(s), aucune connaissance extraite. Renseignez glossaire, acteurs, processus et règles à partir des sources, puis faites valider par les experts.`,
        openQuestions: pack.openQuestions
      };
    }
    case "score": {
      const pack = await loadPack(context.cwd, rest[0]);
      const confidence = computeDomainConfidence(pack);
      const maturity = assessMaturity(pack);
      return { domainId: pack.id, maturity, confidence };
    }
    case "validate": {
      const options = parseFlags(rest.slice(1));
      const packPath = rest[0];
      const pack = await loadPack(context.cwd, packPath);
      const { rule: ruleId, expert, reason, role } = options.flags;
      if (!packPath || !ruleId || !expert || !reason) throw new Error("Usage: ostack domain validate <pack.json> --rule <id> --expert <nom> --reason \"<raison>\" [--role <rôle>]");
      const index = pack.rules.findIndex((rule) => rule.id === ruleId);
      if (index === -1) throw new Error(`Règle inconnue: ${ruleId}. Règles: ${pack.rules.map((rule) => rule.id).join(", ") || "(aucune)"}`);
      const confirmed = confirmRule(pack.rules[index]!, { expert, ...(role ? { role } : {}), reason, validatedAt: new Date().toISOString() });
      pack.rules[index] = confirmed;
      const absolute = containedPath(context.cwd, packPath);
      await writeFile(absolute, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
      await audit.append(auditEntry({
        actorId: expert, action: "domain.rule_validated", projectId: config.project.id, outcome: "succeeded",
        details: { domainId: pack.id, ruleId, reason }
      }));
      return { status: "confirmed", ruleId, validatedBy: confirmed.validatedBy, maturity: assessMaturity(pack) };
    }
    case "check": {
      const options = parseFlags(rest.slice(1));
      const pack = await loadPack(context.cwd, rest[0]);
      const action = options.flags.action;
      if (!action || !options.flags.context) throw new Error("Usage: ostack domain check <pack.json> --action <action> --context <contexte.json> [--jurisdiction <j>] [--criticality low|medium|high|critical]");
      const contextData = JSON.parse(await readFile(containedPath(context.cwd, options.flags.context), "utf8"));
      const scope = applicableRules(pack.rules, options.flags.jurisdiction ?? pack.country);
      const evaluation = evaluateAction(scope.applicable, action, contextData);
      await audit.append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "domain.check", projectId: config.project.id,
        outcome: evaluation.decision === "allowed" ? "allowed" : "denied",
        details: { domainId: pack.id, action, decision: evaluation.decision }
      }));
      return { domainId: pack.id, ...evaluation, excludedForeignRules: scope.excluded };
    }
    case "scenarios": {
      const options = parseFlags(rest.slice(1));
      const pack = await loadPack(context.cwd, rest[0]);
      const rules = options.flags.rule ? pack.rules.filter((rule) => rule.id === options.flags.rule) : pack.rules;
      if (rules.length === 0) throw new Error("Aucune règle correspondante dans le pack");
      return { domainId: pack.id, scenarios: rules.flatMap((rule) => generateRuleScenarios(rule)) };
    }
    case "cross": {
      if (rest.length < 2) throw new Error("Usage: ostack domain cross <pack1.json> <pack2.json> [...]");
      const packs = await Promise.all(rest.map((path) => loadPack(context.cwd, path)));
      return { domains: packs.map((pack) => pack.id), analysis: analyzeCrossDomain(packs) };
    }
    case "agents": {
      return (await import("./domain-agents.js")).runDomainAgents({ ...context, args: rest });
    }
    default:
      throw new Error(`Unknown domain subcommand '${subcommand ?? ""}'. Use create | score | validate | check | scenarios | cross`);
  }
}

async function loadPack(root: string, input?: string): Promise<DomainPack> {
  if (!input) throw new Error("A domain pack path is required");
  const path = containedPath(root, input);
  const pack = JSON.parse(await readFile(path, "utf8")) as DomainPack;
  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/domain-pack.schema.json"), "utf8"));
  const validation = new SchemaValidator().validate(schema, pack);
  if (!validation.valid) throw new Error(`Invalid domain pack: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  return pack;
}

function parseFlags(args: string[]): { positionals: string[]; flags: Record<string, string> } {
  const result: { positionals: string[]; flags: Record<string, string> } = { positionals: [], flags: {} };
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (current.startsWith("--")) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      result.flags[current.slice(2)] = value;
    } else result.positionals.push(current);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Path must be inside the project");
  return absolute;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "source";
}
