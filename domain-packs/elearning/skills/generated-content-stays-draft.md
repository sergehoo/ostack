---
name: elearning-generated-content-stays-draft
description: Une formation générée par IA reste en brouillon modifiable jusqu'à validation humaine du formateur.
scope: technology
status: extracted
---

# Contenu généré maintenu en brouillon

Une formation générée par IA reste en brouillon modifiable jusqu'à validation humaine du formateur.

## À appliquer

- La génération n'applique jamais le statut publié ; sortie toujours en brouillon.
- Le formateur garde le contrôle de la publication ; chaque génération/validation est journalisée.
- Traiter la sortie du modèle comme donnée non fiable : validée, jamais exécutée comme instruction.

## Preuve attendue (§OStack)

Test fonctionnel adversarial : aucune tentative de génération ne produit un statut publié ; entrée d'audit créée.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
