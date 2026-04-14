import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDuration, colorState, truncate, formatLine } from "./format.js";
import type { SessionRecord } from "@opencode-dispatch/core";

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        instanceId: "inst-1",
        sessionId: "sess-1",
        projectPath: "/proj",
        projectName: "myproject",
        sessionTitle: "my-session",
        state: "running",
        lastMessage: "",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

describe("formatDuration", () => {
  it("0ms → '< 1m'", () => {
    expect(formatDuration(0)).toBe("< 1m");
  });
  it("59_999ms → '< 1m'", () => {
    expect(formatDuration(59_999)).toBe("< 1m");
  });
  it("60_000ms → '1m'", () => {
    expect(formatDuration(60_000)).toBe("1m");
  });
  it("120_000ms → '2m'", () => {
    expect(formatDuration(120_000)).toBe("2m");
  });
  it("3_600_000ms → '1h'", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
  });
  it("3_660_000ms → '1h 1m'", () => {
    expect(formatDuration(3_660_000)).toBe("1h 1m");
  });
  it("86_400_000ms → '1d'", () => {
    expect(formatDuration(86_400_000)).toBe("1d");
  });
  it("90_000_000ms → '1d 1h'", () => {
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });
});

describe("colorState", () => {
  it("contains the state label in output", () => {
    expect(colorState("error")).toContain("error");
  });
  it("wraps with ANSI reset", () => {
    expect(colorState("running")).toContain("\x1b[0m");
  });
  it("waiting_permission uses yellow (33)", () => {
    expect(colorState("waiting_permission")).toContain("\x1b[33m");
  });
  it("waiting_answer uses cyan (36)", () => {
    expect(colorState("waiting_answer")).toContain("\x1b[36m");
  });
  it("error uses red (31)", () => {
    expect(colorState("error")).toContain("\x1b[31m");
  });
  it("running uses blue (34)", () => {
    expect(colorState("running")).toContain("\x1b[34m");
  });
  it("done uses green (32)", () => {
    expect(colorState("done")).toContain("\x1b[32m");
  });
  it("idle uses gray (90)", () => {
    expect(colorState("idle")).toContain("\x1b[90m");
  });
});

describe("truncate", () => {
  it("short strings are returned unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("exact length not truncated", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
  it("truncates with ellipsis", () => {
    const result = truncate("hello world", 8);
    expect(result.length).toBe(8);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("formatLine with maxWidth", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("no maxWidth: returns full line unchanged", () => {
    const rec = makeRecord({ projectName: "proj", sessionTitle: "session" });
    // mock Date.now so since = "< 1m"
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(rec.updatedAt));
    const line = formatLine(rec, false);
    expect(line).toBe("▶ proj - session (< 1m)");
  });

  it("line fits within maxWidth: not truncated", () => {
    const rec = makeRecord({ projectName: "proj", sessionTitle: "sess" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(rec.updatedAt));
    const line = formatLine(rec, false, 80);
    // "▶ proj - sess (< 1m)" = 20 chars → fits
    expect(line).toBe("▶ proj - sess (< 1m)");
  });

  it("sessionTitle is truncated when line exceeds maxWidth", () => {
    const rec = makeRecord({ projectName: "proj", sessionTitle: "a-very-long-session-title" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(rec.updatedAt));
    const line = formatLine(rec, false, 30);
    // visible length should be ≤ 30
    expect(line.length).toBeLessThanOrEqual(30);
    expect(line).toContain("proj");
    expect(line).toContain("…");
  });

  it("projectName is also truncated when skeleton alone exceeds maxWidth", () => {
    const rec = makeRecord({
        projectName: "a-very-long-project-name",
        sessionTitle: "a-very-long-session-title",
    });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(rec.updatedAt));
    const line = formatLine(rec, false, 25);
    expect(line.length).toBeLessThanOrEqual(25);
  });

  it("returns something sensible for very small maxWidth", () => {
    const rec = makeRecord({ projectName: "proj", sessionTitle: "sess" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(rec.updatedAt));
    // Should not throw
    expect(() => formatLine(rec, false, 5)).not.toThrow();
  });
});
