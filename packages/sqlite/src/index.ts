import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RunRepository, WorkflowRun } from "@ostack/core";

export class SqliteRunRepository implements RunRepository, Disposable {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_steps_json TEXT NOT NULL,
        outputs_json TEXT NOT NULL,
        pending_approval_request_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_updated
        ON workflow_runs(project_id, updated_at DESC);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
  }

  async save(run: WorkflowRun): Promise<void> {
    this.database.prepare(`
      INSERT INTO workflow_runs(id, workflow_id, project_id, status, started_at, updated_at, completed_steps_json, outputs_json, pending_approval_request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        completed_steps_json = excluded.completed_steps_json,
        outputs_json = excluded.outputs_json,
        pending_approval_request_id = excluded.pending_approval_request_id
    `).run(
      run.id, run.workflowId, run.projectId, run.status, run.startedAt, run.updatedAt ?? new Date().toISOString(),
      JSON.stringify(run.completedSteps), JSON.stringify(run.outputs), run.pendingApprovalRequestId ?? null
    );
  }

  async get(id: string): Promise<WorkflowRun | undefined> {
    const row = this.database.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  async list(projectId: string, limit = 50): Promise<WorkflowRun[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const rows = this.database.prepare("SELECT * FROM workflow_runs WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?").all(projectId, safeLimit) as unknown as RunRow[];
    return rows.map(fromRow);
  }

  close(): void { this.database.close(); }
  [Symbol.dispose](): void { this.close(); }
}

interface RunRow {
  id: string; workflow_id: string; project_id: string; status: WorkflowRun["status"]; started_at: string; updated_at: string;
  completed_steps_json: string; outputs_json: string; pending_approval_request_id: string | null;
}

function fromRow(row: RunRow): WorkflowRun {
  return {
    id: row.id, workflowId: row.workflow_id, projectId: row.project_id, status: row.status,
    startedAt: row.started_at, updatedAt: row.updated_at,
    completedSteps: JSON.parse(row.completed_steps_json) as string[], outputs: JSON.parse(row.outputs_json) as Record<string, unknown>,
    ...(row.pending_approval_request_id ? { pendingApprovalRequestId: row.pending_approval_request_id } : {})
  };
}
