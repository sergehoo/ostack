// Finition du câblage des experts dynamiques (§12). À lancer UNE FOIS dans un
// terminal où le dépôt n'est pas verrouillé par un éditeur/observateur :
//   node scripts/finish-domain-agents.mjs
// Puis: npm run build && ostack domain agents domain-packs/finance/domain-pack.json
//
// Idempotent : applique les 2 éditions seulement si elles manquent.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changes = [];

// 1) Exporter agents.js depuis le barrel du package domain.
const indexPath = join(root, "packages/domain/src/index.ts");
const index = await readFile(indexPath, "utf8");
if (!index.includes("./agents.js")) {
  await writeFile(indexPath, index.trimEnd() + '\nexport * from "./agents.js";\n', "utf8");
  changes.push("packages/domain/src/index.ts : export agents.js");
}

// 2) Ajouter le sous-commande `agents` au routeur `ostack domain`.
const domainPath = join(root, "packages/cli/src/domain.ts");
const domain = await readFile(domainPath, "utf8");
if (!domain.includes('subcommand === "agents"') && !domain.includes('case "agents"')) {
  const marker = '    default:\n      throw new Error(`Unknown domain subcommand';
  const insertion =
    '    case "agents": {\n' +
    '      return (await import("./domain-agents.js")).runDomainAgents({ ...context, args: rest });\n' +
    '    }\n';
  if (!domain.includes(marker)) throw new Error("Point d'insertion introuvable dans domain.ts — insérez le case 'agents' manuellement avant `default:`.");
  await writeFile(domainPath, domain.replace(marker, insertion + marker), "utf8");
  changes.push("packages/cli/src/domain.ts : case 'agents' câblé");
}

if (changes.length === 0) console.log("Déjà câblé — rien à faire.");
else { console.log("Câblage appliqué :"); for (const c of changes) console.log(" -", c); }
console.log("\nEnsuite :");
console.log("  npm run build && npm test");
console.log("  ostack domain agents domain-packs/finance/domain-pack.json --json");
console.log("  ostack domain agents domain-packs/finance/domain-pack.json --out .claude/agents   # matérialise 10 experts");
