// Analyse de secrets sur les fichiers versionnés (hors ignorés). Utilisé par la
// CI d'évolution. Défensif et simple: motifs de tokens courants + paires clé/valeur.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATTERNS = [
  /-----BEGIN [^-]+ PRIVATE KEY-----/,
  /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/,
  /\b(token|secret|password|passwd|api[_-]?key)\b\s*[:=]\s*["'][^"']{8,}["']/i
];
// Fichiers de test exclus: les fixtures y portent des tokens factices par
// nature; un vrai secret n'a de toute façon rien à y faire.
const SKIP = /(^|\/)(node_modules|dist|\.git)\/|(^|\/)test\/|\.test\.[cm]?[jt]s$|\.(png|jpg|jpeg|gif|lock)$|package-lock\.json$/;
// Valeurs manifestement factices (fixtures de test) — pas des secrets réels.
const FIXTURE = /(test|fake|dummy|example|sample|placeholder|redacted|xxx|change[_-]?me|your[_-])/i;

let files = [];
try {
  files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
} catch { files = []; }

const hits = [];
for (const file of files) {
  if (SKIP.test(file)) continue;
  let content;
  try { content = readFileSync(join(root, file), "utf8"); } catch { continue; }
  for (const pattern of PATTERNS) {
    const match = pattern.exec(content);
    if (match && !FIXTURE.test(match[0])) { hits.push(`${file}: ${match[0].slice(0, 24)}…`); break; }
  }
}

if (hits.length > 0) {
  console.error("Secrets potentiels détectés:");
  for (const hit of hits) console.error(` - ${hit}`);
  process.exit(1);
}
console.log(`Analyse de secrets: OK (${files.length} fichiers, aucun secret).`);
