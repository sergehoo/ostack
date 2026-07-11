import type { DefinitionOfDoneGates, DefinitionOfDoneResult, DefinitionOfDoneStatus } from "./types.js";

// Evaluates a configurable, executable Definition of Done (§26). The status ladder
// only advances when every gate at a lower rung holds; zero-tolerance security
// escapes reject the task outright.
export function evaluateDefinitionOfDone(gates: DefinitionOfDoneGates): DefinitionOfDoneResult {
  const unmet: string[] = [];
  const track = (name: string, ok: boolean): boolean => {
    if (!ok) unmet.push(name);
    return ok;
  };

  const baseReady =
    track("requirements_accepted", gates.requirementsAccepted) &&
    track("invariants_defined", gates.invariantsDefined);

  const implementationDone =
    [
      track("lint_passed", gates.lintPassed),
      track("typecheck_passed", gates.typecheckPassed),
      track("build_passed", gates.buildPassed)
    ].every(Boolean) && baseReady;

  const testsDone =
    [
      track("unit_tests_passed", gates.unitTestsPassed),
      track("integration_tests_passed", gates.integrationTestsPassed),
      track("functional_tests_passed", gates.functionalTestsPassed),
      track("e2e_tests_passed", gates.e2eTestsPassed),
      track("permission_tests_passed", gates.permissionTestsPassed)
    ].every(Boolean) && implementationDone;

  const documentationConsistent =
    track("documentation_updated", gates.documentationUpdated) &&
    track("documentation_drift_absent", !gates.documentationDriftDetected);

  const verified =
    [
      track("threat_model_updated", gates.threatModelUpdated),
      track("performance_within_budget", gates.performanceWithinBudget),
      documentationConsistent,
      track("rollback_defined", gates.rollbackDefined),
      track("evidence_pack_generated", gates.evidencePackGenerated)
    ].every(Boolean) && testsDone;

  const approved = track("human_approved", gates.humanApproved) && verified;
  const released = gates.released && approved;

  const rejectionReasons: string[] = [];
  if (gates.criticalFindings > 0) rejectionReasons.push(`${gates.criticalFindings} critical security finding(s)`);
  if (gates.highFindings > 0) rejectionReasons.push(`${gates.highFindings} high security finding(s)`);
  const rejected = rejectionReasons.length > 0;

  let status: DefinitionOfDoneStatus;
  if (rejected) status = "REJECTED";
  else if (released) status = "RELEASED";
  else if (approved) status = "APPROVED";
  else if (verified) status = "VERIFIED";
  else if (testsDone) status = "TESTED";
  else if (implementationDone) status = "IMPLEMENTED";
  else status = "DRAFT";

  return { status, unmet, rejected, rejectionReasons };
}
