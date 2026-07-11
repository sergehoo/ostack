import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { arbitrate, challengeProposal, type Challenge, type DeliberationRecord } from "@ostack/deliberation";
import { configDirectory, loadConfig } from "./config.js";
import { selectProvider } from "./feature.js";
import type { CommandContext } from "./commands.js";

// `ostack challenge` (§7) — submit a proposal to the critic and adversarial
// agents, record their challenges, and let the evidence-based arbiter speak.
// Without executed evidence the verdict is insufficient_evidence by design:
// challenges are the input to verification, never a substitute for it.
export async function runChallenge(context: CommandContext): Promise<unknown> {
  const options = parseOptions(context.args);
  const config = await loadConfig(context.cwd);

  let content: string;
  let source: string;
  if (options.from) {
    const path = containedPath(context.cwd, options.from);
    content = await readFile(path, "utf8");
    source = relative(context.cwd, path);
  } else {
    content = options.positionals.join(" ").trim();
    source = "inline";
  }
  if (!content.trim()) throw new Error("Usage: ostack challenge <proposition> [--provider …] | --from <fichier>");
  if (content.length > 24_000) throw new Error("Proposal exceeds 24000 characters; challenge a focused excerpt");

  const provider = await selectProvider(config.ai.preferredProviders, options.provider, config.ai.models);
  if (provider.id === "mock") throw new Error("The mock provider cannot generate challenges; configure a real provider");

  const objective = options.objective ?? "Évaluer la proposition avant implémentation";
  const proposal = { id: "P1", author: source, content, claims: [] };
  const [criticChallenges, adversarialChallenges] = await Promise.all([
    challengeProposal(proposal, objective, "critic", provider),
    challengeProposal(proposal, objective, "adversarial", provider)
  ]);
  const challenges: Challenge[] = [...criticChallenges, ...adversarialChallenges];

  const record: DeliberationRecord = { taskId: options.task ?? `challenge-${Date.now()}`, objective, proposals: [proposal], challenges, evidence: [] };
  const verdict = arbitrate(record);

  const directory = join(configDirectory(context.cwd), "deliberations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${sanitize(record.taskId)}.json`);
  await writeFile(path, `${JSON.stringify({ record, verdict }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action: "deliberation.challenge", projectId: config.project.id, outcome: "succeeded",
    details: { taskId: record.taskId, provider: provider.id, challenges: challenges.length, blocking: challenges.filter((challenge) => challenge.blocking).length }
  }));

  return {
    taskId: record.taskId,
    provider: provider.id,
    challenges: challenges.map((challenge) => ({ challenger: challenge.challenger, blocking: challenge.blocking, message: challenge.message })),
    verdict: { decision: verdict.decision, rationale: verdict.rationale },
    savedTo: relative(context.cwd, path),
    nextStep: "Résoudre chaque défi bloquant par une preuve exécutée, puis assembler l'Evidence Pack avec 'ostack prove'."
  };
}

function parseOptions(args: string[]): { positionals: string[]; provider?: string; from?: string; objective?: string; task?: string } {
  const result: { positionals: string[]; provider?: string; from?: string; objective?: string; task?: string } = { positionals: [] };
  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) continue;
    if (["--provider", "--from", "--objective", "--task"].includes(current)) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${current}`);
      if (current === "--provider") result.provider = value;
      else if (current === "--from") result.from = value;
      else if (current === "--objective") result.objective = value;
      else result.task = value;
    } else result.positionals.push(current);
  }
  return result;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Proposal file must be inside the project");
  if (/(^|\/)\.env(?:\.|$)/.test(relation) || /\.(pem|key|p12|pfx)$/i.test(relation)) throw new Error("Protected path");
  return absolute;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}
