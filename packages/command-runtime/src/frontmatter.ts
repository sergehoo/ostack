import type { CommandDefinition, CommandInputContract, ResourceKind } from "./types.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9:_/-]{0,127}$/;
const RESOURCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/;
const RESOURCE_KEYS: ResourceKind[] = ["agents", "standards", "policies", "workflows"];
const LIST_KEYS = new Set(["aliases", ...RESOURCE_KEYS]);

export interface ParsedDocument {
  attributes: Record<string, string | number | boolean | string[]>;
  body: string;
}

export interface CommandDefaults {
  name: string;
  shortName: string;
  sourcePath: string;
  sourceRoot: string;
  resourceBase: string;
  scope: CommandDefinition["scope"];
  namespace?: string;
}

export function parseCommandDocument(source: string, defaults: CommandDefaults): CommandDefinition {
  const parsed = parseFrontmatter(source);
  const declaredName = readString(parsed.attributes, "name") ?? defaults.name;
  const name = normalizeCommandName(defaults.namespace && !declaredName.includes(":")
    ? `${defaults.namespace}:${declaredName}`
    : declaredName);
  assertName(name, "command name");

  const aliases = unique(readList(parsed.attributes, "aliases").map(normalizeCommandName));
  for (const alias of aliases) assertName(alias, "command alias");

  const maxChars = readInteger(parsed.attributes, "input-max-chars") ?? 100_000;
  if (maxChars < 0 || maxChars > 1_000_000) {
    throw new Error(`Invalid input-max-chars for '${name}': expected 0..1000000`);
  }
  const pattern = readString(parsed.attributes, "input-pattern");
  if (pattern !== undefined) {
    try { new RegExp(pattern, "u"); }
    catch { throw new Error(`Invalid input-pattern for '${name}'`); }
  }
  const input: CommandInputContract = {
    required: readBoolean(parsed.attributes, "input-required") ?? false,
    maxChars,
    ...(pattern !== undefined ? { pattern } : {})
  };

  const timeoutMs = readInteger(parsed.attributes, "timeout-ms");
  if (timeoutMs !== undefined && (timeoutMs < 100 || timeoutMs > 600_000)) {
    throw new Error(`Invalid timeout-ms for '${name}': expected 100..600000`);
  }

  const resources = Object.fromEntries(RESOURCE_KEYS.map((kind) => {
    const ids = unique(readList(parsed.attributes, kind));
    for (const id of ids) {
      if (!RESOURCE_PATTERN.test(id) || id.includes("..") || id.startsWith("/")) {
        throw new Error(`Invalid ${kind} resource '${id}' for '${name}'`);
      }
    }
    return [kind, ids];
  })) as Record<ResourceKind, string[]>;

  const description = readString(parsed.attributes, "description") ?? firstHeading(parsed.body) ?? name;
  const argumentHint = readString(parsed.attributes, "argument-hint");
  return {
    name,
    shortName: defaults.shortName,
    description,
    aliases,
    sourcePath: defaults.sourcePath,
    sourceRoot: defaults.sourceRoot,
    resourceBase: defaults.resourceBase,
    scope: defaults.scope,
    ...(defaults.namespace !== undefined ? { namespace: defaults.namespace } : {}),
    instructions: parsed.body.trim(),
    input,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    resources,
    metadata: parsed.attributes,
    ...(argumentHint !== undefined ? { argumentHint } : {})
  };
}

export function normalizeCommandName(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("/ostack:")) normalized = normalized.slice("/ostack:".length);
  else if (normalized.startsWith("ostack:")) normalized = normalized.slice("ostack:".length);
  else if (normalized.startsWith("/")) normalized = normalized.slice(1);
  return normalized.replaceAll("\\", ":").replaceAll("/", ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

export function parseFrontmatter(source: string): ParsedDocument {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { attributes: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Unclosed command frontmatter");
  const header = normalized.slice(4, end);
  const attributes: Record<string, string | number | boolean | string[]> = {};
  for (const [index, rawLine] of header.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`Invalid frontmatter at line ${index + 2}`);
    const key = line.slice(0, separator).trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error(`Invalid frontmatter key '${key}'`);
    attributes[key] = parseValue(key, line.slice(separator + 1).trim());
  }
  return { attributes, body: normalized.slice(end + 5) };
}

function parseValue(key: string, value: string): string | number | boolean | string[] {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (LIST_KEYS.has(key) && value.startsWith("[") && value.endsWith("]")) {
    const content = value.slice(1, -1).trim();
    if (!content) return [];
    return content.split(",").map((item) => unquote(item.trim())).filter(Boolean);
  }
  return unquote(value);
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readString(attributes: ParsedDocument["attributes"], key: string): string | undefined {
  const value = attributes[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readInteger(attributes: ParsedDocument["attributes"], key: string): number | undefined {
  const value = attributes[key];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value)) throw new Error(`Frontmatter '${key}' must be an integer`);
  return value as number;
}

function readBoolean(attributes: ParsedDocument["attributes"], key: string): boolean | undefined {
  const value = attributes[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Frontmatter '${key}' must be a boolean`);
  return value;
}

function readList(attributes: ParsedDocument["attributes"], key: string): string[] {
  const value = attributes[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  throw new Error(`Frontmatter '${key}' must be a list`);
}

function firstHeading(body: string): string | undefined {
  return body.split("\n").map((line) => line.trim()).find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "");
}

function assertName(value: string, label: string): void {
  if (!NAME_PATTERN.test(value)) throw new Error(`Invalid ${label}: '${value}'`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
