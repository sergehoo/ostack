import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface OStackConfig {
  schemaVersion: 1;
  project: { id: string; name: string; root: string };
  ai: {
    preferredProviders: string[];
    models?: { openai?: string; anthropic?: string; ollama?: string };
    defaultModel?: string;
  };
  security: { defaultLevel: 1 | 2; productionApproval: "always" };
  knowledge: { include: string[]; exclude: string[] };
  quality?: { commands: Array<{ command: string; args: string[] }> };
  observe?: {
    probes: Array<{ name: string; url: string; method?: "GET" | "HEAD"; expectStatus?: number; maxLatencyMs?: number; timeoutMs?: number }>;
    allowedHosts?: string[];
  };
  mesh?: {
    candidates: Array<{ id: string; provider: string; model: string; local: boolean }>;
    routes: Array<{ taskType: string; strategy: "quality_first" | "cost_per_verified_result" | "privacy_first" | "independent_consensus"; candidates: string[]; requiredIndependentModels?: number }>;
  };
  knowledgeRepository?: {
    remote: string;
    branch: string;
    localPath: string;
    syncOnStart?: boolean;
    pushOnVerifiedLearning?: boolean;
  };
  plugins: string[];
}

export const configDirectory = (root: string) => join(root, ".ostack");
export const configFile = (root: string) => join(configDirectory(root), "config.json");

export async function loadConfig(root: string): Promise<OStackConfig> {
  return JSON.parse(await readFile(configFile(root), "utf8")) as OStackConfig;
}

export async function initializeConfig(root: string, name: string): Promise<OStackConfig> {
  const config: OStackConfig = {
    schemaVersion: 1,
    project: { id: slug(name), name, root: "." },
    ai: {
      preferredProviders: ["ollama", "openai", "anthropic", "azure-openai", "google", "mistral", "deepseek", "openrouter"],
      models: { openai: "gpt-5.4-mini", anthropic: "claude-sonnet-4-5", ollama: "qwen3" }
    },
    security: { defaultLevel: 1, productionApproval: "always" },
    knowledge: { include: ["AGENTS.md", "README.md", "docs/**/*", "**/*.{md,json,yaml,yml}"], exclude: ["node_modules/**", ".git/**", "dist/**", ".env*"] },
    quality: { commands: [{ command: "npm", args: ["run", "check"] }, { command: "npm", args: ["test"] }] },
    plugins: []
  };
  await mkdir(configDirectory(root), { recursive: true, mode: 0o700 });
  await writeFile(configFile(root), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await mkdir(join(configDirectory(root), "runs"), { recursive: true });
  await mkdir(join(configDirectory(root), "cache"), { recursive: true });
  return config;
}

function slug(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
