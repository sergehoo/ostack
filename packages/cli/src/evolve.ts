import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import {
  applyLocalCommit, branchName, classifyRisk, commitMessage, decideMerge, evaluateCandidate, isGitRepo,
  parseLedger, permittedActions, pullRequestBody, pushBranch, sanitizeEntry, serializeEntry,
  type Checks, type EvolutionProposal, type ExperienceType, type GitAutonomy, type LedgerEntry, type SkillMetrics
} from "@ostack/evolution";
import { deriveLessons, type LessonKind } from "@ostack/learning";
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
    case "collect": {
      // Experience Collector + Lesson Extractor (§6-7): derive CANDIDATE
      // learnings from the project's real artifacts and append them to the
      // ledger. Deterministic (stable eventId per lesson → idempotent),
      // secret-free, project-scoped (§9 — never universal from collection).
      const now = new Date().toISOString();
      const state = configDirectory(context.cwd);
      const derived = deriveLessons({
        project: config.project.id, now,
        evidencePacks: await readJsonDir(join(state, "evidence")),
        deliberations: await readJsonDir(join(state, "deliberations")),
        intents: await readJsonDir(join(state, "intents"))
      });
      const existing = await readLedger(ledgerPath);
      const seen = new Set(existing.map((entry) => entry.eventId));
      const added: LedgerEntry[] = [];
      for (const lesson of derived) {
        const mapped = mapLessonToLedger(lesson.kind, lesson.statement, lesson.sources, lesson.count, config.project.id, now);
        if (!mapped || seen.has(mapped.eventId)) continue;
        seen.add(mapped.eventId);
        added.push(mapped);
      }
      if (added.length > 0) {
        await mkdir(join(state, "evolution"), { recursive: true, mode: 0o700 });
        await appendFile(ledgerPath, added.map((entry) => serializeEntry(entry)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
        await audit(context, config.project.id, "evolution.collect", { candidates: added.length });
      }
      return {
        status: "collected",
        candidatesAdded: added.length,
        alreadyKnown: derived.length - added.length,
        candidates: added.map((entry) => ({ eventId: entry.eventId, lesson: entry.lesson, proposedResource: entry.proposedResource, confidence: entry.confidence })),
        note: "Nouveaux candidats au statut CANDIDATE, portée projet. La promotion exige reproduction, preuves et vérification indépendante (§8)."
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

// Maps a factual lesson to a ledger CANDIDATE, choosing a proposed resource
// path by kind. Only actionable kinds become candidates; usage stats do not.
function mapLessonToLedger(kind: LessonKind, statement: string, sources: string[], count: number, project: string, now: string): LedgerEntry | undefined {
  const mapping: Partial<Record<LessonKind, { dir: string; experienceType: ExperienceType }>> = {
    blocking_challenge: { dir: "anti-patterns/verification", experienceType: "other" },
    residual_risk: { dir: "lessons/risks", experienceType: "security" },
    recurring_invariant: { dir: "patterns/invariants", experienceType: "feature" }
  };
  const target = mapping[kind];
  if (!target) return undefined;
  const slug = statement.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "lesson";
  const eventId = `EVL-${createHash("sha256").update(`${kind}:${slug}:${project}`).digest("hex").slice(0, 12)}`;
  // Confidence rises modestly with repeated observation but never reaches the
  // promotion bar (§8): collected candidates stay CANDIDATE until reproduced.
  const confidence = Math.min(0.5 + 0.1 * Math.max(0, count - 1), 0.85);
  return {
    eventId, timestamp: now, project, taskId: "collected",
    experienceType: target.experienceType, outcome: "observed",
    lesson: statement, scope: `project:${project}`, confidence,
    evidence: sources, proposedResource: `${target.dir}/${slug}.md`, status: "CANDIDATE"
  };
}

async function readJsonDir<T>(directory: string): Promise<T[]> {
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); } catch { return []; }
  const documents: T[] = [];
  for (const name of names.sort()) {
    try { documents.push(JSON.parse(await readFile(join(directory, name), "utf8")) as T); } catch { /* skip */ }
  }
  return documents;
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
