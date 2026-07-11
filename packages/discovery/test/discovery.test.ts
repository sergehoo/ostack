import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProject } from "../src/index.js";

test("project discovery detects stack while excluding secrets and dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "ostack-discovery-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { react: "1", next: "1" } }));
  await writeFile(join(root, "package-lock.json"), "{}");
  await writeFile(join(root, "src/index.ts"), "export const value = 1;");
  await writeFile(join(root, "README.md"), "# Demo");
  await writeFile(join(root, ".env"), "SECRET=never-read");
  await writeFile(join(root, "node_modules/ignored.js"), "ignored");
  const report = await discoverProject(root);
  assert.deepEqual(report.frameworks, ["Next.js", "React"]);
  assert.deepEqual(report.packageManagers, ["npm"]);
  assert.equal(report.inventory.files, 4);
  assert.equal(report.entryPoints.includes("src/index.ts"), true);
  assert.equal(report.knowledgeCandidates.includes("README.md"), true);
});
