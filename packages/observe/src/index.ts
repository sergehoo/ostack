// OStack Runtime Observation (§22) — confirm that the RUNNING application
// matches what the specification, tests and twin claim. Probes are defensive
// and scoped: loopback only by default; any other host must be explicitly
// allowlisted by the project configuration, never by an agent (§17, §36.3).

import { performance } from "node:perf_hooks";
import type { EvidenceItem } from "@ostack/evidence";

export interface Probe {
  name: string;
  url: string;
  method?: "GET" | "HEAD";
  expectStatus?: number;
  maxLatencyMs?: number;
  timeoutMs?: number;
}

export interface ProbeResult {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  failure?: string;
}

export interface ObserveOptions {
  allowedHosts?: string[];
  fetchImpl?: typeof fetch;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertProbeTarget(url: string, allowedHosts: string[] = []): URL {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid probe URL: ${url}`); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`Probe protocol must be http(s): ${url}`);
  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK.has(host) && !allowedHosts.map((item) => item.toLowerCase()).includes(host)) {
    throw new Error(`Probe host '${host}' is not loopback and not in the project's allowed hosts`);
  }
  return parsed;
}

export async function runProbes(probes: Probe[], options: ObserveOptions = {}): Promise<ProbeResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    assertProbeTarget(probe.url, options.allowedHosts);
    const started = performance.now();
    try {
      const response = await fetchImpl(probe.url, {
        method: probe.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(probe.timeoutMs ?? 5000)
      });
      const latencyMs = Math.round(performance.now() - started);
      const expected = probe.expectStatus ?? 200;
      const statusOk = response.status === expected;
      const latencyOk = probe.maxLatencyMs === undefined || latencyMs <= probe.maxLatencyMs;
      const result: ProbeResult = { name: probe.name, url: probe.url, ok: statusOk && latencyOk, status: response.status, latencyMs };
      if (!statusOk) result.failure = `expected status ${expected}, observed ${response.status}`;
      else if (!latencyOk) result.failure = `latency ${latencyMs}ms exceeds budget ${probe.maxLatencyMs}ms`;
      results.push(result);
    } catch (error) {
      results.push({
        name: probe.name, url: probe.url, ok: false,
        latencyMs: Math.round(performance.now() - started),
        failure: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

// Observed behavior becomes first-class evidence: probe results feed the same
// Evidence Pack as tests, so "it runs" is proven, not asserted.
export function toEvidenceItems(results: ProbeResult[]): EvidenceItem[] {
  return results.map((result) => ({
    id: `observe:${result.name}`,
    kind: "trace",
    dimension: "implementation_correctness",
    status: result.ok ? "observed" : "failed",
    summary: result.ok
      ? `Probe '${result.name}' ${result.status} in ${result.latencyMs}ms`
      : `Probe '${result.name}' failed: ${result.failure ?? "unknown"}`,
    uri: result.url,
    ...(result.latencyMs !== undefined ? { metrics: { latencyMs: result.latencyMs } } : {})
  }));
}
export * from "./performance.js";
