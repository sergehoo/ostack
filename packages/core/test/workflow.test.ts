import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../src/events.js";
import { PermissionEngine } from "../src/security.js";
import { WorkflowEngine } from "../src/workflow.js";
import type { WorkflowDefinition } from "../src/types.js";

test("workflow pauses before a sensitive step", async () => {
  const workflow: WorkflowDefinition = { id: "demo", name: "Demo", version: "1", description: "test", steps: [
    { id: "read", name: "Read", command: "read", securityLevel: 1 },
    { id: "release", name: "Release", command: "release", needs: ["read"], securityLevel: 3 }
  ] };
  const run = await new WorkflowEngine(new PermissionEngine(), new EventBus()).run(workflow, "project", async (step) => step.id);
  assert.equal(run.status, "waiting_approval");
  assert.deepEqual(run.completedSteps, ["read"]);
});

test("invalid dependencies are rejected", () => {
  const engine = new WorkflowEngine(new PermissionEngine(), new EventBus());
  const errors = engine.validate({ id: "bad", name: "Bad", version: "1", description: "", steps: [{ id: "a", name: "A", needs: ["missing"], securityLevel: 1 }] });
  assert.equal(errors.length, 1);
});

test("workflow resumes without re-running completed steps", async () => {
  const workflow: WorkflowDefinition = { id: "resume", name: "Resume", version: "1", description: "", steps: [
    { id: "first", name: "First", command: "first", securityLevel: 1 },
    { id: "approval", name: "Approval", command: "approval", needs: ["first"], securityLevel: 3 },
    { id: "last", name: "Last", command: "last", needs: ["approval"], securityLevel: 1 }
  ] };
  const engine = new WorkflowEngine(new PermissionEngine(), new EventBus());
  const executed: string[] = [];
  const paused = await engine.run(workflow, "project", async (step) => { executed.push(step.id); return step.id; });
  assert.equal(paused.status, "waiting_approval");
  const resumed = await engine.run(workflow, "project", async (step) => { executed.push(step.id); return step.id; }, {
    existingRun: paused,
    approvals: [{ requestId: `${paused.id}:approval`, approver: { id: "human", kind: "human", roles: [] }, approvedAt: new Date().toISOString(), reason: "Reviewed" }]
  });
  assert.equal(resumed.status, "succeeded");
  assert.deepEqual(executed, ["first", "approval", "last"]);
});
