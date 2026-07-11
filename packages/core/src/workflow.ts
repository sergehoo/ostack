import type { Approval, WorkflowDefinition, WorkflowRun, WorkflowStep } from "./types.js";
import { PermissionEngine } from "./security.js";
import { createEvent, EventBus } from "./events.js";

export type StepExecutor = (step: WorkflowStep, run: WorkflowRun) => Promise<unknown>;

export interface WorkflowRunOptions {
  approvals?: Approval[];
  existingRun?: WorkflowRun;
  onCheckpoint?: (run: WorkflowRun) => Promise<void>;
}

export class WorkflowEngine {
  constructor(private readonly permissions: PermissionEngine, private readonly events: EventBus) {}

  validate(workflow: WorkflowDefinition): string[] {
    const errors: string[] = [];
    const ids = new Set(workflow.steps.map((step) => step.id));
    if (ids.size !== workflow.steps.length) errors.push("Step identifiers must be unique");
    for (const step of workflow.steps) for (const dependency of step.needs ?? []) {
      if (!ids.has(dependency)) errors.push(`Step ${step.id} needs unknown step ${dependency}`);
      if (dependency === step.id) errors.push(`Step ${step.id} cannot depend on itself`);
    }
    return errors;
  }

  async run(workflow: WorkflowDefinition, projectId: string, executor: StepExecutor, options: WorkflowRunOptions | Approval[] = {}): Promise<WorkflowRun> {
    const errors = this.validate(workflow);
    if (errors.length) throw new Error(errors.join("; "));
    const normalized = Array.isArray(options) ? { approvals: options } : options;
    const approvals = normalized.approvals ?? [];
    const run: WorkflowRun = normalized.existingRun ?? { id: crypto.randomUUID(), workflowId: workflow.id, projectId, status: "running", startedAt: new Date().toISOString(), completedSteps: [], outputs: {} };
    if (run.workflowId !== workflow.id || run.projectId !== projectId) throw new Error("Existing run does not match workflow and project");
    run.status = "running";
    delete run.pendingApprovalRequestId;
    await checkpoint(run, normalized.onCheckpoint);
    await this.events.publish(createEvent("workflow.started", "workflow-engine", run, run.id));

    for (const step of workflow.steps) {
      if (run.completedSteps.includes(step.id)) continue;
      if ((step.needs ?? []).some((dependency) => !run.completedSteps.includes(dependency))) throw new Error(`Unmet dependency for ${step.id}`);
      const request = { id: `${run.id}:${step.id}`, action: step.command ?? `agent:${step.agent}`, level: step.securityLevel, actor: { id: "workflow-engine", kind: "system" as const, roles: ["local-writer"] }, projectId };
      const approval = approvals.find((item) => item.requestId === request.id);
      const decision = this.permissions.evaluate(request, approval);
      if (!decision.allowed) {
        run.status = decision.requiresApproval ? "waiting_approval" : "failed";
        if (decision.requiresApproval) run.pendingApprovalRequestId = request.id;
        await checkpoint(run, normalized.onCheckpoint);
        await this.events.publish(createEvent("workflow.approval_required", "workflow-engine", { runId: run.id, stepId: step.id, requestId: request.id }, run.id));
        return run;
      }
      try {
        run.outputs[step.id] = await executor(step, run);
        run.completedSteps.push(step.id);
        await checkpoint(run, normalized.onCheckpoint);
      } catch (error) {
        run.outputs[step.id] = { error: error instanceof Error ? error.message : String(error) };
        if (!step.continueOnError) { run.status = "failed"; await checkpoint(run, normalized.onCheckpoint); return run; }
      }
    }
    run.status = "succeeded";
    await checkpoint(run, normalized.onCheckpoint);
    await this.events.publish(createEvent("workflow.completed", "workflow-engine", run, run.id));
    return run;
  }
}

async function checkpoint(run: WorkflowRun, handler?: (run: WorkflowRun) => Promise<void>): Promise<void> {
  run.updatedAt = new Date().toISOString();
  await handler?.(run);
}
