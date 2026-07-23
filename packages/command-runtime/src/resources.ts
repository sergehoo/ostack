import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import type { CommandDefinition, LoadedResource, ResourceKind } from "./types.js";

const EXTENSIONS: Record<ResourceKind, string[]> = {
  agents: [".md", ".json"],
  standards: [".json", ".md"],
  policies: [".json", ".md"],
  workflows: [".json", ".md"]
};

export async function loadAssociatedResources(projectRoot: string, command: CommandDefinition): Promise<LoadedResource[]> {
  const resources: LoadedResource[] = [];
  for (const kind of Object.keys(command.resources) as ResourceKind[]) {
    for (const id of command.resources[kind]) {
      const path = await findResource(projectRoot, command.resourceBase, kind, id);
      if (!path) throw new Error(`Associated ${kind} resource '${id}' was not found for '${command.name}'`);
      const content = await readBounded(path);
      const extension = extname(path).toLowerCase();
      if (extension === ".json") {
        let data: unknown;
        try { data = JSON.parse(content); }
        catch { throw new Error(`Associated ${kind} resource '${id}' contains invalid JSON`); }
        resources.push({
          kind,
          id,
          path: relative(projectRoot, path).split(sep).join("/"),
          format: "json",
          content,
          data
        });
      } else {
        resources.push({
          kind,
          id,
          path: relative(projectRoot, path).split(sep).join("/"),
          format: extension === ".md" ? "markdown" : "text",
          content
        });
      }
    }
  }
  return resources;
}

async function findResource(projectRoot: string, resourceBase: string, kind: ResourceKind, id: string): Promise<string | undefined> {
  if (isAbsolute(id) || id.includes("..")) throw new Error(`Unsafe resource id '${id}'`);
  const roots = [...new Set([
    join(resourceBase, kind),
    join(projectRoot, ".ostack", kind),
    join(projectRoot, kind)
  ])];
  const hasExtension = extname(id).length > 0;
  if (hasExtension && !EXTENSIONS[kind].includes(extname(id).toLowerCase())) {
    throw new Error(`Unsupported ${kind} resource extension for '${id}'`);
  }
  const candidates = hasExtension ? [id] : EXTENSIONS[kind].map((extension) => `${id}${extension}`);
  for (const root of roots) {
    for (const candidate of candidates) {
      const path = join(root, candidate);
      if (await isContainedFile(root, path)) return path;
    }
  }
  return undefined;
}

async function isContainedFile(root: string, path: string): Promise<boolean> {
  try {
    const [rootReal, pathReal, info] = await Promise.all([realpath(root), realpath(path), stat(path)]);
    return info.isFile() && (pathReal === rootReal || pathReal.startsWith(`${rootReal}${sep}`));
  } catch {
    return false;
  }
}

async function readBounded(path: string): Promise<string> {
  const info = await stat(path);
  if (info.size > 1_000_000) throw new Error(`Associated resource exceeds 1 MB: ${path}`);
  return readFile(path, "utf8");
}
