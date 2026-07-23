import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { normalizeCommandName, parseCommandDocument } from "./frontmatter.js";
import type { CommandCatalog, CommandCollision, CommandDefinition, CommandScope } from "./types.js";

interface SearchRoot {
  directory: string;
  resourceBase: string;
  scope: CommandScope;
  namespace?: string;
}

export async function discoverCommands(projectRoot: string): Promise<CommandCatalog> {
  const roots = await searchRoots(projectRoot);
  const commands: CommandDefinition[] = [];
  for (const root of roots) {
    for (const file of await markdownFiles(root.directory)) {
      const relativePath = relative(root.directory, file);
      const stem = relativePath.slice(0, -extname(relativePath).length).split(sep).join(":");
      const shortName = normalizeCommandName(stem.split(":").at(-1) ?? stem);
      const defaultName = normalizeCommandName(root.namespace ? `${root.namespace}:${stem}` : stem);
      const source = await readBounded(file);
      commands.push(parseCommandDocument(source, {
        name: defaultName,
        shortName,
        sourcePath: relative(projectRoot, file).split(sep).join("/"),
        sourceRoot: relative(projectRoot, root.directory).split(sep).join("/"),
        resourceBase: root.resourceBase,
        scope: root.scope,
        ...(root.namespace !== undefined ? { namespace: root.namespace } : {})
      }));
    }
  }
  commands.sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath));
  return { commands, collisions: findCollisions(commands) };
}

export function resolveCommand(catalog: CommandCatalog, query: string): CommandDefinition {
  const normalized = normalizeCommandName(query);
  if (!normalized) throw new Error("A command name is required");
  const matches = catalog.commands.filter((command) => commandKeys(command).includes(normalized));
  if (matches.length === 0) {
    const available = catalog.commands.slice(0, 8).map((command) => command.name).join(", ");
    throw new Error(`Unknown OStack command '${query}'${available ? `. Available: ${available}` : ""}`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous OStack command '${query}': ${matches.map((command) => command.name).join(", ")}`);
  }
  return matches[0]!;
}

function commandKeys(command: CommandDefinition): string[] {
  return [...new Set([command.name, command.shortName, ...command.aliases].map(normalizeCommandName))];
}

function findCollisions(commands: CommandDefinition[]): CommandCollision[] {
  const index = new Map<string, Set<string>>();
  for (const command of commands) {
    for (const key of commandKeys(command)) {
      const values = index.get(key) ?? new Set<string>();
      values.add(command.name);
      index.set(key, values);
    }
  }
  return [...index.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([query, values]) => ({ query, commands: [...values].sort() }))
    .sort((left, right) => left.query.localeCompare(right.query));
}

async function searchRoots(projectRoot: string): Promise<SearchRoot[]> {
  const roots: SearchRoot[] = [];
  const projectCommands = join(projectRoot, ".ostack", "commands");
  if (await isDirectory(projectCommands)) {
    roots.push({ directory: projectCommands, resourceBase: join(projectRoot, ".ostack"), scope: "project" });
  }
  for (const [container, scope] of [
    [join(projectRoot, ".ostack", "domains"), "domain"],
    [join(projectRoot, ".ostack", "domain-packs"), "domain-pack"],
    [join(projectRoot, ".ostack", "packs"), "domain-pack"],
    [join(projectRoot, "domain-packs"), "domain-pack"]
  ] as const) {
    if (!await isDirectory(container)) continue;
    for (const entry of await readdir(container, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const commands = join(container, entry.name, "commands");
      if (!await isDirectory(commands)) continue;
      roots.push({
        directory: commands,
        resourceBase: join(container, entry.name),
        scope,
        namespace: normalizeCommandName(entry.name)
      });
    }
  }
  return roots;
}

async function markdownFiles(directory: string): Promise<string[]> {
  const rootReal = await realpath(directory);
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const resolved = await realpath(path);
        if (resolved === rootReal || resolved.startsWith(`${rootReal}${sep}`)) files.push(path);
      }
    }
  }
  await walk(directory);
  return files.sort();
}

async function isDirectory(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); }
  catch { return false; }
}

async function readBounded(path: string): Promise<string> {
  const info = await stat(path);
  if (info.size > 1_000_000) throw new Error(`Command file exceeds 1 MB: ${path}`);
  return readFile(path, "utf8");
}
