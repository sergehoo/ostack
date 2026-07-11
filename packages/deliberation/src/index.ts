// OStack Multi-Agent Deliberation With Evidence (§7).
// Builder → critic → adversarial → verifier → arbiter. Agents never simply
// approve each other: challenges are recorded, evidence is attached to claims,
// and the arbiter is a PURE function of the record — it selects the proposal
// with the best evidence, never the most persuasive prose. Disagreements are
// preserved verbatim in the record.

import type { ModelProvider } from "@ostack/core";

export type ChallengerRole = "critic" | "adversarial";

export interface Claim {
  id: string;
  statement: string;
}

export interface Proposal {
  id: string;
  author: string;
  content: string;
  claims: Claim[];
}

export interface Challenge {
  proposalId: string;
  challenger: ChallengerRole;
  message: string;
  blocking: boolean;
  resolvedByEvidenceId?: string;
}

export interface DeliberationEvidence {
  id: string;
  claimId: string;
  kind: string;
  status: "passed" | "failed" | "observed";
  summary: string;
}

export interface DeliberationRecord {
  taskId: string;
  objective: string;
  proposals: Proposal[];
  challenges: Challenge[];
  evidence: DeliberationEvidence[];
}

export interface ProposalScore {
  proposalId: string;
  supportedClaims: number;
  failedClaims: number;
  unsupportedClaims: number;
  unresolvedBlockingChallenges: number;
  score: number;
}

export interface Verdict {
  decision: "selected" | "insufficient_evidence" | "all_rejected";
  selectedProposalId?: string;
  scores: ProposalScore[];
  preservedDisagreements: Challenge[];
  rationale: string;
}

// The arbiter: deterministic, evidence-only (§7, §36.5).
export function arbitrate(record: DeliberationRecord): Verdict {
  const scores: ProposalScore[] = record.proposals.map((proposal) => {
    const evidenceByClaim = new Map<string, DeliberationEvidence[]>();
    for (const item of record.evidence) {
      if (!proposal.claims.some((claim) => claim.id === item.claimId)) continue;
      const list = evidenceByClaim.get(item.claimId) ?? [];
      list.push(item);
      evidenceByClaim.set(item.claimId, list);
    }
    let supportedClaims = 0;
    let failedClaims = 0;
    let unsupportedClaims = 0;
    for (const claim of proposal.claims) {
      const items = evidenceByClaim.get(claim.id) ?? [];
      if (items.some((item) => item.status === "failed")) failedClaims++;
      else if (items.length > 0) supportedClaims++;
      else unsupportedClaims++;
    }
    const unresolvedBlockingChallenges = record.challenges.filter(
      (challenge) => challenge.proposalId === proposal.id && challenge.blocking && !isResolved(challenge, record)
    ).length;
    return {
      proposalId: proposal.id,
      supportedClaims,
      failedClaims,
      unsupportedClaims,
      unresolvedBlockingChallenges,
      score: supportedClaims * 2 - failedClaims * 3 - unsupportedClaims - unresolvedBlockingChallenges * 4
    };
  });

  const preservedDisagreements = record.challenges.filter((challenge) => !isResolved(challenge, record));
  const viable = scores.filter(
    (score) => score.supportedClaims > 0 && score.failedClaims === 0 && score.unresolvedBlockingChallenges === 0
  );

  if (record.evidence.length === 0) {
    return {
      decision: "insufficient_evidence",
      scores,
      preservedDisagreements,
      rationale: "Aucune preuve exécutée n'a été rattachée aux affirmations ; escalade humaine requise (§36.1)."
    };
  }
  if (viable.length === 0) {
    return {
      decision: "all_rejected",
      scores,
      preservedDisagreements,
      rationale: "Aucune proposition ne combine preuves positives, absence d'échec et défis bloquants résolus."
    };
  }
  const winner = [...viable].sort((a, b) => b.score - a.score || a.proposalId.localeCompare(b.proposalId))[0]!;
  return {
    decision: "selected",
    selectedProposalId: winner.proposalId,
    scores,
    preservedDisagreements,
    rationale: `Proposition '${winner.proposalId}' retenue: ${winner.supportedClaims} affirmation(s) prouvée(s), 0 échec, 0 défi bloquant non résolu.`
  };
}

function isResolved(challenge: Challenge, record: DeliberationRecord): boolean {
  if (!challenge.resolvedByEvidenceId) return false;
  const evidence = record.evidence.find((item) => item.id === challenge.resolvedByEvidenceId);
  return evidence !== undefined && evidence.status !== "failed";
}

// Model-assisted challenge generation. The model output is untrusted data:
// parsed, shape-checked, capped — never treated as instructions (§17).
const CHALLENGE_PROMPTS: Record<ChallengerRole, string> = {
  critic: `Tu es l'agent critique d'OStack. Analyse la proposition et cherche: incohérences, oublis, complexité inutile, mauvaises hypothèses, dette technique.`,
  adversarial: `Tu es l'agent adversarial d'OStack. Cherche comment la proposition peut: échouer, être contournée, produire un mauvais résultat, violer une permission, perdre des données, dégrader les performances.`
};

const CHALLENGE_FORMAT = `Réponds UNIQUEMENT avec un objet JSON: {"challenges": [{"message": "défi concret et vérifiable", "blocking": true|false}]}. 0 à 5 défis. Un défi est bloquant seulement s'il empêche la mise en production. Aucune prose hors du JSON.`;

export async function challengeProposal(
  proposal: Proposal,
  objective: string,
  role: ChallengerRole,
  provider: ModelProvider
): Promise<Challenge[]> {
  const response = await provider.complete({
    system: `${CHALLENGE_PROMPTS[role]}\n${CHALLENGE_FORMAT}`,
    messages: [{ role: "user", content: `Objectif: ${objective}\n\nProposition (${proposal.id}):\n${proposal.content}` }],
    temperature: 0
  });
  return parseChallenges(response.content, proposal.id, role);
}

export function parseChallenges(content: string, proposalId: string, challenger: ChallengerRole): Challenge[] {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`${challenger} output does not contain a JSON object`);
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed.slice(start, end + 1)); }
  catch { throw new Error(`${challenger} output is not valid JSON`); }
  const list = (parsed as { challenges?: unknown }).challenges;
  if (!Array.isArray(list)) throw new Error(`${challenger} output has no 'challenges' array`);
  return list.slice(0, 5).map((item) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    if (typeof entry.message !== "string" || entry.message.trim().length === 0) throw new Error(`${challenger} produced a challenge without a message`);
    return { proposalId, challenger, message: entry.message.trim().slice(0, 1000), blocking: entry.blocking === true };
  });
}
