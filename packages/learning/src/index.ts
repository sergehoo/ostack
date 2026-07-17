// OStack Institutional Learning — automatic knowledge growth (§24).
// The knowledge base grows PROGRESSIVELY from what actually happened: commands
// run (audit log), evidence produced, deliberations, decisions and the
// projects OStack takes part in. Anti-hallucination by construction: every
// lesson is a FACTUAL AGGREGATION traceable to sources, with an occurrence
// count and the set of projects it was seen in — never invented advice. Merging
// is deterministic (dedupe by signature, sum occurrences), so re-observing the
// same artifacts twice never inflates the base. Secret-free: free text is
// redacted before storage.

import { redactSecrets } from "@ostack/decisions";
import type { EvidencePack } from "@ostack/evidence";

export type LessonKind =
  | "usage"
  | "residual_risk"
  | "blocking_challenge"
  | "recurring_invariant"
  | "reference";

export interface Lesson {
  id: string;
  kind: LessonKind;
  key: string;
  statement: string;
  occurrences: number;
  projects: string[];
  sources: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface KnowledgeBase {
  schemaVersion: 1;
  lessons: Lesson[];
}

export interface AuditLine {
  timestamp?: string;
  actorId?: string;
  action?: string;
  outcome?: string;
  projectId?: string;
  details?: Record<string, unknown>;
}

export interface ObserveInput {
  project: string;
  now: string;
  auditLines?: AuditLine[];
  evidencePacks?: EvidencePack[];
  deliberations?: Array<{ challenges?: Array<{ message?: string; blocking?: boolean }> }>;
  intents?: Array<{ invariants?: Array<{ statement?: string; kind?: string }> }>;
}

export function emptyBase(): KnowledgeBase {
  return { schemaVersion: 1, lessons: [] };
}

// Derives factual lessons from a batch of real artifacts. Each lesson is an
// aggregation with a stable signature so it accumulates rather than duplicates.
export function deriveLessons(input: ObserveInput): Array<Omit<Lesson, "id" | "occurrences" | "projects" | "firstSeen" | "lastSeen"> & { count: number }> {
  const derived: Array<Omit<Lesson, "id" | "occurrences" | "projects" | "firstSeen" | "lastSeen"> & { count: number }> = [];

  // Command usage: per action, how many succeeded vs denied.
  const usage = new Map<string, { total: number; denied: number }>();
  for (const line of input.auditLines ?? []) {
    if (!line.action) continue;
    const entry = usage.get(line.action) ?? { total: 0, denied: 0 };
    entry.total += 1;
    if (line.outcome === "denied" || line.outcome === "failed") entry.denied += 1;
    usage.set(line.action, entry);
  }
  for (const [action, entry] of usage) {
    derived.push({
      kind: "usage", key: action, count: entry.total,
      statement: `Action '${action}' exécutée ${entry.total} fois (${entry.denied} refus/échec)`,
      sources: ["audit.jsonl"]
    });
  }

  // Recurring residual risks across evidence packs.
  for (const pack of input.evidencePacks ?? []) {
    for (const risk of pack.residualRisks ?? []) {
      derived.push({
        kind: "residual_risk", key: normalize(risk.description),
        count: 1,
        statement: `Risque résiduel récurrent [${risk.severity}]: ${clip(risk.description)}`,
        sources: [`evidence:${pack.taskId}`]
      });
    }
  }

  // Recurring blocking challenges from deliberations.
  for (const record of input.deliberations ?? []) {
    for (const challenge of record.challenges ?? []) {
      if (!challenge.blocking || !challenge.message) continue;
      derived.push({
        kind: "blocking_challenge", key: normalize(challenge.message).slice(0, 80),
        count: 1,
        statement: `Défi bloquant récurrent: ${clip(challenge.message)}`,
        sources: ["deliberations"]
      });
    }
  }

  // Recurring invariants across compiled intents.
  for (const intent of input.intents ?? []) {
    for (const invariant of intent.invariants ?? []) {
      if (!invariant.statement) continue;
      derived.push({
        kind: "recurring_invariant", key: normalize(invariant.statement),
        count: 1,
        statement: `Invariant récurrent [${invariant.kind ?? "?"}]: ${clip(invariant.statement)}`,
        sources: ["intents"]
      });
    }
  }

  return derived;
}

// Deterministic merge: same (kind,key) → accumulate occurrences, union projects
// and sources, extend the time window. Never duplicates.
export function mergeLessons(base: KnowledgeBase, derived: ReturnType<typeof deriveLessons>, project: string, now: string): KnowledgeBase {
  const index = new Map(base.lessons.map((lesson) => [`${lesson.kind}${lesson.key}`, lesson]));
  for (const item of derived) {
    const signature = `${item.kind}${item.key}`;
    const clean = redactSecrets(item.statement).text;
    const existing = index.get(signature);
    if (existing) {
      existing.occurrences += item.count;
      existing.statement = clean;
      existing.lastSeen = now;
      if (!existing.projects.includes(project)) existing.projects.push(project);
      for (const source of item.sources) if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      const lesson: Lesson = {
        id: signature.replace(/[^a-z0-9]+/gi, "-").slice(0, 96),
        kind: item.kind, key: item.key, statement: clean,
        occurrences: item.count, projects: [project], sources: [...new Set(item.sources)],
        firstSeen: now, lastSeen: now
      };
      base.lessons.push(lesson);
      index.set(signature, lesson);
    }
  }
  base.lessons.sort((a, b) => b.occurrences - a.occurrences || a.id.localeCompare(b.id));
  return base;
}

// A user- or research-provided lesson (e.g. a finding with its source URL).
// Enters sourced and factual; secrets redacted.
export function recordReference(base: KnowledgeBase, statement: string, sources: string[], project: string, now: string): KnowledgeBase {
  if (!statement.trim()) throw new Error("Une référence exige un énoncé");
  if (sources.length === 0) throw new Error("Une référence exige au moins une source (§33.2: aucune connaissance sans source)");
  return mergeLessons(base, [{ kind: "reference", key: normalize(statement), count: 1, statement, sources }], project, now);
}

export interface Recall {
  lesson: Lesson;
  score: number;
  matchedTerms: string[];
}

// Before proposing a solution, recall accumulated facts (§24). Lexical, ranked
// by term match then by occurrences (a lesson seen often across projects ranks
// higher). Explainable via matched terms.
export function recall(base: KnowledgeBase, query: string, limit = 10): Recall[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const results: Recall[] = [];
  for (const lesson of base.lessons) {
    const haystack = tokenize(`${lesson.statement} ${lesson.key} ${lesson.kind}`);
    const matched = terms.filter((term) => haystack.includes(term));
    if (matched.length > 0) results.push({ lesson, score: matched.length, matchedTerms: [...new Set(matched)].sort() });
  }
  return results
    .sort((a, b) => b.score - a.score || b.lesson.occurrences - a.lesson.occurrences || a.lesson.id.localeCompare(b.lesson.id))
    .slice(0, limit);
}

export function summarize(base: KnowledgeBase): Record<string, number> {
  const byKind: Record<string, number> = {};
  for (const lesson of base.lessons) byKind[lesson.kind] = (byKind[lesson.kind] ?? 0) + 1;
  return { lessons: base.lessons.length, ...byKind };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function clip(value: string): string {
  return value.length > 200 ? `${value.slice(0, 197)}…` : value;
}
