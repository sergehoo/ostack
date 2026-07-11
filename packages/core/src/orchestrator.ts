import type { AgentDefinition, AgentResult, AgentTask, ModelProvider } from "./types.js";
import { createEvent, EventBus } from "./events.js";

export interface AgentRunner {
  run(agent: AgentDefinition, task: AgentTask, provider: ModelProvider): Promise<AgentResult>;
}

export class DefaultAgentRunner implements AgentRunner {
  async run(agent: AgentDefinition, task: AgentTask, provider: ModelProvider): Promise<AgentResult> {
    const response = await provider.complete({
      system: `You are ${agent.name}. Role: ${agent.role}. Limits: ${agent.limits.join("; ")}. Output: ${agent.outputFormat}`,
      messages: [{ role: "user", content: `${task.objective}\nContext: ${JSON.stringify(task.context)}` }],
      metadata: { agentId: agent.id, taskId: task.id }
    });
    return { agentId: agent.id, taskId: task.id, summary: response.content, findings: [], artifacts: [], confidence: 0.7 };
  }
}

export class AgentOrchestrator {
  constructor(
    private readonly agents: AgentDefinition[],
    private readonly runner: AgentRunner,
    private readonly events: EventBus
  ) {}

  select(task: AgentTask): AgentDefinition[] {
    const terms = new Set(task.requiredCapabilities.map((item) => item.toLowerCase()));
    const ranked = this.agents.map((agent) => ({
      agent,
      score: [agent.category, agent.role, ...agent.responsibilities, ...agent.tools]
        .flatMap((value) => value.toLowerCase().split(/\W+/))
        .filter((value) => terms.has(value)).length
    })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    return ranked.slice(0, 3).map(({ agent }) => agent);
  }

  async execute(task: AgentTask, provider: ModelProvider): Promise<AgentResult[]> {
    const selected = this.select(task);
    if (selected.length === 0) throw new Error("No qualified agent found for task");
    await this.events.publish(createEvent("orchestration.started", "core", { taskId: task.id, agents: selected.map((a) => a.id) }, task.id));
    const results = await Promise.all(selected.map((agent) => this.runner.run(agent, task, provider)));
    await this.events.publish(createEvent("orchestration.completed", "core", { taskId: task.id, resultCount: results.length }, task.id));
    return results;
  }

  aggregate(results: AgentResult[]): { summary: string; conflicts: string[]; confidence: number } {
    const severities = results.flatMap((result) => result.findings).filter((finding) => finding.severity === "critical");
    return {
      summary: results.map((result) => `[${result.agentId}] ${result.summary}`).join("\n\n"),
      conflicts: severities.length > 1 ? ["Multiple critical findings require human arbitration"] : [],
      confidence: results.length ? results.reduce((sum, result) => sum + result.confidence, 0) / results.length : 0
    };
  }
}
