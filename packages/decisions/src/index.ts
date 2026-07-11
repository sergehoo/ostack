// OStack Institutional Learning (§24) — a memory of engineering decisions:
// problem, options tried, outcome, chosen solution, why, and when it may be
// reused. Versioned, explainable, deletable, secret-free by construction: any
// credential-looking content is redacted before a record is accepted.

export interface TriedOption {
  option: string;
  result: string;
}

export interface DecisionRecord {
  schemaVersion: 1;
  id: string;
  problem: string;
  context: string;
  optionsTried: TriedOption[];
  chosenSolution: string;
  reason: string;
  reuseConditions: string[];
  tags: string[];
  tests?: string[];
  incidentId?: string;
  recordedBy: string;
  recordedAt: string;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
  [/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED TOKEN]"],
  [/\b(api[_-]?key|token|secret|password|passwd)\b\s*[:=]\s*["']?[^\s"']+["']?/gi, "$1=[REDACTED]"]
];

export function redactSecrets(value: string): { text: string; redacted: boolean } {
  let text = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
  return { text, redacted: text !== value };
}

export function sanitizeRecord(record: DecisionRecord): { record: DecisionRecord; redactions: number } {
  let redactions = 0;
  const clean = (value: string): string => {
    const result = redactSecrets(value);
    if (result.redacted) redactions++;
    return result.text;
  };
  return {
    record: {
      ...record,
      problem: clean(record.problem),
      context: clean(record.context),
      chosenSolution: clean(record.chosenSolution),
      reason: clean(record.reason),
      optionsTried: record.optionsTried.map((option) => ({ option: clean(option.option), result: clean(option.result) })),
      reuseConditions: record.reuseConditions.map(clean)
    },
    redactions
  };
}

export interface DecisionMatch {
  record: DecisionRecord;
  score: number;
  matchedTerms: string[];
}

// Lexical search: before proposing a solution, look for similar decisions,
// known failures and prior fixes (§24). Deterministic ranking, explainable
// through the matched terms.
export function searchDecisions(records: DecisionRecord[], query: string, limit = 10): DecisionMatch[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const matches: DecisionMatch[] = [];
  for (const record of records) {
    const haystackWeighted: Array<[string, number]> = [
      [record.problem, 3],
      [record.tags.join(" "), 3],
      [record.chosenSolution, 2],
      [record.reason, 2],
      [record.context, 1],
      [record.optionsTried.map((option) => `${option.option} ${option.result}`).join(" "), 1],
      [record.reuseConditions.join(" "), 1]
    ];
    let score = 0;
    const matched = new Set<string>();
    for (const term of terms) {
      for (const [text, weight] of haystackWeighted) {
        if (tokenize(text).includes(term)) {
          score += weight;
          matched.add(term);
        }
      }
    }
    if (matched.size > 0) matches.push({ record, score, matchedTerms: [...matched].sort() });
  }
  return matches
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
    .slice(0, limit);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}
