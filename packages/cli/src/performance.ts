import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { comparePerformance, computeBaseline, runProbes, type PerformanceBaseline, type ProbeSamples } from "@ostack/observe";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack performance` (§20) — baseline before, measure after, block on
// regression. A probe that fails during measurement invalidates the campaign:
// a baseline built on errors would be a fabricated reference.
//   ostack performance baseline [--samples N]
//   ostack performance compare [--samples N] [--gate]
export async function runPerformance(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const probes = config.observe?.probes ?? [];
  if (probes.length === 0) throw new Error("Déclarez des sondes dans .ostack/config.json (observe.probes) avant toute campagne de performance");
  const samples = readSamples(rest);
  const gate = rest.includes("--gate");
  const baselinePath = join(configDirectory(context.cwd), "performance", "baseline.json");
  const audit = new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl"));

  switch (subcommand) {
    case "baseline": {
      const measured = await measure(probes, samples, config.observe?.allowedHosts);
      const baseline = computeBaseline(measured);
      await mkdir(join(configDirectory(context.cwd), "performance"), { recursive: true, mode: 0o700 });
      await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await audit.append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "performance.baseline", projectId: config.project.id, outcome: "succeeded",
        details: { probes: baseline.probes.length, samples }
      }));
      return { status: "baseline_saved", samples, probes: baseline.probes, savedTo: relative(context.cwd, baselinePath) };
    }
    case "compare": {
      let baseline: PerformanceBaseline;
      try { baseline = JSON.parse(await readFile(baselinePath, "utf8")) as PerformanceBaseline; }
      catch { throw new Error("Aucune baseline enregistrée. Lancez d'abord 'ostack performance baseline'"); }
      const measured = await measure(probes, samples, config.observe?.allowedHosts);
      const current = computeBaseline(measured);
      const comparison = comparePerformance(baseline, current);
      await audit.append(auditEntry({
        actorId: process.env.USER ?? "cli-user", action: "performance.compare", projectId: config.project.id,
        outcome: comparison.blocking ? "denied" : "succeeded",
        details: { regressions: comparison.regressions.length, improvements: comparison.improvements.length }
      }));
      if (gate && comparison.blocking) {
        throw new Error(`Performance gate failed: ${comparison.regressions.map((regression) => `${regression.name} p95 ${regression.beforeP95Ms}ms → ${regression.afterP95Ms}ms (+${Math.round(regression.changeRatio * 100)}%)`).join("; ")}`);
      }
      return { status: comparison.blocking ? "regression_detected" : "within_budget", baseline: baseline.probes, current: current.probes, comparison };
    }
    default:
      throw new Error("Usage: ostack performance <baseline|compare> [--samples N] [--gate]");
  }
}

async function measure(
  probes: NonNullable<Awaited<ReturnType<typeof loadConfig>>["observe"]>["probes"],
  samples: number,
  allowedHosts?: string[]
): Promise<ProbeSamples[]> {
  const latencies = new Map<string, number[]>(probes.map((probe) => [probe.name, []]));
  for (let round = 0; round < samples; round++) {
    const results = await runProbes(probes, allowedHosts ? { allowedHosts } : {});
    const failures = results.filter((result) => !result.ok || result.latencyMs === undefined);
    if (failures.length > 0) {
      throw new Error(`Campagne invalide: sonde(s) en échec au tour ${round + 1}: ${failures.map((failure) => `${failure.name} (${failure.failure ?? "latence absente"})`).join("; ")}`);
    }
    for (const result of results) latencies.get(result.name)!.push(result.latencyMs!);
  }
  return [...latencies.entries()].map(([name, values]) => ({ name, latenciesMs: values }));
}

function readSamples(args: string[]): number {
  const index = args.indexOf("--samples");
  if (index === -1) return 5;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 3 || value > 100) throw new Error("--samples doit être un entier entre 3 et 100");
  return value;
}
