import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { sanitizeRecord, searchDecisions, type DecisionRecord } from "@ostack/decisions";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack decision` (§24) — institutional memory of engineering decisions.
//   ostack decision record <record.json>   (secrets redacted before storage)
//   ostack decision search "<query>"
// Before proposing a solution, agents/humans search prior decisions first.
export async function runDecision(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const directory = join(configDirectory(context.cwd), "decisions");

  switch (subcommand) {
    case "record": {
      const input = rest.find((argument) => !argument.startsWith("--"));
      if (!input) throw new Error("Usage: ostack decision record <record.json>");
      const raw = JSON.parse(await readFile(containedPath(context.cwd, input), "utf8")) as DecisionRecord;
      const { record, redactions } = sanitizeRecord(raw);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${sanitize(record.id)}.json`);
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
        actorId: record.recordedBy || (process.env.USER ?? "cli-user"), action: "decision.record", projectId: config.project.id, outcome: "succeeded",
        details: { decisionId: record.id, redactions }
      }));
      return { status: "recorded", decisionId: record.id, secretsRedacted: redactions, savedTo: relative(context.cwd, path) };
    }
    case "search": {
      const query = rest.filter((argument) => !argument.startsWith("--")).join(" ");
      if (!query) throw new Error("Usage: ostack decision search \"<query>\"");
      const records = await loadDecisions(directory);
      const matches = searchDecisions(records, query);
      return {
        query, total: records.length,
        matches: matches.map((match) => ({
          id: match.record.id, problem: match.record.problem, chosenSolution: match.record.chosenSolution,
          reuseConditions: match.record.reuseConditions, score: match.score, matchedTerms: match.matchedTerms
        }))
      };
    }
    default:
      throw new Error("Usage: ostack decision <record|search> …");
  }
}

async function loadDecisions(directory: string): Promise<DecisionRecord[]> {
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); } catch { return []; }
  const records: DecisionRecord[] = [];
  for (const name of names.sort()) {
    try { records.push(JSON.parse(await readFile(join(directory, name), "utf8")) as DecisionRecord); } catch { /* skip */ }
  }
  return records;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Path must be inside the project");
  return absolute;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "decision";
}
