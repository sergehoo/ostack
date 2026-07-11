import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOperationAuthorized, validateAuthorization, type SecurityAuthorization } from "../src/index.js";

function manifest(overrides: Partial<SecurityAuthorization> = {}): SecurityAuthorization {
  return {
    schemaVersion: 1,
    authorizationId: "AUTH-2026-001",
    owner: "Organisation concernée",
    environment: "isolated-staging",
    allowedTargets: ["app-staging.internal"],
    forbiddenTargets: ["production", "third-party-services"],
    allowedTestCategories: ["authentication_validation", "authorization_validation", "input_validation", "dependency_analysis"],
    startAt: "2026-07-15T08:00:00Z",
    expiresAt: "2026-07-15T18:00:00Z",
    approvedBy: ["security_manager"],
    emergencyContact: "secops@example.org",
    ...overrides
  };
}

test("a complete manifest validates; missing approvals or targets do not", () => {
  assert.deepEqual(validateAuthorization(manifest()), []);
  assert.ok(validateAuthorization(manifest({ approvedBy: [] })).some((issue) => issue.field === "approvedBy"));
  assert.ok(validateAuthorization(manifest({ allowedTargets: [] })).some((issue) => issue.field === "allowedTargets"));
  assert.ok(validateAuthorization(manifest({ expiresAt: "2026-07-15T07:00:00Z" })).some((issue) => issue.message.includes("after startAt")));
});

test("production can never be an allowed target and windows are capped at 30 days", () => {
  assert.ok(validateAuthorization(manifest({ allowedTargets: ["production"] })).some((issue) => issue.message.includes("production")));
  assert.ok(validateAuthorization(manifest({ allowedTargets: ["api.prod.example.com"] })).some((issue) => issue.message.includes("production")));
  assert.ok(validateAuthorization(manifest({ expiresAt: "2026-09-15T08:00:00Z" })).some((issue) => issue.message.includes("30 days")));
});

test("an operation inside scope, window and categories is authorized", () => {
  assertOperationAuthorized(manifest(), {
    target: "app-staging.internal",
    category: "authorization_validation",
    at: "2026-07-15T10:00:00Z"
  });
  // subdomain of an allowed scope is covered
  assertOperationAuthorized(manifest(), {
    target: "api.app-staging.internal",
    category: "input_validation",
    at: "2026-07-15T10:00:00Z"
  });
});

test("out-of-scope target, forbidden target, expired window and unlisted category are refused", () => {
  assert.throws(() => assertOperationAuthorized(manifest(), { target: "other-app.internal", category: "input_validation", at: "2026-07-15T10:00:00Z" }), /not in the allowed scope/);
  assert.throws(() => assertOperationAuthorized(manifest({ allowedTargets: ["app-staging.internal", "x.internal"], forbiddenTargets: ["x.internal"] }), { target: "x.internal", category: "input_validation", at: "2026-07-15T10:00:00Z" }), /invalid/);
  assert.throws(() => assertOperationAuthorized(manifest(), { target: "app-staging.internal", category: "input_validation", at: "2026-07-16T10:00:00Z" }), /expired/);
  assert.throws(() => assertOperationAuthorized(manifest(), { target: "app-staging.internal", category: "input_validation", at: "2026-07-15T07:00:00Z" }), /not active yet/);
  assert.throws(() => assertOperationAuthorized(manifest(), { target: "app-staging.internal", category: "business_abuse_simulation", at: "2026-07-15T10:00:00Z" }), /not authorized/);
  // forbidden wins even inside an allowed scope
  assert.throws(() => assertOperationAuthorized(manifest({ forbiddenTargets: ["db.app-staging.internal"] }), { target: "db.app-staging.internal", category: "input_validation", at: "2026-07-15T10:00:00Z" }), /explicitly forbidden/);
});

test("a lookalike suffix does not slip through target matching", () => {
  assert.throws(() => assertOperationAuthorized(manifest(), { target: "evilapp-staging.internal", category: "input_validation", at: "2026-07-15T10:00:00Z" }), /not in the allowed scope/);
});
