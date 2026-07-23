// Génère les skills d'ingénierie par secteur (fichiers neufs) dans
// domain-packs/<secteur>/skills/. Skills FACTUELS (best-practices logicielles),
// jamais de conseil réglementé. À lancer depuis la racine du dépôt.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// skill = { slug, name, desc, apply: [..], proof }
const SECTORS = {
  healthcare: [
    {
      slug: "patient-data-privacy", name: "Confidentialité des données patient",
      desc: "Protéger les données de santé : consentement, minimisation, chiffrement, cloisonnement d'accès.",
      apply: [
        "Recueillir et tracer le consentement AVANT tout traitement de données de santé.",
        "Minimiser : ne collecter et n'exposer que les données strictement nécessaires à l'acte.",
        "Chiffrer au repos et en transit ; cloisonner l'accès au dossier par rôle ET par relation de soin.",
        "Ne jamais journaliser en clair une donnée de santé ou un identifiant patient ; masquer/tokeniser."
      ],
      proof: "Tests de permission au niveau de l'objet (un soignant sans relation de soin est refusé), analyse de secrets sur les logs, vérification que le consentement conditionne le traitement."
    },
    {
      slug: "clinical-audit-trail", name: "Piste d'audit clinique inviolable",
      desc: "Journaliser tout acte clinique et tout accès au dossier, de façon horodatée et attribuable.",
      apply: [
        "Journal append-only : qui a accédé/modifié quel dossier, quand, depuis où.",
        "Aucune action clinique silencieuse ; l'accès en lecture au dossier est aussi tracé.",
        "Horodatage fiable et attribution non répudiable ; conservation selon durée documentée."
      ],
      proof: "Test vérifiant qu'un accès au dossier produit une entrée d'audit ; test de non-altération de l'historique."
    },
    {
      slug: "safe-status-transitions", name: "Transitions d'état sûres (ex. sortie patient)",
      desc: "Empêcher les transitions cliniques invalides — la sortie exige un diagnostic renseigné.",
      apply: [
        "Modéliser les statuts et n'autoriser que les transitions valides (machine à états).",
        "Bloquer la sortie tant qu'un diagnostic n'est pas renseigné (règle métier vérifiée, pas seulement l'UI).",
        "Rendre les transitions idempotentes ; aucune double sortie."
      ],
      proof: "Test fonctionnel : sortie refusée sans diagnostic ; test de la matrice rôle × action × état. OStack ne prend AUCUNE décision médicale."
    }
  ],
  elearning: [
    {
      slug: "generated-content-stays-draft", name: "Contenu généré maintenu en brouillon",
      desc: "Une formation générée par IA reste en brouillon modifiable jusqu'à validation humaine du formateur.",
      apply: [
        "La génération n'applique jamais le statut publié ; sortie toujours en brouillon.",
        "Le formateur garde le contrôle de la publication ; chaque génération/validation est journalisée.",
        "Traiter la sortie du modèle comme donnée non fiable : validée, jamais exécutée comme instruction."
      ],
      proof: "Test fonctionnel adversarial : aucune tentative de génération ne produit un statut publié ; entrée d'audit créée."
    },
    {
      slug: "quiz-referential-integrity", name: "Intégrité référentielle des quiz",
      desc: "Chaque quiz référence une section existante de la même formation ; les réponses ne fuitent pas côté client.",
      apply: [
        "Contrainte d'intégrité : quiz → section existante du même cours (rejet sinon).",
        "Ne jamais envoyer les bonnes réponses au client avant soumission.",
        "Idempotence de la soumission ; pas de double comptage de tentative."
      ],
      proof: "Test de cohérence (quiz orphelin rejeté), test de non-fuite des réponses dans la charge réseau."
    },
    {
      slug: "certificate-eligibility-determinism", name: "Éligibilité au certificat déterministe",
      desc: "Le certificat n'est délivré que sur des critères de réussite déterministes et vérifiables.",
      apply: [
        "Critères d'éligibilité explicites et versionnés ; recalcul donne le même verdict.",
        "Délivrance idempotente ; un même parcours réussi ne génère pas deux certificats.",
        "Traçabilité : le certificat référence les preuves de réussite."
      ],
      proof: "Test de reproductibilité de l'éligibilité ; test d'idempotence de délivrance."
    }
  ],
  "real-estate": [
    {
      slug: "lease-document-integrity", name: "Intégrité des documents de bail",
      desc: "Baux et états des lieux versionnés et infalsifiables, avec preuve de signature.",
      apply: [
        "Versionner chaque document ; conserver l'historique, jamais d'écrasement silencieux.",
        "Empreinte de contenu (hash) pour détecter toute altération après signature.",
        "Lier signature, état des lieux et bail ; aucune remise des clés sans les trois."
      ],
      proof: "Test : remise des clés refusée sans bail signé + état des lieux ; vérification d'empreinte du document."
    },
    {
      slug: "rent-accounting-precision", name: "Précision comptable des loyers",
      desc: "Loyers, charges et dépôts calculés en décimal exact, avec quittance pour chaque paiement.",
      apply: [
        "Jamais de float binaire pour l'argent ; décimal exact, échelle par devise.",
        "Toute quittance correspond à un paiement enregistré ; réconciliation périodique.",
        "Prorata et régularisations documentés et rejouables."
      ],
      proof: "Tests fondés sur les propriétés (somme exacte), test quittance⇔paiement. Voir aussi finance/monetary-precision."
    }
  ],
  logistics: [
    {
      slug: "inventory-consistency", name: "Cohérence du stock (pas de survente)",
      desc: "Réserver le stock de façon atomique pour ne jamais expédier plus que disponible.",
      apply: [
        "Réservation atomique du stock à la commande ; décrément et réservation dans la même transaction.",
        "Aucune expédition sans stock réservé ; gérer la concurrence (deux commandes du dernier article).",
        "Réconcilier stock théorique et inventaire physique ; tracer les écarts."
      ],
      proof: "Test concurrentiel : deux commandes simultanées du dernier article — une seule réussit ; pas de stock négatif."
    },
    {
      slug: "parcel-tracking-ordering", name: "Ordonnancement et idempotence des scans",
      desc: "Chaque transition de colis est scannée, horodatée, ordonnée et idempotente.",
      apply: [
        "Horodater et ordonner les événements ; rejeter une transition d'état invalide.",
        "Idempotence : un scan rejoué ne crée pas de doublon d'événement.",
        "Exiger une preuve de livraison (signature/photo) avant clôture."
      ],
      proof: "Test de rejeu de scan (pas de doublon), test de transition invalide rejetée, test preuve de livraison requise."
    }
  ],
  retail: [
    {
      slug: "payment-before-fulfillment", name: "Paiement avant exécution",
      desc: "Aucune remise ni livraison sans paiement validé ; l'UI n'est jamais la seule barrière.",
      apply: [
        "Vérifier l'état de paiement côté serveur avant toute exécution ; refuser sinon.",
        "Idempotence du paiement : un retry ne débite ni ne livre deux fois.",
        "Séparer 'paiement autorisé' de 'paiement capturé' ; livrer sur capture confirmée."
      ],
      proof: "Test : livraison refusée sans paiement validé ; test d'idempotence du paiement. Voir aussi finance/idempotent-order-submission."
    },
    {
      slug: "refund-integrity", name: "Intégrité des remboursements",
      desc: "Un remboursement exige un retour enregistré et conforme ; opération idempotente et tracée.",
      apply: [
        "Lier le remboursement à un retour enregistré et contrôlé ; refuser sinon.",
        "Idempotence : pas de double remboursement pour un même retour.",
        "Journaliser montant, motif, autorisation ; jamais de suppression silencieuse."
      ],
      proof: "Test : remboursement sans retour refusé ; test d'idempotence ; entrée d'audit vérifiée."
    },
    {
      slug: "price-change-audit", name: "Audit et concurrence des changements de prix",
      desc: "Toute modification de prix ou promotion est journalisée et résiste aux mises à jour concurrentes.",
      apply: [
        "Journaliser qui/quand/quoi pour chaque changement de prix ou promotion.",
        "Gérer la concurrence (verrou optimiste) ; pas de perte de mise à jour.",
        "Un prix affiché au panier est celui appliqué au paiement (cohérence temporelle)."
      ],
      proof: "Test d'audit du changement de prix, test de mise à jour concurrente sans perte, test de cohérence panier↔paiement."
    }
  ]
};

function skillMarkdown(sector, s) {
  return [
    "---",
    `name: ${sector}-${s.slug}`,
    `description: ${s.desc}`,
    "scope: technology",
    "status: extracted",
    "---", "",
    `# ${s.name}`, "",
    s.desc, "",
    "## À appliquer", "",
    ...s.apply.map((a) => `- ${a}`), "",
    "## Preuve attendue (§OStack)", "",
    s.proof, "",
    "OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).", ""
  ].join("\n");
}

let count = 0;
for (const [sector, skills] of Object.entries(SECTORS)) {
  const dir = join(root, "domain-packs", sector, "skills");
  await mkdir(dir, { recursive: true });
  for (const s of skills) {
    await writeFile(join(dir, `${s.slug}.md`), skillMarkdown(sector, s), "utf8");
    count++;
  }
  console.log(`${sector} : ${skills.length} skills`);
}
console.log(`\nTotal: ${count} skills d'ingénierie sectoriels générés (finance déjà présent avec 5).`);
