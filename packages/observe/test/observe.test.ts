import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { assertProbeTarget, runProbes, toEvidenceItems } from "../src/index.js";

let server: Server;
let base: string;

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/health") { response.writeHead(200); response.end("ok"); }
    else if (request.url === "/slow") { setTimeout(() => { response.writeHead(200); response.end("slow"); }, 150); }
    else { response.writeHead(404); response.end("missing"); }
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise<void>((resolvePromise) => server.close(() => resolvePromise())));

test("probes observe a running application and measure latency", async () => {
  const results = await runProbes([{ name: "health", url: `${base}/health` }]);
  assert.equal(results[0]?.ok, true);
  assert.equal(results[0]?.status, 200);
  assert.ok((results[0]?.latencyMs ?? -1) >= 0);
});

test("a wrong status or a blown latency budget fails the probe", async () => {
  const results = await runProbes([
    { name: "missing", url: `${base}/nope` },
    { name: "slow", url: `${base}/slow`, maxLatencyMs: 20 }
  ]);
  assert.equal(results[0]?.ok, false);
  assert.match(results[0]?.failure ?? "", /expected status 200, observed 404/);
  assert.equal(results[1]?.ok, false);
  assert.match(results[1]?.failure ?? "", /exceeds budget/);
});

test("non-loopback hosts are refused unless explicitly allowlisted", () => {
  assert.throws(() => assertProbeTarget("https://example.com/health"), /not loopback/);
  assert.throws(() => assertProbeTarget("ftp://127.0.0.1/x"), /http\(s\)/);
  const allowed = assertProbeTarget("https://app-staging.internal/health", ["app-staging.internal"]);
  assert.equal(allowed.hostname, "app-staging.internal");
});

test("an unreachable target is a failed observation, not a crash", async () => {
  const results = await runProbes([{ name: "dead", url: "http://127.0.0.1:1/health", timeoutMs: 500 }]);
  assert.equal(results[0]?.ok, false);
  assert.ok(results[0]?.failure);
});

test("probe results become evidence items for the Evidence Pack", async () => {
  const results = await runProbes([{ name: "health", url: `${base}/health` }, { name: "missing", url: `${base}/nope` }]);
  const items = toEvidenceItems(results);
  assert.equal(items[0]?.status, "observed");
  assert.equal(items[0]?.kind, "trace");
  assert.equal(items[1]?.status, "failed");
  assert.ok((items[0]?.metrics?.latencyMs ?? -1) >= 0);
});
