# Fournisseurs IA

Les fournisseurs implémentent tous le port `ModelProvider`. Agents et workflows ne connaissent ni URL, ni clé, ni format propriétaire.

| Fournisseur | Variable d’accès | Modèle par défaut | Endpoint |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | configurable dans `ai.models.openai` | Responses API |
| Anthropic | `ANTHROPIC_API_KEY` | configurable dans `ai.models.anthropic` | Messages API |
| Ollama | service local | configurable dans `ai.models.ollama` | `/api/chat` |

Les clés sont lues depuis l’environnement, jamais depuis `.ostack/config.json`. Les erreurs HTTP sont bornées à 500 caractères et ne journalisent pas les en-têtes. Le sélecteur essaie les fournisseurs dans l’ordre configuré et n’utilise jamais le fournisseur `mock` implicitement.

Le support Google, Mistral, DeepSeek, Azure OpenAI et OpenRouter reste déclaré dans le contrat de configuration et sera livré par adaptateurs séparés.
