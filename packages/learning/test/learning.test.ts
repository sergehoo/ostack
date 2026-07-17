import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveLessons, emptyBase, mergeLessons, recall, recordReference, summarize, type ObserveInput } from "../src/index.js";

const NOW = "2026-07-17T12:00:00Z";
const LATER = "2026-07-18T12:00:00Z";

function input(overrides: Partial<ObserveInput> = {}): ObserveInput {
  return {
    project: "urapap", now: NOW,
    auditLines: [
      { action: "intent.compile", outcome: "succeeded" },
      { action: "intent.compile", outcome: "succeeded" },
      { action: "domain.check", outcome: "denied" }
    ],
    evidencePacks: [
      { taskId: "T1", residualRisks: [{ severity: "medium", description: "Sandbox non conteneurisée" }] } as never
    ],
    deliberations: [{ challenges: [{ message: "Le rollback n'est pas testé", blocking: true }, { message: "nommage", blocking: false }] }],
    intents: [{ invariants: [{ statement: "Aucune publication automatique", kind: "prohibition" }] }],
    ...overrides
  };
}

test("lessons are factual aggregations of real artifacts, with sources", () => {
  const base = mergeLessons(emptyBase(), deriveLessons(input()), "urapap", NOW);
  const usage = base.lessons.find((l) => l.kind === "usage" && l.key === "intent.compile");
  assert.equal(usage?.occurrences, 2);
  assert.match(usage!.statement, /exécutée 2 fois/);
  assert.ok(usage!.sources.includes("audit.jsonl"));
  assert.ok(base.lessons.some((l) => l.kind === "blocking_challenge" && /rollback/.test(l.statement)));
  assert.ok(base.lessons.some((l) => l.kind === "residual_risk" && /Sandbox/.test(l.statement)));
  // a non-blocking challenge is not a lesson
  assert.ok(!base.lessons.some((l) => /nommage/.test(l.statement)));
});

test("merging is deterministic: re-observing the same batch does not inflate", () => {
  let base = mergeLessons(emptyBase(), deriveLessons(input()), "urapap", NOW);
  const before = base.lessons.length;
  const usageBefore = base.lessons.find((l) => l.key === "intent.compile")!.occurrences;
  base = mergeLessons(base, deriveLessons(input()), "urapap", LATER);
  assert.equal(base.lessons.length, before, "no new lesson signatures");
  assert.equal(base.lessons.find((l) => l.key === "intent.compile")!.occurrences, usageBefore + 2, "occurrences accumulate");
});

test("knowledge grows across projects: the same lesson unions its projects", () => {
  let base = mergeLessons(emptyBase(), deriveLessons(input({ project: "urapap" })), "urapap", NOW);
  base = mergeLessons(base, deriveLessons(input({ project: "bestepargne" })), "bestepargne", LATER);
  const risk = base.lessons.find((l) => l.kind === "residual_risk")!;
  assert.deepEqual(risk.projects.sort(), ["bestepargne", "urapap"]);
});

test("recall ranks by term match then by cross-project frequency, explains matches", () => {
  const base = mergeLessons(emptyBase(), deriveLessons(input()), "urapap", NOW);
  const hits = recall(base, "rollback testé");
  assert.ok(hits.length >= 1);
  assert.ok(hits[0]!.matchedTerms.includes("rollback"));
  assert.deepEqual(recall(base, "kubernetes"), [], "no false positive");
});

test("references require a source and redact secrets", () => {
  let base = emptyBase();
  assert.throws(() => recordReference(base, "un fait", [], "urapap", NOW), /au moins une source/);
  base = recordReference(base, "Utiliser token=sk-abcdefghijklmnop selon la doc", ["https://exemple/doc"], "urapap", NOW);
  const ref = base.lessons.find((l) => l.kind === "reference")!;
  assert.doesNotMatch(ref.statement, /sk-abcdefghijklmnop/);
  assert.ok(ref.sources.includes("https://exemple/doc"));
  assert.equal(summarize(base).reference, 1);
});
