#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { accessSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PermissionEngine, type SecurityLevel } from "@ostack/core";
import { SqliteRunRepository } from "@ostack/sqlite";
import { discoverProject } from "@ostack/discovery";

const projectRoot = process.env.OSTACK_PROJECT_ROOT ?? process.cwd();
const server = new McpServer({ name: "ostack", version: "0.1.0" });

server.registerTool("ostack_doctor", {
  title: "Check OStack project",
  description: "Checks whether the current project is initialized and reports its local configuration. Read-only.",
  inputSchema: {}
}, async () => {
  try {
    const config = await getConfig();
    return output({ healthy: true, project: config.project, database: databaseExists() });
  } catch (error) { return output({ healthy: false, error: message(error) }, true); }
});

server.registerTool("ostack_discover", {
  title: "Discover the current project",
  description: "Inventories the local project and detects languages, frameworks, infrastructure and documentation. Read-only; secrets and dependency directories are excluded.",
  inputSchema: {}
}, async () => {
  try { return output(await discoverProject(projectRoot)); }
  catch (error) { return output({ error: message(error) }, true); }
});

server.registerTool("ostack_list_runs", {
  title: "List OStack runs",
  description: "Lists recent workflow runs for the initialized project. Read-only.",
  inputSchema: { limit: z.number().int().min(1).max(200).default(20) }
}, async ({ limit }) => withRepository(async (repository, config) => output({ runs: await repository.list(config.project.id, limit) })));

server.registerTool("ostack_get_run", {
  title: "Inspect an OStack run",
  description: "Returns one workflow run, including completed steps and approval state. Read-only.",
  inputSchema: { runId: z.string().min(1) }
}, async ({ runId }) => withRepository(async (repository) => {
  const run = await repository.get(runId);
  return run ? output(run) : output({ error: "Run not found" }, true);
}));

server.registerTool("ostack_explain_security_level", {
  title: "Explain an OStack security decision",
  description: "Explains whether an action is permitted at a given OStack security level. This tool never grants approval.",
  inputSchema: { level: z.number().int().min(1).max(4), action: z.string().min(1).default("inspect") }
}, async ({ level, action }) => {
  const decision = new PermissionEngine().evaluate({
    id: crypto.randomUUID(), action, level: level as SecurityLevel,
    actor: { id: "mcp-client", kind: "agent", roles: [] }, projectId: "current"
  });
  return output(decision);
});

server.registerResource("ostack-agent-catalog", "ostack://agents", {
  title: "OStack agent catalog",
  description: "Declarative catalog of available OStack specialist agents",
  mimeType: "application/json"
}, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: await readProjectOrFramework("agents/catalog.json") }] }));

server.registerResource("ostack-feature-workflow", "ostack://workflows/feature-delivery", {
  title: "OStack feature workflow",
  description: "Declarative feature delivery workflow",
  mimeType: "application/json"
}, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: await readProjectOrFramework("workflows/feature-delivery.json") }] }));

const transport = new StdioServerTransport();
await server.connect(transport);

interface Config { project: { id: string; name: string; root: string }; }
async function getConfig(): Promise<Config> { return JSON.parse(await readFile(join(projectRoot, ".ostack/config.json"), "utf8")) as Config; }
function databasePath(): string { return join(projectRoot, ".ostack/ostack.db"); }
function databaseExists(): boolean { try { accessSync(databasePath()); return true; } catch { return false; } }

async function withRepository(handler: (repository: SqliteRunRepository, config: Config) => Promise<ReturnType<typeof output>>): Promise<ReturnType<typeof output>> {
  try {
    const config = await getConfig();
    const repository = new SqliteRunRepository(databasePath());
    try { return await handler(repository, config); } finally { repository.close(); }
  } catch (error) { return output({ error: message(error) }, true); }
}

function output(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function readProjectOrFramework(relativePath: string): Promise<string> {
  try { return await readFile(join(projectRoot, relativePath), "utf8"); }
  catch { return readFile(join(import.meta.dirname, "../../..", relativePath), "utf8"); }
}
