// OStack Intelligent Failure Analysis (§23) — no random fixes. A diagnosis is
// a structured artifact that distinguishes symptom, direct cause, root cause,
// contributing factors, correction and prevention. Hypotheses stay hypotheses
// until an experiment result exists; a report cannot claim "diagnosed" without
// an executed experiment and a non-regression check.

export interface TimelineEvent {
  at: string;
  actor: string;
  action: string;
  outcome: string;
  details?: Record<string, unknown>;
}

export interface Hypothesis {
  id: string;
  cause: string;
  likelihood: "high" | "medium" | "low";
  minimalExperiment: string;
  experimentResult?: { executedAt: string; observation: string; conclusive: boolean; supportsHypothesis: boolean };
}

export interface DiagnosisReport {
  schemaVersion: 1;
  incidentId: string;
  symptom: string;
  observedAt: string;
  components: string[];
  timeline: TimelineEvent[];
  hypotheses: Hypothesis[];
  directCause?: string;
  rootCause?: string;
  contributingFactors: string[];
  correction?: string;
  prevention?: string;
  nonRegressionCheck?: string;
  status: "draft" | "diagnosed";
}

// Timeline from audit-log lines (JSONL): only events inside the window, sorted.
export interface AuditLine {
  timestamp?: string;
  at?: string;
  actorId?: string;
  action?: string;
  outcome?: string;
  details?: Record<string, unknown>;
}

export function buildTimeline(lines: AuditLine[], options: { since?: string; until?: string; limit?: number } = {}): TimelineEvent[] {
  const since = options.since ? Date.parse(options.since) : Number.NEGATIVE_INFINITY;
  const until = options.until ? Date.parse(options.until) : Number.POSITIVE_INFINITY;
  const events = lines
    .map((line) => ({ line, at: Date.parse(line.timestamp ?? line.at ?? "") }))
    .filter(({ at }) => Number.isFinite(at) && at >= since && at <= until)
    .sort((a, b) => a.at - b.at)
    .map(({ line, at }) => ({
      at: new Date(at).toISOString(),
      actor: line.actorId ?? "unknown",
      action: line.action ?? "unknown",
      outcome: line.outcome ?? "unknown",
      ...(line.details ? { details: line.details } : {})
    }));
  return options.limit !== undefined ? events.slice(-options.limit) : events;
}

export function recordExperiment(
  report: DiagnosisReport,
  hypothesisId: string,
  result: { executedAt: string; observation: string; conclusive: boolean; supportsHypothesis: boolean }
): DiagnosisReport {
  const index = report.hypotheses.findIndex((hypothesis) => hypothesis.id === hypothesisId);
  if (index === -1) throw new Error(`Unknown hypothesis: ${hypothesisId}`);
  const hypotheses = [...report.hypotheses];
  hypotheses[index] = { ...hypotheses[index]!, experimentResult: result };
  return { ...report, hypotheses };
}

// The gate: "diagnosed" is earned, not declared (§23, §36.7).
export function assertDiagnosed(report: DiagnosisReport): string[] {
  const missing: string[] = [];
  if (!report.rootCause?.trim()) missing.push("rootCause absent");
  if (!report.directCause?.trim()) missing.push("directCause absent");
  if (!report.correction?.trim()) missing.push("correction absente");
  if (!report.prevention?.trim()) missing.push("prevention absente");
  if (!report.nonRegressionCheck?.trim()) missing.push("nonRegressionCheck absent (aucune correction sans test de non-régression)");
  const supported = report.hypotheses.some((hypothesis) => hypothesis.experimentResult?.conclusive && hypothesis.experimentResult.supportsHypothesis);
  if (!supported) missing.push("aucune hypothèse confirmée par une expérience exécutée et concluante");
  return missing;
}

export function markDiagnosed(report: DiagnosisReport): DiagnosisReport {
  const missing = assertDiagnosed(report);
  if (missing.length > 0) throw new Error(`Le diagnostic n'est pas démontré: ${missing.join("; ")}`);
  return { ...report, status: "diagnosed" };
}
