import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertGitOperationAllowed, assertScopeTransition, branchName, classifyRisk,
  commitMessage, decideMerge, evaluatePromotion, permittedActions, pullRequestBody,
  sanitizeEntry, serializeEntry, touchesProtectedPath,
  type Checks, type EvolutionProposal, type LedgerEntry
} from "../src/index.js";

const NOW = "2026-07-17T18:30:00Z";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    eventId: "EVL-1", timestamp: NOW, project: "bestepargne", taskId: "OST-42",
    experienceType: "bug-fix", outcome: "verified",
    lesson: "The parent must exist before submitting children.",
    scope: "technology:django", confidence: 0.94,
    evidence: [".ostack/reports/OST-42.md"], proposedResource: "patterns/api/parent-before-child.md",
    status: "CANDIDATE", ...overrides
  };
}

function proposal(overrides: Partial<EvolutionProposal> = {}): EvolutionProposal {
  return {
    evolutionId: "LES-2026-0012", taskId: "OST-42", title: "add idempotent installer verification",
    kind: "feat", scopeLabel: "skill", summary: "Ajout d'une compétence de vérification.",
    changedPaths: ["skills/cli/idempotent-installer-testing.md", "tests/skills/idempotent.test.ts"],
    evidencePack: ".ostack/reports/OST-42.md", confidence: 0.94, ...overrides
  };
}

function greenChecks(): Checks {
  return {
    evidencePack: true, testsPassed: true, securityPassed: true, lintPassed: true, buildPassed: true,
    signedCommit: true, noSecretsDetected: true, noPolicyViolations: true, independentVerification: true
  };
}

const POLICY = { enabled: true, allowedRiskLevels: ["low"] as const, confidenceMinimum: 0.92 };

test("ledger never stores secrets", () => {
  const { redactions } = sanitizeEntry(entry({ lesson: "utiliser token=sk-abcdefghijklmnop pour l'appel" }));
  assert.ok(redactions >= 1);
  assert.doesNotMatch(serializeEntry(entry({ lesson: "api_key=sk-verysecretvalue123" })), /sk-verysecretvalue123/);
});

test("forbidden git operations are rejected (no force push, no push to protected branches)", () => {
  assert.throws(() => assertGitOperationAllowed({ command: "push", branch: "feature", force: true }), /force/);
  assert.throws(() => assertGitOperationAllowed({ command: "push", branch: "main" }), /main/);
  assert.throws(() => assertGitOperationAllowed({ command: "push", branch: "develop" }), /develop/);
  assert.doesNotThrow(() => assertGitOperationAllowed({ command: "push", branch: "ostack/evolution/LES-1" }));
});

test("risk classification: docs/skills low, core/policies high, guardrails critical", () => {
  assert.equal(classifyRisk(["docs/x.md", "skills/a.md", "tests/b.test.ts"]), "low");
  assert.equal(classifyRisk(["framework/commands/new.md"]), "medium");
  assert.equal(classifyRisk(["packages/core/src/x.ts"]), "high");
  assert.equal(classifyRisk(["policies/evolution.json"]), "critical");
  assert.equal(classifyRisk(["skills/a.md", "packages/core/src/x.ts"]), "high", "worst path wins");
});

test("auto-merge only for low risk with all checks; never for core, never for guardrails (§32)", () => {
  const low = decideMerge(proposal(), greenChecks(), POLICY);
  assert.equal(low.decision, "AUTO_MERGE");
  assert.equal(low.autoMergeEligible, true);

  // a failing check downgrades to PR
  const failing = decideMerge(proposal(), { ...greenChecks(), testsPassed: false }, POLICY);
  assert.equal(failing.decision, "PULL_REQUEST");
  assert.ok(failing.reasons.some((r) => /tests/.test(r)));

  // high-risk core change requires a human
  const core = decideMerge(proposal({ changedPaths: ["packages/core/src/x.ts"] }), greenChecks(), POLICY);
  assert.equal(core.decision, "REQUIRE_HUMAN");

  // touching the evolution guardrails is always human, even with green checks (§32)
  const guardrail = decideMerge(proposal({ changedPaths: ["policies/evolution.json"] }), greenChecks(), POLICY);
  assert.equal(guardrail.decision, "REQUIRE_HUMAN");
  assert.ok(guardrail.reasons.some((r) => /garde-fous/.test(r)));
  assert.equal(touchesProtectedPath(["packages/evolution/src/git.ts"]), true);
});

test("low confidence blocks auto-merge even at low risk", () => {
  const decision = decideMerge(proposal({ confidence: 0.8 }), greenChecks(), POLICY);
  assert.equal(decision.decision, "PULL_REQUEST");
  assert.ok(decision.reasons.some((r) => /confiance/.test(r)));
});

test("promotion needs observations, reproduction, evidence, confidence; project never auto-universal", () => {
  const weak = evaluatePromotion("VALIDATED", { type: "technology", technology: "django" }, {
    observations: 1, distinctProjects: 1, reproduced: false, confidence: 0.7, hasEvidence: false, contradicted: false, independentVerification: false
  });
  assert.equal(weak.eligibleForPromotion, false);
  assert.ok(weak.blockers.length >= 3);

  const strong = evaluatePromotion("VALIDATED", { type: "technology", technology: "django" }, {
    observations: 3, distinctProjects: 2, reproduced: true, confidence: 0.95, hasEvidence: true, contradicted: false, independentVerification: true
  });
  assert.equal(strong.eligibleForPromotion, true);
  assert.equal(strong.next, "PROMOTED");

  const universalOneProject = evaluatePromotion("VALIDATED", { type: "universal" }, {
    observations: 3, distinctProjects: 1, reproduced: true, confidence: 0.99, hasEvidence: true, contradicted: false, independentVerification: true
  });
  assert.equal(universalOneProject.eligibleForPromotion, false, "universal needs several projects");

  assert.throws(() => assertScopeTransition({ type: "project" }, { type: "universal" }), /universelle/);
  assert.throws(() => assertScopeTransition({ type: "domain", domain: "elearning" }, { type: "technology" }), /standards techniques/);
});

test("a contradiction blocks promotion", () => {
  const decision = evaluatePromotion("VALIDATED", { type: "technology" }, {
    observations: 5, distinctProjects: 3, reproduced: true, confidence: 0.99, hasEvidence: true, contradicted: true, independentVerification: true
  });
  assert.equal(decision.eligibleForPromotion, false);
  assert.ok(decision.blockers.some((b) => /contradiction/.test(b)));
});

test("commit message carries conventional header + OStack trailers; branch and PR are well-formed", () => {
  const message = commitMessage(proposal());
  assert.match(message, /^feat\(skill\): add idempotent installer verification/);
  assert.match(message, /OStack-Evolution-ID: LES-2026-0012/);
  assert.match(message, /Confidence: 94/);
  assert.equal(branchName(proposal()), "ostack/evolution/les-2026-0012");
  assert.match(pullRequestBody(proposal(), decideMerge(proposal(), greenChecks(), POLICY)), /AUTO_MERGE/);
});

test("autonomy levels gate the permitted git actions (§14/§31)", () => {
  assert.deepEqual(permittedActions("observe"), ["collect_experience", "extract_lessons"]);
  assert.ok(!permittedActions("pull-request").includes("auto_merge_low_risk"));
  assert.ok(permittedActions("controlled-auto-merge").includes("auto_merge_low_risk"));
});
