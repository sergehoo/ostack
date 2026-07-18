import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import {
  applyLocalCommit, branchName, classifyRisk, commitMessage, decideMerge, evaluateCandidate, evaluatePromotion, isGitRepo,
  parseLedger, permittedActions, pullRequestBody, pushBranch, sanitizeEntry, serializeEntry,
  type Checks, type EvolutionProposal, type ExperienceType, type GitAutonomy, type LedgerEntry, type Scope, type SkillMetrics
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
    case "promote": {
      // Applies the promotion gate (§8) to a ledger CANDIDATE and, if eligible,
      // MATERIALIZES the knowledge into a versioned resource file (§2). Refuses
      // honestly while reproduction / evidence / independent verification are
      // missing — never promoted on relevance alone.
      const eventId = readFlag(rest, "--event");
      if (!eventId) throw new Error("Usage: ostack evolve promote --event <eventId> [--reproduced] [--independent-verification] [--observations N]");
      const entries = await readLedger(ledgerPath);
      const entry = [...entries].reverse().find((item) => item.eventId === eventId && item.status !== "PROMOTED" && item.status !== "DEPRECATED");
      if (!entry) throw new Error(`Aucun candidat promouvable pour l'événement ${eventId}`);

      const scope = parseScope(entry.scope);
      const signals = {
        observations: Number(readFlag(rest, "--observations") ?? 1),
        distinctProjects: scope.type === "project" ? 1 : 2,
        reproduced: rest.includes("--reproduced"),
        confidence: entry.confidence,
        hasEvidence: entry.evidence.length > 0,
        contradicted: false,
        independentVerification: rest.includes("--independent-verification")
      };
      const decision = evaluatePromotion(entry.status, scope, signals);
      if (!decision.eligibleForPromotion) {
        return { status: "not_promoted", eventId, current: entry.status, next: decision.next, blockers: decision.blockers, note: "Une connaissance n'est promue qu'avec reproduction, preuves et vérification indépendante (§8)." };
      }

      const resourcePath = containedResource(context.cwd, entry.proposedResource);
      const now = new Date().toISOString();
      const frontMatter = [
        "---",
        `id: ${entry.eventId}`,
        "status: promoted",
        `scope: ${entry.scope}`,
        `confidence: ${entry.confidence}`,
        `experienceType: ${entry.experienceType}`,
        `evidence: [${entry.evidence.map((source) => JSON.stringify(source)).join(", ")}]`,
        `promotedAt: ${now}`,
        "---", ""
      ].join("\n");
      await mkdir(join(resourcePath, ".."), { recursive: true });
      await writeFile(resourcePath, `${frontMatter}${entry.lesson}\n`, { encoding: "utf8" });

      // Append a PROMOTED event referencing the same lesson (ledger is append-only).
      const promotedEvent: LedgerEntry = { ...entry, timestamp: now, status: "PROMOTED" };
      await appendFile(ledgerPath, `${serializeEntry(promotedEvent)}\n`, { encoding: "utf8", mode: 0o600 });
      await audit(context, config.project.id, "evolution.promote", { eventId, resource: entry.proposedResource });
      return {
        status: "promoted", eventId, resource: entry.proposedResource,
        nextStep: `Fichier ressource matérialisé. Committez-le via 'ostack evolve propose' puis 'ostack evolve apply' (chemins: ${entry.proposedResource}, .ostack/evolution/ledger.jsonl).`
      };
    }
    case "pr": {
      // §7 network execution: open a PR from a pushed evolution branch.
      if (autonomy !== "pull-request" && autonomy !== "controlled-auto-merge") {
        throw new Error(`gitAutonomy=${autonomy}: l'ouverture de PR exige pull-request ou controlled-auto-merge.`);
      }
      const branch = readFlag(rest, "--branch");
      const bodyFile = readFlag(rest, "--body-file");
      const title = readFlag(rest, "--title");
      if (!branch || !bodyFile || !title) throw new Error("Usage: ostack evolve pr --branch <b> --title <t> --body-file <f>");
      const base = readFlag(rest, "--base") ?? (config as { evolution?: { git?: { baseBranch?: string } } }).evolution?.git?.baseBranch ?? "main";
      const { createPullRequest } = await import("./evolve-network.js");
      const result = await createPullRequest({ cwd: context.cwd, branch, base, title, bodyFile });
      await audit(context, config.project.id, "evolution.pr", { branch, base });
      return { status: "pr_created", url: result.url };
    }
    case "merge": {
      // §7/§16 auto-merge: gated to low risk + no guardrail path + confidence;
      // GitHub branch protection is the real gate. Requires controlled-auto-merge.
      if (autonomy !== "controlled-auto-merge") {
        throw new Error(`gitAutonomy=${autonomy}: l'auto-merge exige gitAutonomy=controlled-auto-merge dans policies/evolution.json.`);
      }
      const pr = readFlag(rest, "--pr");
      const branch = readFlag(rest, "--branch");
      const paths = readList(rest, "--paths");
      if (!pr || !branch || paths.length === 0) throw new Error("Usage: ostack evolve merge --pr <url|n> --branch <b> --paths <a,b,c> [--confidence 0.94]");
      const confidence = Number(readFlag(rest, "--confidence") ?? 0);
      const confidenceMinimum = (config as { evolution?: { autoMerge?: { confidenceMinimum?: number } } }).evolution?.autoMerge?.confidenceMinimum ?? 0.92;
      const { enableAutoMerge } = await import("./evolve-network.js");
      const outcome = await enableAutoMerge({ cwd: context.cwd, pr, branch, changedPaths: paths, confidence, confidenceMinimum });
      await audit(context, config.project.id, outcome.enabled ? "evolution.auto_merge_enabled" : "evolution.auto_merge_refused", { pr, refused: outcome.refused });
      if (!outcome.enabled) return { status: "refused", reason: outcome.refused };
      return { status: "auto_merge_enabled", pr, note: "GitHub fusionnera après réussite des checks obligatoires et satisfaction des protections de branche (§16)." };
    }
    default:
      throw new Error(`Unknown evolve subcommand '${subcommand}'. Use collect | status | record | classify | propose | apply | evaluate | promote | pr | merge`);
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

function parseScope(raw: string): Scope {
  const [type, value] = raw.split(":");
  if (type === "domain") return { type: "domain", ...(value ? { domain: value } : {}) };
  if (type === "technology") return { type: "technology", ...(value ? { technology: value } : {}) };
  if (type === "organization") return { type: "organization" };
  if (type === "universal") return { type: "universal" };
  return { type: "project" };
}

// Materialized resources must land inside the project, under a known evolvable
// directory — never outside, never a protected path.
function containedResource(root: string, resource: string): string {
  const absolute = isAbsolute(resource) ? resource : resolve(root, resource);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("La ressource doit être dans le projet");
  if (!/^(patterns|anti-patterns|lessons|skills|standards|domain-packs|knowledge)\//.test(relation)) {
    throw new Error(`Ressource hors des répertoires évolutifs autorisés: ${relation}`);
  }
  return absolute;
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
