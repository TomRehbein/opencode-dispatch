import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTable } from "./table.js";
import type { SessionRecord } from "@opencode-overview/core";

const FIXED_NOW = new Date("2024-01-01T02:00:00Z").getTime();

function rec(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    instanceId: "host-1",
    sessionId: "s1",
    projectPath: "/path",
    projectName: "proj",
    sessionTitle: "sess",
    state: "running",
    lastMessage: "Working on it",
    updatedAt: new Date("2024-01-01T01:58:00Z").toISOString(), // 2 min ago
    createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

const SAMPLE: SessionRecord[] = [
  rec({
    projectName: "alpha",
    sessionTitle: "Fix auth",
    state: "waiting_permission",
    lastMessage: "Need approval to proceed",
    updatedAt: new Date("2024-01-01T01:58:00Z").toISOString(),
  }),
  rec({
    instanceId: "host-2",
    sessionId: "s2",
    projectName: "beta",
    sessionTitle: "Add tests",
    state: "running",
    lastMessage: "Generating test cases...",
    updatedAt: new Date("2024-01-01T01:50:00Z").toISOString(),
  }),
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderTable", () => {
  it("snapshot: renders table without colors", () => {
    const result = renderTable(SAMPLE, { colors: false, termWidth: 120 });
    expect(result).toMatchSnapshot();
  });

  it("contains column headers", () => {
    const result = renderTable(SAMPLE, { colors: false, termWidth: 120 });
    expect(result).toContain("Project");
    expect(result).toContain("Session");
    expect(result).toContain("State");
    expect(result).toContain("Wartet seit");
    expect(result).toContain("Letzte Nachricht");
  });

  it("contains project and session names", () => {
    const result = renderTable(SAMPLE, { colors: false, termWidth: 120 });
    expect(result).toContain("alpha");
    expect(result).toContain("Fix auth");
    expect(result).toContain("beta");
    expect(result).toContain("Add tests");
  });

  it("empty records renders header and separator only", () => {
    const result = renderTable([], { colors: false, termWidth: 80 });
    expect(result).toContain("Project");
    // only 2 lines: header + separator
    const lines = result.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
  });

  it("no ANSI codes when colors=false", () => {
    const result = renderTable(SAMPLE, { colors: false, termWidth: 120 });
    expect(result).not.toContain("\x1b[");
  });

  it("ANSI codes present when colors=true", () => {
    const result = renderTable(SAMPLE, { colors: true, termWidth: 120 });
    expect(result).toContain("\x1b[");
  });
});
