import test from "node:test";
import assert from "node:assert/strict";
import { QualityRunner, type QualityCommand } from "../src/index.js";

const human = { id: "human", kind: "human" as const, roles: ["approver"] };
const request = { id: "quality-1", action: "quality.execute", level: 3 as const, actor: { id: "engine", kind: "system" as const, roles: [] }, projectId: "project" };
const approval = { requestId: "quality-1", approver: human, approvedAt: new Date().toISOString(), reason: "Reviewed exact command" };

test("quality runner executes only exact allowlisted commands without a shell", async () => {
  const command: QualityCommand = { command: "npm", args: ["--version"] };
  const results = await new QualityRunner(process.cwd(), [command]).run([command], request, approval);
  assert.equal(results[0]?.success, true);
  assert.match(results[0]?.stdout ?? "", /^\d+\./);
});

test("quality runner rejects unlisted and unapproved execution", async () => {
  const allowed: QualityCommand = { command: "npm", args: ["--version"] };
  const runner = new QualityRunner(process.cwd(), [allowed]);
  await assert.rejects(runner.run([{ command: "npm", args: ["help"] }], request, approval), /not allowlisted/);
  await assert.rejects(runner.run([allowed], request, { ...approval, requestId: "other" }), /requires human approval/);
});

test("quality output redacts common credential formats", async () => {
  const command: QualityCommand = { command: "node", args: ["-e", "console.log('API_KEY=supersecret');console.error('Bearer abc.def.ghi')"] };
  const result = (await new QualityRunner(process.cwd(), [command]).run([command], request, approval))[0]!;
  assert.equal(result.stdout.includes("supersecret"), false);
  assert.equal(result.stderr.includes("abc.def.ghi"), false);
  assert.match(result.stdout, /REDACTED/);
});
