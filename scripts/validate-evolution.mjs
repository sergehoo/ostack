// Valide les ressources d'évolution versionnées: le ledger ne contient aucun
// secret et est du JSONL bien formé; policies/evolution.json est cohérent.
// Utilisé par la CI (.github/workflows/ostack-evolution.yml). Échec = code ≠ 0.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

const SECRET = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16}|-----BEGIN [^-]+ PRIVATE KEY-----)/;
const CRED_KV = /\b(token|secret|password|passwd|api[_-]?key)\b\s*[:=]\s*["']?\S{6,}/i;

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch { return null; }
}

// Ledger (append-only): chaque ligne est du JSON valide et sans secret.
const ledger = await readOptional(join(root, ".ostack/evolution/ledger.jsonl"));
if (ledger) {
  ledger.split("\n").filter((l) => l.trim()).forEach((line, index) => {
    if (SECRET.test(line) || CRED_KV.test(line)) problems.push(`ledger L${index + 1}: secret apparent`);
    try { JSON.parse(line); } catch { problems.push(`ledger L${index + 1}: JSON invalide`); }
  });
}

// Policy d'évolution: garde-fous présents et cohérents.
const policyRaw = await readOptional(join(root, "policies/evolution.json"));
if (!policyRaw) problems.push("policies/evolution.json manquant");
else {
  const policy = JSON.parse(policyRaw);
  if (policy.git?.forcePush !== false) problems.push("policy: forcePush doit être false (§35.6)");
  if (policy.git?.directPushToProtectedBranches !== false) problems.push("policy: directPushToProtectedBranches doit être false (§35.7)");
  if (!Array.isArray(policy.autoMerge?.allowedRiskLevels) || policy.autoMerge.allowedRiskLevels.some((r) => r !== "low")) {
    problems.push("policy: auto-merge autorisé uniquement pour le risque low (§16)");
  }
  const guardrails = ["policies/evolution.json", "packages/evolution/"];
  for (const path of guardrails) {
    if (!policy.protectedPaths?.some((p) => path.startsWith(p) || p.startsWith(path))) problems.push(`policy: chemin protégé manquant '${path}' (§32)`);
  }
}

if (problems.length > 0) {
  console.error("Validation d'évolution ÉCHOUÉE:");
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log("Validation d'évolution: OK (ledger sans secret, garde-fous en place).");
