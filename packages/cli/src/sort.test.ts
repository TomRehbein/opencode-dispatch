import { describe, it, expect } from "vitest";
import { sortRecords, filterRecords, cycleFilter } from "./sort.js";
import type { SessionRecord, SessionState } from "@opencode-dispatch/core";
import { makeRecord } from "@opencode-dispatch/core/test-fixtures";

function rec(state: SessionState, projectName = "proj", sessionTitle = "sess", hidden?: boolean): SessionRecord {
    return makeRecord({ state, projectName, sessionTitle, sessionId: "s1", hidden });
}

describe("sortRecords", () => {
    it("waiting_permission appears before running", () => {
        const result = sortRecords([rec("running"), rec("waiting_permission")]);
        expect(result[0].state).toBe("waiting_permission");
        expect(result[1].state).toBe("running");
    });

    it("waiting_answer appears before running", () => {
        const result = sortRecords([rec("running"), rec("waiting_answer")]);
        expect(result[0].state).toBe("waiting_answer");
    });

    it("error appears before done", () => {
        const result = sortRecords([rec("done"), rec("error")]);
        expect(result[0].state).toBe("error");
    });

    it("idle and done are in the same tier (both 'Rest')", () => {
        // Same tier → sorted alphabetically by projectName tiebreaker
        const result = sortRecords([
            rec("done", "a-proj"),
            rec("idle", "b-proj"),
        ]);
        expect(result[0].projectName).toBe("a-proj");
        expect(result[1].projectName).toBe("b-proj");
    });

    it("done appears before running is NOT required (both tier 'rest')", () => {
        const result = sortRecords([
            rec("running", "b"),
            rec("done", "a"),
        ]);
        // Both tier 1, sorted by projectName
        expect(result[0].projectName).toBe("a");
    });

    it("within same tier, sorted alphabetically by projectName", () => {
        const result = sortRecords([
            rec("running", "zebra"),
            rec("running", "alpha"),
        ]);
        expect(result[0].projectName).toBe("alpha");
    });

    it("within same tier and project, sorted by sessionTitle", () => {
        const result = sortRecords([
            rec("running", "proj", "z-session"),
            rec("running", "proj", "a-session"),
        ]);
        expect(result[0].sessionTitle).toBe("a-session");
    });

    it("does not mutate the input array", () => {
        const input = [rec("running"), rec("waiting_permission")];
        const original = [...input];
        sortRecords(input);
        expect(input[0].state).toBe(original[0].state);
    });
});

describe("filterRecords", () => {
    const mixed = [
        rec("waiting_permission"),
        rec("waiting_answer"),
        rec("error"),
        rec("running"),
        rec("idle"),
        rec("done"),
    ];

    it("mode=all returns all records", () => {
        expect(filterRecords(mixed, "all")).toHaveLength(6);
    });

    it("mode=waiting returns only waiting_permission and waiting_answer", () => {
        const result = filterRecords(mixed, "waiting");
        expect(result).toHaveLength(2);
        expect(result.every((r) => r.state === "waiting_permission" || r.state === "waiting_answer")).toBe(true);
    });

    it("mode=waiting excludes error records", () => {
        const result = filterRecords(mixed, "waiting");
        expect(result.some((r) => r.state === "error")).toBe(false);
    });

    it("mode=errors returns only error records", () => {
        const result = filterRecords(mixed, "errors");
        expect(result).toHaveLength(1);
        expect(result[0].state).toBe("error");
    });

    it("empty input returns empty output for any mode", () => {
        expect(filterRecords([], "waiting")).toHaveLength(0);
        expect(filterRecords([], "errors")).toHaveLength(0);
        expect(filterRecords([], "all")).toHaveLength(0);
        expect(filterRecords([], "hidden")).toHaveLength(0);
    });

    it("mode=all excludes hidden sessions", () => {
        const records = [
            rec("running"),
            rec("idle", "proj", "sess", true),
        ];
        const result = filterRecords(records, "all");
        expect(result).toHaveLength(1);
        expect(result[0].hidden).toBeFalsy();
    });

    it("mode=hidden returns only hidden sessions", () => {
        const records = [
            rec("running"),
            rec("idle", "proj", "sess", true),
            rec("done", "proj2", "sess2", true),
        ];
        const result = filterRecords(records, "hidden");
        expect(result).toHaveLength(2);
        expect(result.every((r) => r.hidden === true)).toBe(true);
    });

    it("mode=waiting excludes hidden sessions", () => {
        const records = [
            rec("waiting_permission"),
            rec("waiting_answer", "proj", "sess", true),
        ];
        const result = filterRecords(records, "waiting");
        expect(result).toHaveLength(1);
        expect(result[0].hidden).toBeFalsy();
    });

    it("mode=errors excludes hidden sessions", () => {
        const records = [
            rec("error"),
            rec("error", "proj", "sess", true),
        ];
        const result = filterRecords(records, "errors");
        expect(result).toHaveLength(1);
        expect(result[0].hidden).toBeFalsy();
    });
});

describe("cycleFilter", () => {
    it("all → waiting → errors → hidden → all", () => {
        expect(cycleFilter("all")).toBe("waiting");
        expect(cycleFilter("waiting")).toBe("errors");
        expect(cycleFilter("errors")).toBe("hidden");
        expect(cycleFilter("hidden")).toBe("all");
    });
});
