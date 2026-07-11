export type SecurityLevel = 1 | 2 | 3 | 4;
export type RunStatus = "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";

export interface Actor {
  id: string;
  kind: "human" | "agent" | "system";
  roles: string[];
}

export interface ActionRequest {
  id: string;
  action: string;
  level: SecurityLevel;
  actor: Actor;
  projectId: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

export interface Approval {
  requestId: string;
  approver: Actor;
  approvedAt: string;
  reason: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  category: string;
  role: string;
  responsibilities: string[];
  limits: string[];
  tools: string[];
  qualityCriteria: string[];
  outputFormat: string;
  defaultSecurityLevel: SecurityLevel;
}

export interface AgentTask {
  id: string;
  objective: string;
  context: Record<string, unknown>;
  requiredCapabilities: string[];
  securityLevel: SecurityLevel;
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  summary: string;
  findings: Array<{ severity: "info" | "low" | "medium" | "high" | "critical"; message: string }>;
  artifacts: Array<{ kind: string; uri: string }>;
  confidence: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  agent?: string;
  command?: string;
  needs?: string[];
  securityLevel: SecurityLevel;
  humanApproval?: "always" | "on-risk" | "never";
  continueOnError?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  projectId: string;
  status: RunStatus;
  startedAt: string;
  completedSteps: string[];
  outputs: Record<string, unknown>;
  updatedAt?: string;
  pendingApprovalRequestId?: string;
}

export interface RunRepository {
  save(run: WorkflowRun): Promise<void>;
  get(id: string): Promise<WorkflowRun | undefined>;
  list(projectId: string, limit?: number): Promise<WorkflowRun[]>;
}

export interface ModelRequest {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  content: string;
  model: string;
  provider: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
