// Génère des Domain Packs sectoriels schéma-valides (fichiers neufs). Méthode
// OStack : règles au statut pending_validation, réglementaire en questions
// ouvertes À SOURCER, aucun conseil réglementé. À lancer depuis la racine.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = { id: "engineering-best-practices", title: "Pratiques d'ingénierie logicielle générales", kind: "document" };
const g = (term, definition, concept) => ({ term, definition, concept, status: "extracted", sources: [SRC.id] });
const actor = (id, name, roles) => ({ id, name, roles, status: "extracted", sources: [SRC.id] });
const step = (id, name, extra = {}) => ({ id, name, ...extra });
const rule = (id, statement, action, path, message) => ({
  id, statement, kind: "internal_rule", when: { action },
  conditions: [{ path, equals: true }], otherwise: { block: true, message },
  status: "pending_validation", sources: [SRC.id], validatedBy: []
});
const kpi = (name, objective, formula, dataSources, owner, target) => ({ name, objective, formula, dataSources, frequency: "monthly", owner, threshold: { target } });

const PACKS = [
  {
    id: "healthcare", name: "Santé — parcours patient et établissement de soins", sector: "sante",
    glossary: [
      g("patient", "Personne prise en charge par l'établissement", "customer"),
      g("dossier patient", "Dossier médical rassemblant antécédents, diagnostics et actes", "case_file"),
      g("admission", "Entrée d'un patient dans une unité de soins", "transaction"),
      g("diagnostic", "Conclusion médicale documentée", "document"),
      g("sortie", "Fin de prise en charge et sortie du patient", "event")
    ],
    actors: [actor("medecin", "Médecin", ["diagnostiquer", "prescrire"]), actor("infirmier", "Infirmier", ["soins", "surveillance"]), actor("admission-agent", "Agent d'admission", ["enregistrement"]), actor("conformite", "Conformité / DPO", ["protection des données"])],
    workflows: [{ id: "parcours-patient", name: "Parcours patient", status: "extracted", sources: [SRC.id], steps: [step("admission", "Admission", { actor: "admission-agent" }), step("prise-en-charge", "Prise en charge", { actor: "medecin", requires: ["admission"] }), step("sortie", "Sortie", { requires: ["prise-en-charge"], irreversible: true })] }],
    rules: [
      rule("no-discharge-without-diagnosis", "Aucune sortie sans diagnostic renseigné", "patient.discharge", "diagnosis.exists", "Un diagnostic doit être renseigné avant la sortie"),
      rule("audit-clinical-actions", "Tout acte clinique et accès au dossier est journalisé", "clinical.action", "audit.recorded", "Action clinique non journalisée"),
      rule("consent-before-sensitive-data", "Le consentement est recueilli avant traitement de données de santé", "patient.data.process", "consent.recorded", "Consentement non recueilli")
    ],
    kpis: [kpi("delai-de-prise-en-charge", "Respect des délais de prise en charge", "patients_dans_delai / patients_total * 100", ["admissions"], "cadre-de-sante", 95)],
    mappings: [["customer", ["patient", "assuré social"]], ["case_file", ["dossier patient"]], ["transaction", ["admission", "acte", "consultation"]], ["sensitive_data", ["données de santé"]]],
    openQuestions: [
      "Quelles obligations réglementaires s'appliquent (par juridiction) : protection des données de santé, hébergement agréé, secret médical, consentement ? — À SOURCER et valider par un expert conformité, avec juridiction et date.",
      "Quelles décisions cliniques exigent une validation médicale explicite ? (OStack ne prend AUCUNE décision médicale)"
    ],
    disclaimer: "OStack ne pose aucun diagnostic et ne prend aucune décision médicale. Il modélise le processus et aide à construire le logiciel ; toute décision clinique relève d'un professionnel de santé."
  },
  {
    id: "elearning", name: "E-learning — formation et apprentissage en ligne", sector: "education",
    glossary: [
      g("apprenant", "Personne suivant une formation", "customer"),
      g("formation", "Parcours pédagogique structuré en modules", "product"),
      g("module", "Unité pédagogique d'une formation", "resource"),
      g("quiz", "Évaluation associée à un module", "control"),
      g("certificat", "Attestation délivrée à la réussite", "document")
    ],
    actors: [actor("formateur", "Formateur", ["créer", "publier"]), actor("apprenant", "Apprenant", ["suivre", "évaluer"]), actor("administrateur", "Administrateur", ["gérer"])],
    workflows: [{ id: "publication-formation", name: "Publication d'une formation", status: "extracted", sources: [SRC.id], steps: [step("creation", "Création (brouillon)", { actor: "formateur" }), step("revue", "Revue", { requires: ["creation"] }), step("publication", "Publication", { requires: ["revue"] })] }],
    rules: [
      rule("no-auto-publish", "Une formation générée reste en brouillon jusqu'à validation du formateur", "formation.generate", "formation.stayDraft", "Publication automatique interdite"),
      rule("quiz-belongs-to-section", "Chaque quiz référence une section existante de la même formation", "quiz.attach", "quiz.sectionValid", "Quiz rattaché à une section inexistante"),
      rule("certificate-eligibility", "Le certificat n'est délivré qu'aux critères de réussite remplis", "certificate.issue", "learner.eligible", "Critères de certification non remplis")
    ],
    kpis: [kpi("taux-de-completion", "Part des apprenants terminant la formation", "completions / inscriptions * 100", ["enrollments"], "responsable-pedagogique", 70)],
    mappings: [["customer", ["apprenant", "étudiant", "stagiaire"]], ["product", ["formation", "cours"]], ["control", ["quiz", "évaluation"]], ["document", ["certificat", "attestation"]]],
    openQuestions: [
      "Quelles obligations réglementaires (accessibilité, protection des données des mineurs, certification qualité de la formation) selon la juridiction ? — À SOURCER.",
      "Quels critères exacts d'éligibilité au certificat la maison impose-t-elle ?"
    ],
    disclaimer: "OStack modélise le processus e-learning et aide à construire le logiciel ; il ne certifie aucun apprenant de lui-même."
  },
  {
    id: "real-estate", name: "Immobilier — gestion locative et transactions", sector: "immobilier",
    glossary: [
      g("bien", "Bien immobilier géré ou commercialisé", "asset"),
      g("locataire", "Personne louant un bien", "customer"),
      g("bail", "Contrat de location", "contract"),
      g("état des lieux", "Constat contradictoire de l'état du bien", "document"),
      g("loyer", "Montant dû périodiquement", "transaction")
    ],
    actors: [actor("gestionnaire", "Gestionnaire", ["gérer", "encaisser"]), actor("locataire", "Locataire", ["louer", "payer"]), actor("proprietaire", "Propriétaire", ["mandater"])],
    workflows: [{ id: "cycle-location", name: "Cycle de location", status: "extracted", sources: [SRC.id], steps: [step("candidature", "Candidature", { actor: "locataire" }), step("bail", "Signature du bail", { requires: ["candidature"] }), step("etat-des-lieux", "État des lieux d'entrée", { requires: ["bail"] }), step("quittancement", "Quittancement", { requires: ["etat-des-lieux"] })] }],
    rules: [
      rule("no-key-handover-without-signed-lease", "Aucune remise des clés sans bail signé et état des lieux", "lease.handover", "lease.signedAndInventory", "Bail non signé ou état des lieux manquant"),
      rule("rent-receipt-issued", "Toute quittance est émise pour un paiement enregistré", "rent.receipt", "payment.recorded", "Paiement non enregistré"),
      rule("audit-lease-events", "Signatures, états des lieux et encaissements sont journalisés", "lease.event", "audit.recorded", "Événement de bail non journalisé")
    ],
    kpis: [kpi("taux-d-occupation", "Part des biens occupés", "biens_occupes / biens_total * 100", ["properties"], "gestionnaire", 95)],
    mappings: [["customer", ["locataire", "acquéreur"]], ["asset", ["bien", "lot", "logement"]], ["contract", ["bail", "mandat"]], ["transaction", ["loyer", "vente", "caution"]]],
    openQuestions: [
      "Quelles obligations réglementaires (encadrement des loyers, diagnostics obligatoires, dépôt de garantie, préavis) selon la juridiction ? — À SOURCER.",
      "Quels délais légaux de préavis et de restitution du dépôt s'appliquent ?"
    ],
    disclaimer: "OStack modélise la gestion immobilière et aide à construire le logiciel ; il ne fournit aucun conseil juridique."
  },
  {
    id: "logistics", name: "Logistique — entreposage et transport", sector: "logistique",
    glossary: [
      g("colis", "Unité expédiée", "asset"),
      g("commande", "Demande d'expédition", "transaction"),
      g("stock", "Quantité disponible en entrepôt", "resource"),
      g("expedition", "Envoi d'une commande vers un destinataire", "event"),
      g("livraison", "Remise au destinataire", "event")
    ],
    actors: [actor("preparateur", "Préparateur", ["picking", "emballage"]), actor("transporteur", "Transporteur", ["acheminer"]), actor("gestionnaire-stock", "Gestionnaire de stock", ["réappro", "inventaire"])],
    workflows: [{ id: "order-to-delivery", name: "De la commande à la livraison", status: "extracted", sources: [SRC.id], steps: [step("commande", "Commande", {}), step("preparation", "Préparation", { actor: "preparateur", requires: ["commande"] }), step("expedition", "Expédition", { requires: ["preparation"] }), step("livraison", "Livraison", { requires: ["expedition"], irreversible: true })] }],
    rules: [
      rule("no-ship-without-stock", "Aucune expédition sans stock disponible réservé", "order.ship", "stock.reserved", "Stock insuffisant ou non réservé"),
      rule("scan-at-each-step", "Chaque transition de colis est scannée et horodatée", "parcel.transition", "scan.recorded", "Transition de colis non scannée"),
      rule("delivery-proof", "La livraison exige une preuve (signature ou photo)", "order.deliver", "delivery.proof", "Preuve de livraison manquante")
    ],
    kpis: [kpi("taux-de-livraison-a-temps", "Part des livraisons dans le délai promis", "livraisons_a_temps / livraisons_total * 100", ["deliveries"], "responsable-logistique", 97)],
    mappings: [["asset", ["colis", "palette", "article"]], ["transaction", ["commande", "expédition"]], ["resource", ["stock"]], ["event", ["livraison", "scan"]]],
    openQuestions: [
      "Quelles obligations réglementaires (transport de marchandises dangereuses, douanes, traçabilité) selon la juridiction ? — À SOURCER.",
      "Quels délais de livraison contractuels s'appliquent par mode de transport ?"
    ],
    disclaimer: "OStack modélise la chaîne logistique et aide à construire le logiciel."
  },
  {
    id: "retail", name: "Commerce de détail — vente et encaissement", sector: "commerce",
    glossary: [
      g("client", "Acheteur en magasin ou en ligne", "customer"),
      g("panier", "Ensemble d'articles avant paiement", "resource"),
      g("paiement", "Règlement d'une commande", "payment"),
      g("commande", "Achat validé", "transaction"),
      g("remboursement", "Restitution suite à un retour", "transaction")
    ],
    actors: [actor("vendeur", "Vendeur / caisse", ["encaisser"]), actor("client", "Client", ["acheter", "retourner"]), actor("gestionnaire", "Gestionnaire de magasin", ["prix", "promotions"])],
    workflows: [{ id: "achat", name: "Achat et encaissement", status: "extracted", sources: [SRC.id], steps: [step("panier", "Constitution du panier", { actor: "client" }), step("paiement", "Paiement", { requires: ["panier"] }), step("livraison-remise", "Remise / livraison", { requires: ["paiement"] })] }],
    rules: [
      rule("no-delivery-without-payment", "Aucune remise ni livraison sans paiement validé", "order.delivery", "payment.validated", "Paiement non validé"),
      rule("refund-requires-return", "Un remboursement exige un retour enregistré et conforme", "order.refund", "return.recorded", "Retour non enregistré"),
      rule("audit-price-changes", "Toute modification de prix ou promotion est journalisée", "price.change", "audit.recorded", "Changement de prix non journalisé")
    ],
    kpis: [kpi("taux-de-conversion", "Part des paniers convertis en commande", "commandes / paniers * 100", ["orders"], "gestionnaire", 30)],
    mappings: [["customer", ["client", "acheteur"]], ["payment", ["paiement", "règlement"]], ["transaction", ["commande", "remboursement"]], ["resource", ["panier", "stock"]]],
    openQuestions: [
      "Quelles obligations réglementaires (droit de rétractation, information précontractuelle, TVA, protection du consommateur) selon la juridiction ? — À SOURCER.",
      "Quel délai légal de rétractation et de remboursement s'applique ?"
    ],
    disclaimer: "OStack modélise le processus de vente et aide à construire le logiciel ; il ne fournit aucun conseil juridique ou fiscal."
  }
];

