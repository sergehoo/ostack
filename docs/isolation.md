# Isolation des validations

`@ostack/isolation` crée une copie éphémère unique dans le répertoire temporaire du système. OStack y applique le plan et y lance les contrôles qualité avant de toucher au projet réel.

## Exclusions

La copie exclut notamment `.git`, `.ostack`, `.env`, gestionnaires de secrets, clés, certificats, configurations cloud, builds et couvertures. Les liens symboliques absolus ou sortant de la racine sont refusés. Les liens relatifs internes nécessaires aux workspaces de dépendances sont conservés.

La copie est supprimée dans un bloc `finally`, y compris après timeout, échec d’un test ou exception. L’historique conserve seulement son identifiant, le nombre de fichiers et le volume copiés — jamais son ancien chemin temporaire.

## Promotion

Après succès des contrôles, OStack relit les fichiers réels et recalcule l’empreinte de confirmation. Une modification concurrente interdit la promotion. Les fichiers validés sont ensuite appliqués par le sandbox réversible.

## Limite de sécurité

Cette stratégie protège le projet réel contre les effets de bord normaux des builds et tests. Elle ne confine pas un programme hostile au niveau du système d’exploitation. Le futur exécuteur de production utilisera un conteneur sans privilèges, un système de fichiers minimal, des limites de ressources et un réseau désactivé par défaut.
