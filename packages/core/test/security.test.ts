import test from "node:test";
import assert from "node:assert/strict";
import { PermissionEngine } from "../src/security.js";
import type { ActionRequest, Approval } from "../src/types.js";

const base: ActionRequest = { id: "req-1", action: "deploy", level: 4, actor: { id: "agent-1", kind: "agent", roles: ["local-writer"] }, projectId: "demo" };

test("production is denied without explicit human approval", () => {
  const result = new PermissionEngine().evaluate(base);
  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
});

test("production accepts approval bound to the exact request", () => {
  const approval: Approval = { requestId: "req-1", approver: { id: "human-1", kind: "human", roles: ["release-approver"] }, approvedAt: new Date().toISOString(), reason: "Release reviewed" };
  assert.equal(new PermissionEngine().evaluate(base, approval).allowed, true);
});

test("agent cannot approve production", () => {
  const approval: Approval = { requestId: "req-1", approver: { id: "agent-2", kind: "agent", roles: ["release-approver"] }, approvedAt: new Date().toISOString(), reason: "Automated" };
  assert.equal(new PermissionEngine().evaluate(base, approval).allowed, false);
});
