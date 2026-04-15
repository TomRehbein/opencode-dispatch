import { homedir, hostname } from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { writeFileSync, renameSync } from "fs";

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
    /** When true the session is hidden from the default "all" view.
     *  Hidden sessions remain on disk until the normal 24-hour stale purge
     *  and can be revealed via the "hidden" filter mode. */
    hidden?: boolean;
}

export interface Summary {
    updatedAt: string;
    counts: Record<SessionState, number>;
}

export const ALL_STATES: SessionState[] = [
    "idle",
    "running",
    "waiting_permission",
    "waiting_answer",
    "error",
    "done",
];

/**
 * Records not updated within this window are considered stale and are purged
 * automatically during readAllRecords(). 24 hours is chosen to cover a full
 * work day, ensuring that a crashed or forgotten instance is cleaned up
 * without manual intervention.
 */
const STALE_MS = 24 * 60 * 60 * 1000;

// ── Path helpers ─────────────────────────────────────────────────────────────

export function storeDir(): string {
    const base =
        process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state");
    return path.join(base, "opencode-dispatch");
}

export function sessionsDir(): string {
    return path.join(storeDir(), "sessions");
}

export function summaryPath(): string {
    return path.join(storeDir(), "summary.json");
}

/**
 * Sanitize a path segment so it cannot escape the sessions directory.
 * Strips all path separators and `..` sequences.
 */
function sanitizeSegment(segment: string): string {
    // Remove any slash variants and null bytes
    return segment.replace(/[/\\]/g, "_").replace(/\.\./g, "__").replace(/\0/g, "");
}

/**
 * Returns the absolute file path for the JSON record identified by
 * `instanceId` and `sessionId`. Both segments are sanitized to prevent path
 * traversal attacks.
 */
export function recordPath(instanceId: string, sessionId: string): string {
    return path.join(
        sessionsDir(),
        `${sanitizeSegment(instanceId)}--${sanitizeSegment(sessionId)}.json`
    );
}

// ── Runtime type guards ───────────────────────────────────────────────────────

/**
 * Returns true when `value` looks like a valid SessionRecord.
 * Validates all required fields so callers can trust the result.
 */
export function isSessionRecord(value: unknown): value is SessionRecord {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.instanceId === "string" &&
        typeof v.sessionId === "string" &&
        typeof v.projectPath === "string" &&
        typeof v.projectName === "string" &&
        typeof v.sessionTitle === "string" &&
        typeof v.state === "string" &&
        (ALL_STATES as string[]).includes(v.state) &&
        typeof v.lastMessage === "string" &&
        typeof v.updatedAt === "string" &&
        typeof v.createdAt === "string"
    );
}

/**
 * Returns true when `value` looks like a valid Summary object.
 */
export function isSummary(value: unknown): value is Summary {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (typeof v.updatedAt !== "string") return false;
    if (!v.counts || typeof v.counts !== "object") return false;
    const counts = v.counts as Record<string, unknown>;
    return ALL_STATES.every((s) => typeof counts[s] === "number");
}

// ── Atomic write helpers ──────────────────────────────────────────────────────

