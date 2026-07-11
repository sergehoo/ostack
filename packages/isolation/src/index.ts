import { cp, lstat, mkdtemp, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DEFAULT_EXCLUDES = [
  /(^|\/)\.git(\/|$)/, /(^|\/)\.ostack(\/|$)/, /(^|\/)(dist|build|coverage|\.next)(\/|$)/,
  /(^|\/)\.env(?:\.|$)/, /\.(pem|key|p12|pfx)$/i, /(^|\/)(id_rsa|id_ed25519)$/i, /(^|\/)\.DS_Store$/,
  /(^|\/)(\.npmrc|\.pypirc|\.netrc|kubeconfig|credentials\.json|secrets?\.[^/]+)$/i,
  /(^|\/)(\.ssh|\.aws|\.azure)(\/|$)/, /\.(keystore|jks)$/i
];

export interface IsolationOptions { includeDependencies?: boolean; excludedPatterns?: RegExp[]; }
export interface IsolationReport { id: string; path: string; copiedFiles: number; copiedBytes: number; excludedPaths: string[]; createdAt: string; }

export class EphemeralWorkspace implements AsyncDisposable {
  readonly report: IsolationReport;
  private cleaned = false;

  private constructor(private readonly containerPath: string, report: IsolationReport) { this.report = report; }

  static async create(source: string, options: IsolationOptions = {}): Promise<EphemeralWorkspace> {
    const sourceRoot = await realpath(source);
    const container = await mkdtemp(join(tmpdir(), "ostack-isolation-"));
    const workspace = join(container, "workspace");
    const excludes = [...DEFAULT_EXCLUDES, ...(options.includeDependencies === false ? [/(^|\/)node_modules(\/|$)/] : []), ...(options.excludedPatterns ?? [])];
    const excludedPaths: string[] = [];
    let copiedFiles = 0;
    let copiedBytes = 0;
    try {
      await cp(sourceRoot, workspace, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        preserveTimestamps: true,
        filter: async (sourcePath) => {
          const path = relative(sourceRoot, sourcePath);
          if (path && excludes.some((pattern) => pattern.test(path))) { if (excludedPaths.length < 500) excludedPaths.push(path); return false; }
          const info = await lstat(sourcePath);
          if (info.isSymbolicLink()) {
            const link = await readlink(sourcePath);
            const target = isAbsolute(link) ? link : resolve(dirname(sourcePath), link);
            if (isAbsolute(link) || (target !== sourceRoot && !target.startsWith(`${sourceRoot}${sep}`))) {
              if (excludedPaths.length < 500) excludedPaths.push(`${path} (external symlink)`);
              return false;
            }
          } else if (!info.isDirectory() && !info.isFile()) {
            if (excludedPaths.length < 500) excludedPaths.push(`${path} (special file)`);
            return false;
          }
          if (info.isFile()) { copiedFiles++; copiedBytes += info.size; }
          return true;
        }
      });
      return new EphemeralWorkspace(container, {
        id: basename(container), path: workspace, copiedFiles, copiedBytes, excludedPaths, createdAt: new Date().toISOString()
      });
    } catch (error) {
      await rm(container, { recursive: true, force: true });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.cleaned) return;
    if (!basename(this.containerPath).startsWith("ostack-isolation-")) throw new Error("Refusing to remove an unrecognized isolation path");
    await rm(this.containerPath, { recursive: true, force: true });
    this.cleaned = true;
  }

  async [Symbol.asyncDispose](): Promise<void> { await this.cleanup(); }
}
