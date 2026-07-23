import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { applyUpdate, checkForUpdates, createRestorePoint, isClean, rollbackTo } from "@ostack/evolution";
import { loadConfig, configDirectory } from "./config.js";
import type { CommandContext } from "./commands.js";

const execFileAsync = promisify(execFile);
const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Propagation automatique des mises à jour à TOUS les utilisateurs (§21).
// Posé en hook de démarrage de session par `ostack install`, `ostack update
// --auto` :
//   - récupère l'état distant (fast-forward only, jamais de merge) ;
//   - applique automatiquement les mises à jour de RESSOURCES uniquement
//     (skills, standards, policies, workflows, domain-packs, docs, définitions
//     du framework) — elles ne se compilent pas, donc sûres et immédiates ;
//   - ne touche JAMAIS le noyau/CLI automatiquement (packages/**, apps/**,
//     package.json) : ces changements exigent build + contrôle, on se contente
//     de notifier. Rollback automatique si la mise à jour échoue.
//
// Ainsi, chaque instance installée converge seule vers les dernières ressources
// dès que le Git est à jour, sans jamais appliquer un changement de code non
// vérifié.
const CORE_PATH = /^(packages|apps)\/|(^|\/)package(-lock)?\.json$|^tsconfig|^eslint\.config/;

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: frameworkRoot, timeout: 120_000, maxBuffer: 8_000_000 });
  return stdout.trim();
}

export async function runAutoUpdate(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const updates = (config as { updates?: { channel?: string; autoInstall?: { resources?: boolean }; rollbackOnFailure?: boolean } }).updates ?? {};
  const quiet = context.args.includes("--quiet");
  const branch = updates.channel === "beta" ? "beta" : "main";
  const autoResources = updates.autoInstall?.resources !== false;   // défaut: ressources auto
  const rollbackOnFailure = updates.rollbackOnFailure !== false;

  let check;
  try { check = await checkForUpdates(frameworkRoot, "origin", branch); }
  catch (error) { return quiet ? { status: "unchecked" } : { status: "unchecked", reason: error instanceof Error ? error.message : String(error) }; }

  if (!check.updatesAvailable) return { status: "up_to_date", channel: branch };
  if (!(await isClean(frameworkRoot))) return { status: "skipped", reason: "dépôt local non propre; lancez 'ostack update' manuellement" };

  // Classer le diff entrant : ressources seulement, ou noyau/CLI ?
  const changed = (await git(["diff", "--name-only", "HEAD", "FETCH_HEAD"])).split("\n").filter(Boolean);
  const touchesCore = changed.some((path) => CORE_PATH.test(path));

  if (touchesCore || !autoResources) {
    await audit(context, config.project?.id ?? "ostack", "update.auto_notified", { behind: check.behind, touchesCore });
    return {
      status: "update_available",
      scope: touchesCore ? "framework" : "resources",
      behind: check.behind,
      note: "Mise à jour disponible. Le noyau/CLI ne s'applique pas automatiquement (build + contrôle requis) : lancez 'ostack update'."
    };
  }

  // Ressources uniquement : appliquer en fast-forward avec point de restauration.
  const restorePoint = await createRestorePoint(frameworkRoot);
  try {
    const result = await applyUpdate(frameworkRoot, "origin", branch);
    await audit(context, config.project?.id ?? "ostack", "update.auto_applied", { from: result.from, to: result.to, files: changed.length });
    return { status: "resources_updated", channel: branch, from: result.from.slice(0, 12), to: result.to.slice(0, 12), files: changed.length };
  } catch (error) {
    if (rollbackOnFailure) await rollbackTo(frameworkRoot, restorePoint);
    await audit(context, config.project?.id ?? "ostack", "update.auto_failed", { rolledBack: rollbackOnFailure });
    return { status: "failed_rolled_back", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function audit(context: CommandContext, projectId: string, action: string, details: Record<string, unknown>): Promise<void> {
  try {
    await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
      actorId: process.env.USER ?? "cli-user", action, projectId, outcome: action.includes("failed") ? "denied" : "succeeded", details
    }));
  } catch { /* best-effort en hook de session */ }
}
