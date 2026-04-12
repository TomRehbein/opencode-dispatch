import { describe, it, expect } from "vitest";
import { sortRecords, filterRecords } from "./sort.js";
import type { SessionRecord, SessionState } from "@opencode-overview/core";

function rec(state: SessionState, projectName = "proj", sessionTitle = "sess"): SessionRecord {
  return {
    instanceId: "host-1",
    sessionId: "s1",
    projectPath: "/path",
    projectName,
    sessionTitle,
    state,
    lastMessage: "",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
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

  it("done appears after idle", () => {
    const result = sortRecords([rec("done"), rec("idle")]);
    expect(result[0].state).toBe("idle");
    expect(result[1].state).toBe("done");
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
  });
});
