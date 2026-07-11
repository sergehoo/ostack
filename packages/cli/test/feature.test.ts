import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeConfig } from "../src/config.js";
import { runFeature } from "../src/feature.js";

interface FeatureResult {
  runId: string;
  status: string;
  pendingApprovalRequestId: string | null;
  completedSteps: string[];
  outputs: Record<string, never>;
}

test("verified feature workflow compiles intent, challenges, gates and scaffolds evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-feature-"));
  await initializeConfig(root, "Feature Test");
  const start = await runFeature({ cwd: root, args: ["Secure", "login", "--provider", "mock"], json: true }) as FeatureResult;
  assert.equal(start.status, "waiting_approval");
  assert.deepEqual(start.completedSteps, ["intent", "discovery", "specification", "architecture"]);

  // The intent is compiled and persisted before any agent speaks (§4).
  const intent = start.outputs.intent as { intentId: string; source: string; invariants: number; acceptanceCriteria: string[]; savedTo: string };
  assert.equal(intent.source, "mock-draft");
  assert.ok(intent.invariants >= 1);
  const persisted = JSON.parse(await readFile(join(root, intent.savedTo), "utf8"));
  assert.equal(persisted.contentHash.length, 64);

  const middle = await runFeature({ cwd: root, args: [
    "--resume", start.runId, "--approve", start.pendingApprovalRequestId!, "--reason", "Design reviewed", "--provider", "mock"
  ], json: true }) as FeatureResult;
  assert.equal(middle.status, "waiting_approval");
  assert.equal(middle.completedSteps.length, 10);

  // The mock provider cannot deliberate — recorded as skipped, never as approved (§7).
  const challenge = middle.outputs.challenge as { skipped: boolean; blocking: number };
  assert.equal(challenge.skipped, true);
  assert.equal(challenge.blocking, 0);

  const done = await runFeature({ cwd: root, args: [
    "--resume", start.runId, "--approve", middle.pendingApprovalRequestId!, "--reason", "Release reviewed", "--provider", "mock"
  ], json: true }) as FeatureResult;
  assert.equal(done.status, "succeeded");
  assert.equal(done.completedSteps.length, 12);

  // The run closes with an honest Evidence Pack scaffold (§3): zeros and todos,
  // linked to the compiled intent, carrying both human approvals.
  const scaffold = done.outputs["evidence-scaffold"] as { savedTo: string; todo: string[] };
  const draft = JSON.parse(await readFile(join(root, scaffold.savedTo), "utf8"));
  assert.equal(draft.intentId, intent.intentId);
  assert.deepEqual(draft.acceptanceCriteria, intent.acceptanceCriteria);
  assert.equal(draft.security.threatModelUpdated, false);
  assert.equal(draft.humanApprovals.length, 2);
  assert.ok(draft.$todo.some((item: string) => item.includes("mode mock")));

  const audit = await readFile(join(root, ".ostack/audit.jsonl"), "utf8");
  assert.match(audit, /workflow\.approval_required/);
  assert.match(audit, /workflow\.completed/);
  assert.match(audit, /intent\.compile/);
});

test("a tampered compiled intent is rejected by the integrity check", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-feature-tamper-"));
  await initializeConfig(root, "Tamper Test");
  const first = await runFeature({ cwd: root, args: ["Audit", "trail", "--provider", "mock"], json: true }) as FeatureResult;
  const intent = first.outputs.intent as { savedTo: string };
  const path = join(root, intent.savedTo);
  const compiled = JSON.parse(await readFile(path, "utf8"));
  compiled.invariants[0].statement = "affaibli après compilation";
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, JSON.stringify(compiled));
  // The workflow engine checkpoints step failures instead of throwing:
  // the run fails at the intent step and records the integrity error.
  const rerun = await runFeature({ cwd: root, args: ["Audit", "trail", "--provider", "mock", "--intent", intent.savedTo], json: true }) as FeatureResult;
  assert.equal(rerun.status, "failed");
  assert.equal(rerun.completedSteps.length, 0);
  const failure = rerun.outputs.intent as { error: string };
  assert.match(failure.error, /does not match its content hash/);
});
