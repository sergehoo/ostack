# Moteur de changements contrôlés

Un plan de changement OStack est un document JSON conforme à `schemas/change-plan.schema.json`. Il ne peut créer ou remplacer que des fichiers texte ; la suppression et le renommage ne sont pas encore autorisés.

## Protocole

1. Validation du schéma, du projet cible, du nombre de fichiers et de l’unicité des chemins.
2. Staging en mémoire sans toucher au système de fichiers.
3. Production des diffs et empreintes SHA-256 avant/après.
4. Calcul d’une empreinte de confirmation couvrant le plan, les préimages et les commandes qualité exactes.
5. Confirmation humaine avec raison obligatoire.
6. Création d’une copie éphémère excluant état local, secrets, builds et liens externes.
7. Application du plan et exécution sans shell des commandes qualité dans cette copie.
8. Suppression de la copie, que les contrôles réussissent ou échouent.
9. Nouvelle lecture du projet réel ; toute dérive pendant les tests invalide la confirmation.
10. Promotion atomique des seuls fichiers planifiés lorsque tous les contrôles ont réussi.

Les secrets, liens symboliques et chemins protégés restent refusés par le sandbox. Les traces de décision et résultats sont écrits dans `.ostack/audit.jsonl` et `.ostack/changes/`, exclus du contrôle de source.

## Limite résiduelle

La copie éphémère isole les effets de bord ordinaires sur les fichiers, mais elle n’est pas une frontière de sécurité système : un processus hostile peut encore utiliser le réseau, les autres chemins accessibles au compte local ou les ressources du système. Une sandbox OS ou un conteneur durci reste nécessaire avant d’exécuter du code non fiable.
