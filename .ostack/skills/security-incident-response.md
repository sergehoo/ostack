---
name: ostack-security-incident-response
description: Réponse à incident de sécurité selon OStack — détecter, contenir, éradiquer, restaurer, capitaliser, chaque étape adossée à une preuve, réversible et journalisée. À suivre lors d'un incident de sécurité suspecté ou confirmé.
---

# Réponse à incident de sécurité

Cadre défensif de gestion d'incident (§19). Chaque étape est **journalisée**, **réversible** quand
possible, et adossée à une **preuve**. On ne détruit ni n'altère aucune donnée probante.

## Étapes

1. **Détecter & qualifier** — rassembler les preuves observables (journaux d'accès refusés, échecs
   d'authentification, alertes, `npm audit`). Qualifier la gravité sans supposition : un incident
   « probable » reste probable tant qu'une preuve ne le confirme pas.
2. **Contenir** — limiter la propagation par des actions **réversibles** et **autorisées** (révoquer un
   jeton, isoler un service, activer une limitation de débit). Toute action irréversible exige une
   approbation humaine explicite. Préserver les preuves (ne pas écraser les journaux).
3. **Éradiquer** — corriger la cause racine (`ostack diagnosis` pour l'analyse de cause), pas seulement
   le symptôme. Chaque correctif porte une preuve et un test de non-régression.
4. **Restaurer** — rétablir le service depuis un état sain vérifié ; confirmer par des tests exécutés,
   jamais par supposition.
5. **Capitaliser** — consigner la décision (`ostack decision`) et l'invariant défensif appris
   (`ostack learn`). **Ne jamais** stocker de secret, d'identifiant, de donnée personnelle ni de détail
   de cible : uniquement l'invariant réutilisable (« ce contrôle doit rester en place », § 24).

## Interdits pendant un incident

- Aucune contre-attaque, aucun accès à un système tiers, aucune tentative de « pirater en retour ».
- Aucune suppression de preuve, aucune altération de journaux.
- Aucune communication publique non approuvée ; le rapport priorise la remédiation et les faits établis.

## Sortie

Assembler l'Evidence Pack de l'incident : contrôles vérifiés, constats avec preuves, tests de
non-régression ajoutés, recommandation de release (`ostack security evidence`). `BLOCKED` tant qu'un
constat critique/haut reste ouvert. Voir [[ostack-security-defense]] pour le cadre global.
