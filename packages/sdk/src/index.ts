import type { AgentDefinition, ModelProvider, WorkflowDefinition } from "@ostack/core";

export const OSTACK_PLUGIN_API_VERSION = "1";

export interface PluginContext {
  projectRoot: string;
  config: Readonly<Record<string, unknown>>;
  logger: { info(message: string, details?: unknown): void; warn(message: string, details?: unknown): void; error(message: string, details?: unknown): void };
}

export interface OStackPlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  agents?: AgentDefinition[];
  workflows?: WorkflowDefinition[];
  providers?: ModelProvider[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: typeof OSTACK_PLUGIN_API_VERSION;
  description: string;
  author?: string;
  license?: string;
  permissions: Array<"project:read" | "project:write" | "network" | "secrets:read" | "process:execute">;
  engines: { ostack: string };
}

export function definePlugin(plugin: OStackPlugin): OStackPlugin {
  if (!/^[a-z0-9][a-z0-9.-]+$/.test(plugin.manifest.id)) throw new Error("Invalid plugin id");
  if (plugin.manifest.apiVersion !== OSTACK_PLUGIN_API_VERSION) throw new Error(`Unsupported plugin API: ${plugin.manifest.apiVersion}`);
  return Object.freeze(plugin);
}
