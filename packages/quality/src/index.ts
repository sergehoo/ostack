import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { PermissionEngine, type ActionRequest, type Approval } from "@ostack/core";

const execFileAsync = promisify(execFile);

export interface QualityCommand { command: string; args: string[]; }
export interface QualityResult { command: QualityCommand; success: boolean; exitCode: number | string; stdout: string; stderr: string; durationMs: number; }
export interface QualityRunnerOptions { timeoutMs?: number; maxOutputBytes?: number; }

export class QualityRunner {
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly allowed: Set<string>;

  constructor(private readonly root: string, allowedCommands: QualityCommand[], options: QualityRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 256_000;
    this.allowed = new Set(allowedCommands.map(commandKey));
  }

  async run(commands: QualityCommand[], request: ActionRequest, approval: Approval): Promise<QualityResult[]> {
    new PermissionEngine().assert(request, approval);
    if (request.level !== 3) throw new Error("Quality process execution must use security level 3");
    for (const command of commands) if (!this.allowed.has(commandKey(command))) throw new Error(`Quality command is not allowlisted: ${formatCommand(command)}`);
    const results: QualityResult[] = [];
    for (const command of commands) {
      const result = await this.execute(command);
      results.push(result);
      if (!result.success) break;
    }
    return results;
  }

  private async execute(command: QualityCommand): Promise<QualityResult> {
    if (!command.command || command.command.includes("/") || command.command.includes("\\")) throw new Error("Quality executable must be resolved from PATH");
    const started = performance.now();
    try {
      const { stdout, stderr } = await execFileAsync(command.command, command.args, {
        cwd: this.root, env: safeEnvironment(), timeout: this.timeoutMs, maxBuffer: this.maxOutputBytes, encoding: "utf8", windowsHide: true
      });
      return { command, success: true, exitCode: 0, stdout: sanitizeOutput(stdout, this.maxOutputBytes), stderr: sanitizeOutput(stderr, this.maxOutputBytes), durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
      return {
        command, success: false, exitCode: failure.code ?? "FAILED",
        stdout: sanitizeOutput(String(failure.stdout ?? ""), this.maxOutputBytes),
        stderr: sanitizeOutput(String(failure.stderr ?? failure.message), this.maxOutputBytes),
        durationMs: Math.round(performance.now() - started)
      };
    }
  }
}

function sanitizeOutput(value: string, limit: number): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED TOKEN]")
    .replace(/\b(api[_-]?key|token|secret|password|passwd)\b\s*[:=]\s*["']?[^\s"']+["']?/gi, "$1=[REDACTED]")
    .slice(0, limit);
}

function commandKey(command: QualityCommand): string { return JSON.stringify([command.command, ...command.args]); }
function formatCommand(command: QualityCommand): string { return [command.command, ...command.args].join(" "); }
function safeEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SystemRoot", "ComSpec"];
  const environment: NodeJS.ProcessEnv = { CI: "1", NO_COLOR: "1" };
  for (const key of allowed) if (process.env[key] !== undefined) environment[key] = process.env[key];
  return environment;
}
