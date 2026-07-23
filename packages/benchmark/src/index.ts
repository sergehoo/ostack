// OStack Engineering Benchmark (§33) — every task runs SEVERAL times: the
// score measures stability across repetitions, never the single best run.
// The harness is execution-agnostic: it receives a task executor and judges
// results only through declared, mechanical checks.

export type BenchmarkCategory =
  | "greenfield_feature"
  | "brownfield_feature"
  | "complex_bug"
  | "security_regression"
  | "permission_bypass_prevention"
  | "data_migration"
  | "performance_regression"
  | "ux_functional_regression"
  | "incident_diagnosis"
  | "release_readiness";

export interface BenchmarkCheck {
  path: string;
  equals?: string | number | boolean;
  minimum?: number;
  exists?: boolean;
}

export interface BenchmarkTask {
  id: string;
  category: BenchmarkCategory;
  description: string;
  command: string;
  args: string[];
  checks: BenchmarkCheck[];
}

export interface BenchmarkSuite {
  schemaVersion: 1;
  id: string;
  repetitions: number;
  tasks: BenchmarkTask[];
}

export type TaskExecutor = (task: BenchmarkTask, repetition: number) => Promise<unknown>;

export interface CheckResult extends BenchmarkCheck {
  passed: boolean;
  observed: unknown;
}

export interface RepetitionResult {
  repetition: number;
  succeeded: boolean;
  durationMs: number;
  checks: CheckResult[];
  error?: string;
}

export interface TaskReport {
  taskId: string;
  category: BenchmarkCategory;
  repetitions: RepetitionResult[];
  successRate: number;
  stable: boolean;
  medianDurationMs: number;
  p95DurationMs: number;
}

export interface BenchmarkReport {
  suiteId: string;
  tasks: TaskReport[];
  overall: {
    tasks: number;
    fullySuccessful: number;
    stableTasks: number;
    successRate: number;
    stabilityRate: number;
  };
}

export async function runBenchmark(suite: BenchmarkSuite, executor: TaskExecutor, clock: () => number): Promise<BenchmarkReport> {
  if (suite.schemaVersion !== 1) throw new Error("Unsupported benchmark suite schema version");
  if (suite.repetitions < 2) throw new Error("A benchmark requires at least 2 repetitions: a single run cannot measure stability (§33)");
  const tasks: TaskReport[] = [];
  for (const task of suite.tasks) {
    const repetitions: RepetitionResult[] = [];
    for (let repetition = 1; repetition <= suite.repetitions; repetition++) {
      const started = clock();
      try {
        const output = await executor(task, repetition);
        const checks = task.checks.map((check) => evaluateCheck(check, output));
        repetitions.push({
          repetition,
          succeeded: checks.every((check) => check.passed),
          durationMs: Math.round(clock() - started),
          checks
        });
      } catch (error) {
        repetitions.push({
          repetition, succeeded: false, durationMs: Math.round(clock() - started),
          checks: [], error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const successes = repetitions.filter((entry) => entry.succeeded).length;
    tasks.push({
      taskId: task.id,
      category: task.category,
      repetitions,
      successRate: successes / repetitions.length,
      // Stable = every repetition agrees (all succeeded or all failed the same way).
      stable: successes === 0 || successes === repetitions.length,
      medianDurationMs: median(repetitions.map((entry) => entry.durationMs)),
      p95DurationMs: percentile(repetitions.map((entry) => entry.durationMs), 0.95)
    });
  }
  const fullySuccessful = tasks.filter((task) => task.successRate === 1).length;
  return {
    suiteId: suite.id,
    tasks,
    overall: {
      tasks: tasks.length,
      fullySuccessful,
      stableTasks: tasks.filter((task) => task.stable).length,
      successRate: tasks.length === 0 ? 0 : round2(tasks.reduce((sum, task) => sum + task.successRate, 0) / tasks.length),
      stabilityRate: tasks.length === 0 ? 0 : round2(tasks.filter((task) => task.stable).length / tasks.length)
    }
  };
}

export function evaluateCheck(check: BenchmarkCheck, output: unknown): CheckResult {
  const observed = resolvePath(output, check.path);
  let passed = true;
  if (check.exists !== undefined) passed = passed && (observed !== undefined) === check.exists;
  if (check.equals !== undefined) passed = passed && observed === check.equals;
  if (check.minimum !== undefined) passed = passed && typeof observed === "number" && observed >= check.minimum;
  return { ...check, passed, observed: summarize(observed) };
}

function resolvePath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return segment === "length" ? current.length : undefined;
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

function summarize(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 200);
  if (value !== null && typeof value === "object") return JSON.stringify(value).slice(0, 200);
  return value;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index]!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
