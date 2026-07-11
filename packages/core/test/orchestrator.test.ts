import test from "node:test";
import assert from "node:assert/strict";
import { AgentOrchestrator } from "../src/orchestrator.js";
import { EventBus } from "../src/events.js";
import type { AgentDefinition } from "../src/types.js";

const agents: AgentDefinition[] = [
  { id: "security", name: "Security Auditor", category: "security", role: "security audit", responsibilities: ["security testing"], limits: ["no write"], tools: ["scan"], qualityCriteria: ["evidence"], outputFormat: "markdown", defaultSecurityLevel: 1 },
  { id: "writer", name: "Writer", category: "documentation", role: "documentation", responsibilities: ["write guides"], limits: ["no deploy"], tools: ["read"], qualityCriteria: ["clarity"], outputFormat: "markdown", defaultSecurityLevel: 1 }
];

test("orchestrator selects agents from required capabilities", () => {
  const orchestrator = new AgentOrchestrator(agents, { run: async () => { throw new Error("unused"); } }, new EventBus());
  assert.deepEqual(orchestrator.select({ id: "t", objective: "audit", context: {}, requiredCapabilities: ["security"], securityLevel: 1 }).map((agent) => agent.id), ["security"]);
});
