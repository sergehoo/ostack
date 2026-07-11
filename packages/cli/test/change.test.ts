import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeConfig } from "../src/config.js";
import { runChange } from "../src/change.js";

test("CLI change previews, confirms, audits and records a controlled plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-cli-change-"));
  const config = await initializeConfig(root, "Change CLI");
  config.quality = { commands: [{ command: "npm", args: ["--version"] }] };
  await writeFile(join(root, ".ostack/config.json"), JSON.stringify(config));
  await writeFile(join(root, "plan.json"), JSON.stringify({
    schemaVersion: 1, id: "cli-change", projectId: "change-cli", description: "Apply a validated CLI test change",
    changes: [{ path: "result.txt", content: "controlled\n" }]
  }));
  const preview = await runChange({ cwd: root, args: ["plan.json"], json: true }) as { confirmationHash: string };
  await assert.rejects(readFile(join(root, "result.txt")), /ENOENT/);
  const result = await runChange({ cwd: root, args: ["plan.json", "--confirm", preview.confirmationHash, "--reason", "Reviewed test diff"], json: true }) as { status: string };
  assert.equal(result.status, "succeeded");
  assert.equal(await readFile(join(root, "result.txt"), "utf8"), "controlled\n");
  assert.match(await readFile(join(root, ".ostack/audit.jsonl"), "utf8"), /change\.execute/);
});
