import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ModelProvider, WorkflowRun } from "@ostack/core";
import { challengeProposal, type Challenge } from "@ostack/deliberation";
import type { EvidenceInput, HumanApproval } from "@ostack/evidence";
import { compileIntent, draftIntent, type CompiledIntent, type IntentDraft } from "@ostack/intent";
import { configDirectory } from "./config.js";
import { persistCompiledIntent } from "./intent.js";

// Executors for the verified feature workflow steps (§4, §7, §3): the intent is
// compiled before any agent speaks, the implementation is adversarially
// challenged, and the run closes by scaffolding the Evidence Pack input.

export interface IntentStepResult {
  intentId: string;
  contentHash: string;
  source: string;
  invariants: number;
  acceptanceCriteria: string[];
  requiredTests: string[];
  savedTo: string;
}

export async function executeIntentStep(
  cwd: string, projectId: string, objective: string, provider: ModelProvider, intentPath?: string
): Promise<IntentStepResult> {
  let compiled: CompiledIntent;
  let source: string;
  if (intentPath) {
    const path = containedPath(cwd, intentPath);
    const loaded = JSON.parse(await readFile(path, "utf8")) as CompiledIntent;
    // Integrity check: recompile the embedded draft and require the same hash,
    // so a hand-edited compiled intent cannot smuggle unverified content in.
    const draft: IntentDraft = {
      schemaVersion: 1, id: loaded.id, request: loaded.request,
      functionalIntent: loaded.functionalIntent, actors: loaded.actors, invariants: loaded.invariants
    };
    compiled = compileIntent(draft);
    if (compiled.contentHash !== loaded.contentHash) {
      throw new Error(`Compiled intent at ${relative(cwd, path)} does not match its content hash; regenerate it with 'ostack intent-compile'`);
    }
    source = relative(cwd, path);
  } else if (provider.id === "mock") {
    // Deterministic dry-run draft, clearly labeled: one auditable obligation.
    compiled = compileIntent({
      schemaVersion: 1,
      id: slugify(objective),
      request: objective,
      functionalIntent: [objective],
      actors: ["utilisateur"],
      invariants: [{
        id: "actions-journalisees",
        statement: `Toute action de « ${objective.slice(0, 120)} » doit être journalisée`,
        kind: "obligation",
        given: "la fonctionnalité est utilisée",
        when: "une action aboutit ou échoue",
        outcome: "une entrée d'audit est créée",
        auditRequired: true
      }]
    });
    source = "mock-draft";
  } else {
    const draft = await draftIntent(slugify(objective), objective, provider);
    compiled = compileIntent(draft);
    source = `provider:${provider.id}`;
  }
  const savedTo = await persistCompiledIntent(cwd, projectId, compiled, source);
  return {
    intentId: compiled.id,
    contentHash: compiled.contentHash,
    source,
    invariants: compiled.invariants.length,
    acceptanceCriteria: compiled.acceptanceCriteria,
    requiredTests: compiled.requiredTests,
    savedTo: relative(cwd, savedTo)
  };
}

export interface ChallengeStepResult {
  skipped?: boolean;
  reason?: string;
  provider: string;
  challenges: Array<{ challenger: string; blocking: boolean; message: string }>;
  blocking: number;
  savedTo?: string;
}

