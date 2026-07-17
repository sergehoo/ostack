// Risk classification (§15) + self-guard on the evolution machinery (§32).
// Determines the risk of a proposed change from the resource paths it touches.
// The engine can never lower its own guardrails: files that control autonomy
// are CRITICAL and can never be auto-merged.

export type RiskLevel = "low" | "medium" | "high" | "critical";

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

// Files that govern OStack's own autonomy — modifying them is always critical
// and blocks auto-merge (§32: the engine cannot reduce its own controls).
export const PROTECTED_EVOLUTION_PATHS = [
  "policies/evolution.json",
  "policies/security.json",
  "core/autonomous-evolution/",
  "packages/evolution/",
  "scripts/git-push",
  ".github/workflows/ostack-evolution.yml"
];

const RULES: Array<{ test: (path: string) => boolean; level: RiskLevel }> = [
  // critical — guardrails, secrets, production, branch protection
  { test: (p) => PROTECTED_EVOLUTION_PATHS.some((x) => p === x || p.startsWith(x)), level: "critical" },
  { test: (p) => /(^|\/)(\.env|secrets?|credentials?)(\/|\.|$)/i.test(p), level: "critical" },
  { test: (p) => /(^|\/)(deploy|production|release)(\/|\.|$)/i.test(p), level: "critical" },
  // high — core runtime, policies, security, shell, network, hooks, deps
  { test: (p) => /^packages\/core\//.test(p), level: "high" },
  { test: (p) => /^policies\//.test(p), level: "high" },
  { test: (p) => /(^|\/)(security|hooks|scripts)\//.test(p), level: "high" },
  { test: (p) => /^package(-lock)?\.json$/.test(p) || /\/package\.json$/.test(p), level: "high" },
  // medium — new command/workflow/agent, domain pack, installer, routing
  { test: (p) => /^(framework\/)?(commands|agents|workflows)\//.test(p), level: "medium" },
  { test: (p) => /^(standards|domain-packs)\//.test(p), level: "medium" },
  { test: (p) => /install\.|mesh\./.test(p), level: "medium" },
  // low — docs, examples, tests, benchmarks, lessons, candidate knowledge, skills
  { test: (p) => /^(docs|examples|tests|benchmarks|lessons|patterns|anti-patterns)\//.test(p), level: "low" },
  { test: (p) => /^knowledge\/candidates\//.test(p), level: "low" },
  { test: (p) => /^(framework\/)?skills\//.test(p), level: "low" }
];

export function classifyPathRisk(path: string): RiskLevel {
  for (const rule of RULES) if (rule.test(path)) return rule.level;
  return "medium"; // unknown path: never assumed safe
}

export function classifyRisk(paths: string[]): RiskLevel {
  if (paths.length === 0) return "low";
  return paths.map(classifyPathRisk).reduce((worst, level) => (RANK[level] > RANK[worst] ? level : worst), "low");
}

export function touchesProtectedPath(paths: string[]): boolean {
  return paths.some((path) => PROTECTED_EVOLUTION_PATHS.some((x) => path === x || path.startsWith(x)));
}
