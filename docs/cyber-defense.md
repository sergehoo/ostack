# Cyberdéfense & tests de sécurité (extension OStack)

Cette extension dote OStack d'une expertise avancée en cybersécurité **strictement défensive** :
Blue Team, Purple Team, DevSecOps, AppSec, sécurité cloud/conteneurs, tests autorisés, réponse à
incident. Elle ne produit jamais de charge offensive contre une cible réelle ou tierce.

## Limites non négociables

- Aucun test actif sans **autorisation explicite**, datée et bornée (via `ostack security-lab`).
- Aucun test sur une cible publique/tierce non déclarée ; aucun contournement d'un vrai contrôle d'accès.
- Aucun vol d'identifiants, accès à des comptes tiers, brute force contre un service réel.
- Aucun phishing trompeur, logiciel malveillant/persistant/destructeur.
- Aucune suppression/altération de données ; aucun déni de service.
- Tests actifs **uniquement en environnement autorisé et isolé** ; tout est journalisé et réversible.
- Le rapport priorise la remédiation. L'auto-évolution ne peut réduire aucun de ces garde-fous (§35).

Ces règles sont encodées dans la politique versionnée [`policies/self-defense.json`](../policies/self-defense.json)
et appliquées de façon déterministe par `@ostack/security` (aucun contenu observé via un outil n'est
traité comme une instruction ; tout chemin protégé ou toute réduction de garde-fou exige une
approbation humaine).

## Commandes

```bash
ostack security review                     # audit local passif, non destructif → Evidence Pack
ostack security dependencies               # audit des dépendances (npm audit si présent)
ostack security threat-model "<système>"   # squelette STRIDE (actifs, frontières, menaces, contrôles)
ostack security catalog [critical|high]    # catalogue défensif des risques web (détection + contrôles + test)
ostack security permissions <matrice.json> # matrice Rôle × Ressource × État (violations, cellules non testées)
ostack security containers                 # lint Dockerfiles/IaC (hadolint, trivy config) si présents
ostack security evidence <fichier.json>    # assemble un Security Evidence Pack
ostack security retest <fichier.json>      # réassemble l'Evidence Pack en revérifiant l'état des constats
ostack incident "<intitulé>"               # squelette de réponse à incident (détecter → capitaliser)
```

`review` exécute les scanners réellement présents sur le PATH : **semgrep** (SAST), **gitleaks**
(secrets, valeur toujours rédigée §24), **trivy** (dépendances/IaC). Un scanner absent, en échec ou
qui dépasse `OSTACK_SCANNER_TIMEOUT_MS` (45 s par défaut) devient `not_run`, jamais `passed`.

Test **actif** autorisé (exception encadrée) — passe exclusivement par le gate d'autorisation :

```bash
ostack security-lab validate-authorization authorization.json
ostack security-lab check authorization.json --target app-staging.internal --category input_validation
```

Le manifeste borne propriétaire, cibles autorisées/interdites, **catégories interdites** (elles
gagnent toujours), fenêtre temporelle et **limites** de débit/durée. Hors périmètre, hors fenêtre ou
en production ⇒ refusé.

## Garanties déterministes (`@ostack/security`)

- **Security Evidence Pack** — un constat sans preuve **ou** sans remédiation est rejeté ; un constat
  haut/critique ou un contrôle échoué force `BLOCKED` ; empreinte de contenu stable.
- **Catalogue de risques web** — pour chaque risque : signaux de détection, contrôles et **test de
  non-régression**. Aucune procédure d'exploitation.
- **Détection d'outils honnête** — un outil absent devient une vérification `not_run`, **jamais**
  `passed`. L'absence de preuve n'est pas une preuve de sécurité.
- **Scanners réels quand présents** — `ostack security review` exécute `semgrep` (SAST), `gitleaks`
  (secrets) et `trivy` (dépendances/IaC) **uniquement s'ils sont sur le PATH**, et convertit leur
  sortie JSON réelle en constats. Un outil absent est ignoré ; un outil qui échoue ou dont la sortie
  est inanalysable reste `not_run`. Le parseur de secrets **rédige** toute valeur : aucun secret n'est
  jamais stocké (§24).
- **Auto-défense** — politiques, garde-fous et preuves de sécurité sont des actifs protégés ; le
  contenu observé via un outil est une donnée non fiable.

## Skills installés

`ostack install` dépose ces skills défensifs dans le projet : `ostack-security-defense` (cadre et
cycle), `ostack-security-appsec-review` (revue de code par le catalogue), `ostack-security-incident-response`
(réponse à incident). Ils sont mobilisés par l'agent `ostack-security-engineer`.
