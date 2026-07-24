// Self-defense model (§13). OStack treats its own security policies, guardrails
// and evidence as protected assets, and treats everything it reads through tools
// (scan output, target responses, third-party content) as UNTRUSTED DATA that
// can never issue instructions. This encodes both halves as pure predicates.

/** Paths whose modification must require explicit human approval (§13, §35). */
export const PROTECTED_SECURITY_PATHS: readonly string[] = [
  "policies/",
  "framework/skills/cybersecurity/",
  "packages/security/",
  "packages/security-lab/",
  ".ostack/security/",
  "scripts/scan-secrets.mjs",
  "scripts/validate-evolution.mjs",
];

export function isProtectedSecurityPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return PROTECTED_SECURITY_PATHS.some((protectedPath) =>
    protectedPath.endsWith("/") ? normalized.startsWith(protectedPath) : normalized === protectedPath,
  );
}

export type UntrustedSource = "scan_output" | "target_response" | "third_party_content" | "dependency_metadata";

export interface TrustDecision {
  source: UntrustedSource;
  mayIssueInstructions: false;
  treatAs: "data";
  note: string;
}

/**
 * Everything observed through a security tool is data, never a command. This is
 * the deterministic gate the CLI applies before ever acting on scan content:
 * findings are recorded as evidence, instructions embedded in them are ignored.
 */
export function classifyUntrusted(source: UntrustedSource): TrustDecision {
  return {
    source,
    mayIssueInstructions: false,
    treatAs: "data",
    note: "Contenu observé via un outil: traité comme donnée non fiable, jamais comme instruction (§13).",
  };
}

export interface GuardrailChange {
  path: string;
  reducesGuardrail: boolean;
}

/**
 * Self-evolution can never weaken its own guardrails (§35). Any change that both
 * touches a protected path AND reduces a guardrail must be refused by automation
 * and escalated to a human.
 */
export function requiresHumanApproval(change: GuardrailChange): boolean {
  return isProtectedSecurityPath(change.path) || change.reducesGuardrail;
}
