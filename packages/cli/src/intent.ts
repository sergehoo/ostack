import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, PermissionEngine, auditEntry } from "@ostack/core";
import { compileIntent, draftIntent, type IntentDraft } from "@ostack/intent";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, loadConfig } from "./config.js";
import { selectProvider } from "./feature.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack intent-compile` (§4) — turns a request into invariants, Gherkin
// properties, required controls and expected evidence. With --from the pipeline
// is fully deterministic; with a natural-language request a provider drafts the
// structured intent, which is schema-validated before compilation.
export async function runIntentCompile(context: CommandContext): Promise<unknown> {
  const options = parseOptions(context.args);
  const config = await loadConfig(context.cwd);
  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/intent-draft.schema.json"), "utf8"));

  let draft: IntentDraft;
  let source: string;
  if (options.from) {
    const path = containedPath(context.cwd, options.from);
    draft = JSON.parse(await readFile(path, "utf8")) as IntentDraft;
    source = relative(context.cwd, path);
  } else {
    const request = options.positionals.join(" ").trim();
    if (!request) throw new Error("Usage: ostack intent-compile <besoin en langage naturel> [--provider …] | --from <draft.json>");
    let provider;
    try {
      provider = await selectProvider(config.ai.preferredProviders, options.provider, config.ai.models);
    } catch {
      throw new Error(
        "Aucun fournisseur IA disponible pour rédiger le brouillon. Trois options: " +
        "(1) rédigez le brouillon vous-même (ou via votre assistant Claude/Cursor/Codex) au format schemas/intent-draft.schema.json puis relancez avec --from <draft.json> — c'est la voie recommandée quand OStack est piloté depuis un assistant; " +
        "(2) démarrez Ollama en local; (3) exportez OPENAI_API_KEY ou ANTHROPIC_API_KEY."
      );
    }
    if (provider.id === "mock") throw new Error("Le fournisseur mock ne peut pas rédiger d'intention; rédigez le brouillon et utilisez --from <draft.json> pour une compilation déterministe");
    draft = await draftIntent(slugify(request), request, provider);
    source = `provider:${provider.id}`;
  }

  const validation = new SchemaValidator().validate(schema, { ...draft, $schema: "https://ostack.dev/schemas/intent-draft.schema.json" });
  if (!validation.valid) throw new Error(`Invalid intent draft: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);

  const compiled = compileIntent(draft);
  const path = await persistCompiledIntent(context.cwd, config.project.id, compiled, source);

  return {
    intent: compiled,
    savedTo: relative(context.cwd, path),
    source,
    summary: {
      invariants: compiled.invariants.length,
      properties: compiled.properties.length,
      adversarialProperties: compiled.properties.filter((property) => property.adversarial).length,
      controls: compiled.controls,
      requiredTests: compiled.requiredTests
    }
  };
}

export async function persistCompiledIntent(root: string, projectId: string, compiled: ReturnType<typeof compileIntent>, source: string): Promise<string> {
  const actor = { id: process.env.USER ?? "cli-user", kind: "human" as const, roles: ["local-writer"] };
  const directory = join(configDirectory(root), "intents");
  const path = join(directory, `${compiled.id}-${compiled.contentHash.slice(0, 12)}.json`);
  new PermissionEngine().assert({ id: crypto.randomUUID(), action: "intent.persist", level: 2, actor, projectId, resource: path });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(compiled, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await new JsonLinesAuditStore(join(configDirectory(root), "audit.jsonl")).append(auditEntry({
    actorId: actor.id, action: "intent.compile", projectId, outcome: "succeeded",
    details: { intentId: compiled.id, contentHash: compiled.contentHash, source, invariants: compiled.invariants.length }
  }));
  return path;
}

function parseOptions(args: string[]): { positionals: string[]; provider?: string; from?: string } {
  const result: { positionals: string[]; provider?: string; from?: string } = { positionals: [] };
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (current === "--provider" || current === "--from") {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      if (current === "--provider") result.provider = value;
      else result.from = value;
    } else result.positionals.push(current);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Intent draft must be inside the project");
  return absolute;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || "intent";
}
