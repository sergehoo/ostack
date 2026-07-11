// OStack Performance Intelligence (§20) — baseline before, measure after,
// detect regression, block. Percentiles are computed from real samples; a
// probe absent from the baseline is reported as unknown, never assumed fine.

export interface ProbeSamples {
  name: string;
  latenciesMs: number[];
}

export interface BaselineProbe {
  name: string;
  p50Ms: number;
  p95Ms: number;
  samples: number;
}

export interface PerformanceBaseline {
  schemaVersion: 1;
  probes: BaselineProbe[];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("Cannot compute a percentile of zero samples");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank]!;
}

export function computeBaseline(samples: ProbeSamples[]): PerformanceBaseline {
  return {
    schemaVersion: 1,
    probes: samples.map((sample) => ({
      name: sample.name,
      p50Ms: percentile(sample.latenciesMs, 50),
      p95Ms: percentile(sample.latenciesMs, 95),
      samples: sample.latenciesMs.length
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

export interface PerformanceRegression {
  name: string;
  beforeP95Ms: number;
  afterP95Ms: number;
  changeRatio: number;
  blocking: boolean;
}

export interface PerformanceComparison {
  regressions: PerformanceRegression[];
  improvements: Array<{ name: string; beforeP95Ms: number; afterP95Ms: number }>;
  withinTolerance: string[];
  newProbes: string[];
  missingProbes: string[];
  blocking: boolean;
}

export interface ComparisonOptions {
  // regression = after > before * (1 + maxRegressionRatio), ignoring changes
  // under minAbsoluteMs which are measurement noise, not engineering signal.
  maxRegressionRatio?: number;
  minAbsoluteMs?: number;
}

export function comparePerformance(
  baseline: PerformanceBaseline,
  current: PerformanceBaseline,
  options: ComparisonOptions = {}
): PerformanceComparison {
  const maxRatio = options.maxRegressionRatio ?? 0.2;
  const minAbsolute = options.minAbsoluteMs ?? 20;
  const before = new Map(baseline.probes.map((probe) => [probe.name, probe]));
  const after = new Map(current.probes.map((probe) => [probe.name, probe]));

  const regressions: PerformanceRegression[] = [];
  const improvements: PerformanceComparison["improvements"] = [];
  const withinTolerance: string[] = [];
  for (const probe of current.probes) {
    const reference = before.get(probe.name);
    if (!reference) continue;
    const delta = probe.p95Ms - reference.p95Ms;
    if (delta > minAbsolute && probe.p95Ms > reference.p95Ms * (1 + maxRatio)) {
      regressions.push({
        name: probe.name,
        beforeP95Ms: reference.p95Ms,
        afterP95Ms: probe.p95Ms,
        changeRatio: Math.round(((probe.p95Ms - reference.p95Ms) / reference.p95Ms) * 1000) / 1000,
        blocking: true
      });
    } else if (delta < -minAbsolute) {
      improvements.push({ name: probe.name, beforeP95Ms: reference.p95Ms, afterP95Ms: probe.p95Ms });
    } else {
      withinTolerance.push(probe.name);
    }
  }
  const newProbes = current.probes.filter((probe) => !before.has(probe.name)).map((probe) => probe.name);
  const missingProbes = baseline.probes.filter((probe) => !after.has(probe.name)).map((probe) => probe.name);
  return {
    regressions, improvements, withinTolerance, newProbes, missingProbes,
    blocking: regressions.some((regression) => regression.blocking)
  };
}
