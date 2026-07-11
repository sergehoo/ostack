# Sandbox de modifications locales

Le paquet `@ostack/workspace` est le seul chemin prévu pour permettre à un agent de modifier un projet. Il applique les règles suivantes avant toute écriture :

- acteur doté du rôle `local-writer` et autorisation de niveau 2 ;
- chemin relatif contenu dans la racine réelle du projet ;
- refus de traversée `..`, chemins absolus et liens symboliques ;
- refus de `.git`, `.ostack`, `node_modules`, fichiers `.env`, clés et certificats ;
- limite de taille avant lecture et écriture ;
- écriture atomique via fichier temporaire dans le même répertoire.

Chaque session conserve la préimage de chaque fichier au premier changement. Avant commit elle produit un diff unifié et les empreintes SHA-256. `rollback()` restaure les fichiers modifiés et supprime les fichiers créés. Après `commit()` ou `rollback()`, la session est fermée et ne peut plus être réutilisée.

## Limite actuelle

Le sandbox est testé mais n’est pas encore exposé directement aux modèles IA. Cette séparation est intentionnelle : le prochain jalon imposera une sortie structurée, une validation humaine du diff et l’exécution des tests avant commit de session.
