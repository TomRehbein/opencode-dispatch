import { describe, it, expect } from "vitest";
import { eventToState, parseTmuxTarget } from "./index.js";

// ── eventToState ──────────────────────────────────────────────────────────────

describe("eventToState", () => {
  it("session.status.busy → running", () => {
    expect(eventToState("session.status.busy", "idle")).toBe("running");
  });

  it("permission.asked → waiting_permission", () => {
    expect(eventToState("permission.asked", "running")).toBe(
      "waiting_permission"
    );
  });

  it("tool.question → waiting_answer", () => {
    expect(eventToState("tool.question", "running")).toBe("waiting_answer");
  });

  it("session.idle → done", () => {
    expect(eventToState("session.idle", "running")).toBe("done");
  });

  it("session.error → error", () => {
    expect(eventToState("session.error", "running")).toBe("error");
  });

  it("idle.timer → idle", () => {
    expect(eventToState("idle.timer", "done")).toBe("idle");
  });

  it("subagent.idle → null (no state change)", () => {
    expect(eventToState("subagent.idle", "running")).toBeNull();
  });

  it("unknown event → null", () => {
    expect(eventToState("something.unknown", "running")).toBeNull();
  });

  it("prevState is not modified by subagent.idle", () => {
    const prev = "running" as const;
    const result = eventToState("subagent.idle", prev);
    expect(result).toBeNull();
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
