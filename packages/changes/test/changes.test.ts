import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangeEngine, type ChangePlan } from "../src/index.js";

const actor = { id: "human", kind: "human" as const, roles: ["local-writer"] };

test("change preview is mutation-free and confirmed execution commits", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-change-"));
  const plan: ChangePlan = { schemaVersion: 1, id: "add-readme", projectId: "project", description: "Create a project readme", changes: [{ path: "README.md", content: "# Project\n" }] };
  const commands = [{ command: "npm", args: ["--version"] }];
  const engine = new ChangeEngine(root, "project", actor, commands);
  const prepared = await engine.prepare(plan);
  await assert.rejects(readFile(join(root, "README.md")), /ENOENT/);
  const result = await engine.execute(plan, prepared.confirmationHash, {
    requestId: prepared.approvalRequestId, approver: actor, approvedAt: new Date().toISOString(), reason: "Diff reviewed"
  });
  assert.equal(result.status, "succeeded");
  assert.equal(await readFile(join(root, "README.md"), "utf8"), "# Project\n");
});

test("failed isolated quality command leaves the real workspace untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-change-"));
  await writeFile(join(root, "file.txt"), "before");
  const plan: ChangePlan = { schemaVersion: 1, id: "failed-change", projectId: "project", description: "Exercise automatic rollback", changes: [{ path: "file.txt", content: "after" }, { path: "new.txt", content: "new" }] };
  const commands = [{ command: "node", args: ["-e", "require('fs').writeFileSync('side-effect.txt','isolated');process.exit(1)"] }];
  const engine = new ChangeEngine(root, "project", actor, commands);
  const prepared = await engine.prepare(plan);
  const result = await engine.execute(plan, prepared.confirmationHash, {
    requestId: prepared.approvalRequestId, approver: actor, approvedAt: new Date().toISOString(), reason: "Rollback test"
  });
  assert.equal(result.status, "rejected");
  assert.equal(await readFile(join(root, "file.txt"), "utf8"), "before");
  await assert.rejects(readFile(join(root, "new.txt")), /ENOENT/);
  await assert.rejects(readFile(join(root, "side-effect.txt")), /ENOENT/);
});

test("real workspace drift during isolated tests prevents promotion", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-change-"));
  await writeFile(join(root, "file.txt"), "before");
  const plan: ChangePlan = { schemaVersion: 1, id: "concurrent-change", projectId: "project", description: "Detect drift while isolated tests run", changes: [{ path: "file.txt", content: "planned" }] };
  const commands = [{ command: "node", args: ["-e", "setTimeout(()=>process.exit(0),300)"] }];
  const engine = new ChangeEngine(root, "project", actor, commands);
  const prepared = await engine.prepare(plan);
  const execution = engine.execute(plan, prepared.confirmationHash, {
    requestId: prepared.approvalRequestId, approver: actor, approvedAt: new Date().toISOString(), reason: "Concurrency test"
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await writeFile(join(root, "file.txt"), "changed during tests");
  await assert.rejects(execution, /Workspace changed during isolated validation/);
  assert.equal(await readFile(join(root, "file.txt"), "utf8"), "changed during tests");
});

test("confirmation becomes invalid when workspace content changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-change-"));
  await writeFile(join(root, "file.txt"), "one");
  const plan: ChangePlan = { schemaVersion: 1, id: "stale-change", projectId: "project", description: "Detect concurrent workspace drift", changes: [{ path: "file.txt", content: "two" }] };
  const engine = new ChangeEngine(root, "project", actor, [{ command: "npm", args: ["--version"] }]);
  const prepared = await engine.prepare(plan);
  await writeFile(join(root, "file.txt"), "changed elsewhere");
  await assert.rejects(engine.execute(plan, prepared.confirmationHash, {
    requestId: prepared.approvalRequestId, approver: actor, approvedAt: new Date().toISOString(), reason: "Old approval"
  }), /Confirmation hash/);
});
