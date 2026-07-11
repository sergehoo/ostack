// Hermetic: the machine may or may not run a local Ollama; tests must not
// depend on it, so the ollama candidate points at an unreachable port.
process.env.OLLAMA_HOST = "http://127.0.0.1:9";

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
  // unavailable (hermetic OLLAMA_HOST), so the mock candidate serves the step.
  assert.equal(result.stepProviders?.discovery, "mock/deterministic");
  assert.equal(result.stepProviders?.intent, "mock", "no intent_drafting route: session fallback");
});

test("routed steps write a cost/latency ledger; settle turns it into stats after the verdict", async () => {
  const root = await meshProject();
  const run = await runFeature({ cwd: root, args: ["Ledger", "demo", "--provider", "mock"], json: true }) as { runId: string };

  const ledger = await runMeshCommand({ cwd: root, args: ["ledger"], json: true }) as { pending: Array<{ runId: string; stepId: string; candidateId: string; latencyMs: number; costUsd?: number; usage: { calls: number } }> };
  const mine = ledger.pending.filter((entry) => entry.runId === run.runId);
  // phase 1 routes discovery and specification (category 'product'); intent
  // and architecture have no route in this config and fall back unmetered.
  assert.ok(mine.length >= 2, "each mesh-routed agent step is metered");
  assert.deepEqual([...new Set(mine.map((entry) => entry.stepId))].sort(), ["discovery", "specification"]);
  assert.ok(mine.every((entry) => entry.latencyMs >= 0 && entry.usage.calls >= 1));
  assert.ok(mine.every((entry) => entry.costUsd === undefined), "mock candidate has no pricing: cost stays UNKNOWN, never zero");

  // settling without an evidence pack requires an explicit human verdict
  await assert.rejects(runMeshCommand({ cwd: root, args: ["settle", run.runId], json: true }), /Evidence Pack/);
  const settled = await runMeshCommand({ cwd: root, args: ["settle", run.runId, "--failed"], json: true }) as { status: string; entries: unknown[] };
  assert.equal(settled.status, "settled");
  assert.equal(settled.entries.length, mine.length);

  const stats = await runMeshCommand({ cwd: root, args: ["stats"], json: true }) as { stats: Array<{ taskType: string; candidates: Array<{ candidateId: string; attempts: number; verified: number; costPerVerifiedResultUsd: number | null }> }> };
  const product = stats.stats.find((entry) => entry.taskType === "product")?.candidates.find((candidate) => candidate.candidateId === "mock/deterministic");
  assert.ok(product && product.attempts >= 1);
  assert.equal(product.verified, 0);
  assert.equal(product.costPerVerifiedResultUsd, null, "no known cost and no verified result: metric stays null");

  // the ledger is consumed: settling the same run twice is impossible
  await assert.rejects(runMeshCommand({ cwd: root, args: ["settle", run.runId, "--failed"], json: true }), /Aucune entrée/);
});
