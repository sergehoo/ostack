# Politique de sécurité

OStack foundation alpha n’est pas encore approuvé pour un usage en production.

Signalez une vulnérabilité de manière privée au mainteneur du projet avant toute divulgation publique. Incluez composant, version, impact, scénario de reproduction minimal et correctif suggéré si disponible. Ne joignez jamais de secret ou de donnée personnelle réelle.

## Invariants

- refus par défaut et moindre privilège ;
- approbation humaine explicite pour toute action de niveau 4 ;
- secrets exclus des prompts, journaux et artefacts ;
- permissions de plugins déclarées avant activation ;
- événements sensibles auditables avec corrélation.

La copie éphémère protège l’intégrité du projet mais ne constitue pas encore une sandbox OS. N’exécutez pas de commandes qualité provenant d’un dépôt non fiable sur une machine sensible.
