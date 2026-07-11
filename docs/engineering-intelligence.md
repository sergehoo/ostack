# Intelligence d'ingénierie — boucle, performance, architecture, diagnostic, mémoire

Ces moteurs complètent la chaîne vérifiée sur les points d'ingénierie profonds du cahier des
charges. Tous sont déterministes et refusent d'affirmer sans preuve.

## Boucle de vérification autonome — `@ostack/loop` (§11)

Hypothèse → implémentation → exécution → observation → comparaison → diagnostic → correction
ciblée → nouvelle vérification. La boucle ne dérive jamais :

- budgets **durs** : tentatives, temps, coût ;
- **détection de répétition** : une correction déjà tentée arrête la boucle (pas de modification au hasard) ;
- **détection d'oscillation** : un aller-retour A→B→A est signalé comme corrections contradictoires ;
- **arrêt sur preuve insuffisante** : une réussite déclarée sans aucune observation est refusée (§36.6) ; N tentatives aveugles consécutives escaladent ;
- toute sortie qui n'est pas une réussite vérifiée **escalade vers l'humain** avec l'historique complet.

Le moteur est utilisé programmatiquement (par le quality runner et les workflows). La commande de
correction *entièrement autonome* attend la sandbox de mutation durcie (M2) : exécuter des
corrections de code non supervisées exige l'isolation conteneur.

## Performance Intelligence — `@ostack/observe` (§20)

Baseline avant, mesure après, détection de régression, blocage. Les percentiles p50/p95 viennent
d'échantillons réels (`--samples`, ≥ 3). Une sonde en échec pendant la campagne **invalide** la
mesure — une baseline construite sur des erreurs serait une référence fabriquée. Le seuil combine
ratio (+20 % par défaut) et plancher absolu (20 ms) pour ignorer le bruit. Sondes nouvelles ou
disparues signalées, jamais supposées bonnes.

```bash
ostack performance baseline --samples 10
ostack performance compare --samples 10 --gate    # échoue sur régression p95
```

## Architecture Intelligence — `@ostack/architecture` (§19)

Frontières déclarées (`policies/architecture.json`) vérifiées contre le **graphe d'imports réel**
(static, dynamique, require, ré-exports). Chaque violation nomme le fichier, l'import fautif et la
règle. OStack applique ses propres règles à lui-même : noyau sans dépendance interne, packages
jamais dépendants des apps, moteurs de vérification et couche métier neutres vis-à-vis des
fournisseurs. `ostack architecture check --gate` bloque avant merge.

## Analyse de cause racine — `@ostack/diagnosis` (§23)

Un diagnostic est un artefact structuré distinguant symptôme, cause directe, cause racine,
facteurs contributifs, correction et prévention. La chronologie est reconstruite depuis le journal
d'audit. Le statut `diagnosed` est **mérité** : il exige une hypothèse confirmée par une expérience
exécutée et concluante, **et** un test de non-régression (§36.7 — aucune correction sans test de
non-régression). `root-cause check` liste ce qui manque ; `close` refuse tant que ce n'est pas complet.

## Mémoire institutionnelle — `@ostack/decisions` (§24)

Mémoire versionnée des décisions : problème, options essayées, résultat, solution retenue, raison,
conditions de réutilisation. **Aucun secret** : tout contenu ressemblant à un identifiant est
masqué avant l'enregistrement (testé). La recherche lexicale pondérée est explicable par les termes
correspondants — avant de proposer une solution, on cherche d'abord les décisions similaires.

## Model Mesh — compteur de coûts réels (§8)

Le workflow `feature` mesure désormais l'usage réel de tokens et la latence par étape routée, dans
un **ledger** (`.ostack/mesh-ledger.jsonl`). La vérification est réglée après coup : `ostack mesh
settle <runId>` lit le verdict depuis l'Evidence Pack du run (ou un drapeau humain explicite) et
convertit le ledger en statistiques. Sans tarif configuré, le coût reste **inconnu** — jamais
remplacé par zéro, ce qui fausserait le coût par résultat vérifié. Le ledger est consommé au
règlement : impossible de régler deux fois le même run.
