import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { runBenchmark, type BenchmarkSuite, type BenchmarkTask } from "@ostack/benchmark";
import { SchemaValidator } from "@ostack/validation";
import { configDirectory, initializeConfig, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack benchmark` (§33) — run the platform benchmark suite. Every task is
// executed `repetitions` times in per-repetition throwaway projects, so the
// report measures reproducibility, never a lucky single run. Only the mock
// provider and deterministic engines are exercised: no external calls.
export async function runBenchmarkCommand(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const suitePath = context.args.find((argument) => !argument.startsWith("--")) ?? join(frameworkRoot, "benchmarks/core-suite.json");
  const suite = JSON.parse(await readFile(suitePath, "utf8")) as BenchmarkSuite;
  const schema = JSON.parse(await readFile(join(frameworkRoot, "schemas/benchmark-suite.schema.json"), "utf8"));
  const validation = new SchemaValidator().validate(schema, suite);
  if (!validation.valid) throw new Error(`Invalid benchmark suite: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);

  const { commands } = await import("./commands.js");
  const roots = new Map<number, string>();
  const executor = async (task: BenchmarkTask, repetition: number): Promise<unknown> => {
    let root = roots.get(repetition);
    if (!root) {
      root = await mkdtemp(join(tmpdir(), `ostack-bench-${repetition}-`));
      await initializeConfig(root, `Benchmark ${repetition}`);
      await mkdir(join(root, "examples"), { recursive: true });
      for (const example of ["intent-draft.json", "evidence-input.json", "security-authorization.json"]) {
        await copyFile(join(frameworkRoot, "examples", example), join(root, "examples", example));
      }
      roots.set(repetition, root);
    }
    const command = commands[task.command];
    if (!command) throw new Error(`Unknown benchmark command: ${task.command}`);
    return command.handler({ cwd: root, args: task.args, json: true });
  };

  try {
    const report = await runBenchmark(suite, executor, () => performance.now());
    const directory = join(configDirectory(context.cwd), "benchmarks");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, `${suite.id}-${Date.now()}.json`);
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action: "benchmark.run", projectId: config.project.id,
      outcome: report.overall.successRate === 1 ? "succeeded" : "denied",
      details: { suite: suite.id, repetitions: suite.repetitions, ...report.overall }
    }));
    return {
      suite: suite.id,
      repetitions: suite.repetitions,
      overall: report.overall,
      tasks: report.tasks.map((task) => ({
        taskId: task.taskId, category: task.category,
        successRate: task.successRate, stable: task.stable,
        medianDurationMs: task.medianDurationMs, p95DurationMs: task.p95DurationMs,
        ...(task.successRate < 1 ? {
          failures: task.repetitions.filter((entry) => !entry.succeeded).map((entry) => ({
            repetition: entry.repetition,
            error: entry.error ?? entry.checks.filter((check) => !check.passed).map((check) => `${check.path}: observé ${JSON.stringify(check.observed)}`).join("; ")
          }))
        } : {})
      })),
      savedTo: relative(context.cwd, path)
    };
  } finally {
    await Promise.all([...roots.values()].map((root) => rm(root, { recursive: true, force: true })));
  }
}
