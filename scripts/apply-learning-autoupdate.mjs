// Applique deux améliorations, de façon idempotente et sûre :
//  1. Auto-apprentissage des SUCCÈS (§24) : deriveLessons émet aussi des
//     `verified_pattern` à partir des Evidence Packs vérifiés.
//  2. Propagation auto des mises à jour (§21) : `ostack update --auto` + hook
//     SessionStart posé par `ostack install`.
// Vérifie toutes les ancres AVANT d'écrire ; si une manque, n'écrit RIEN.
// À lancer depuis la racine : node scripts/apply-learning-autoupdate.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const errors = [];
const plans = [];

async function plan(file, transform, alreadyMarker) {
  const path = R(file);
  const before = await readFile(path, "utf8");
  if (before.includes(alreadyMarker)) { plans.push({ path, after: before, skipped: true, file }); return; }
  try {
    const after = transform(before);
    if (after === before) errors.push(`${file}: transformation sans effet (ancre introuvable ?)`);
    else plans.push({ path, after, skipped: false, file });
  } catch (e) { errors.push(`${file}: ${e.message}`); }
}

function replaceOnce(src, anchor, replacement, label) {
  if (!src.includes(anchor)) throw new Error(`ancre absente [${label}]`);
  return src.replace(anchor, replacement);
}

// --- 1. learning/index.ts : type + dérivation des succès ---
await plan("packages/learning/src/index.ts", (src) => {
  let out = replaceOnce(src, '  | "reference";', '  | "reference"\n  | "verified_pattern";', "LessonKind");
  const block =
    "  // Verified successes across evidence packs — learn from what worked (§24).\n" +
    "  for (const pack of input.evidencePacks ?? []) {\n" +
    "    if (!pack.verified) continue;\n" +
    "    for (const criterion of pack.generatedFrom?.acceptanceCriteria ?? []) {\n" +
    "      derived.push({\n" +
    '        kind: "verified_pattern", key: normalize(criterion), count: 1,\n' +
    "        statement: `Critère prouvé: ${clip(criterion)}`,\n" +
    "        sources: [`evidence:${pack.taskId}`]\n" +
    "      });\n" +
    "    }\n" +
    "  }\n\n";
  out = replaceOnce(out, "  // Recurring blocking challenges from deliberations.", block + "  // Recurring blocking challenges from deliberations.", "deriveLessons");
  return out;
}, "verified_pattern");

// --- 2a. update.ts : délégation --auto ---
await plan("packages/cli/src/update.ts", (src) =>
  replaceOnce(src,
    "  if (context.args.includes(\"--rollback\")) {",
    "  if (context.args.includes(\"--auto\")) return (await import(\"./update-auto.js\")).runAutoUpdate(context);\n\n  if (context.args.includes(\"--rollback\")) {",
    "update --auto"),
  "update-auto.js");

// --- 2b. install.ts : hook SessionStart + fonction ---
await plan("packages/cli/src/install.ts", (src) => {
  let out = replaceOnce(src,
    "  if (assistant === \"claude\") learningHook = await installLearningHook(context.cwd);",
    "  if (assistant === \"claude\") learningHook = await installLearningHook(context.cwd);\n  if (assistant === \"claude\") await installUpdateHook(context.cwd);",
    "install call");
  const fn =
    "// Hook SessionStart: chaque session tire les mises à jour de ressources (§21).\n" +
    "async function installUpdateHook(cwd: string): Promise<boolean> {\n" +
    "  const path = join(cwd, \".claude\", \"settings.json\");\n" +
    "  let settings: { hooks?: Record<string, unknown[]> } = {};\n" +
    "  const existing = await readFileOrEmpty(path);\n" +
    "  if (existing.trim()) { try { settings = JSON.parse(existing); } catch { return false; } }\n" +
    "  settings.hooks = settings.hooks ?? {};\n" +
    "  const start = Array.isArray(settings.hooks.SessionStart) ? settings.hooks.SessionStart : [];\n" +
    "  if (JSON.stringify(start).includes(\"ostack update --auto\")) return false;\n" +
    "  start.push({ hooks: [{ type: \"command\", command: \"ostack update --auto --quiet\" }] });\n" +
    "  settings.hooks.SessionStart = start;\n" +
    "  await mkdir(join(cwd, \".claude\"), { recursive: true });\n" +
    "  await writeFile(path, `${JSON.stringify(settings, null, 2)}\\n`, { encoding: \"utf8\" });\n" +
    "  return true;\n" +
    "}\n\n";
  out = replaceOnce(out, "function readAssistant(args: string[]): Assistant {", fn + "function readAssistant(args: string[]): Assistant {", "install fn");
  return out;
}, "installUpdateHook");

if (errors.length > 0) {
  console.error("ABANDON — aucune modification écrite. Ancres manquantes :");
  for (const e of errors) console.error(" -", e);
  console.error("\nLes fichiers ont peut-être changé. Demandez-moi les blocs manuels exacts.");
  process.exit(1);
}

let applied = 0;
for (const p of plans) {
  if (p.skipped) { console.log(`= ${p.file} : déjà appliqué`); continue; }
  await writeFile(p.path, p.after, "utf8");
  console.log(`✔ ${p.file}`);
  applied++;
}
console.log(`\n${applied} fichier(s) modifié(s).`);
console.log("Ensuite : npm run build && npm test");
console.log("Auto-update : les nouveaux 'ostack install --assistant claude' poseront le hook SessionStart 'ostack update --auto'.");
