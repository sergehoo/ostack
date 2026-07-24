// OStack Authorized Security Lab (§15) — the authorization gate every active
// security operation must pass BEFORE it runs. Strictly defensive: this module
// contains no offensive capability; it only decides whether a declared,
// approved, time-boxed manifest covers a requested operation. Forbidden
// targets always win over allowed ones, and outside the window nothing runs.

export const TEST_CATEGORIES = [
  "authentication_validation",
  "authorization_validation",
  "input_validation",
  "session_validation",
  "dependency_analysis",
  "configuration_review",
  "header_inspection",
  "business_abuse_simulation",
  "patch_validation"
] as const;

export type TestCategory = (typeof TEST_CATEGORIES)[number];

export interface SecurityAuthorization {
  schemaVersion: 1;
  authorizationId: string;
  owner: string;
  environment: string;
  allowedTargets: string[];
  forbiddenTargets: string[];
  allowedTestCategories: TestCategory[];
  startAt: string;
  expiresAt: string;
  approvedBy: string[];
  emergencyContact: string;
  maxRequestsPerSecond?: number;
  // §5 hardening: categories that are forbidden even if someone lists them as
  // allowed (forbidden always wins), and hard test limits.
  forbiddenTestCategories?: TestCategory[];
  limits?: {
    maxRequestsPerSecond?: number;
    maxTestDurationMinutes?: number;
  };
}

export interface AuthorizationIssue {
  field: string;
  message: string;
}

export function validateAuthorization(manifest: SecurityAuthorization): AuthorizationIssue[] {
  const issues: AuthorizationIssue[] = [];
  const requireText = (field: keyof SecurityAuthorization) => {
    const value = manifest[field];
    if (typeof value !== "string" || value.trim().length === 0) issues.push({ field, message: "required" });
  };
  requireText("authorizationId");
  requireText("owner");
  requireText("environment");
  requireText("emergencyContact");

  if (manifest.allowedTargets.length === 0) issues.push({ field: "allowedTargets", message: "at least one explicitly allowed target is required" });
  if (manifest.approvedBy.length === 0) issues.push({ field: "approvedBy", message: "at least one named approver is required" });
  if (manifest.allowedTestCategories.length === 0) issues.push({ field: "allowedTestCategories", message: "at least one test category is required" });
  for (const category of manifest.allowedTestCategories) {
    if (!TEST_CATEGORIES.includes(category)) issues.push({ field: "allowedTestCategories", message: `unknown category '${category}'` });
  }
  const forbiddenCategories = new Set(manifest.forbiddenTestCategories ?? []);
  for (const category of manifest.allowedTestCategories) {
    if (forbiddenCategories.has(category)) issues.push({ field: "allowedTestCategories", message: `'${category}' is both allowed and forbidden; forbidden wins, remove it from allowed` });
  }
  const maxRps = manifest.limits?.maxRequestsPerSecond ?? manifest.maxRequestsPerSecond;
  if (maxRps !== undefined && (!Number.isFinite(maxRps) || maxRps <= 0)) issues.push({ field: "limits.maxRequestsPerSecond", message: "must be a positive number" });
  const maxDuration = manifest.limits?.maxTestDurationMinutes;
  if (maxDuration !== undefined && (!Number.isFinite(maxDuration) || maxDuration <= 0)) issues.push({ field: "limits.maxTestDurationMinutes", message: "must be a positive number" });

  const start = Date.parse(manifest.startAt);
  const end = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(start)) issues.push({ field: "startAt", message: "must be an ISO-8601 date" });
  if (!Number.isFinite(end)) issues.push({ field: "expiresAt", message: "must be an ISO-8601 date" });
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) issues.push({ field: "expiresAt", message: "must be after startAt" });
  if (Number.isFinite(start) && Number.isFinite(end) && end - start > 30 * 24 * 3600 * 1000) {
    issues.push({ field: "expiresAt", message: "authorization window exceeds 30 days; issue a shorter, renewable authorization" });
  }

  const forbidden = new Set(manifest.forbiddenTargets.map(normalizeTarget));
  for (const target of manifest.allowedTargets) {
    if (forbidden.has(normalizeTarget(target))) issues.push({ field: "allowedTargets", message: `'${target}' is both allowed and forbidden; forbidden wins, remove the ambiguity` });
  }
  if (manifest.allowedTargets.some((target) => normalizeTarget(target) === "production" || /(^|\.)prod(uction)?($|\.)/.test(normalizeTarget(target)))) {
    issues.push({ field: "allowedTargets", message: "production targets cannot be authorized through the lab" });
  }
  return issues;
}

export interface OperationRequest {
  target: string;
  category: TestCategory;
  at: string;
}

// Throws unless the manifest explicitly covers the operation (§36.3).
export function assertOperationAuthorized(manifest: SecurityAuthorization, operation: OperationRequest): void {
  const issues = validateAuthorization(manifest);
  if (issues.length > 0) {
    throw new Error(`Authorization manifest is invalid: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`);
  }
  const at = Date.parse(operation.at);
  if (!Number.isFinite(at)) throw new Error("Operation timestamp must be an ISO-8601 date");
  if (at < Date.parse(manifest.startAt)) throw new Error(`Authorization ${manifest.authorizationId} is not active yet (starts ${manifest.startAt})`);
  if (at > Date.parse(manifest.expiresAt)) throw new Error(`Authorization ${manifest.authorizationId} expired at ${manifest.expiresAt}`);

  const target = normalizeTarget(operation.target);
  if (manifest.forbiddenTargets.some((item) => matchesTarget(target, normalizeTarget(item)))) {
    throw new Error(`Target '${operation.target}' is explicitly forbidden by ${manifest.authorizationId}`);
  }
  if (!manifest.allowedTargets.some((item) => matchesTarget(target, normalizeTarget(item)))) {
    throw new Error(`Target '${operation.target}' is not in the allowed scope of ${manifest.authorizationId}`);
  }
  if ((manifest.forbiddenTestCategories ?? []).includes(operation.category)) {
    throw new Error(`Test category '${operation.category}' is explicitly forbidden by ${manifest.authorizationId}`);
  }
  if (!manifest.allowedTestCategories.includes(operation.category)) {
    throw new Error(`Test category '${operation.category}' is not authorized by ${manifest.authorizationId}`);
  }
}

function normalizeTarget(value: string): string {
  return value.trim().toLowerCase();
}

// 'app-staging.internal' covers itself and its subdomains, nothing else.
function matchesTarget(target: string, scope: string): boolean {
  return target === scope || target.endsWith(`.${scope}`);
}
