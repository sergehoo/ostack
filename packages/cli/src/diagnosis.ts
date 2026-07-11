import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { assertDiagnosed, buildTimeline, markDiagnosed, type AuditLine, type DiagnosisReport } from "@ostack/diagnosis";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack root-cause` (§23) — structured failure analysis over the local audit
// log. `open` seeds a draft with a timeline; `check` reports what is still
// missing; `close` promotes to "diagnosed" only when the evidence is complete.
export async function runRootCause(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const options = parseFlags(rest);
  const directory = join(configDirectory(context.cwd), "diagnoses");

  switch (subcommand) {
    case "open": {
      const incidentId = options.flags.incident;
      const symptom = options.flags.symptom;
      if (!incidentId || !symptom) throw new Error("Usage: ostack root-cause open --incident <id> --symptom \"<symptôme>\" [--since <iso>] [--until <iso>]");
      const auditPath = join(configDirectory(context.cwd), "audit.jsonl");
      const lines = await readAuditLines(auditPath);
      const timeline = buildTimeline(lines, {
        ...(options.flags.since ? { since: options.flags.since } : {}),
        ...(options.flags.until ? { until: options.flags.until } : {}),
        limit: 200
      });
      const report: DiagnosisReport = {
        schemaVersion: 1, incidentId, symptom,
        observedAt: options.flags.since ?? new Date().toISOString(),
        components: options.flags.components ? options.flags.components.split(",") : [],
        timeline, hypotheses: [], contributingFactors: [], status: "draft"
      };
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${sanitize(incidentId)}.json`);
      await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await audit(context, config.project.id, "root_cause.open", "succeeded", { incidentId, timelineEvents: timeline.length });
      return {
        status: "draft", incidentId, savedTo: relative(context.cwd, path), timelineEvents: timeline.length,
        nextStep: "Renseignez hypotheses/directCause/rootCause/correction/prevention/nonRegressionCheck et exécutez l'expérience minimale, puis 'ostack root-cause close'."
      };
    }
    case "check":
    case "close": {
      const path = containedPath(context.cwd, options.positionals[0] ?? join(directory, `${sanitize(options.flags.incident ?? "")}.json`));
      const report = JSON.parse(await readFile(path, "utf8")) as DiagnosisReport;
      const missing = assertDiagnosed(report);
      if (subcommand === "check") return { incidentId: report.incidentId, status: report.status, diagnosed: missing.length === 0, missing };
      const diagnosed = markDiagnosed(report);
      await writeFile(path, `${JSON.stringify(diagnosed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await audit(context, config.project.id, "root_cause.close", "succeeded", { incidentId: report.incidentId, rootCause: diagnosed.rootCause });
      return { status: "diagnosed", incidentId: diagnosed.incidentId, rootCause: diagnosed.rootCause, correction: diagnosed.correction, prevention: diagnosed.prevention };
    }
    default:
      throw new Error("Usage: ostack root-cause <open|check|close> …");
  }
}

async function readAuditLines(path: string): Promise<AuditLine[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as AuditLine);
  } catch { return []; }
}

async function audit(context: CommandContext, projectId: string, action: string, outcome: "succeeded" | "denied", details: Record<string, unknown>): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action, projectId, outcome, details
  }));
}

function parseFlags(args: string[]): { positionals: string[]; flags: Record<string, string> } {
  const result: { positionals: string[]; flags: Record<string, string> } = { positionals: [], flags: {} };
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (current.startsWith("--")) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      result.flags[current.slice(2)] = value;
    } else result.positionals.push(current);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Path must be inside the project");
  return absolute;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "incident";
}
