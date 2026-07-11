import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { PermissionEngine, type Actor } from "@ostack/core";

export interface WorkspaceSandboxOptions { maxFileBytes?: number; deniedPatterns?: RegExp[]; }
export interface ChangePreview { path: string; kind: "create" | "update"; diff: string; beforeHash?: string; afterHash: string; }
export interface ChangeManifest { id: string; committedAt: string; changes: Array<Omit<ChangePreview, "diff">>; }

interface Snapshot { relativePath: string; original: Buffer | null; current: Buffer; mode?: number; }

export class WorkspaceSandbox {
  private readonly maxFileBytes: number;
  private readonly deniedPatterns: RegExp[];
  private readonly permissions = new PermissionEngine();
  private rootRealPath?: string;

  constructor(private readonly root: string, private readonly actor: Actor, options: WorkspaceSandboxOptions = {}) {
    this.maxFileBytes = options.maxFileBytes ?? 1_000_000;
    this.deniedPatterns = options.deniedPatterns ?? [
      /(^|\/)\.git(\/|$)/, /(^|\/)\.ostack(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)\.env(?:\.|$)/,
      /\.(pem|key|p12|pfx|keystore|jks)$/i, /(^|\/)(id_rsa|id_ed25519)$/i,
      /(^|\/)(\.npmrc|\.pypirc|\.netrc|kubeconfig|credentials\.json|secrets?\.[^/]+)$/i,
      /(^|\/)(\.ssh|\.aws|\.azure)(\/|$)/
    ];
  }

  async begin(projectId: string): Promise<ChangeSession> {
    this.rootRealPath ??= await realpath(this.root);
    this.permissions.assert({ id: randomUUID(), action: "workspace.write", level: 2, actor: this.actor, projectId, resource: this.rootRealPath });
    return new ChangeSession(this.rootRealPath, projectId, this.actor, this.maxFileBytes, this.deniedPatterns);
  }
}

export class ChangeSession {
  readonly id = randomUUID();
  private readonly snapshots = new Map<string, Snapshot>();
  private closed = false;
  private applied = false;

  constructor(
    private readonly root: string,
    readonly projectId: string,
    readonly actor: Actor,
    private readonly maxFileBytes: number,
    private readonly deniedPatterns: RegExp[]
  ) {}

  async read(relativePath: string): Promise<string> {
    const absolute = await this.safePath(relativePath, false);
    const content = await readFile(absolute);
    this.assertSize(content);
    return content.toString("utf8");
  }

  async write(relativePath: string, content: string): Promise<ChangePreview> {
    const result = await this.stage(relativePath, content);
    await this.apply();
    return result;
  }

