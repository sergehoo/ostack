import type {
  ConfidenceDimension,
  ConfidenceReport,
  ConfidenceSubScore,
  EvidenceItem
} from "./types.js";

const DIMENSIONS: ConfidenceDimension[] = [
  "requirements_understanding",
  "implementation_correctness",
  "test_strength",
  "security_assurance",
  "performance_assurance",
  "documentation_consistency",
  "rollback_readiness"
];

// A dimension claimed above this ceiling must be backed by passing evidence,
// otherwise its effective score is capped here. High confidence without proof
// is forbidden (§25, §36.6).
const UNSUPPORTED_CAP = 60;
const FAILED_CAP = 50;
const HIGH_CONFIDENCE_FLOOR = 70;

const SUPPORTING = new Set(["passed", "observed", "approved"]);
const FAILING = new Set(["failed", "rejected"]);

export function scoreConfidence(
  claims: Array<{ dimension: ConfidenceDimension; score: number }>,
  evidenceItems: EvidenceItem[]
): ConfidenceReport {
  const claimByDimension = new Map<ConfidenceDimension, number>();
  for (const claim of claims) claimByDimension.set(claim.dimension, clamp(claim.score));

  const uncertainty: string[] = [];
  const dimensions: ConfidenceSubScore[] = DIMENSIONS.map((dimension) => {
    const items = evidenceItems.filter((item) => item.dimension === dimension);
    const supporting = items.filter((item) => SUPPORTING.has(item.status));
    const failing = items.filter((item) => FAILING.has(item.status));
    const claimed = claimByDimension.get(dimension) ?? 0;

    if (!claimByDimension.has(dimension)) {
      uncertainty.push(`No confidence score was provided for ${dimension}`);
    }

    let effective = claimed;
    let note: string | undefined;
    const supported = supporting.length > 0;

    if (failing.length > 0) {
      effective = Math.min(effective, FAILED_CAP);
      note = `${failing.length} failing evidence item(s) cap this dimension at ${FAILED_CAP}`;
      uncertainty.push(`${dimension}: ${failing.map((item) => item.summary).join("; ")}`);
    } else if (!supported && claimed > UNSUPPORTED_CAP) {
      effective = UNSUPPORTED_CAP;
      note = `Claimed ${claimed} but no supporting evidence; capped at ${UNSUPPORTED_CAP}`;
      uncertainty.push(`${dimension} is not backed by executable evidence`);
    }

    const subScore: ConfidenceSubScore = {
      dimension,
      claimed,
      effective,
      supported,
      supportingEvidence: supporting.map((item) => item.id)
    };
    if (note !== undefined) subScore.note = note;
    return subScore;
  });

  const anyUnsupported = dimensions.some((dimension) => !dimension.supported);
  const average = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.effective, 0) / dimensions.length
  );
  const overall = anyUnsupported ? Math.min(average, HIGH_CONFIDENCE_FLOOR - 1) : average;

  return { dimensions, overall, uncertainty };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
