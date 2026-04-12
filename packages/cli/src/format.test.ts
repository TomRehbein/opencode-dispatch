import { describe, it, expect } from "vitest";
import { formatDuration, colorState, truncate } from "./format.js";

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
