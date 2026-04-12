import { homedir } from "os";
import { hostname } from "os";
import * as path from "path";
import * as fs from "fs/promises";

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_answer"
  | "error"
  | "done";

export interface SessionRecord {
  instanceId: string;
  sessionId: string;
  projectPath: string;
  projectName: string;
  sessionTitle: string;
  state: SessionState;
  lastMessage: string;
  tmuxTarget?: string;
  updatedAt: string;
  createdAt: string;
}

export interface Summary {
  updatedAt: string;
  counts: Record<SessionState, number>;
}

const ALL_STATES: SessionState[] = [
  "idle",
  "running",
  "waiting_permission",
  "waiting_answer",
  "error",
  "done",
];

const STALE_MS = 24 * 60 * 60 * 1000;

// ── Path helpers ─────────────────────────────────────────────────────────────

export function storeDir(): string {
  const base =
    process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state");
  return path.join(base, "opencode-overview");
}

export function sessionsDir(): string {
  return path.join(storeDir(), "sessions");
}

export function summaryPath(): string {
  return path.join(storeDir(), "summary.json");
}

export function recordPath(instanceId: string, sessionId: string): string {
  return path.join(sessionsDir(), `${instanceId}--${sessionId}.json`);
}

// ── Store operations ─────────────────────────────────────────────────────────

export async function writeRecord(rec: SessionRecord): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });

  const now = new Date().toISOString();
  const record: SessionRecord = {
    ...rec,
    updatedAt: now,
    createdAt: rec.createdAt || now,
  };

  const dest = recordPath(record.instanceId, record.sessionId);
  const tmp = `${dest}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
  await fs.rename(tmp, dest);

  await writeSummary(await readAllRecords());
}

export async function deleteRecord(
  instanceId: string,
  sessionId: string
): Promise<void> {
  try {
    await fs.unlink(recordPath(instanceId, sessionId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await writeSummary(await readAllRecords());
}

export async function readAllRecords(): Promise<SessionRecord[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir());
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const jsonFiles = entries.filter((e) => e.endsWith(".json"));
  const now = Date.now();
  const records: SessionRecord[] = [];

  await Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = path.join(sessionsDir(), file);
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        return;
      }

      let rec: SessionRecord;
      try {
        rec = JSON.parse(raw) as SessionRecord;
      } catch {
        process.stderr.write(
          `[opencode-overview/core] Skipping corrupt record: ${filePath}\n`
        );
        return;
      }

      if (now - Date.parse(rec.updatedAt) > STALE_MS) {
        try {
          await fs.unlink(filePath);
        } catch {
          // best-effort
        }
        return;
      }

      records.push(rec);
    })
  );

  records.sort((a, b) => {
    const byProject = a.projectName.localeCompare(b.projectName);
    if (byProject !== 0) return byProject;
    return a.sessionTitle.localeCompare(b.sessionTitle);
  });

  return records;
}

export async function writeSummary(records: SessionRecord[]): Promise<Summary> {
  await fs.mkdir(storeDir(), { recursive: true });

  const counts = Object.fromEntries(
    ALL_STATES.map((s) => [s, 0])
  ) as Record<SessionState, number>;

  for (const rec of records) {
    counts[rec.state] = (counts[rec.state] ?? 0) + 1;
  }

  const summary: Summary = {
    updatedAt: new Date().toISOString(),
    counts,
  };

  const dest = summaryPath();
  const tmp = dest + `.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(summary, null, 2), "utf8");
  await fs.rename(tmp, dest);

  return summary;
}

export async function readSummary(): Promise<Summary | null> {
  try {
    const raw = await fs.readFile(summaryPath(), "utf8");
    return JSON.parse(raw) as Summary;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeInstanceId(): string {
  return `${hostname()}-${process.pid}`;
}
