import { isAbsolute, join, resolve } from "node:path";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { pullFastForward, pushResources, syncStatus } from "@ostack/evolution";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// `ostack sync` (§20) — synchronise le dépôt de connaissances dédié.
//   ostack sync status         état du clone local (branche, avance/retard, propreté)
//   ostack sync pull           pull fast-forward-only (jamais de merge silencieux)
//   ostack sync push           push gardé (jamais force ni branche protégée)
//   ostack sync verify         vérifie que le clone est propre et à jour
//
// Sûr par conception: pull refuse une branche divergée plutôt que de fusionner;
// push passe par assertGitOperationAllowed. Rien ne contourne les protections.
export async function runSync(context: CommandContext): Promise<unknown> {
  const [subcommand] = context.args;
  const config = await loadConfig(context.cwd);
  const repo = config.knowledgeRepository;
  if (!repo) {
    return {
      status: "not_configured",
      message: "Déclarez knowledgeRepository dans .ostack/config.json: { remote, branch, localPath, syncOnStart, pushOnVerifiedLearning }. Le dépôt principal contient le moteur; le dépôt de connaissances contient les ressources évolutives (§19)."
    };
  }
  const localPath = resolveLocal(context.cwd, repo.localPath);

  switch (subcommand ?? "status") {
    case "status": {
      const status = await syncStatus(localPath);
      return { repository: repo.remote, branch: repo.branch, localPath: repo.localPath, ...status };
    }
    case "pull": {
      const result = await pullFastForward(localPath, "origin", repo.branch);
      await audit(context, config.project.id, "sync.pull", { pulled: result.pulled });
      return { status: result.pulled ? "pulled" : "not_pulled", ...(result.note ? { note: result.note } : {}), branch: repo.branch };
    }
    case "push": {
      if (!repo.pushOnVerifiedLearning) {
        throw new Error("Push refusé: knowledgeRepository.pushOnVerifiedLearning est false. Activez-le explicitement pour autoriser la publication des connaissances vérifiées.");
      }
      const status = await syncStatus(localPath);
      if (!status.isRepo) throw new Error(`Aucun dépôt git en ${repo.localPath}`);
      if (!status.clean) throw new Error("Arbre de travail non propre; commit avant de pousser");
      await pushResources(localPath, repo.branch);   // guarded: refuses protected branch names
      await audit(context, config.project.id, "sync.push", { branch: repo.branch });
      return { status: "pushed", branch: repo.branch };
    }
    case "verify": {
      const status = await syncStatus(localPath);
      const issues: string[] = [];
      if (!status.isRepo) issues.push("le chemin local n'est pas un dépôt git");
      if (status.isRepo && !status.clean) issues.push("arbre de travail non propre");
      if (status.hasUpstream && (status.behind ?? 0) > 0) issues.push(`${status.behind} commit(s) en retard sur le distant; lancez 'ostack sync pull'`);
      return { status: issues.length === 0 ? "verified" : "issues", issues, details: status };
    }
    default:
      throw new Error(`Unknown sync subcommand '${subcommand}'. Use status | pull | push | verify`);
  }
}

function resolveLocal(cwd: string, localPath: string): string {
  return isAbsolute(localPath) ? localPath : resolve(cwd, localPath);
}

async function audit(context: CommandContext, projectId: string, action: string, details: Record<string, unknown>): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action, projectId, outcome: "succeeded", details
  }));
}
