import type { Plugin } from "@opencode-ai/plugin";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
  readFileSync,
} from "fs";
import {
  makeInstanceId,
  writeRecord,
  recordPath,
  sessionsDir,
  storeDir,
  summaryPath,
  type SessionRecord,
  type SessionState,
  type Summary,
} from "@opencode-overview/core";

const ALL_STATES: SessionState[] = [
  "idle",
  "running",
  "waiting_permission",
  "waiting_answer",
  "error",
  "done",
];

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Maps a semantic event type to a new SessionState.
 * Returns null when the event should not change state (e.g. subagent.idle).
 */
export function eventToState(
  eventType: string,
  _prevState: SessionState
): SessionState | null {
  switch (eventType) {
    case "session.status.busy":
      return "running";
    case "permission.asked":
      return "waiting_permission";
    case "tool.question":
      return "waiting_answer";
    case "session.idle":
      return "done";
    case "session.error":
      return "error";
    case "idle.timer":
      return "idle";
    case "subagent.idle":
      return null;
    default:
      return null;
  }
}

/**
 * Returns the tmux session name by running `tmux display -p '#S'`.
 * The `executor` parameter can be replaced in tests.
 * Returns undefined when not in tmux or when the command fails.
 */
export function parseTmuxTarget(
  tmuxEnv: string | undefined,
  executor: (cmd: string, args: string[]) => string = (cmd, args) =>
    execFileSync(cmd, args, { encoding: "utf8", timeout: 1_000 }) as string
): string | undefined {
  if (!tmuxEnv) return undefined;
  try {
    const result = executor("tmux", ["display", "-p", "#S"]).trim();
    return result || undefined;
  } catch {
    return undefined;
  }
}

// ── Module-level singletons (one set per OpenCode process) ────────────────────

const instanceId = makeInstanceId();
const tmuxTarget = parseTmuxTarget(process.env.TMUX);
const projectPath = process.cwd();
const projectName = path.basename(projectPath);

// In-memory record cache: sessionId → record
const sessions = new Map<string, SessionRecord>();
// IDs of subagent sessions (those with a parentID)
const subagentIds = new Set<string>();
// childId → parentId (for propagating subagent.idle to the parent record)
const subagentParent = new Map<string, string>();
// Pending 60-second idle timers
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Timer helpers ─────────────────────────────────────────────────────────────

function clearIdleTimer(sessionId: string): void {
  const t = idleTimers.get(sessionId);
  if (t !== undefined) {
    clearTimeout(t);
    idleTimers.delete(sessionId);
  }
}

