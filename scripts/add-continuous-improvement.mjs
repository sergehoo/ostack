// Enregistre la commande `ostack improve` (méthode d'amélioration continue).
// Idempotent, anti-casse : vérifie l'ancre avant d'écrire ; si absente, n'écrit
// rien. À lancer depuis la racine : node scripts/add-continuous-improvement.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "packages/cli/src/commands.ts");
const src = await readFile(path, "utf8");

if (src.includes('"./improve.js"') || src.includes("improve:")) {
  console.log("= commande 'improve' déjà enregistrée — rien à faire.");
  process.exit(0);
}

const anchor = '  learn: { description: "Apprentissage institutionnel: enrichit la base de connaissance (observe, recall, record)", handler: async (context) => (await import("./learn.js")).runLearn(context) },';
if (!src.includes(anchor)) {
  console.error("ABANDON — ancre 'learn:' introuvable dans commands.ts. Aucune modification écrite.");
  console.error("Ajoutez manuellement, dans l'objet commands :");
  console.error('  improve: { description: "Amélioration continue: un cycle de mesure et de priorisation (lecture seule)", handler: async (context) => (await import("./improve.js")).runImprove(context) },');
  process.exit(1);
}

const line = '  improve: { description: "Amélioration continue: un cycle de mesure et de priorisation (lecture seule)", handler: async (context) => (await import("./improve.js")).runImprove(context) },';
await writeFile(path, src.replace(anchor, anchor + "\n" + line), "utf8");
console.log("✔ packages/cli/src/commands.ts : commande 'improve' enregistrée");
console.log("\nEnsuite : npm run build && npm test");
console.log("Puis : ostack improve --json   (cycle d'amélioration, lecture seule)");
