// OStack Cross-Domain Reasoning (§19) — deterministic detection of shared
// concepts and rule interactions across several domain packs. When a rule from
// one domain touches an action another domain also governs, the overlap is
// reported explicitly for cross-validation — never resolved silently.

import type { DomainPack } from "./pack.js";

export interface SharedConcept {
  universalConcept: string;
  domains: Array<{ packId: string; localTerms: string[] }>;
}

export interface CrossDomainRuleOverlap {
  action: string;
  rules: Array<{ packId: string; ruleId: string; blocking: boolean; status: string }>;
  requiresCrossValidation: boolean;
}

export interface CrossDomainAnalysis {
  sharedConcepts: SharedConcept[];
  ruleOverlaps: CrossDomainRuleOverlap[];
  sharedActors: Array<{ name: string; domains: string[] }>;
}

export function analyzeCrossDomain(packs: DomainPack[]): CrossDomainAnalysis {
  const byConcept = new Map<string, SharedConcept["domains"]>();
  for (const pack of packs) {
    for (const mapping of pack.mappings) {
      const list = byConcept.get(mapping.universalConcept) ?? [];
      list.push({ packId: pack.id, localTerms: mapping.localTerms });
      byConcept.set(mapping.universalConcept, list);
    }
  }
  const sharedConcepts = [...byConcept.entries()]
    .filter(([, domains]) => domains.length > 1)
    .map(([universalConcept, domains]) => ({ universalConcept, domains }));

  const byAction = new Map<string, CrossDomainRuleOverlap["rules"]>();
  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.status === "obsolete") continue;
      const list = byAction.get(rule.when.action) ?? [];
      list.push({ packId: pack.id, ruleId: rule.id, blocking: rule.otherwise.block, status: rule.status });
      byAction.set(rule.when.action, list);
    }
  }
  const ruleOverlaps = [...byAction.entries()]
    .filter(([, rules]) => new Set(rules.map((rule) => rule.packId)).size > 1)
    .map(([action, rules]) => ({
      action,
      rules,
      // any blocking rule shared across domains demands human cross-validation
      requiresCrossValidation: rules.some((rule) => rule.blocking)
    }));

  const byActor = new Map<string, Set<string>>();
  for (const pack of packs) {
    for (const actor of pack.actors) {
      const key = actor.name.toLowerCase();
      const set = byActor.get(key) ?? new Set<string>();
      set.add(pack.id);
      byActor.set(key, set);
    }
  }
  const sharedActors = [...byActor.entries()]
    .filter(([, domains]) => domains.size > 1)
    .map(([name, domains]) => ({ name, domains: [...domains].sort() }));

  return { sharedConcepts, ruleOverlaps, sharedActors };
}
