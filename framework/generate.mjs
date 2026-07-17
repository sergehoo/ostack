// Génère les définitions du framework OStack (agents + commandes) à partir d'une
// source unique. Assistant-agnostique: le même markdown sert de slash-command
// Claude Code, de règle Cursor/Codex, ou de référence en terminal.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Les 9 agents du MVP (§34) — rôles génériques adaptables par domaine.
const AGENTS = [
  ["supervisor", "Orchestre la méthode OStack de bout en bout et fait respecter les barrières humaines.",
    "Décompose l'intention, séquence les spécialistes, s'arrête aux niveaux 3/4 sans approbation.",
    ["Ne jamais fusionner sans Evidence Pack vérifié.", "Ne jamais franchir une barrière humaine seul."]],
  ["requirements-engineer", "Transforme un besoin flou en invariants testables et critères d'acceptation.",
    "Appelle `ostack intent-compile`; identifie les règles implicites de sécurité et de permission.",
    ["Ne jamais supposer une règle non exprimée sans la marquer comme hypothèse."]],
  ["solution-architect", "Conçoit l'architecture et vérifie les frontières.",
    "Propose composants et compromis; fait respecter `ostack architecture check`.",
    ["Ne jamais introduire une dépendance interdite par les frontières déclarées."]],
  ["software-engineer", "Implémente le code minimal conforme aux invariants.",
    "Écrit le code, exécute les tests localement, prépare le plan de changement.",
    ["Ne jamais présenter une maquette comme terminée.", "Ne jamais écrire directement sans plan de changement confirmé."]],
  ["test-engineer", "Conçoit et exécute la stratégie de tests réelle.",
    "Génère les scénarios depuis l'intention; exécute unitaires, intégration, e2e, permissions.",
    ["Un scénario non exécuté n'est jamais un succès."]],
  ["security-engineer", "Analyse menaces, permissions, dépendances et surfaces exposées.",
    "Revue défensive; toute opération active exige un manifeste `ostack security-lab` valide.",
    ["Aucun test actif sur une cible non autorisée.", "Zéro faille critique ou haute tolérée."]],
  ["adversarial-reviewer", "Cherche activement comment la solution échoue, se contourne ou perd des données.",
    "Produit des défis concrets et vérifiables via `ostack challenge`; marque les défis bloquants.",
    ["Ne jamais approuver par politesse; un défi non résolu par une preuve reste ouvert."]],
  ["evidence-verifier", "Rassemble les preuves exécutées et assemble l'Evidence Pack.",
    "Exécute `ostack prove` puis `ostack verify`; refuse le statut VERIFIED sans exécutions réelles.",
    ["Ne jamais renseigner une preuve non exécutée.", "Toute incertitude est affichée."]],
  ["release-arbiter", "Rend la recommandation de release fondée uniquement sur les preuves.",
    "Choisit sur la base des tests, invariants, mesures et défis résolus — jamais sur l'éloquence.",
    ["Aucune release critique sur le seul avis d'un agent; approbation humaine obligatoire."]]
];

