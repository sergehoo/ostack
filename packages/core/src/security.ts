import type { ActionRequest, Approval, SecurityLevel } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  level: SecurityLevel;
}

export class PermissionEngine {
  evaluate(request: ActionRequest, approval?: Approval): PolicyDecision {
    if (request.level === 4) {
      const valid = approval?.requestId === request.id && approval.approver.kind === "human";
      return {
        allowed: valid,
        requiresApproval: true,
        reason: valid ? "Explicit human production approval verified" : "Production actions always require explicit human approval",
        level: 4
      };
    }

    if (request.level === 3) {
      const valid = approval?.requestId === request.id && approval.approver.kind === "human";
      return {
        allowed: valid,
        requiresApproval: true,
        reason: valid ? "Human approval verified" : "Sensitive action requires human approval",
        level: 3
      };
    }

    if (request.level === 2 && request.actor.kind === "agent" && !request.actor.roles.includes("local-writer")) {
      return { allowed: false, requiresApproval: false, reason: "Agent lacks local-writer role", level: 2 };
    }

    return { allowed: true, requiresApproval: false, reason: request.level === 1 ? "Read-only action" : "Authorized local modification", level: request.level };
  }

  assert(request: ActionRequest, approval?: Approval): void {
    const decision = this.evaluate(request, approval);
    if (!decision.allowed) throw new PolicyDeniedError(request, decision);
  }
}

export class PolicyDeniedError extends Error {
  constructor(public readonly request: ActionRequest, public readonly decision: PolicyDecision) {
    super(decision.reason);
    this.name = "PolicyDeniedError";
  }
}
