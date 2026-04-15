import type { Plugin } from "@opencode-ai/plugin";
import { execFileSync } from "child_process";
import * as path from "path";
import { readFile } from "fs/promises";
import {
    mkdirSync,
    readdirSync,
    readFileSync,
} from "fs";
import {
    ALL_STATES,
    makeInstanceId,
    writeRecord,
    writeRecordOnly,
    writeSummary,
    readAllRecords,
    recordPath,
    sessionsDir,
    storeDir,
    summaryPath,
    atomicWriteSync,
    computeCounts,
    isSessionRecord,
    type SessionRecord,
    type SessionState,
    type Summary,
} from "@opencode-dispatch/core";

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Maps a semantic event type to a new SessionState.
 * Returns null when the event should not change state (e.g. subagent.idle).
 */
export function eventToState(eventType: string): SessionState | null {
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
 * `tmuxEnv` is only used as a presence check for $TMUX; the actual session
 * name comes from the executor. The `executor` parameter is injectable for
 * tests. Returns undefined when not in tmux or when the command fails.
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

/**
 * Extract a human-readable message from any SDK error shape.
 * Tries, in order: err.data.message, err.message, String(err), JSON.stringify.
 */
export function extractErrorMessage(err: unknown): string {
    if (err === null || err === undefined) return "";
    if (typeof err === "string") return err;
    if (typeof err !== "object") return String(err);

    const obj = err as Record<string, unknown>;
    const data = obj.data;
    if (data && typeof data === "object") {
        const msg = (data as Record<string, unknown>).message;
        if (typeof msg === "string" && msg.length > 0) return msg;
    }
    if (typeof obj.message === "string" && obj.message.length > 0) {
        return obj.message;
    }
    if (err instanceof Error) return err.toString();
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

// ── Plugin state (created per plugin-factory call) ────────────────────────────

interface PluginState {
    instanceId: string;
    tmuxTarget: string | undefined;
    projectPath: string;
    projectName: string;
    sessions: Map<string, SessionRecord>;
    subagentIds: Set<string>;
    subagentParent: Map<string, string>;
    idleTimers: Map<string, ReturnType<typeof setTimeout>>;
    /** Pending debounced summary-rebuild timer. */
    summaryDebounce: ReturnType<typeof setTimeout> | null;
}

function createState(): PluginState {
    const projectPath = process.cwd();
    return {
        instanceId: makeInstanceId(),
        tmuxTarget: parseTmuxTarget(process.env.TMUX),
        projectPath,
        projectName: path.basename(projectPath),
        sessions: new Map(),
        subagentIds: new Set(),
        subagentParent: new Map(),
        idleTimers: new Map(),
        summaryDebounce: null,
    };
}

// ── Timer helpers ─────────────────────────────────────────────────────────────

function clearIdleTimer(state: PluginState, sessionId: string): void {
    const t = state.idleTimers.get(sessionId);
    if (t !== undefined) {
        clearTimeout(t);
        state.idleTimers.delete(sessionId);
    }
}

function scheduleIdleTimer(state: PluginState, sessionId: string): void {
    clearIdleTimer(state, sessionId);
    const t = setTimeout(() => {
        state.idleTimers.delete(sessionId);
        updateSession(state, sessionId, "idle.timer", null).catch(() => { });
    }, 60_000);
    t.unref();
    state.idleTimers.set(sessionId, t);
}

/**
 * Schedules a debounced summary rebuild (150 ms window) to avoid rebuilding
 * the summary on every event in a burst.
 */
function scheduleSummaryRebuild(state: PluginState): void {
    if (state.summaryDebounce !== null) clearTimeout(state.summaryDebounce);
    state.summaryDebounce = setTimeout(() => {
        state.summaryDebounce = null;
        readAllRecords()
            .then((records) => writeSummary(records))
            .catch(() => { });
    }, 150);
    state.summaryDebounce.unref();
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function getOrCreateRecord(
    state: PluginState,
    sessionId: string,
    sessionTitle: string,
    initialState?: SessionState
): Promise<SessionRecord> {
    const cached = state.sessions.get(sessionId);
    if (cached) return cached;

    // Try reading a record already on disk from a previous event
    try {
        const raw = await readFile(
            recordPath(state.instanceId, sessionId),
            "utf8"
        );
        const parsed: unknown = JSON.parse(raw);
        if (isSessionRecord(parsed)) {
            state.sessions.set(sessionId, parsed);
            return parsed;
        }
    } catch {
        /* first event for this session */
    }

    const now = new Date().toISOString();
    const rec: SessionRecord = {
        instanceId: state.instanceId,
        sessionId,
        projectPath: state.projectPath,
        projectName: state.projectName,
        sessionTitle: sessionTitle || "(untitled)",
        state: initialState ?? "running",
        lastMessage: "",
        tmuxTarget: state.tmuxTarget,
        createdAt: now,
        updatedAt: now,
    };
    state.sessions.set(sessionId, rec);
    return rec;
}

/**
 * Apply a semantic event to the record for `sessionId` and persist it.
 * Summary is rebuilt via a debounced timer to avoid O(n²) I/O during bursts.
 */
async function updateSession(
    state: PluginState,
    sessionId: string,
    eventType: string,
    lastMsg: string | null,
    sessionTitle?: string
): Promise<void> {
    // Determine initial state from event type if this is the first event for the session
    const initialState = eventToState(eventType) ?? undefined;
    
    const rec = await getOrCreateRecord(
        state,
        sessionId,
        sessionTitle ?? "(untitled)",
        initialState
    );
    const newState = eventToState(eventType);

    const nextTitle =
        sessionTitle !== undefined && sessionTitle.length > 0
            ? sessionTitle
            : rec.sessionTitle;

    const updated: SessionRecord = {
        ...rec,
        state: newState ?? rec.state,
        lastMessage: lastMsg !== null ? lastMsg.slice(0, 200) : rec.lastMessage,
        sessionTitle: nextTitle,
        updatedAt: new Date().toISOString(),
    };

    state.sessions.set(sessionId, updated);

    try {
        await writeRecordOnly(updated);
        scheduleSummaryRebuild(state);
    } catch (err) {
        console.error("[opencode-dispatch/plugin] writeRecord failed:", err);
    }
}

/**
 * Like updateSession, but only acts when the record already exists (either
 * in memory or on disk). Used for subagent.idle on the parent — we must not
 * fabricate a "running" parent record if none has ever existed.
 */
async function updateExistingSession(
    state: PluginState,
    sessionId: string,
    eventType: string,
    lastMsg: string | null
): Promise<void> {
    let rec = state.sessions.get(sessionId);
    if (!rec) {
        try {
            const raw = await readFile(
                recordPath(state.instanceId, sessionId),
                "utf8"
            );
            const parsed: unknown = JSON.parse(raw);
            if (!isSessionRecord(parsed)) return;
            rec = parsed;
            state.sessions.set(sessionId, rec);
        } catch {
            return; // no existing record; nothing to update
        }
    }

    const newState = eventToState(eventType);
    const updated: SessionRecord = {
        ...rec,
        state: newState ?? rec.state,
        lastMessage: lastMsg !== null ? lastMsg.slice(0, 200) : rec.lastMessage,
        updatedAt: new Date().toISOString(),
    };
    state.sessions.set(sessionId, updated);

    try {
        await writeRecordOnly(updated);
        scheduleSummaryRebuild(state);
    } catch (err) {
        console.error("[opencode-dispatch/plugin] writeRecord failed:", err);
    }
}

// ── Shutdown: mark all known sessions idle (synchronous) ─────────────────────
// Must be synchronous: process.on("exit") cannot await promises.

function writeRecordSync(rec: SessionRecord): void {
    mkdirSync(sessionsDir(), { recursive: true });
    const dest = recordPath(rec.instanceId, rec.sessionId);
    atomicWriteSync(dest, JSON.stringify(rec, null, 2));
}

/**
 * Rebuild summary.json from on-disk records synchronously. Exported for tests.
 */
export function refreshSummarySync(): void {
    const counts = computeCounts([]);

    let entries: string[] = [];
    try {
        entries = readdirSync(sessionsDir());
    } catch (err) {
        // If the directory does not exist, proceed with empty counts.
        // For any other error (e.g. EACCES), log and bail out.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            process.stderr.write(
                `[opencode-dispatch/plugin] Cannot read sessions dir: ${String(err)}\n`
            );
            return;
        }
    }

    for (const file of entries) {
        if (!file.endsWith(".json")) continue;
        try {
            const raw = readFileSync(path.join(sessionsDir(), file), "utf8");
            const parsed: unknown = JSON.parse(raw);
            if (isSessionRecord(parsed)) {
                counts[parsed.state] = (counts[parsed.state] ?? 0) + 1;
            }
        } catch {
            // skip unreadable/corrupt files
        }
    }

    const summary: Summary = {
        updatedAt: new Date().toISOString(),
        counts,
    };

    mkdirSync(storeDir(), { recursive: true });
    atomicWriteSync(summaryPath(), JSON.stringify(summary, null, 2));
}

/**
 * Flip every tracked session to `idle` synchronously and rebuild the summary.
 * Exported for tests.
 */
export function shutdownState(state: PluginState): void {
    for (const [, rec] of state.sessions) {
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

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * Exported for tests.
 */
export function _createPluginState(): PluginState {
    return createState();
}

const OverviewPlugin: Plugin = async () => {
    const state = createState();

    // Only `exit` — do NOT register SIGINT/SIGTERM here. Those signals are
    // owned by the OpenCode host; hooking them and calling process.exit() would
    // cut off the host's own cleanup (in-flight generations, temp files, etc.).
    // A clean host shutdown fires `exit` for us; a hard kill we can't survive
    // anyway.
    process.on("exit", () => shutdownState(state));

    return {
        // ── Generic event handler ────────────────────────────────────────────────
        event: async ({ event }) => {
            // Session lifecycle ---------------------------------------------------
            if (event.type === "session.created") {
                const { id, title, parentID } = event.properties.info;
                if (parentID) {
                    state.subagentIds.add(id);
                    state.subagentParent.set(id, parentID);
                } else {
                    clearIdleTimer(state, id);
                    await updateSession(
                        state,
                        id,
                        "session.status.busy",
                        null,
                        title
                    ).catch(console.error);
                }
                return;
            }

            if (event.type === "session.updated") {
                const { id, title, parentID } = event.properties.info;
                if (parentID) {
                    state.subagentIds.add(id);
                    if (!state.subagentParent.has(id))
                        state.subagentParent.set(id, parentID);
                    return;
                }
                // Propagate title updates (OpenCode often backfills auto-generated
                // titles after session.created). Only touch the record if we already
                // track this session and the title actually changed — no state change.
                const existing = state.sessions.get(id);
                if (existing && title && existing.sessionTitle !== title) {
                    const updated: SessionRecord = {
                        ...existing,
                        sessionTitle: title,
                        updatedAt: new Date().toISOString(),
                    };
                    state.sessions.set(id, updated);
                    try {
                        await writeRecordOnly(updated);
                        scheduleSummaryRebuild(state);
                    } catch (err) {
                        console.error(
                            "[opencode-dispatch/plugin] writeRecord failed:",
                            err
                        );
                    }
                }
                return;
            }

            if (event.type === "session.deleted") {
                const { id } = event.properties.info;
                state.subagentIds.delete(id);
                state.subagentParent.delete(id);
                state.sessions.delete(id);
                clearIdleTimer(state, id);
                return;
            }

            // session.status: busy → running -------------------------------------
            if (event.type === "session.status") {
                const { sessionID, status } = event.properties;
                if (status.type === "busy" && !state.subagentIds.has(sessionID)) {
                    clearIdleTimer(state, sessionID);
                    await updateSession(
                        state,
                        sessionID,
                        "session.status.busy",
                        null
                    ).catch(console.error);
                }
                return;
            }

            // session.idle: → done (or propagate to parent if subagent) ---------
            if (event.type === "session.idle") {
                const { sessionID } = event.properties;
                if (state.subagentIds.has(sessionID)) {
                    const parentId = state.subagentParent.get(sessionID);
                    if (parentId) {
                        // Only update parent if it already exists — never fabricate
                        // a "running" parent for an orphan subagent.idle.
                        await updateExistingSession(
                            state,
                            parentId,
                            "subagent.idle",
                            "subagent completed"
                        ).catch(console.error);
                    }
                } else {
                    await updateSession(state, sessionID, "session.idle", null).catch(
                        console.error
                    );
                    scheduleIdleTimer(state, sessionID);
                }
                return;
            }

            // session.error: → error ---------------------------------------------
            if (event.type === "session.error") {
                const { sessionID, error } = event.properties;
                if (sessionID && !state.subagentIds.has(sessionID)) {
                    clearIdleTimer(state, sessionID);
                    await updateSession(
                        state,
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
            if (!state.subagentIds.has(sessionID)) {
                clearIdleTimer(state, sessionID);
                await updateSession(state, sessionID, "permission.asked", null).catch(
                    console.error
                );
            }
        },

        // ── Tool execute before: question tool → waiting_answer ──────────────────
        "tool.execute.before": async (input) => {
            if (input.tool === "question" && !state.subagentIds.has(input.sessionID)) {
                clearIdleTimer(state, input.sessionID);
                await updateSession(state, input.sessionID, "tool.question", null).catch(
                    console.error
                );
            }
        },
    };
};

export default OverviewPlugin;
