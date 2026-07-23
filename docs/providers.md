# Fournisseurs IA

Les fournisseurs implémentent tous le port `ModelProvider`. Agents et workflows ne connaissent ni URL, ni clé, ni format propriétaire.

| Fournisseur | Variable d’accès | Modèle par défaut | Endpoint |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | configurable dans `ai.models.openai` | Responses API |
| Anthropic | `ANTHROPIC_API_KEY` | configurable dans `ai.models.anthropic` | Messages API |
| Ollama | service local | configurable dans `ai.models.ollama` | `/api/chat` |

Les clés sont lues depuis l’environnement, jamais depuis `.ostack/config.json`. Les erreurs HTTP sont bornées à 500 caractères et ne journalisent pas les en-têtes. Le sélecteur essaie les fournisseurs dans l’ordre configuré et n’utilise jamais le fournisseur `mock` implicitement.

Le port `ModelProvider` accepte un `AbortSignal` facultatif sur chaque requête. Les adaptateurs HTTP
le combinent avec leur timeout propre ; le runtime de commandes l’annule quand sa limite est
atteinte. La borne locale reste active pour un plugin tiers qui ignorerait le signal.

Le support Google, Mistral, DeepSeek, Azure OpenAI et OpenRouter reste déclaré dans le contrat de configuration et sera livré par adaptateurs séparés.

## Exécution des commandes déclaratives

`ostack run <commande>` utilise le même sélecteur et le même port `ModelProvider` que les workflows.
Le fournisseur peut être imposé avec `--provider`; il n’est jamais remplacé implicitement par
`mock`. `--dry-run` n’effectue aucun appel réseau.

Le timeout de la couche d’exécution est indépendant du format du fournisseur et peut être défini
dans `execution.timeoutMs`, dans le frontmatter `timeout-ms` de la commande ou avec `--timeout`.
Les échecs et timeouts sont journalisés sans persister les prompts ou réponses.
