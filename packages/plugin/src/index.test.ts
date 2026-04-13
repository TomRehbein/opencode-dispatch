import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
    eventToState,
    parseTmuxTarget,
    extractErrorMessage,
    refreshSummarySync,
    shutdownState,
    _createPluginState,
} from "./index.js";
import {
    readSummary,
    recordPath,
    writeRecord,
    type SessionRecord,
} from "@opencode-dispatch/core";
import { makeRecord as makeCoreRecord } from "@opencode-dispatch/core/test-fixtures";

// ── eventToState ──────────────────────────────────────────────────────────────

describe("eventToState", () => {
    it("session.status.busy → running", () => {
        expect(eventToState("session.status.busy")).toBe("running");
    });

    it("permission.asked → waiting_permission", () => {
        expect(eventToState("permission.asked")).toBe("waiting_permission");
    });

    it("tool.question → waiting_answer", () => {
        expect(eventToState("tool.question")).toBe("waiting_answer");
    });

    it("session.idle → done", () => {
        expect(eventToState("session.idle")).toBe("done");
    });

    it("session.error → error", () => {
        expect(eventToState("session.error")).toBe("error");
    });

    it("idle.timer → idle", () => {
        expect(eventToState("idle.timer")).toBe("idle");
    });

    it("subagent.idle → null (no state change)", () => {
        expect(eventToState("subagent.idle")).toBeNull();
    });

    it("unknown event → null", () => {
        expect(eventToState("something.unknown")).toBeNull();
    });
});

// ── parseTmuxTarget ───────────────────────────────────────────────────────────

describe("parseTmuxTarget", () => {
    it("returns undefined when tmuxEnv is undefined", () => {
        expect(parseTmuxTarget(undefined)).toBeUndefined();
    });

    it("returns undefined when tmuxEnv is empty string", () => {
        expect(parseTmuxTarget("")).toBeUndefined();
    });

    it("returns session name from executor when tmuxEnv is set", () => {
        const mockExecutor = (_cmd: string, _args: string[]) => "mysession\n";
        expect(
            parseTmuxTarget("/tmp/tmux-1000/default,12345,0", mockExecutor)
        ).toBe("mysession");
    });

    it("trims whitespace from executor output", () => {
        const mockExecutor = (_cmd: string, _args: string[]) => "  myproject  \n";
        expect(
            parseTmuxTarget("/tmp/tmux-1000/default,12345,0", mockExecutor)
        ).toBe("myproject");
    });

    it("returns undefined when executor returns empty string", () => {
        const mockExecutor = (_cmd: string, _args: string[]) => "   ";
        expect(
            parseTmuxTarget("/tmp/tmux-1000/default,12345,0", mockExecutor)
        ).toBeUndefined();
    });

    it("returns undefined when executor throws", () => {
        const mockExecutor = (_cmd: string, _args: string[]) => {
            throw new Error("tmux not found");
        };
        expect(
            parseTmuxTarget("/tmp/tmux-1000/default,12345,0", mockExecutor)
        ).toBeUndefined();
    });

    it("passes correct args to executor", () => {
        const calls: Array<{ cmd: string; args: string[] }> = [];
        const mockExecutor = (cmd: string, args: string[]) => {
            calls.push({ cmd, args });
            return "test";
        };
        parseTmuxTarget("/tmp/tmux-1000/default,12345,0", mockExecutor);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ cmd: "tmux", args: ["display", "-p", "#S"] });
    });
});

// ── extractErrorMessage ──────────────────────────────────────────────────────

describe("extractErrorMessage", () => {
    it("returns empty string for null/undefined", () => {
        expect(extractErrorMessage(null)).toBe("");
        expect(extractErrorMessage(undefined)).toBe("");
    });

    it("returns string input directly", () => {
        expect(extractErrorMessage("boom")).toBe("boom");
    });

    it("prefers err.data.message", () => {
        expect(
            extractErrorMessage({ data: { message: "inner" }, message: "outer" })
        ).toBe("inner");
    });

    it("falls back to err.message when data.message missing", () => {
        expect(extractErrorMessage({ message: "outer" })).toBe("outer");
    });

    it("handles Error instances", () => {
        const out = extractErrorMessage(new Error("kaboom"));
        expect(out).toContain("kaboom");
    });

    it("falls back to JSON for arbitrary objects", () => {
        expect(extractErrorMessage({ foo: 1 })).toBe('{"foo":1}');
    });

    it("stringifies primitives other than string", () => {
        expect(extractErrorMessage(42)).toBe("42");
    });
});

// ── shutdown + summary (disk) ────────────────────────────────────────────────

describe("shutdownState + refreshSummarySync", () => {
    let tmpDir: string;
    const prevXdg = process.env.XDG_STATE_HOME;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "plugin-test-"));
        process.env.XDG_STATE_HOME = tmpDir;
    });

    afterEach(async () => {
        if (prevXdg === undefined) delete process.env.XDG_STATE_HOME;
        else process.env.XDG_STATE_HOME = prevXdg;
        await rm(tmpDir, { recursive: true, force: true });
    });

    function mkRec(overrides: Partial<SessionRecord> = {}): SessionRecord {
        return makeCoreRecord({
            instanceId: "host-1",
            sessionId: "ses-a",
            projectPath: "/tmp/proj",
            projectName: "proj",
            sessionTitle: "t",
            ...overrides,
        });
    }

    it("shutdownState flips tracked sessions to idle on disk", async () => {
        const state = _createPluginState();
        const rec1 = mkRec({ sessionId: "ses-1", state: "running" });
        const rec2 = mkRec({ sessionId: "ses-2", state: "waiting_permission" });
        state.sessions.set("ses-1", { ...rec1, instanceId: state.instanceId });
        state.sessions.set("ses-2", { ...rec2, instanceId: state.instanceId });

        shutdownState(state);

        const raw1 = await readFile(
            recordPath(state.instanceId, "ses-1"),
            "utf8"
        );
        const raw2 = await readFile(
            recordPath(state.instanceId, "ses-2"),
            "utf8"
        );
        expect(JSON.parse(raw1).state).toBe("idle");
        expect(JSON.parse(raw2).state).toBe("idle");
    });

    it("shutdownState rebuilds summary.json counts", async () => {
        const state = _createPluginState();
        state.sessions.set("a", {
            ...mkRec({ sessionId: "a" }),
            instanceId: state.instanceId,
        });
        state.sessions.set("b", {
            ...mkRec({ sessionId: "b" }),
            instanceId: state.instanceId,
        });

        shutdownState(state);

        const summary = await readSummary();
        expect(summary).not.toBeNull();
        expect(summary!.counts.idle).toBe(2);
        expect(summary!.counts.running).toBe(0);
    });

    it("refreshSummarySync aggregates records present on disk", async () => {
        const base = mkRec({ instanceId: "h-1" });
        await writeRecord({ ...base, sessionId: "x1", state: "running" });
        await writeRecord({ ...base, sessionId: "x2", state: "running" });
        await writeRecord({ ...base, sessionId: "x3", state: "waiting_answer" });

        refreshSummarySync();

        const summary = await readSummary();
        expect(summary).not.toBeNull();
        expect(summary!.counts.running).toBe(2);
        expect(summary!.counts.waiting_answer).toBe(1);
        expect(summary!.counts.idle).toBe(0);
    });

    it("refreshSummarySync handles missing sessions dir gracefully", () => {
        // No records written — summary should still be writable with zero counts
        expect(() => refreshSummarySync()).not.toThrow();
    });
});