export async function executeChallengeStep(
  cwd: string, run: WorkflowRun, objective: string, provider: ModelProvider
): Promise<ChallengeStepResult> {
  if (provider.id === "mock") {
    return {
      skipped: true,
      reason: "Le fournisseur mock ne peut pas délibérer; la proposition reste non contestée et donc non vérifiée.",
      provider: provider.id,
      challenges: [],
      blocking: 0
    };
  }
  const implementation = run.outputs.implementation;
  const content = extractSummary(implementation);
  if (!content) throw new Error("No implementation output available to challenge");
  const proposal = { id: `${run.id}:implementation`, author: "backend-engineer", content, claims: [] };
  const objectiveLine = `Fonctionnalité: ${objective}`;
  const [critic, adversarial] = await Promise.all([
    challengeProposal(proposal, objectiveLine, "critic", provider),
    challengeProposal(proposal, objectiveLine, "adversarial", provider)
  ]);
  const challenges: Challenge[] = [...critic, ...adversarial];
  const directory = join(configDirectory(cwd), "deliberations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${run.id}-challenge.json`);
  await writeFile(path, `${JSON.stringify({ taskId: run.id, objective, proposals: [proposal], challenges, evidence: [] }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    provider: provider.id,
    challenges: challenges.map((challenge) => ({ challenger: challenge.challenger, blocking: challenge.blocking, message: challenge.message })),
    blocking: challenges.filter((challenge) => challenge.blocking).length,
    savedTo: relative(cwd, path)
  };
}

export interface ScaffoldStepResult {
  savedTo: string;
  todo: string[];
  nextStep: string;
}

// The scaffold is honest by construction: everything not actually executed is
// zeroed or false, and listed in `todo`. `ostack prove` will refuse VERIFIED
// status until real executions replace the placeholders.
export async function executeEvidenceScaffoldStep(cwd: string, run: WorkflowRun, objective: string): Promise<ScaffoldStepResult> {
  const intent = run.outputs.intent as IntentStepResult | undefined;
  const challenge = run.outputs.challenge as ChallengeStepResult | undefined;
  const approvals: HumanApproval[] = [];
  for (const stepId of ["design-approval", "release-readiness"]) {
    const output = run.outputs[stepId] as { approval?: { approverId: string; approvedAt: string; reason: string } | null } | undefined;
    if (output?.approval) approvals.push({ approver: output.approval.approverId, approvedAt: output.approval.approvedAt, reason: output.approval.reason });
  }

  const todo = [
    "Renseigner changedFiles et diffRef après l'implémentation réelle",
    "Exécuter les tests et remplacer les compteurs à zéro par les résultats réels",
    "Exécuter l'analyse de sécurité et mettre à jour security + threatModelUpdated",
    "Mesurer la performance des endpoints touchés",
    "Vérifier la matrice de permissions (permissionMatrixVerified)",
    "Définir et tester le rollback",
    "Évaluer chaque dimension de confiance à partir des preuves réelles",
    ...(challenge?.blocking ? [`Résoudre ${challenge.blocking} défi(s) bloquant(s) de la délibération par des preuves`] : []),
    ...(challenge?.skipped ? ["Relancer la délibération avec un fournisseur réel (étape challenge sautée en mode mock)"] : [])
  ];

  const scaffold: EvidenceInput & { $todo: string[] } = {
    $todo: todo,
    taskId: run.id,
    feature: objective,
    ...(intent ? { intentId: intent.intentId } : {}),
    request: objective,
    specification: { summary: extractSummary(run.outputs.specification) ?? "À compléter", coverage: 0 },
    assumptions: [],
    acceptanceCriteria: intent?.acceptanceCriteria ?? [],
    changedFiles: [],
    tests: { unit: { passed: 0, failed: 0 } },
    security: { critical: 0, high: 0, medium: 0, threatModelUpdated: false },
    rollback: { defined: false, tested: false },
    humanApprovals: approvals,
    confidence: [],
    evidenceItems: []
  };

  const directory = join(configDirectory(cwd), "evidence", "drafts");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${run.id}.json`);
  await writeFile(path, `${JSON.stringify(scaffold, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    savedTo: relative(cwd, path),
    todo,
    nextStep: `Compléter ${relative(cwd, path)} avec les exécutions réelles puis lancer 'ostack prove ${relative(cwd, path)}'`
  };
}

function extractSummary(value: unknown): string | undefined {
  if (typeof value === "string") return value.slice(0, 8000);
  if (value && typeof value === "object" && "summary" in value && typeof (value as { summary: unknown }).summary === "string") {
    return (value as { summary: string }).summary.slice(0, 8000);
  }
  if (value !== undefined) return JSON.stringify(value).slice(0, 8000);
  return undefined;
}

function containedPath(root: string, input: string): string {
  const absolute = isAbsolute(input) ? input : resolve(root, input);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Intent file must be inside the project");
  return absolute;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || "intent";
}
