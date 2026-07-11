import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MockProvider } from "@ostack/core";
import { initializeConfig, configFile } from "../src/config.js";
import { buildMesh, runMeshCommand, selectForTask } from "../src/mesh.js";
import { runFeature } from "../src/feature.js";

async function meshProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ostack-mesh-"));
  const config = await initializeConfig(root, "Mesh Test");
  const withMesh = {
    ...config,
    mesh: {
      candidates: [
        { id: "mock/deterministic", provider: "mock", model: "deterministic-test", local: true },
        { id: "ollama/qwen3", provider: "ollama", model: "qwen3", local: true }
      ],
      routes: [
        { taskType: "product", strategy: "quality_first", candidates: ["ollama/qwen3", "mock/deterministic"] },
        { taskType: "engineering", strategy: "cost_per_verified_result", candidates: ["mock/deterministic"] }
      ]
    }
  };
  await writeFile(configFile(root), JSON.stringify(withMesh, null, 2));
  return root;
}

test("selection falls back to an available candidate, then to the session provider", async () => {
  const root = await meshProject();
  const loaded = await buildMesh(root, {
    candidates: [{ id: "mock/deterministic", provider: "mock", model: "deterministic-test", local: true }],
    routes: [{ taskType: "engineering", strategy: "quality_first", candidates: ["mock/deterministic"] }]
  });
  const fallback = new MockProvider();
  const routed = await selectForTask(loaded, "engineering", fallback);
  assert.equal(routed.candidateId, "mock/deterministic");
  const unrouted = await selectForTask(loaded, "unknown-task", fallback);
  assert.equal(unrouted.candidateId, undefined, "unknown route falls back without failing");
  assert.equal(unrouted.provider, fallback);
  const disabled = await selectForTask(null, "engineering", fallback);
  assert.equal(disabled.provider, fallback);
});

test("mesh CLI shows routes and refuses to record without real cost and latency", async () => {
  const root = await meshProject();
  const routes = await runMeshCommand({ cwd: root, args: ["routes"], json: true }) as { routes: Array<{ taskType: string; ranked: string[] }> };
  assert.equal(routes.routes.length, 2);
  await assert.rejects(runMeshCommand({ cwd: root, args: ["record", "engineering", "mock/deterministic", "--verified"], json: true }), /coût et la latence réels sont obligatoires/);

  const recorded = await runMeshCommand({ cwd: root, args: ["record", "engineering", "mock/deterministic", "--verified", "--cost", "0.03", "--latency", "1200"], json: true }) as { metrics: { verified: number; costPerVerifiedResultUsd: number } };
  assert.equal(recorded.metrics.verified, 1);
  assert.equal(recorded.metrics.costPerVerifiedResultUsd, 0.03);

  // stats persist and reload
  const stats = await runMeshCommand({ cwd: root, args: ["stats"], json: true }) as { stats: Array<{ taskType: string; candidates: Array<{ attempts: number }> }> };
  const engineering = stats.stats.find((entry) => entry.taskType === "engineering");
  assert.equal(engineering?.candidates[0]?.attempts, 1);
  const persisted = JSON.parse(await readFile(join(root, ".ostack/mesh.json"), "utf8"));
  assert.equal(persisted.stats.engineering["mock/deterministic"].verified, 1);
});

test("the feature workflow reports which candidate served each step", async () => {
  const root = await meshProject();
  const result = await runFeature({ cwd: root, args: ["Mesh", "routing", "--provider", "mock"], json: true }) as { status: string; stepProviders?: Record<string, string> };
  assert.equal(result.status, "waiting_approval");
  assert.ok(result.stepProviders, "mesh-configured runs expose per-step providers");
  // product-category agents are routed by the mesh; ollama is first-ranked but
  // unavailable in tests, so the available mock candidate serves the step.
  assert.equal(result.stepProviders?.discovery, "mock/deterministic");
  assert.equal(result.stepProviders?.intent, "mock", "no intent_drafting route: session fallback");
});
