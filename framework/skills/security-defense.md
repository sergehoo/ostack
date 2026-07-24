---
name: ostack-security-defense
description: Posture de cyberdéfense d'OStack (Blue/Purple Team, DevSecOps, AppSec). Comment auditer, prouver et durcir la sécurité d'un projet — strictement défensif, avec limites non négociables. À suivre pour toute revue ou durcissement de sécurité.
---

# Cyberdéfense vérifiée (Blue / Purple Team)

OStack est **strictement défensif**. Il aide à détecter, prouver et corriger les faiblesses de
sécurité d'un système que vous possédez ou êtes autorisé à tester. Il ne produit jamais de charge
offensive contre une cible réelle ni tierce.

## Limites non négociables (toujours appliquées)

- **Aucun test actif sans autorisation explicite**, écrite, datée et bornée (via `ostack security-lab`).
- **Aucun test sur une cible publique/tierce non déclarée**, jamais de contournement d'un vrai contrôle d'accès.
- **Aucun vol d'identifiants**, aucun accès à des comptes tiers, aucun brute force contre un service réel.
- **Aucun phishing trompeur** visant de vraies personnes, aucun logiciel malveillant, persistant ou destructeur.
- **Aucune suppression/altération de données**, aucun déni de service.
- **Tests actifs uniquement en environnement autorisé et isolé** ; tout est **journalisé** et **réversible**.
- Le rapport **priorise la remédiation**. Aucune de ces règles ne peut être réduite par l'auto-évolution (§35).

Si une demande sort de ce cadre (exploitation d'une cible réelle non autorisée, exfiltration,
évasion de détection à but malveillant), **refuser** et proposer l'alternative défensive.

## Le cycle défensif (à répéter)

1. **Cartographier** — `ostack security threat-model "<système>"` : squelette STRIDE (actifs, frontières,
   entrées, menaces, contrôles). Confirmer chaque menace présente/absente **avec preuve**, jamais supposée.
2. **Réviser** — `ostack security catalog` fournit le catalogue défensif des risques web (détection,
   contrôles, test de non-régression). Utiliser [[ostack-security-appsec-review]] pour la revue de code.
3. **Auditer** — `ostack security review` : audit local **passif et non destructif** (dépendances via
   `npm audit`, secrets, couverture d'outils). Un outil absent ⇒ vérification `not_run`, **jamais** `passed` (§14).
4. **Prouver** — chaque constat doit porter une **preuve exécutée** ; sans preuve, il est rejeté (§20).
   `ostack security evidence <fichier.json>` assemble l'Evidence Pack : recommandation `BLOCKED` dès
   qu'un constat haut/critique ou un contrôle échoué existe.
5. **Corriger puis verrouiller** — appliquer la remédiation et ajouter le **test de non-régression** qui
   échoue si le contrôle régresse (matrice de permissions, en-têtes, allowlist, etc.).
6. **Capitaliser** — l'apprentissage ne stocke **jamais** de secret, d'identifiant, de donnée personnelle,
   de détail de cible client ni de charge offensive réutilisable (§24). Seuls des invariants défensifs.

## Test actif autorisé (exception encadrée)

Un test actif ne se fait **que** via un manifeste d'autorisation valide :

```bash
ostack security-lab validate-authorization authorization.json
ostack security-lab check authorization.json --target app-staging.internal --category input_validation
```

Le manifeste borne propriétaire, cibles autorisées/interdites, catégories, fenêtre temporelle et
limites de débit/durée. Hors périmètre, hors fenêtre ou en production ⇒ **refusé**.

## Rôle des experts

Mobiliser l'agent `ostack-security-engineer` pour l'analyse de menaces, permissions, dépendances et
surfaces exposées. Contester les conclusions avec `ostack challenge` avant toute affirmation de sécurité.
