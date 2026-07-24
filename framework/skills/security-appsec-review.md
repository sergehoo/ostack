---
name: ostack-security-appsec-review
description: Revue de sécurité applicative (AppSec) fondée sur le catalogue défensif des risques web d'OStack — détecter une faiblesse, prouver qu'elle est contrôlée, verrouiller par un test de non-régression. À suivre lors d'une revue de code orientée sécurité.
---

# Revue de sécurité applicative (AppSec)

Objectif : pour chaque risque pertinent, **détecter** un signal, vérifier le **contrôle** en place, et
ajouter un **test de non-régression** qui échoue si le contrôle disparaît. Défensif uniquement : on ne
rédige jamais de procédure d'exploitation.

## Méthode

1. `ostack security catalog` — liste les risques (contrôle d'accès, injections SQL/XSS, SSRF, CSRF,
   authentification, exposition de données, mauvaise configuration, dépendances vulnérables, traversée
   de chemin, désérialisation, journalisation, redirection ouverte, limitation de débit).
   `ostack security catalog critical` filtre par niveau.
2. Pour chaque endpoint/module modifié, parcourir les **signaux de détection** du catalogue et chercher
   le motif dans le code (concaténation SQL, `innerHTML` sur donnée non fiable, fetch d'URL utilisateur
   sans allowlist, décision d'autorisation côté client, secret en clair…).
3. Quand un signal est présent : vérifier le **contrôle** correspondant. S'il manque, créer un constat
   avec **preuve** (fichier + ligne + observation) et **remédiation** — c'est la seule forme acceptée (§20).
4. Ajouter le **test de non-régression** du catalogue (ex. « un utilisateur A reçoit 403/404 sur une
   ressource de B », « une charge `<script>` est rendue comme texte inerte », « une requête vers une IP
   privée est refusée »).
5. Assembler l'Evidence Pack : `ostack security evidence findings.json`. Un constat haut/critique ⇒
   `BLOCKED`. Aucun constat sans preuve n'est compté.

## Priorités de contrôle (deny-by-default)

- **Autorisation** vérifiée côté serveur à chaque requête (propriété rôle × ressource × propriétaire).
- **Entrées** validées et typées ; requêtes **paramétrées** ; **échappement contextuel** à la sortie.
- **Secrets** hors du dépôt (scanner) ; **TLS** partout ; **chiffrement au repos** des données réglementées.
- **En-têtes** de sécurité présents ; **CORS** restreint ; débogage désactivé en production.
- **Dépendances** auditées ; vulnérabilités hautes/critiques traitées avant release.

Voir [[ostack-security-defense]] pour le cadre et les limites non négociables, et
[[ostack-security-incident-response]] si une faiblesse est déjà exploitée en production.
