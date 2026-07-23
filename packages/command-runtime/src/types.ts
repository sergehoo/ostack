import type { ModelResponse } from "@ostack/core";

export type CommandScope = "project" | "domain" | "domain-pack";
export type ResourceKind = "agents" | "standards" | "policies" | "workflows";

export interface CommandInputContract {
  required: boolean;
  maxChars: number;
  pattern?: string;
}

export interface CommandDefinition {
  name: string;
  shortName: string;
  description: string;
  argumentHint?: string;
  aliases: string[];
  sourcePath: string;
  sourceRoot: string;
  resourceBase: string;
  scope: CommandScope;
  namespace?: string;
  instructions: string;
  input: CommandInputContract;
  timeoutMs?: number;
  resources: Record<ResourceKind, string[]>;
  metadata: Record<string, string | number | boolean | string[]>;
}

export interface CommandCollision {
  query: string;
  commands: string[];
}

export interface CommandCatalog {
  commands: CommandDefinition[];
  collisions: CommandCollision[];
}

export interface LoadedResource {
  kind: ResourceKind;
  id: string;
  path: string;
  format: "markdown" | "json" | "text";
  content: string;
  data?: unknown;
}

export interface CommandExecutionContext {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  project: {
    id: string;
    name: string;
    root: string;
  };
  command: {
    name: string;
    description: string;
    source: string;
    scope: CommandScope;
    namespace?: string;
    instructions: string;
  };
  input: {
    value: string;
    chars: number;
  };
  resources: LoadedResource[];
}

export type CommandRunStatus = "dry_run" | "succeeded" | "failed" | "timed_out";

export interface CommandRunRecord {
  schemaVersion: 1;
  runId: string;
  projectId: string;
  command: string;
  status: CommandRunStatus;
  provider?: string;
  model?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputChars: number;
  inputHash: string;
  outputChars?: number;
  outputHash?: string;
  usage?: ModelResponse["usage"];
  error?: string;
}

export interface CommandExecutionResult {
  response: ModelResponse;
  durationMs: number;
}

export type SkillScope = "project" | "domain" | "domain-pack";

export interface SkillDefinition {
  name: string;
  description: string;
  sourcePath: string;
  scope: SkillScope;
  namespace?: string;
  status?: string;
  instructions: string;
  contentHash: string;
  metadata: Record<string, string | number | boolean | string[]>;
}

export interface SkillDuplicate {
  name: string;
  kept: string;
  ignored: string[];
}

export interface SkillCatalog {
  skills: SkillDefinition[];
  duplicates: SkillDuplicate[];
  availableDomains: string[];
}

export interface AllSkillsExecutionContext {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  project: {
    id: string;
    name: string;
    root: string;
  };
  objective: {
    value: string;
    chars: number;
  };
  selection: {
    projectSkills: true;
    domains: string[];
    total: number;
  };
  skills: Array<{
    name: string;
    description: string;
    source: string;
    scope: SkillScope;
    namespace?: string;
    status?: string;
    instructions: string;
    contentHash: string;
  }>;
}
