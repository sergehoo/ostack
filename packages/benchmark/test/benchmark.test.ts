import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCheck, runBenchmark, type BenchmarkSuite } from "../src/index.js";

function suite(overrides: Partial<BenchmarkSuite> = {}): BenchmarkSuite {
  return {
    schemaVersion: 1,
    id: "test-suite",
    repetitions: 3,
    tasks: [{
      id: "t1", category: "release_readiness", description: "tâche de démonstration",
      command: "demo", args: [], checks: [{ path: "status", equals: "ok" }]
    }],
    ...overrides
  };
}

const clock = (() => { let t = 0; return () => (t += 5); })();

test("a single run cannot measure stability: repetitions < 2 are rejected", async () => {
  await assert.rejects(runBenchmark(suite({ repetitions: 1 }), async () => ({}), clock), /stability/);
});

test("stable success and stable failure are both stable; flapping is not", async () => {
  let call = 0;
  const report = await runBenchmark(suite({
    repetitions: 3,
    tasks: [
      { id: "always-ok", category: "greenfield_feature", description: "réussit toujours", command: "a", args: [], checks: [{ path: "status", equals: "ok" }] },
      { id: "always-ko", category: "complex_bug", description: "échoue toujours", command: "b", args: [], checks: [{ path: "status", equals: "ok" }] },
      { id: "flapping", category: "incident_diagnosis", description: "réussit une fois sur deux", command: "c", args: [], checks: [{ path: "status", equals: "ok" }] }
    ]
  }), async (task) => {
    if (task.id === "always-ok") return { status: "ok" };
    if (task.id === "always-ko") return { status: "ko" };
    return { status: ++call % 2 === 0 ? "ok" : "ko" };
  }, clock);

  const byId = Object.fromEntries(report.tasks.map((task) => [task.taskId, task]));
  assert.equal(byId["always-ok"]?.successRate, 1);
  assert.equal(byId["always-ok"]?.stable, true);
  assert.equal(byId["always-ko"]?.successRate, 0);
  assert.equal(byId["always-ko"]?.stable, true, "a consistent failure is a stable signal");
  assert.equal(byId.flapping?.stable, false, "an intermittent result is the worst outcome");
  assert.equal(report.overall.fullySuccessful, 1);
  assert.equal(report.overall.stabilityRate, 0.67);
});

test("an executor exception is a failed repetition, not a crash of the harness", async () => {
  const report = await runBenchmark(suite(), async () => { throw new Error("provider down"); }, clock);
  assert.equal(report.tasks[0]?.successRate, 0);
  assert.equal(report.tasks[0]?.repetitions[0]?.error, "provider down");
});

test("checks resolve nested paths, array lengths, minimums and existence", () => {
  const output = { a: { b: [{ c: 5 }, { c: 9 }] }, hash: "x" };
  assert.equal(evaluateCheck({ path: "a.b.length", equals: 2 }, output).passed, true);
  assert.equal(evaluateCheck({ path: "a.b.1.c", minimum: 8 }, output).passed, true);
  assert.equal(evaluateCheck({ path: "hash", exists: true }, output).passed, true);
  assert.equal(evaluateCheck({ path: "missing.deep", exists: false }, output).passed, true);
  assert.equal(evaluateCheck({ path: "a.b.0.c", minimum: 8 }, output).passed, false);
});
