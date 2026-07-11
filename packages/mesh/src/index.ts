// OStack Adaptive Model Mesh (§8) — dynamic model routing. No agent owns a
// fixed provider: candidates are ranked per task type by strategy, and the
// primary metric is COST PER VERIFIED RESULT, never cost per token. All
// selection logic is deterministic given the recorded history.

export interface ModelCandidate {
  id: string;
  provider: string;
  model: string;
  local: boolean;
  pricing?: { inputPerMTokenUsd: number; outputPerMTokenUsd: number };
}

// Real cost from real token usage; without pricing the cost is UNKNOWN — the
// caller must not substitute zero, which would fake the central metric.
export function estimateCostUsd(candidate: ModelCandidate, usage: { inputTokens: number; outputTokens: number }): number | undefined {
  if (!candidate.pricing) return undefined;
  return (usage.inputTokens * candidate.pricing.inputPerMTokenUsd + usage.outputTokens * candidate.pricing.outputPerMTokenUsd) / 1_000_000;
}

export type RoutingStrategy =
  | "quality_first"
  | "cost_per_verified_result"
  | "privacy_first"
  | "independent_consensus";

export interface TaskRoute {
  taskType: string;
  strategy: RoutingStrategy;
  candidates: string[];
  requiredIndependentModels?: number;
}

export interface Outcome {
  verified: boolean;
  costUsd?: number;
  latencyMs: number;
  humanCorrections?: number;
}

export interface CandidateStats {
  attempts: number;
  verified: number;
  totalCostUsd: number;
  costKnownCount?: number;
  totalLatencyMs: number;
  humanCorrections: number;
}

export interface CandidateMetrics extends CandidateStats {
  candidateId: string;
  firstPassVerifiedRate: number;
  costPerVerifiedResultUsd: number | null;
  averageLatencyMs: number | null;
}

export interface Selection {
  taskType: string;
  strategy: RoutingStrategy;
  ranked: string[];
  consensusSet?: string[];
}

export interface SerializedMesh {
  schemaVersion: 1;
  stats: Record<string, Record<string, CandidateStats>>;
}

export class ModelMesh {
  private readonly candidates = new Map<string, ModelCandidate>();
  private readonly routes = new Map<string, TaskRoute>();
  private readonly stats = new Map<string, Map<string, CandidateStats>>();

  constructor(candidates: ModelCandidate[], routes: TaskRoute[]) {
    for (const candidate of candidates) {
      if (this.candidates.has(candidate.id)) throw new Error(`Duplicate candidate: ${candidate.id}`);
      this.candidates.set(candidate.id, candidate);
    }
    for (const route of routes) {
      for (const id of route.candidates) if (!this.candidates.has(id)) throw new Error(`Route '${route.taskType}' references unknown candidate '${id}'`);
      if (route.candidates.length === 0) throw new Error(`Route '${route.taskType}' has no candidates`);
      this.routes.set(route.taskType, route);
    }
  }

  record(taskType: string, candidateId: string, outcome: Outcome): void {
    if (!this.candidates.has(candidateId)) throw new Error(`Unknown candidate: ${candidateId}`);
    const byCandidate = this.stats.get(taskType) ?? new Map<string, CandidateStats>();
    const current = byCandidate.get(candidateId) ?? { attempts: 0, verified: 0, totalCostUsd: 0, costKnownCount: 0, totalLatencyMs: 0, humanCorrections: 0 };
    byCandidate.set(candidateId, {
      attempts: current.attempts + 1,
      verified: current.verified + (outcome.verified ? 1 : 0),
      totalCostUsd: current.totalCostUsd + (outcome.costUsd ?? 0),
      // legacy stats (pre cost-meter) recorded a cost with every outcome
      costKnownCount: (current.costKnownCount ?? current.attempts) + (outcome.costUsd !== undefined ? 1 : 0),
      totalLatencyMs: current.totalLatencyMs + outcome.latencyMs,
      humanCorrections: current.humanCorrections + (outcome.humanCorrections ?? 0)
    });
    this.stats.set(taskType, byCandidate);
  }

