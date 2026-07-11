import { createHash } from "node:crypto";
import type { Actor, Approval } from "@ostack/core";
import { EphemeralWorkspace } from "@ostack/isolation";
import { QualityRunner, type QualityCommand, type QualityResult } from "@ostack/quality";
import { WorkspaceSandbox, type ChangeManifest, type ChangePreview } from "@ostack/workspace";

export interface ChangePlan {
  schemaVersion: 1;
  id: string;
  projectId: string;
  description: string;
  changes: Array<{ path: string; content: string; expectedBeforeHash?: string }>;
}
export interface PreparedChange { planId: string; confirmationHash: string; approvalRequestId: string; previews: ChangePreview[]; qualityCommands: QualityCommand[]; }
export interface IsolationEvidence { id: string; copiedFiles: number; copiedBytes: number; excludedPathCount: number; }
export interface ExecutedChange { status: "succeeded" | "rejected"; manifest?: ChangeManifest; qualityResults: QualityResult[]; confirmationHash: string; isolation: IsolationEvidence; }

export class ChangeEngine {
  constructor(
    private readonly root: string,
    private readonly projectId: string,
    private readonly actor: Actor,
    private readonly allowedQualityCommands: QualityCommand[]
  ) {}

  async prepare(plan: ChangePlan): Promise<PreparedChange> {
    this.assertPlan(plan);
    const session = await new WorkspaceSandbox(this.root, this.actor).begin(this.projectId);
    try {
      for (const change of plan.changes) {
        const preview = await session.stage(change.path, change.content);
        if (change.expectedBeforeHash !== undefined && preview.beforeHash !== change.expectedBeforeHash)
          throw new Error(`Precondition failed for ${change.path}: current content hash differs`);
      }
      const previews = session.previews();
      const confirmationHash = fingerprint(plan, previews, this.allowedQualityCommands);
      return { planId: plan.id, confirmationHash, approvalRequestId: `change:${confirmationHash}`, previews, qualityCommands: this.allowedQualityCommands };
    } finally { await session.rollback(); }
  }

  async execute(plan: ChangePlan, confirmationHash: string, approval: Approval): Promise<ExecutedChange> {
    const prepared = await this.prepare(plan);
    if (prepared.confirmationHash !== confirmationHash) throw new Error("Confirmation hash is stale or does not match this plan and workspace state");
    if (approval.requestId !== prepared.approvalRequestId) throw new Error("Approval does not match the prepared change");
    let qualityResults: QualityResult[] = [];
    const isolated = await EphemeralWorkspace.create(this.root);
    const isolation = {
      id: isolated.report.id,
      copiedFiles: isolated.report.copiedFiles,
      copiedBytes: isolated.report.copiedBytes,
      excludedPathCount: isolated.report.excludedPaths.length
    };
    try {
      const isolatedSession = await new WorkspaceSandbox(isolated.report.path, this.actor).begin(this.projectId);
      for (const change of plan.changes) await isolatedSession.stage(change.path, change.content);
      await isolatedSession.apply();
      qualityResults = await new QualityRunner(isolated.report.path, this.allowedQualityCommands).run(
        this.allowedQualityCommands,
        qualityRequest(prepared.approvalRequestId, this.projectId, plan.id, this.allowedQualityCommands),
        approval
      );
      if (qualityResults.some((result) => !result.success)) {
        return { status: "rejected", qualityResults, confirmationHash, isolation };
      }
    } finally { await isolated.cleanup(); }

    const realSession = await new WorkspaceSandbox(this.root, this.actor).begin(this.projectId);
    try {
      for (const change of plan.changes) await realSession.stage(change.path, change.content);
      const executionHash = fingerprint(plan, realSession.previews(), this.allowedQualityCommands);
      if (executionHash !== confirmationHash) throw new Error("Workspace changed during isolated validation; prepare the change again");
      await realSession.apply();
      return { status: "succeeded", manifest: realSession.commit(), qualityResults, confirmationHash, isolation };
    } catch (error) {
      try { await realSession.rollback(); } catch { /* preserve original failure */ }
      throw error;
    }
  }

  private assertPlan(plan: ChangePlan): void {
    if (plan.projectId !== this.projectId) throw new Error(`Plan targets project '${plan.projectId}', expected '${this.projectId}'`);
    if (plan.changes.length === 0) throw new Error("Change plan is empty");
    if (this.allowedQualityCommands.length === 0) throw new Error("At least one trusted quality command is required");
    if (plan.changes.length > 100) throw new Error("Change plan exceeds 100 file limit");
    const paths = new Set(plan.changes.map((change) => change.path));
    if (paths.size !== plan.changes.length) throw new Error("Change plan contains duplicate paths");
  }
}

function qualityRequest(requestId: string, projectId: string, planId: string, commands: QualityCommand[]) {
  return {
    id: requestId, action: "quality.execute", level: 3 as const,
    actor: { id: "change-engine", kind: "system" as const, roles: ["local-writer"] }, projectId,
    metadata: { planId, commands }
  };
}

function fingerprint(plan: ChangePlan, previews: ChangePreview[], qualityCommands: QualityCommand[]): string {
  return createHash("sha256").update(stableStringify({ plan, state: previews.map(({ diff: _diff, ...preview }) => preview), qualityCommands })).digest("hex");
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