function scheduleIdleTimer(sessionId: string): void {
  clearIdleTimer(sessionId);
  const t = setTimeout(() => {
    idleTimers.delete(sessionId);
    updateSession(sessionId, "idle.timer", null).catch(() => {});
  }, 60_000);
  t.unref();
  idleTimers.set(sessionId, t);
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function getOrCreateRecord(
  sessionId: string,
  sessionTitle: string
): Promise<SessionRecord> {
  const cached = sessions.get(sessionId);
  if (cached) return cached;

  // Try reading a record already on disk from a previous event
  try {
    const raw = await fs.readFile(recordPath(instanceId, sessionId), "utf8");
    const rec = JSON.parse(raw) as SessionRecord;
    sessions.set(sessionId, rec);
    return rec;
  } catch {
    /* first event for this session */
  }

  const now = new Date().toISOString();
  const rec: SessionRecord = {
    instanceId,
    sessionId,
    projectPath,
    projectName,
    sessionTitle: sessionTitle || "(untitled)",
    state: "running",
    lastMessage: "",
    tmuxTarget,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(sessionId, rec);
  return rec;
}

/**
 * Apply a semantic event to the record for `sessionId` and persist it.
 *
 * @param sessionId   Target session
 * @param eventType   Semantic event key (see eventToState)
 * @param lastMsg     Replacement for lastMessage; null = keep existing
 * @param sessionTitle Override session title (used on first creation)
 */
async function updateSession(
  sessionId: string,
  eventType: string,
  lastMsg: string | null,
  sessionTitle?: string
): Promise<void> {
  const rec = await getOrCreateRecord(sessionId, sessionTitle ?? "(untitled)");
  const newState = eventToState(eventType, rec.state);

  const updated: SessionRecord = {
    ...rec,
    state: newState ?? rec.state,
    lastMessage: lastMsg !== null ? lastMsg.slice(0, 200) : rec.lastMessage,
    sessionTitle: sessionTitle ?? rec.sessionTitle,
    updatedAt: new Date().toISOString(),
  };

  sessions.set(sessionId, updated);

  try {
    await writeRecord(updated);
  } catch (err) {
    console.error("[opencode-overview/plugin] writeRecord failed:", err);
  }
}

// Extract a human-readable message from any SDK error shape
function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const data = (err as Record<string, unknown>).data;
  if (data && typeof data === "object") {
    const msg = (data as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

// ── Shutdown: mark all known sessions idle (synchronous) ─────────────────────
// Must be synchronous: process.on("exit") cannot await promises, and
// SIGINT/SIGTERM handlers call process.exit() immediately after.

function writeRecordSync(rec: SessionRecord): void {
  mkdirSync(sessionsDir(), { recursive: true });
  const dest = recordPath(rec.instanceId, rec.sessionId);
  const tmp = `${dest}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(rec, null, 2), "utf8");
  renameSync(tmp, dest);
}

// Synchronously rebuild summary.json from on-disk records. Used at shutdown
// so the aggregate counts stay consistent with the per-session files we just
// flipped to `idle`. Async core.writeSummary cannot run inside process "exit".
function refreshSummarySync(): void {
  const counts = Object.fromEntries(
    ALL_STATES.map((s) => [s, 0])
  ) as Record<SessionState, number>;

  let entries: string[] = [];
  try {
    entries = readdirSync(sessionsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return;
  }

  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(path.join(sessionsDir(), file), "utf8");
      const rec = JSON.parse(raw) as SessionRecord;
      counts[rec.state] = (counts[rec.state] ?? 0) + 1;
    } catch {
      // skip unreadable/corrupt files
    }
  }

  const summary: Summary = {
    updatedAt: new Date().toISOString(),
    counts,
  };

  mkdirSync(storeDir(), { recursive: true });
  const dest = summaryPath();
  const tmp = `${dest}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(summary, null, 2), "utf8");
  renameSync(tmp, dest);
}

function shutdown(): void {
  for (const [, rec] of sessions) {
    const updated: SessionRecord = {
      ...rec,
      state: "idle",
      updatedAt: new Date().toISOString(),
    };
    try {
      writeRecordSync(updated);
    } catch {
      // best-effort; we are shutting down
    }
  }
  try {
    refreshSummarySync();
  } catch {
    // best-effort; we are shutting down
  }
}

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

// ── Plugin ────────────────────────────────────────────────────────────────────

const OverviewPlugin: Plugin = async () => {
  return {
    // ── Generic event handler ────────────────────────────────────────────────
    event: async ({ event }) => {
      // Session lifecycle ---------------------------------------------------
      if (event.type === "session.created") {
        const { id, title, parentID } = event.properties.info;
        if (parentID) {
          subagentIds.add(id);
          subagentParent.set(id, parentID);
        } else {
          clearIdleTimer(id);
          await updateSession(id, "session.status.busy", null, title).catch(
            console.error
          );
        }
        return;
      }

      if (event.type === "session.updated") {
        const { id, parentID } = event.properties.info;
        if (parentID) {
          subagentIds.add(id);
          if (!subagentParent.has(id)) subagentParent.set(id, parentID);
        }
        return;
      }

      if (event.type === "session.deleted") {
        const { id } = event.properties.info;
        subagentIds.delete(id);
        subagentParent.delete(id);
        sessions.delete(id);
        clearIdleTimer(id);
        return;
      }

      // session.status: busy → running -------------------------------------
      if (event.type === "session.status") {
        const { sessionID, status } = event.properties;
        if (status.type === "busy" && !subagentIds.has(sessionID)) {
          clearIdleTimer(sessionID);
          await updateSession(sessionID, "session.status.busy", null).catch(
            console.error
          );
        }
        return;
      }

      // session.idle: → done (or propagate to parent if subagent) ---------
      if (event.type === "session.idle") {
        const { sessionID } = event.properties;
        if (subagentIds.has(sessionID)) {
          const parentId = subagentParent.get(sessionID);
          if (parentId) {
            await updateSession(
              parentId,
              "subagent.idle",
              "subagent completed"
            ).catch(console.error);
          }
        } else {
          await updateSession(sessionID, "session.idle", null).catch(
            console.error
          );
          scheduleIdleTimer(sessionID);
        }
        return;
      }

      // session.error: → error ---------------------------------------------
      if (event.type === "session.error") {
        const { sessionID, error } = event.properties;
        if (sessionID && !subagentIds.has(sessionID)) {
          clearIdleTimer(sessionID);
          await updateSession(
            sessionID,
            "session.error",
            extractErrorMessage(error)
          ).catch(console.error);
        }
        return;
      }
    },

    // ── Permission asked: → waiting_permission ───────────────────────────────
    "permission.ask": async (input) => {
      const { sessionID } = input;
      if (!subagentIds.has(sessionID)) {
        clearIdleTimer(sessionID);
        await updateSession(sessionID, "permission.asked", null).catch(
          console.error
        );
      }
    },

    // ── Tool execute before: question tool → waiting_answer ──────────────────
    "tool.execute.before": async (input) => {
      if (input.tool === "question" && !subagentIds.has(input.sessionID)) {
        clearIdleTimer(input.sessionID);
        await updateSession(input.sessionID, "tool.question", null).catch(
          console.error
        );
      }
    },
  };
};

export default OverviewPlugin;