  metrics(taskType: string, candidateId: string): CandidateMetrics {
    const stats = this.stats.get(taskType)?.get(candidateId) ?? { attempts: 0, verified: 0, totalCostUsd: 0, costKnownCount: 0, totalLatencyMs: 0, humanCorrections: 0 };
    const costKnown = stats.costKnownCount ?? stats.attempts;
    return {
      candidateId,
      ...stats,
      firstPassVerifiedRate: stats.attempts === 0 ? 0 : stats.verified / stats.attempts,
      // claimable only when every recorded outcome carried a real cost;
      // partial knowledge would understate the metric.
      costPerVerifiedResultUsd: stats.verified === 0 || costKnown < stats.attempts ? null : stats.totalCostUsd / stats.verified,
      averageLatencyMs: stats.attempts === 0 ? null : stats.totalLatencyMs / stats.attempts
    };
  }

  select(taskType: string): Selection {
    const route = this.routes.get(taskType);
    if (!route) throw new Error(`No route configured for task type '${taskType}'`);
    const metrics = route.candidates.map((id, index) => ({ index, candidate: this.candidates.get(id)!, metrics: this.metrics(taskType, id) }));

    switch (route.strategy) {
      case "privacy_first": {
        // Only local candidates may see the content; a remote model is never a fallback (§36.4).
        const local = metrics.filter((entry) => entry.candidate.local);
        if (local.length === 0) throw new Error(`Task type '${taskType}' is privacy_first but no local candidate is configured`);
        return { taskType, strategy: route.strategy, ranked: local.map((entry) => entry.candidate.id) };
      }
      case "quality_first": {
        const ranked = [...metrics].sort((a, b) =>
          b.metrics.firstPassVerifiedRate - a.metrics.firstPassVerifiedRate ||
          compareCost(a.metrics, b.metrics) ||
          a.index - b.index
        );
        return { taskType, strategy: route.strategy, ranked: ranked.map((entry) => entry.candidate.id) };
      }
      case "cost_per_verified_result": {
        const ranked = [...metrics].sort((a, b) =>
          compareCost(a.metrics, b.metrics) ||
          b.metrics.firstPassVerifiedRate - a.metrics.firstPassVerifiedRate ||
          a.index - b.index
        );
        return { taskType, strategy: route.strategy, ranked: ranked.map((entry) => entry.candidate.id) };
      }
      case "independent_consensus": {
        const required = route.requiredIndependentModels ?? 2;
        const seenProviders = new Set<string>();
        const consensus: string[] = [];
        for (const entry of metrics) {
          if (seenProviders.has(entry.candidate.provider)) continue;
          seenProviders.add(entry.candidate.provider);
          consensus.push(entry.candidate.id);
          if (consensus.length === required) break;
        }
        if (consensus.length < required) throw new Error(`Task type '${taskType}' requires ${required} independent providers but only ${consensus.length} are configured`);
        return { taskType, strategy: route.strategy, ranked: metrics.map((entry) => entry.candidate.id), consensusSet: consensus };
      }
    }
  }

  toJSON(): SerializedMesh {
    const stats: SerializedMesh["stats"] = {};
    for (const [taskType, byCandidate] of [...this.stats.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      stats[taskType] = Object.fromEntries([...byCandidate.entries()].sort(([a], [b]) => a.localeCompare(b)));
    }
    return { schemaVersion: 1, stats };
  }

  loadStats(data: SerializedMesh): void {
    if (data.schemaVersion !== 1) throw new Error("Unsupported mesh schema version");
    for (const [taskType, byCandidate] of Object.entries(data.stats)) {
      const map = new Map<string, CandidateStats>();
      for (const [candidateId, stats] of Object.entries(byCandidate)) {
        if (this.candidates.has(candidateId)) map.set(candidateId, stats);
      }
      this.stats.set(taskType, map);
    }
  }
}

// null cost means "never produced a verified result" — always worst.
function compareCost(a: { costPerVerifiedResultUsd: number | null }, b: { costPerVerifiedResultUsd: number | null }): number {
  const costA = a.costPerVerifiedResultUsd ?? Number.POSITIVE_INFINITY;
  const costB = b.costPerVerifiedResultUsd ?? Number.POSITIVE_INFINITY;
  return costA - costB;
}
