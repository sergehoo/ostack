import test from "node:test";
import assert from "node:assert/strict";
import { SqliteRunRepository } from "../src/index.js";
import type { WorkflowRun } from "@ostack/core";

test("SQLite repository persists and updates workflow checkpoints", async () => {
  const repository = new SqliteRunRepository(":memory:");
  const run: WorkflowRun = { id: "run-1", workflowId: "feature", projectId: "project", status: "running", startedAt: "2026-01-01T00:00:00Z", completedSteps: [], outputs: {} };
  await repository.save(run);
  run.status = "waiting_approval";
  run.completedSteps.push("specification");
  run.pendingApprovalRequestId = "run-1:approval";
  await repository.save(run);
  const restored = await repository.get("run-1");
  assert.equal(restored?.status, "waiting_approval");
  assert.deepEqual(restored?.completedSteps, ["specification"]);
  assert.equal((await repository.list("project")).length, 1);
  repository.close();
});