function buildDecisionTable() {
  return {
    id: "validation-operation", name: "Niveau de validation d'une opération", status: "pending_validation", sources: [SRC.id],
    inputs: [{ name: "montant", values: ["faible", "moyen", "eleve"] }, { name: "sensibilite", values: ["standard", "sensible"] }],
    rows: [
      { conditions: { montant: "faible", sensibilite: "*" }, outcome: "automatique" },
      { conditions: { montant: "moyen", sensibilite: "*" }, outcome: "responsable" },
      { conditions: { montant: "eleve", sensibilite: "*" }, outcome: "direction" }
    ]
  };
}

let written = 0;
for (const spec of PACKS) {
  const pack = {
    $schema: "https://ostack.dev/schemas/domain-pack.schema.json",
    schemaVersion: 1, id: spec.id, name: spec.name, sector: spec.sector, language: "fr", version: "0.1.0",
    sources: [SRC], experts: [],
    glossary: spec.glossary, actors: spec.actors, workflows: spec.workflows, rules: spec.rules,
    decisionTables: [buildDecisionTable()], kpis: spec.kpis,
    mappings: spec.mappings.map(([universalConcept, localTerms]) => ({ universalConcept, localTerms })),
    openQuestions: spec.openQuestions
  };
  const dir = join(root, "domain-packs", spec.id);
  await mkdir(join(dir, "skills"), { recursive: true });
  await writeFile(join(dir, "domain-pack.json"), JSON.stringify(pack, null, 2) + "\n", "utf8");
  await writeFile(join(dir, "README.md"),
    `# Domain Pack — ${spec.name}\n\n${spec.disclaimer}\n\n` +
    "Méthode OStack : règles au statut `pending_validation` (aucun effet bloquant tant qu'un expert " +
    "ne les a pas confirmées) ; obligations réglementaires en **questions ouvertes à sourcer** " +
    "(jamais inventées). Maturité basse par conception jusqu'à validation experte.\n\n" +
    "```bash\n" +
    `ostack domain score domain-packs/${spec.id}/domain-pack.json\n` +
    `ostack domain agents domain-packs/${spec.id}/domain-pack.json --json   # 10 experts\n` +
    "```\n", "utf8");
  written++;
}
console.log(`Packs générés: ${written} (${PACKS.map((p) => p.id).join(", ")})`);
console.log(`Experts additionnels: ${written * 10} → avec finance, ${(written + 1) * 10} au total.`);
