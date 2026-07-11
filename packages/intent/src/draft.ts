import type { ModelProvider } from "@ostack/core";
import type { IntentDraft, Invariant, InvariantKind } from "./types.js";

const SYSTEM_PROMPT = `Tu es le compilateur d'intentions d'OStack. Tu transformes une demande logicielle en brouillon d'intention STRICTEMENT structuré.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans bloc de code, au format:
{
  "functionalIntent": ["phrase courte", ...],
  "actors": ["role", ...],
  "invariants": [
    {
      "id": "kebab-case-court",
      "statement": "règle métier inviolable, une phrase",
      "kind": "prohibition" | "permission" | "obligation" | "consistency",
      "given": "contexte initial (une clause Gherkin Given, sans le mot Given)",
      "when": "déclencheur (une clause Gherkin When, sans le mot When)",
      "outcome": "résultat qui doit se produire (permission/obligation/consistency) ou qui est interdit (prohibition)",
      "auditRequired": true | false
    }
  ]
}
Règles: 2 à 8 invariants; chaque règle de sécurité ou de permission implicite dans la demande devient un invariant; toute action sensible exige auditRequired=true. Aucune prose hors du JSON.`;

// Model output is untrusted data: it is parsed, shape-checked and normalized —
// never interpreted as instructions (§17).
export async function draftIntent(id: string, request: string, provider: ModelProvider): Promise<IntentDraft> {
  const response = await provider.complete({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: request }],
    temperature: 0
  });
  const parsed = extractJson(response.content);
  return normalizeDraft(id, request, parsed);
}

export function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model output does not contain a JSON object");
  try { return JSON.parse(trimmed.slice(start, end + 1)); }
  catch { throw new Error("Model output is not valid JSON"); }
}

const KINDS: InvariantKind[] = ["prohibition", "permission", "obligation", "consistency"];

export function normalizeDraft(id: string, request: string, raw: unknown): IntentDraft {
  if (!raw || typeof raw !== "object") throw new Error("Intent draft must be an object");
  const data = raw as Record<string, unknown>;
  const invariantsRaw = Array.isArray(data.invariants) ? data.invariants : [];
  const invariants: Invariant[] = invariantsRaw.map((item, index) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const kind = entry.kind as InvariantKind;
    if (!KINDS.includes(kind)) throw new Error(`Invariant ${index + 1}: unknown kind '${String(entry.kind)}'`);
    const invariant: Invariant = {
      id: text(entry.id, `invariant ${index + 1} id`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64),
      statement: text(entry.statement, `invariant ${index + 1} statement`),
      kind,
      given: text(entry.given, `invariant ${index + 1} given`),
      when: text(entry.when, `invariant ${index + 1} when`),
      outcome: text(entry.outcome, `invariant ${index + 1} outcome`)
    };
    if (entry.auditRequired === true) invariant.auditRequired = true;
    return invariant;
  });
  if (invariants.length === 0) throw new Error("The draft declares no invariants; refine the request or write the draft by hand");
  return {
    schemaVersion: 1,
    id,
    request,
    functionalIntent: stringList(data.functionalIntent),
    actors: stringList(data.actors),
    invariants
  };
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${label}`);
  return value.trim().slice(0, 500);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 300)).slice(0, 20);
}
