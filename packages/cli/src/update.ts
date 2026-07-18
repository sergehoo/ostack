import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonLinesAuditStore, auditEntry } from "@ostack/core";
import { applyUpdate, checkForUpdates, createRestorePoint, isClean, rollbackTo } from "@ostack/evolution";
import { configDirectory, loadConfig } from "./config.js";
import type { CommandContext } from "./commands.js";

// La mise à jour opère sur le dépôt FRAMEWORK (le clone OStack), pas sur le projet.
const frameworkRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// `ostack update` (§21) — met à jour le framework OStack avec point de
// restauration et rollback sur échec. Sûr: fast-forward only, doctor exécuté
// après mise à jour, rollback automatique si la vérification échoue.
//   ostack update --check       vérifie sans installer
//   ostack update               met à jour puis vérifie (rollback si échec)
//   ostack update --rollback    restaure le dernier point de restauration
//   ostack update --channel <stable|beta>
export async function runUpdate(context: CommandContext): Promise<unknown> {
  const config = await loadConfig(context.cwd);
  const updates = (config as { updates?: { channel?: string; rollbackOnFailure?: boolean } }).updates ?? {};
  const branch = readChannel(context.args, updates.channel);
  const rollbackOnFailure = updates.rollbackOnFailure !== false;
  const restorePath = join(frameworkRoot, ".ostack", "update", "restore-point.json");

  if (context.args.includes("--rollback")) {
    const saved = await readRestorePoint(restorePath);
    if (!saved) throw new Error("Aucun point de restauration enregistré.");
    await rollbackTo(frameworkRoot, saved.commit);
    await audit(context, config.project.id, "update.rollback", { commit: saved.commit });
    return { status: "rolled_back", to: saved.commit.slice(0, 12), note: "Relancez 'npm run build' pour reconstruire." };
  }

  const check = await checkForUpdates(frameworkRoot, "origin", branch);
  if (context.args.includes("--check")) {
    return { status: check.updatesAvailable ? "update_available" : "up_to_date", channel: branch, current: check.current.slice(0, 12), behind: check.behind };
  }
  if (!check.updatesAvailable) return { status: "up_to_date", channel: branch, current: check.current.slice(0, 12) };
  if (!(await isClean(frameworkRoot))) throw new Error("Le dépôt framework a des changements non commités; commit ou stash avant la mise à jour.");

  // 1) Point de restauration. 2) Mise à jour fast-forward. 3) Vérification.
  const restorePoint = await createRestorePoint(frameworkRoot);
  await writeRestorePoint(restorePath, { commit: restorePoint, at: new Date().toISOString(), channel: branch });
  const result = await applyUpdate(frameworkRoot, "origin", branch);

  const verification = await verify();
  if (!verification.ok) {
    let rolledBack = false;
    if (rollbackOnFailure) { await rollbackTo(frameworkRoot, restorePoint); rolledBack = true; }
    await audit(context, config.project.id, "update.failed", { from: result.from, to: result.to, rolledBack, reason: verification.reason });
    throw new Error(`Vérification post-mise-à-jour échouée (${verification.reason}). ${rolledBack ? `Restauré à ${restorePoint.slice(0, 12)}.` : "Rollback désactivé; restaurez avec 'ostack update --rollback'."}`);
  }

  await audit(context, config.project.id, "update.applied", { from: result.from, to: result.to });
  return {
    status: "updated", channel: branch,
    from: result.from.slice(0, 12), to: result.to.slice(0, 12),
    restorePoint: restorePoint.slice(0, 12),
    note: "Relancez 'npm run build' si le noyau ou le CLI ont changé."
  };
}

// Vérification post-mise-à-jour: build + doctor doivent réussir.
async function verify(): Promise<{ ok: boolean; reason?: string }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  try { await run("npm", ["run", "check"], { cwd: frameworkRoot, timeout: 300_000, maxBuffer: 8_000_000 }); }
  catch { return { ok: false, reason: "build/typecheck en échec" }; }
  return { ok: true };
}

function readChannel(args: string[], configured?: string): string {
  const index = args.indexOf("--channel");
  const channel = index === -1 ? (configured ?? "stable") : args[index + 1];
  if (channel === "stable") return "main";
  if (channel === "beta") return "beta";
  return channel ?? "main";
}

async function readRestorePoint(path: string): Promise<{ commit: string } | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as { commit: string }; } catch { return undefined; }
}

async function writeRestorePoint(path: string, data: { commit: string; at: string; channel: string }): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function audit(context: CommandContext, projectId: string, action: string, details: Record<string, unknown>): Promise<void> {
  await new JsonLinesAuditStore(join(configDirectory(context.cwd), "audit.jsonl")).append(auditEntry({
    actorId: process.env.USER ?? "cli-user", action, projectId, outcome: action.includes("failed") ? "denied" : "succeeded", details
  }));
}
