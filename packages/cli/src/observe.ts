import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { runProbes, toEvidenceItems } from "@ostack/observe";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack observe` (§22) — probe the running application and record the
// observations as evidence. Targets are loopback-only unless the project
// configuration allowlists a host; agents cannot widen the scope.
export async function runObserve(context: CommandContext): Promise<unknown> {
  const gate = context.args.includes("--gate");
  const config = await loadConfig(context.cwd);
  const probes = config.observe?.probes ?? [];
  if (probes.length === 0) {
    return {
      status: "not_configured",
      message: "Déclarez des sondes dans .ostack/config.json sous observe.probes, par exemple: { \"name\": \"api-health\", \"url\": \"http://127.0.0.1:4310/api/health\", \"maxLatencyMs\": 500 }"
    };
  }

  const results = await runProbes(probes, { ...(config.observe?.allowedHosts ? { allowedHosts: config.observe.allowedHosts } : {}) });
  const evidenceItems = toEvidenceItems(results);
  const failed = results.filter((result) => !result.ok);

  const directory = join(configDirectory(context.cwd), "observations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `observation-${Date.now()}.json`);
  await writeFile(path, `${JSON.stringify({ results, evidenceItems }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "observe.run", projectId: config.project.id,
    outcome: failed.length === 0 ? "succeeded" : "denied",
    details: { probes: results.length, failed: failed.length }
  }));

  if (gate && failed.length > 0) {
    throw new Error(`Observation gate failed: ${failed.map((result) => `${result.name} (${result.failure})`).join("; ")}`);
  }
  return {
    status: failed.length === 0 ? "observed" : "divergence_detected",
    probes: results,
    evidenceItems,
    savedTo: relative(context.cwd, path),
    message: failed.length === 0
      ? "Le comportement observé correspond aux attentes déclarées; joignez evidenceItems à l'entrée de 'ostack prove'."
      : `${failed.length} sonde(s) en échec — le comportement réel ne correspond pas aux attentes.`
  };
}
