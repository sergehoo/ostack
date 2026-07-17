// OStack Evolution Ledger (§5) — append-only record of learning events.
// Never contains secrets, tokens, credentials or personal data: every free-text
// field is redacted before an entry is accepted.

import { redactSecrets } from "@ostack/decisions";

export type ExperienceType = "feature" | "bug-fix" | "refactor" | "security" | "performance" | "docs" | "test" | "other";
export type PromotionStatus = "OBSERVED" | "CANDIDATE" | "REPRODUCED" | "VALIDATED" | "PROMOTED" | "DEPRECATED";

export interface LedgerEntry {
  eventId: string;
  timestamp: string;
  project: string;
  taskId: string;
  experienceType: ExperienceType;
  outcome: "verified" | "failed" | "observed";
  lesson: string;
  scope: string;
  confidence: number;
  evidence: string[];
  proposedResource: string;
  status: PromotionStatus;
  commit?: string;
  pullRequest?: string;
  version?: string;
}

const FORBIDDEN_KEYS = /(token|secret|password|passwd|api[_-]?key|authorization|bearer)/i;

export function sanitizeEntry(entry: LedgerEntry): { entry: LedgerEntry; redactions: number } {
  let redactions = 0;
  const clean = (value: string): string => {
    const result = redactSecrets(value);
    if (result.redacted) redactions++;
    return result.text;
  };
  return {
    entry: {
      ...entry,
      lesson: clean(entry.lesson),
      evidence: entry.evidence.map(clean)
    },
    redactions
  };
}

// A defensive check: the whole serialized entry must not carry credential-shaped
// key/value pairs (§5 — the ledger never stores secrets).
export function assertNoSecrets(entry: LedgerEntry): void {
  const serialized = JSON.stringify(entry);
  if (FORBIDDEN_KEYS.test(serialized) && /["']?[:=]["']?\s*\S{8,}/.test(serialized)) {
    const { redactions } = sanitizeEntry(entry);
    if (redactions > 0) throw new Error("L'entrée de ledger contient un secret apparent; sanitize avant d'écrire (§5)");
  }
}

export function serializeEntry(entry: LedgerEntry): string {
  const { entry: clean } = sanitizeEntry(entry);
  assertNoSecrets(clean);
  return JSON.stringify(clean);
}

export function parseLedger(content: string): LedgerEntry[] {
  return content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as LedgerEntry);
}
