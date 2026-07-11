import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { checkArchitecture, extractImports, type ArchitectureRule, type ImportRecord } from "@ostack/architecture";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_EXTENSIONS = new Set([".ts", ".mts", ".js", ".mjs"]);
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".ostack"]);

// `ostack architecture check` (§19) — declared boundaries verified against the
// actual import graph; any violation is a merge blocker with --gate.
export async function runArchitectureCheck(context: CommandContext): Promise<unknown> {
  const gate = context.args.includes("--gate");
  const config = await loadConfig(context.cwd);
  const policy = JSON.parse(await readFile(join(frameworkRoot, "policies/architecture.json"), "utf8")) as { rules: ArchitectureRule[] };

  const records: ImportRecord[] = [];
  for (const top of ["packages", "apps"]) {
    for (const file of await walk(join(context.cwd, top))) {
      records.push({ file: relative(context.cwd, file), specifiers: extractImports(await readFile(file, "utf8")) });
    }
  }
  const violations = checkArchitecture(policy.rules, records);

  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "architecture.check", projectId: config.project.id,
    outcome: violations.length === 0 ? "succeeded" : "denied",
    details: { rules: policy.rules.length, files: records.length, violations: violations.length }
  }));

  if (gate && violations.length > 0) {
    throw new Error(`Architecture gate failed: ${violations.map((violation) => `${violation.file} → ${violation.specifier} (${violation.rule})`).join("; ")}`);
  }
  return {
    status: violations.length === 0 ? "boundaries_respected" : "violations_detected",
    rules: policy.rules.length,
    filesScanned: records.length,
    violations
  };
}

async function walk(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) files.push(...await walk(join(directory, entry.name)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extensionOf(entry.name))) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}