  async stage(relativePath: string, content: string): Promise<ChangePreview> {
    this.assertOpen();
    const current = Buffer.from(content, "utf8");
    this.assertSize(current);
    const normalizedPath = normalizeRelative(relativePath);
    const absolute = await this.safePath(normalizedPath, true);
    let original: Buffer | null = null;
    let mode: number | undefined;
    try {
      const info = await lstat(absolute);
      if (!info.isFile()) throw new Error(`Not a regular file: ${normalizedPath}`);
      if (info.isSymbolicLink()) throw new Error(`Symbolic links are not writable: ${normalizedPath}`);
      original = await readFile(absolute);
      mode = info.mode;
      this.assertSize(original);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const existing = this.snapshots.get(normalizedPath);
    if (!existing) this.snapshots.set(normalizedPath, { relativePath: normalizedPath, original, current, ...(mode !== undefined ? { mode } : {}) });
    else existing.current = current;
    this.applied = false;
    const baseline = existing?.original ?? original;
    return preview(normalizedPath, baseline, current);
  }

  async apply(): Promise<void> {
    this.assertOpen();
    this.applied = true;
    for (const snapshot of this.snapshots.values()) {
      const absolute = join(this.root, snapshot.relativePath);
      await mkdir(dirname(absolute), { recursive: true });
      await assertContainedDirectory(this.root, dirname(absolute));
      await atomicWrite(absolute, snapshot.current, snapshot.mode);
    }
  }

  previews(): ChangePreview[] { return [...this.snapshots.values()].map((snapshot) => preview(snapshot.relativePath, snapshot.original, snapshot.current)); }

  commit(): ChangeManifest {
    this.assertOpen();
    if (this.snapshots.size > 0 && !this.applied) throw new Error("Staged changes must be applied before commit");
    this.closed = true;
    return {
      id: this.id,
      committedAt: new Date().toISOString(),
      changes: this.previews().map(({ diff: _diff, ...change }) => change)
    };
  }

  async rollback(): Promise<void> {
    this.assertOpen();
    if (!this.applied) { this.closed = true; return; }
    const errors: unknown[] = [];
    for (const snapshot of [...this.snapshots.values()].reverse()) {
      try {
        const absolute = join(this.root, snapshot.relativePath);
        await assertContainedDirectory(this.root, dirname(absolute));
        if (snapshot.original === null) {
          try { await unlink(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        } else await atomicWrite(absolute, snapshot.original, snapshot.mode);
      } catch (error) { errors.push(error); }
    }
    this.closed = true;
    if (errors.length) throw new AggregateError(errors, `Rollback incomplete for ${errors.length} path(s)`);
  }

  private async safePath(relativePath: string, forWrite: boolean): Promise<string> {
    const normalizedPath = normalizeRelative(relativePath);
    if (this.deniedPatterns.some((pattern) => pattern.test(normalizedPath))) throw new Error(`Protected path: ${normalizedPath}`);
    const absolute = join(this.root, normalizedPath);
    const relation = relative(this.root, absolute);
    if (relation.startsWith(`..${sep}`) || relation === ".." || isAbsolute(relation)) throw new Error(`Path escapes workspace: ${relativePath}`);
    const segments = normalizedPath.split(sep);
    const stop = forWrite ? segments.length - 1 : segments.length;
    let cursor = this.root;
    for (let index = 0; index < stop; index++) {
      cursor = join(cursor, segments[index]!);
      try {
        const info = await lstat(cursor);
        if (info.isSymbolicLink()) throw new Error(`Symbolic link traversal denied: ${segments.slice(0, index + 1).join(sep)}`);
        if (!info.isDirectory()) throw new Error(`Parent is not a directory: ${segments.slice(0, index + 1).join(sep)}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && forWrite) break;
        throw error;
      }
    }
    if (!forWrite) {
      const resolved = await realpath(absolute);
      if (resolved !== this.root && !resolved.startsWith(`${this.root}${sep}`)) throw new Error(`Resolved path escapes workspace: ${relativePath}`);
    }
    return absolute;
  }

  private assertOpen(): void { if (this.closed) throw new Error("Change session is closed"); }
  private assertSize(content: Buffer): void { if (content.byteLength > this.maxFileBytes) throw new Error(`File exceeds ${this.maxFileBytes} byte limit`); }
}

function normalizeRelative(path: string): string {
  if (!path || isAbsolute(path)) throw new Error("A non-empty relative path is required");
  const normalized = normalize(path);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) throw new Error(`Path escapes workspace: ${path}`);
  return normalized;
}

async function atomicWrite(path: string, content: Buffer, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.ostack-tmp-${randomUUID()}`);
  try {
    await writeFile(temporary, content, { flag: "wx", mode: mode ?? 0o644 });
    await rename(temporary, path);
  } catch (error) {
    try { await unlink(temporary); } catch { /* best effort cleanup */ }
    throw error;
  }
}

async function assertContainedDirectory(root: string, directory: string): Promise<void> {
  const resolved = await realpath(directory);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error("Resolved parent escapes workspace");
}

function preview(path: string, before: Buffer | null, after: Buffer): ChangePreview {
  return {
    path,
    kind: before === null ? "create" : "update",
    diff: unifiedDiff(path, before?.toString("utf8") ?? "", after.toString("utf8")),
    ...(before ? { beforeHash: hash(before) } : {}),
    afterHash: hash(after)
  };
}
function hash(content: Buffer): string { return createHash("sha256").update(content).digest("hex"); }
function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  const contextBefore = Math.max(0, prefix - 2);
  const contextAfterOld = Math.min(oldLines.length, oldLines.length - suffix + 2);
  const contextAfterNew = Math.min(newLines.length, newLines.length - suffix + 2);
  const oldMiddleEnd = oldLines.length - suffix;
  const newMiddleEnd = newLines.length - suffix;
  const body = [
    ...oldLines.slice(contextBefore, prefix).map((line) => ` ${line}`),
    ...oldLines.slice(prefix, oldMiddleEnd).map((line) => `-${line}`),
    ...newLines.slice(prefix, newMiddleEnd).map((line) => `+${line}`),
    ...oldLines.slice(oldMiddleEnd, contextAfterOld).map((line) => ` ${line}`)
  ];
  const oldCount = contextAfterOld - contextBefore;
  const newCount = contextAfterNew - contextBefore;
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -${contextBefore + 1},${oldCount} +${contextBefore + 1},${newCount} @@`, ...body].join("\n");
}