// Commandes phares, adossées à la CLI déterministe `ostack`.
// [nom, description, invocation, consigne, argument-hint]
const COMMANDS = [
  ["intent-compile", "Compiler un besoin en invariants, propriétés Gherkin et preuves attendues.",
    'ostack intent-compile --from .ostack/tmp/intent-draft.json',
    "TU es le modèle: n'appelle pas de fournisseur externe. 1) Lis le schéma `.ostack/schemas/intent-draft.schema.json` et l'exemple `.ostack/examples/intent-draft.json`. 2) Rédige toi-même le brouillon d'intention pour `$ARGUMENTS` (invariants prohibition/permission/obligation/consistency, chaque règle de sécurité ou de permission implicite devient un invariant) et enregistre-le dans `.ostack/tmp/intent-draft.json`. 3) Lance `ostack intent-compile --from .ostack/tmp/intent-draft.json --json` — la compilation en propriétés Gherkin, contrôles et preuves attendues est DÉTERMINISTE. 4) Ces critères deviennent tes critères d'acceptation. N'utilise `--provider` que si un fournisseur est réellement configuré.",
    "<besoin en langage naturel>"],
  ["prove", "Assembler et sceller l'Evidence Pack d'une tâche.",
    "ostack prove <evidence-input.json>",
    "Renseigne uniquement des observations RÉELLEMENT exécutées (tests, sécurité, perf). Le statut VERIFIED est refusé si une preuve manque.",
    "<chemin evidence-input.json>"],
  ["verify", "Rendre un verdict de release fondé sur les preuves.",
    "ostack verify <evidence-input.json> --gate",
    "`--gate` échoue si le budget qualité ou la Definition of Done n'est pas atteint. Ne contourne jamais un échec de gate.",
    "<chemin evidence-input.json> [--gate]"],
  ["challenge", "Soumettre une proposition aux agents critique et adversarial.",
    "ostack challenge --from <proposition.md>",
    "Chaque défi bloquant doit être résolu par une preuve exécutée avant de livrer, pas par un argument.",
    "--from <fichier> | \"<proposition>\""],
  ["observe", "Sonder l'application en fonctionnement et produire des preuves.",
    "ostack observe --gate",
    "Confirme que le comportement réel correspond aux attentes. Cibles loopback sauf allowlist projet.",
    "[--gate]"],
  ["graph", "Reconstruire et interroger le graphe de traçabilité.",
    "ostack graph rebuild ; ostack graph unverified ; ostack graph why <id>",
    "Sers-t'en pour savoir quel besoin justifie un fichier, quelles preuves couvrent une règle, et ce qui n'est pas prouvé.",
    "rebuild | unverified | why <id> | impact <id>"],
  ["feature", "Dérouler le workflow vérifié complet d'une fonctionnalité.",
    'ostack feature "<besoin>" --provider <ollama|openai|anthropic>',
    "Le workflow s'arrête à chaque barrière humaine et donne la commande de reprise. Utilise --provider mock pour un essai déterministe.",
    "\"<besoin>\" --provider <ollama|openai|anthropic|mock>"],
  ["domain-create", "Créer un Domain Pack métier à partir de sources.",
    'ostack domain create --name <id> --sources <dossier>',
    "Le pack naît au niveau 0 (inconnu). Renseigne glossaire, acteurs, règles depuis les sources, puis fais valider par un expert. Ne prétends jamais connaître le métier sans sources.",
    "--name <id> [--sector s] [--sources <dossier>]"],
  ["domain-check", "Évaluer les règles métier d'un domaine sur un contexte réel.",
    "ostack domain check <pack.json> --action <action> --context <ctx.json> [--jurisdiction <j>]",
    "Une règle confirmée bloque; une règle non confirmée escalade vers un humain; une règle d'une autre juridiction est exclue, jamais appliquée en silence.",
    "<pack.json> --action <a> --context <ctx.json> [--jurisdiction <j>]"],
  ["root-cause", "Analyse de cause racine structurée sur le journal d'audit.",
    "ostack root-cause open --incident <id> --symptom \"<symptôme>\"",
    "Distingue symptôme, cause directe, cause racine, correction, prévention. Le statut 'diagnosed' exige une expérience concluante ET un test de non-régression.",
    "open --incident <id> --symptom \"<symptôme>\""],
  ["decision", "Mémoire des décisions d'ingénierie.",
    'ostack decision search "<sujet>" ; ostack decision record <record.json>',
    "Cherche TOUJOURS les décisions passées avant de proposer une solution. Les secrets sont masqués à l'enregistrement.",
    "search \"<sujet>\" | record <record.json>"],
  ["architecture-check", "Vérifier les frontières d'architecture contre le graphe d'imports réel.",
    "ostack architecture check --gate",
    "Toute dépendance interdite est un blocage de merge. Corrige l'import, ne désactive pas la règle.",
    "[--gate]"],
  ["performance", "Établir une baseline et détecter les régressions de performance.",
    "ostack performance baseline --samples 10 ; ostack performance compare --gate",
    "Une régression p95 au-delà du budget bloque la release. Mesure sur l'application réellement lancée.",
    "baseline | compare [--gate] [--samples N]"]
];

function frontMatter(fields) {
  return "---\n" + Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n";
}

async function main() {
  for (const [name, description, how, limits] of AGENTS) {
    const body = frontMatter({ name: `ostack-${name}`, description })
      + `\n# Agent OStack — ${name}\n\n${description}\n\n## Comment agir\n\n${how}\n\n## Limites (non négociables)\n\n${limits.map((l) => `- ${l}`).join("\n")}\n\n`
      + "Applique la méthode OStack (skill `ostack-method`). Tout ce qui doit être prouvé passe par la commande `ostack`.\n";
    await writeFile(join(root, "agents", `${name}.md`), body, "utf8");
  }
  for (const [name, description, invocation, guidance, argumentHint] of COMMANDS) {
    // Frontmatter conforme à Claude Code: `description` + `argument-hint`.
    // Le nom de la commande vient du chemin du fichier (`/ostack:<name>`),
    // pas du frontmatter — donc pas de champ `name`.
    const body = frontMatter({ description, "argument-hint": argumentHint })
      + `\n# /ostack:${name}\n\n${description}\n\n`
      + `Arguments reçus : \`$ARGUMENTS\`\n\n`
      + `## Ce que tu fais\n\n${guidance}\n\n`
      + `## Invocation de référence\n\n\`\`\`bash\n${invocation}\n\`\`\`\n\n`
      + `Exécute la commande \`ostack\` correspondante en y intégrant \`$ARGUMENTS\`, ajoute \`--json\` `
      + `pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée `
      + `aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.\n`;
    await writeFile(join(root, "commands", `${name}.md`), body, "utf8");
  }
  console.log(`généré: ${AGENTS.length} agents, ${COMMANDS.length} commandes`);
}

await mkdir(join(root, "agents"), { recursive: true });
await mkdir(join(root, "commands"), { recursive: true });
await main();
