import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CommandRunRecord } from "./types.js";

export class JsonLinesCommandRunJournal {
  constructor(private readonly path: string) {}

  async append(record: CommandRunRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await appendFile(this.path, `${JSON.stringify(sanitizeRecord(record))}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async list(): Promise<CommandRunRecord[]> {
    try {
      return (await readFile(this.path, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CommandRunRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .slice(0, 500);
}

function sanitizeRecord(record: CommandRunRecord): CommandRunRecord {
  return {
    ...record,
    ...(record.error !== undefined ? { error: safeError(record.error) } : {})
  };
}
