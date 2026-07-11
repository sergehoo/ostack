import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  projectId: string;
  outcome: "allowed" | "denied" | "failed" | "succeeded";
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  list(): Promise<AuditEntry[]>;
}

export class JsonLinesAuditStore implements AuditStore {
  constructor(private readonly file: string) {}

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async list(): Promise<AuditEntry[]> {
    try {
      return (await readFile(this.file, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

export function auditEntry(input: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...input };
}