/** Generates a unique temporary file path alongside `dest`. */
function tmpPath(dest: string): string {
    return `${dest}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
}

/**
 * Atomically writes `data` to `dest` by first writing to a temporary file
 * and then renaming it. Prevents partial reads on concurrent access.
 */
export async function atomicWrite(dest: string, data: string): Promise<void> {
    const tmp = tmpPath(dest);
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, dest);
}

/**
 * Synchronous variant of {@link atomicWrite}. Required for process.on("exit")
 * handlers that cannot use async I/O.
 */
export function atomicWriteSync(dest: string, data: string): void {
    const tmp = tmpPath(dest);
    writeFileSync(tmp, data, "utf8");
    renameSync(tmp, dest);
}

// ── Counts utility ────────────────────────────────────────────────────────────

/**
 * Computes per-state counts from an array of records. Returns an object with
 * all known states initialized to zero so callers never get `undefined`.
 */
export function computeCounts(
    records: SessionRecord[]
): Record<SessionState, number> {
    const counts = Object.fromEntries(
        ALL_STATES.map((s) => [s, 0])
    ) as Record<SessionState, number>;
    for (const rec of records) {
        counts[rec.state] = (counts[rec.state] ?? 0) + 1;
    }
    return counts;
}

// ── Store operations ─────────────────────────────────────────────────────────

/**
 * Persists a session record to disk atomically and updates summary.json.
 *
 * Always updates `updatedAt` to the current timestamp. If `createdAt` is
 * empty, it is also set to now (first write). The summary is rebuilt from
 * all on-disk records after the write so callers never need to call
 * writeSummary() manually.
 *
 * If you need to write many records in a tight loop without triggering a
 * full directory scan on each write, call {@link writeRecordOnly} in a loop
 * and then call `writeSummary(await readAllRecords())` once afterwards.
 */
export async function writeRecord(rec: SessionRecord): Promise<void> {
    await writeRecordOnly(rec);
    await writeSummary(await readAllRecords());
}

/**
 * Persists a session record to disk atomically **without** updating
 * summary.json. Use this when writing multiple records in a batch; call
 * `writeSummary(await readAllRecords())` once after all writes to avoid
 * O(n²) I/O.
 */
export async function writeRecordOnly(rec: SessionRecord): Promise<void> {
    await fs.mkdir(sessionsDir(), { recursive: true });

    const now = new Date().toISOString();
    const record: SessionRecord = {
        ...rec,
        updatedAt: now,
        createdAt: rec.createdAt || now,
    };

    const dest = recordPath(record.instanceId, record.sessionId);
    await atomicWrite(dest, JSON.stringify(record, null, 2));
}

/**
 * Removes the record for the given `(instanceId, sessionId)` pair from disk.
 * Silently ignores the case where the file does not exist. Rebuilds
 * summary.json afterwards.
 */
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

/**
 * Reads all valid, non-stale session records from the sessions directory.
 *
 * - Files that cannot be read are skipped with a warning (e.g. permission
 *   errors are logged to stderr rather than silently ignored).
 * - Files containing invalid JSON or a non-conforming shape are skipped with
 *   a warning.
 * - Records whose `updatedAt` is older than 24 hours are deleted and omitted.
 * - Returns an empty array when the sessions directory does not exist yet.
 */
export async function readAllRecords(): Promise<SessionRecord[]> {
    const dir = sessionsDir();
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }

    const jsonFiles = entries.filter((e) => e.endsWith(".json"));
    const now = Date.now();
    const records: SessionRecord[] = [];

    await Promise.all(
        jsonFiles.map(async (file) => {
            const filePath = path.join(dir, file);
            let raw: string;
            try {
                raw = await fs.readFile(filePath, "utf8");
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                    process.stderr.write(
                        `[opencode-dispatch/core] Cannot read record ${filePath}: ${String(err)}\n`
                    );
                }
                return;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                process.stderr.write(
                    `[opencode-dispatch/core] Skipping corrupt record: ${filePath}\n`
                );
                return;
            }

            if (!isSessionRecord(parsed)) {
                process.stderr.write(
                    `[opencode-dispatch/core] Skipping invalid record (missing/wrong fields): ${filePath}\n`
                );
                return;
            }

            const rec: SessionRecord = parsed;

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

    // Deduplicate: if multiple records share the same sessionId, keep only the newest
    const sessionMap = new Map<string, SessionRecord>();
    for (const rec of records) {
        const existing = sessionMap.get(rec.sessionId);
        if (!existing || Date.parse(rec.updatedAt) > Date.parse(existing.updatedAt)) {
            sessionMap.set(rec.sessionId, rec);
        }
    }
    const deduplicated = Array.from(sessionMap.values());

    deduplicated.sort((a, b) => {
        const byProject = a.projectName.localeCompare(b.projectName);
        if (byProject !== 0) return byProject;
        return a.sessionTitle.localeCompare(b.sessionTitle);
    });

    return deduplicated;
}

/**
 * Computes summary counts from `records` and persists them to summary.json
 * atomically. Returns the written Summary.
 *
 * Use {@link computeCounts} if you only need the counts in-memory without
 * writing to disk.
 */
export async function writeSummary(records: SessionRecord[]): Promise<Summary> {
    await fs.mkdir(storeDir(), { recursive: true });

    const summary: Summary = {
        updatedAt: new Date().toISOString(),
        counts: computeCounts(records),
    };

    await atomicWrite(summaryPath(), JSON.stringify(summary, null, 2));

    return summary;
}

/**
 * Reads and parses summary.json. Returns null when the file does not exist.
 * Returns null and logs a warning when the file is present but malformed.
 */
export async function readSummary(): Promise<Summary | null> {
    let raw: string;
    try {
        raw = await fs.readFile(summaryPath(), "utf8");
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        process.stderr.write(
            `[opencode-dispatch/core] Cannot read summary: ${String(err)}\n`
        );
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        process.stderr.write(
            `[opencode-dispatch/core] Corrupt summary.json, returning null\n`
        );
        return null;
    }

    if (!isSummary(parsed)) {
        process.stderr.write(
            `[opencode-dispatch/core] summary.json has unexpected shape, returning null\n`
        );
        return null;
    }

    return parsed;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeInstanceId(): string {
    return `${hostname()}-${process.pid}`;
}
