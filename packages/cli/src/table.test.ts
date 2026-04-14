import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderList } from "./table.js";
import type { SessionRecord } from "@opencode-dispatch/core";
import { makeRecord } from "@opencode-dispatch/core/test-fixtures";

const FIXED_NOW = new Date("2024-01-01T02:00:00Z").getTime();

function rec(overrides: Partial<SessionRecord>): SessionRecord {
    return makeRecord({
        lastMessage: "Working on it",
        updatedAt: new Date("2024-01-01T01:58:00Z").toISOString(), // 2 min ago
        createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
        ...overrides,
    });
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

describe("renderList", () => {
    it("snapshot: renders list without colors", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).toMatchSnapshot();
    });

    it("contains project and session names", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).toContain("alpha");
        expect(result).toContain("Fix auth");
        expect(result).toContain("beta");
        expect(result).toContain("Add tests");
    });

    it("contains state symbols", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).toContain("▪"); // waiting_permission
        expect(result).toContain("▶"); // running
    });

    it("contains duration", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).toContain("2m");
        expect(result).toContain("10m");
    });

    it("uses format: <symbol> <project> - <session> (<since>)", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).toContain("▪ alpha - Fix auth (2m)");
        expect(result).toContain("▶ beta - Add tests (10m)");
    });

    it("empty records returns placeholder line", () => {
        const result = renderList([], { colors: false, termWidth: 80 });
        expect(result).toBe("(keine aktiven Sessions)");
    });

    it("no ANSI codes when colors=false", () => {
        const result = renderList(SAMPLE, { colors: false, termWidth: 120 });
        expect(result).not.toContain("\x1b[");
    });

    it("ANSI codes present when colors=true", () => {
        const result = renderList(SAMPLE, { colors: true, termWidth: 120 });
        expect(result).toContain("\x1b[");
    });

    it("selectedIndex wraps the selected row in ANSI inverse when colors=true", () => {
        const result = renderList(SAMPLE, {
            colors: true,
            termWidth: 120,
            selectedIndex: 1,
        });
        const lines = result.split("\n");
        expect(lines[1]).toContain("\x1b[7m");
    });

    it("selectedIndex is ignored when colors=false (no ANSI at all)", () => {
        const result = renderList(SAMPLE, {
            colors: false,
            termWidth: 120,
            selectedIndex: 0,
        });
        expect(result).not.toContain("\x1b[");
    });
});
