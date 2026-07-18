#!/usr/bin/env bash
# Configure la protection de branche exigée par l'auto-merge OStack (§16).
# À lancer UNE FOIS, après `gh auth login`. OStack ne voit jamais le token:
# gh l'obtient du gestionnaire d'identifiants sécurisé du système.
#
#   bash scripts/setup-branch-protection.sh <owner/repo> [branche]
#
# Impose sur la branche principale: Pull Request obligatoire, checks CI
# obligatoires, pas de force push, pas de suppression. C'est la VRAIE barrière
# qui rend l'auto-merge sûr — l'automatisation ne peut pas la contourner.
set -euo pipefail

REPO="${1:?Usage: setup-branch-protection.sh <owner/repo> [branche]}"
BRANCH="${2:-main}"

command -v gh >/dev/null 2>&1 || { echo "gh introuvable. Installez GitHub CLI puis 'gh auth login'." >&2; exit 1; }

echo "Application de la protection sur ${REPO}@${BRANCH}…"
gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify", "OStack Evolution Verification / verify"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON

# Active l'auto-merge au niveau du dépôt (nécessaire pour `gh pr merge --auto`).
gh api -X PATCH "repos/${REPO}" -f allow_auto_merge=true >/dev/null

echo "Protection appliquée: PR obligatoire, checks CI stricts, pas de force push ni suppression, auto-merge activé."
echo "OStack peut désormais: ostack evolve pr … puis ostack evolve merge … (auto-merge faible risque)."
