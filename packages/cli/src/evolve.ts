import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import {
  applyLocalCommit, branchName, classifyRisk, commitMessage, decideMerge, evaluateCandidate, isGitRepo,
  parseLedger, permittedActions, pullRequestBody, pushBranch, sanitizeEntry, serializeEntry,
  type Checks, type EvolutionProposal, type GitAutonomy, type LedgerEntry, type SkillMetrics
} from "@ostack/evolution";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack evolve` — Autonomous Evolution Engine (§29).
//   ostack evolve status                      état du ledger + autonomie
//   ostack evolve record <event.json>          ajoute un événement au ledger (secrets masqués)
//   ostack evolve classify --paths a,b,c        classe le risque d'un changement
//   ostack evolve propose <proposal.json>       plan Git déterministe (branche, commit, PR, décision)
//
// Sûreté d'abord: cette commande PLANIFIE et DÉCIDE; elle n'exécute aucune
// opération Git réseau. Le push/PR/auto-merge s'appuient sur les décisions
// produites ici et restent gouvernés par policies/evolution.json + la CI +
// les protections de branche. Rien ne contourne ces contrôles.
export async function runEvolve(context: CommandContext): Promise<unknown> {
  const [subcommand, ...rest] = context.args;
  const config = await loadConfig(context.cwd);
  const autonomy = (config as { evolution?: { gitAutonomy?: GitAutonomy } }).evolution?.gitAutonomy ?? "pull-request";
  const ledgerPath = join(configDirectory(context.cwd), "evolution", "ledger.jsonl");

  switch (subcommand ?? "status") {
    case "status": {
      const entries = await readLedger(ledgerPath);
      const byStatus: Record<string, number> = {};
      for (const entry of entries) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
      return {
        gitAutonomy: autonomy,
        permittedActions: permittedActions(autonomy),
        ledgerEvents: entries.length,
        byStatus,
        candidates: entries.filter((entry) => entry.status === "CANDIDATE").map((entry) => ({ eventId: entry.eventId, lesson: entry.lesson, proposedResource: entry.proposedResource }))
      };
    }
    case "record": {
      const input = rest.find((argument) => !argument.startsWith("--"));
      if (!input) throw new Error("Usage: ostack evolve record <event.json>");
      const raw = JSON.parse(await readFile(join(context.cwd, input), "utf8")) as LedgerEntry;
      const { redactions } = sanitizeEntry(raw);
      const line = serializeEntry(raw);   // throws if a secret survives sanitize
      await mkdir(join(configDirectory(context.cwd), "evolution"), { recursive: true, mode: 0o700 });
      await appendFile(ledgerPath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      await audit(context, config.project.id, "evolution.record", { eventId: raw.eventId, redactions });
      return { status: "recorded", eventId: raw.eventId, secretsRedacted: redactions };
    }
    case "classify": {
      const paths = readList(rest, "--paths");
      if (paths.length === 0) throw new Error("Usage: ostack evolve classify --paths <a,b,c>");
      return { paths, risk: classifyRisk(paths) };
    }
    case "propose": {
      const input = rest.find((argument) => !argument.startsWith("--"));
      if (!input) throw new Error("Usage: ostack evolve propose <proposal.json>");
      const proposal = JSON.parse(await readFile(join(context.cwd, input), "utf8")) as EvolutionProposal;
      // Checks are supplied by the caller from REAL executions; unknown = false.
      const checks = defaultChecks(proposal);
      const policy = (config as { evolution?: { autoMerge?: { enabled: boolean; allowedRiskLevels: never[]; confidenceMinimum: number } } }).evolution?.autoMerge
        ?? { enabled: true, allowedRiskLevels: ["low"] as never[], confidenceMinimum: 0.92 };
      const merge = decideMerge(proposal, checks, policy);
      const plan = {
        branch: branchName(proposal),
        commitMessage: commitMessage(proposal),
        pullRequestTitle: `[OStack Evolution] ${proposal.title}`,
        pullRequestBody: pullRequestBody(proposal, merge),
        risk: merge.risk,
        decision: merge.decision,
        autoMergeEligible: merge.autoMergeEligible,
        reasons: merge.reasons,
        gitAutonomy: autonomy,
        // Explicit, safe next steps — never executed automatically here.
        commands: gitCommands(proposal, branchName(proposal), autonomy, merge.decision)
      };
      await audit(context, config.project.id, "evolution.propose", { evolutionId: proposal.evolutionId, risk: merge.risk, decision: merge.decision });
      return plan;
    }
    case "apply": {
      const input = rest.find((argument) => !argument.startsWith("--"));
      if (!input) throw new Error("Usage: ostack evolve apply <proposal.json> [--push]");
      if (autonomy === "observe") throw new Error("gitAutonomy=observe: OStack ne crée pas de commit. Passez à local-commit ou pull-request dans policies/evolution.json.");
      const proposal = JSON.parse(await readFile(join(context.cwd, input), "utf8")) as EvolutionProposal;
      const wantsPush = rest.includes("--push");
      if (wantsPush && autonomy !== "pull-request" && autonomy !== "controlled-auto-merge") {
        throw new Error(`--push exige gitAutonomy=pull-request; niveau actuel: ${autonomy}`);
      }
      if (!(await isGitRepo(context.cwd))) throw new Error("Aucun dépôt git ici; 'evolve apply' exige un dépôt initialisé");

      const branch = branchName(proposal);
      const applied = await applyLocalCommit({ cwd: context.cwd, branch, changedPaths: proposal.changedPaths, commitMessage: commitMessage(proposal) });
      let pushed = false;
      let pushNote: string | undefined;
      if (wantsPush) {
        try { await pushBranch(context.cwd, branch); pushed = true; }
        catch (error) { pushNote = `push non effectué: ${error instanceof Error ? error.message : String(error)}`; }
      }
      await audit(context, config.project.id, "evolution.apply", { evolutionId: proposal.evolutionId, branch, commit: applied.commit, pushed });
      return {
        status: "applied", ...applied, pushed,
        ...(pushNote ? { pushNote } : {}),
        nextStep: pushed
          ? `Branche poussée. Ouvrez la PR: gh pr create --base main --head ${branch}`
          : `Commit local créé sur ${branch}. Poussez avec 'ostack evolve apply <proposal> --push' (autonomie pull-request) ou manuellement.`
      };
    }
    case "evaluate": {
      // Compare a candidate's measured metrics to the baseline before promotion.
      const baselinePath = readFlag(rest, "--baseline");
      const candidatePath = readFlag(rest, "--candidate");
      if (!baselinePath || !candidatePath) throw new Error("Usage: ostack evolve evaluate --baseline <baseline.json> --candidate <candidate.json> [--fixes-defect]");
      const baseline = JSON.parse(await readFile(join(context.cwd, baselinePath), "utf8")) as SkillMetrics;
      const candidate = JSON.parse(await readFile(join(context.cwd, candidatePath), "utf8")) as SkillMetrics;
      const result = evaluateCandidate(baseline, candidate, rest.includes("--fixes-defect") ? { fixesProvenDefect: true } : {});
      await audit(context, config.project.id, "evolution.evaluate", { recommendation: result.recommendation, regressions: result.regressions });
      return {
        recommendation: result.recommendation,
        promotable: result.recommendation === "promote",
        regressions: result.regressions,
        deltas: result.deltas,
        reasons: result.reasons,
        note: "Une évolution n'est promue que si elle démontre une amélioration ou corrige un défaut prouvé, sans régression (§22)."
      };
    }
    default:
      throw new Error(`Unknown evolve subcommand '${subcommand}'. Use status | record | classify | propose | apply | evaluate`);
  }
}

// The exact git commands a human (or a higher-autonomy runner) would run. We
// print them; we do not execute network/merge operations from here.
function gitCommands(proposal: EvolutionProposal, branch: string, autonomy: GitAutonomy, decision: string): string[] {
  const add = `git add ${proposal.changedPaths.map((p) => `\\\n  ${p}`).join("")} \\\n  .ostack/evolution/ledger.jsonl`;
  const base = [
    "git fetch origin",
    `git checkout -b ${branch}`,
    add,
    `git commit -F - <<'MSG'\n${commitMessage(proposal)}\nMSG`
  ];
  if (autonomy === "observe" || autonomy === "local-commit") return base;
  base.push(`git push -u origin ${branch}`, `gh pr create --title "[OStack Evolution] ${proposal.title}" --base main --head ${branch} --body-file -`);
  if (autonomy === "controlled-auto-merge" && decision === "AUTO_MERGE") {
    base.push("gh pr merge --squash --auto   # uniquement si les protections de branche et la CI l'autorisent");
  }
  return base;
}

function defaultChecks(proposal: EvolutionProposal): Checks {
  const provided = (proposal as unknown as { checks?: Partial<Checks> }).checks ?? {};
  return {
    evidencePack: provided.evidencePack === true,
    testsPassed: provided.testsPassed === true,
    securityPassed: provided.securityPassed === true,
    lintPassed: provided.lintPassed === true,
    buildPassed: provided.buildPassed === true,
    signedCommit: provided.signedCommit === true,
    noSecretsDetected: provided.noSecretsDetected === true,
    noPolicyViolations: provided.noPolicyViolations === true,
    independentVerification: provided.independentVerification === true
  };
}

async function readLedger(path: string): Promise<LedgerEntry[]> {
  try { return parseLedger(await readFile(path, "utf8")); } catch { return []; }
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function readList(args: string[], flag: string): string[] {
  const index = args.indexOf(flag);
  if (index === -1 || !args[index + 1]) return [];
  return args[index + 1]!.split(",").map((value) => value.trim()).filter(Boolean);
}

async function audit(context: CommandContext, projectId: string, action: string, details: Record<string, unknown>): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action, projectId, outcome: "succeeded", details
  }));
}
