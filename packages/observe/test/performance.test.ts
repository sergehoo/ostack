import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePerformance, computeBaseline, percentile } from "../src/index.js";

test("percentiles come from real samples; zero samples refuse to answer", () => {
  const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  assert.equal(percentile(values, 50), 500);
  assert.equal(percentile(values, 95), 1000);
  assert.equal(percentile([42], 95), 42);
  assert.throws(() => percentile([], 95), /zero samples/);
});

test("the §20 scenario: a +190% p95 regression blocks the release", () => {
  const baseline = computeBaseline([{ name: "GET /api/courses", latenciesMs: [200, 210, 220, 230, 220] }]);
  const current = computeBaseline([{ name: "GET /api/courses", latenciesMs: [600, 640, 650, 620, 640] }]);
  const comparison = comparePerformance(baseline, current);
  assert.equal(comparison.blocking, true);
  const regression = comparison.regressions[0]!;
  assert.equal(regression.beforeP95Ms, 230);
  assert.equal(regression.afterP95Ms, 650);
  assert.ok(regression.changeRatio > 1.8, `ratio observé: ${regression.changeRatio}`);
});

test("noise under the absolute floor never blocks; improvements are reported", () => {
  const baseline = computeBaseline([
    { name: "fast", latenciesMs: [10, 12, 11] },
    { name: "improved", latenciesMs: [500, 510, 520] }
  ]);
  const current = computeBaseline([
    { name: "fast", latenciesMs: [22, 24, 25] },
    { name: "improved", latenciesMs: [300, 310, 320] }
  ]);
  const comparison = comparePerformance(baseline, current);
  assert.equal(comparison.blocking, false, "a +13ms jump on a 12ms probe is noise, not regression");
  assert.equal(comparison.improvements[0]?.name, "improved");
});

test("new and missing probes are surfaced, never silently assumed fine", () => {
  const baseline = computeBaseline([{ name: "old", latenciesMs: [100] }]);
  const current = computeBaseline([{ name: "new", latenciesMs: [100] }]);
  const comparison = comparePerformance(baseline, current);
  assert.deepEqual(comparison.newProbes, ["new"]);
  assert.deepEqual(comparison.missingProbes, ["old"]);
});
