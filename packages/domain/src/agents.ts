// Sector Intelligence Agents (§12) — instead of hardcoding one agent per
// sector, OStack instantiates a domain EXPERT from a generic role + a Domain
// Pack. A handful of generic roles × N packs = unlimited experts, with access
// and restrictions DERIVED from what the pack actually contains and from its
// maturity — never claiming authority the pack has not earned.

import { assessMaturity, type DomainPack } from "./pack.js";

export interface GenericRole {
  id: string;
  title: string;
  focus: string;
}

// The universal roles (§12). Each adapts to the loaded pack.
export const GENERIC_ROLES: GenericRole[] = [
  { id: "universal-business-analyst", title: "Analyste métier universel", focus: "besoins, acteurs, règles" },
  { id: "process-analyst", title: "Analyste de processus", focus: "workflows, étapes, goulots" },
  { id: "domain-architect", title: "Architecte de domaine", focus: "modèles de données, intégrations" },
  { id: "compliance-analyst", title: "Analyste conformité", focus: "obligations réglementaires, contrôles" },
  { id: "operations-analyst", title: "Analyste des opérations", focus: "exécution, délais, exceptions" },
  { id: "data-steward", title: "Intendant des données", focus: "qualité, sensibilité, rétention" },
  { id: "risk-analyst", title: "Analyste des risques", focus: "risques, limites, exposition" },
  { id: "quality-analyst", title: "Analyste qualité", focus: "critères, tests fonctionnels" },
  { id: "documentation-analyst", title: "Analyste documentaire", focus: "documents, formulaires, versions" },
  { id: "domain-test-engineer", title: "Ingénieur de tests métier", focus: "scénarios, matrice de permissions" }
];

export interface InstantiatedAgent {
  name: string;
  baseRole: string;
  domainPack: string;
  title: string;
  access: string[];
  restrictions: string[];
  maturityLevel: number;
}

function accessFromPack(pack: DomainPack): string[] {
  const access: string[] = [];
  if (pack.glossary.length > 0) access.push("glossary");
  if (pack.actors.length > 0) access.push("actors");
  if (pack.workflows.length > 0) access.push("workflows");
  if (pack.rules.length > 0) access.push("rules");
  if (pack.rules.some((rule) => rule.kind === "regulatory_obligation")) access.push("regulations");
  if (pack.decisionTables.length > 0) access.push("decision-tables");
  if (pack.kpis.length > 0) access.push("indicators");
  return access;
}

// Restrictions are derived, not decorative. They tighten as the pack is less
// mature or carries regulatory/unconfirmed content (§8, §26, §33).
function restrictionsFromPack(pack: DomainPack, maturityLevel: number): string[] {
  const restrictions = ["human_approval_required_for_critical_actions", "no_action_on_unconfirmed_rule"];
  if (maturityLevel < 3) restrictions.push("advisory_only_until_domain_validated");
  const hasRegulatory = pack.rules.some((rule) => rule.kind === "regulatory_obligation")
    || pack.openQuestions.some((q) => /réglement|regulation|loi|obligation|conformit/i.test(q));
  if (hasRegulatory) restrictions.push("regulatory_decisions_require_sourced_expert_validation");
  if (pack.rules.some((rule) => rule.status !== "confirmed")) restrictions.push("unconfirmed_rules_escalate_to_human");
  return restrictions;
}

export function instantiateAgent(role: GenericRole, pack: DomainPack): InstantiatedAgent {
  const maturity = assessMaturity(pack);
  return {
    name: `${role.id}-${pack.id}`,
    baseRole: role.id,
    domainPack: pack.id,
    title: `${role.title} — ${pack.name}`,
    access: accessFromPack(pack),
    restrictions: restrictionsFromPack(pack, maturity.level),
    maturityLevel: maturity.level
  };
}

export function instantiateTeam(pack: DomainPack, roles: GenericRole[] = GENERIC_ROLES): InstantiatedAgent[] {
  return roles.map((role) => instantiateAgent(role, pack));
}

// Renders an instantiated expert as an installable agent definition (markdown
// with front-matter), consumable by Claude Code / Cursor / Codex as a subagent.
export function renderAgentMarkdown(agent: InstantiatedAgent): string {
  const front = [
    "---",
    `name: ostack-${agent.name}`,
    `description: Expert ${agent.title} — instancié depuis le Domain Pack '${agent.domainPack}' (maturité ${agent.maturityLevel}/4).`,
    "---", ""
  ].join("\n");
  return front
    + `# ${agent.title}\n\n`
    + `Expert métier instancié depuis le Domain Pack \`${agent.domainPack}\` (rôle générique \`${agent.baseRole}\`).\n\n`
    + `## Accès (sections du pack)\n\n${agent.access.map((a) => `- ${a}`).join("\n") || "- (aucune section renseignée)"}\n\n`
    + `## Restrictions (non négociables)\n\n${agent.restrictions.map((r) => `- ${r}`).join("\n")}\n\n`
    + `Applique la méthode OStack. N'affirme aucune règle métier ou réglementaire non confirmée : `
    + `interroge le pack via \`ostack domain check\` et escalade vers un humain en cas de doute. `
    + `Ne fournit jamais de conseil réglementé sans validation experte sourcée.\n`;
}
