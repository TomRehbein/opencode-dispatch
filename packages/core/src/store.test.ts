import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  writeRecord,
  readAllRecords,
  writeSummary,
  readSummary,
  sessionsDir,
  recordPath,
  type SessionRecord,
} from "./index.js";
import { makeRecord } from "./test-fixtures.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "core-test-"));
  process.env.XDG_STATE_HOME = tmpDir;
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.XDG_STATE_HOME;
  await rm(tmpDir, { recursive: true, force: true });
});

describe("writeRecord + readAllRecords", () => {
  it("1. happy path: writes a record and reads it back", async () => {
    const rec = makeRecord();
    await writeRecord(rec);

    const records = await readAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].instanceId).toBe("host-1234");
    expect(records[0].sessionId).toBe("ses-abc");
    expect(records[0].projectName).toBe("myproject");
    expect(records[0].state).toBe("running");
    expect(records[0].updatedAt).toBeTruthy();
    expect(records[0].createdAt).toBeTruthy();
  });

  it("2. two writes to same (instanceId, sessionId) → one file, last version wins", async () => {
    await writeRecord(makeRecord({ lastMessage: "first" }));
    await writeRecord(makeRecord({ lastMessage: "second", state: "done" }));

    const files = await readdir(sessionsDir());
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    expect(jsonFiles).toHaveLength(1);

    const records = await readAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].lastMessage).toBe("second");
    expect(records[0].state).toBe("done");
  });

  it("3. parallel writes (10x Promise.all) → no partial files, final state consistent", async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      writeRecord(
        makeRecord({
          instanceId: "host-1234",
          sessionId: `ses-${i}`,
          projectName: `proj-${i}`,
          sessionTitle: `title-${i}`,
        })
      )
    );
    await Promise.all(writes);

    const records = await readAllRecords();
    expect(records).toHaveLength(10);
    for (const rec of records) {
      // Each record must be fully valid JSON with required fields
      expect(rec.updatedAt).toBeTruthy();
      expect(rec.createdAt).toBeTruthy();
    }
  });

  it("4. stale cleanup: record older than 24h is removed on readAllRecords", async () => {
    const now = new Date("2024-01-10T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await writeRecord(makeRecord());

    // Advance time by 25 hours
    vi.setSystemTime(new Date(now.getTime() + 25 * 60 * 60 * 1000));

    const records = await readAllRecords();
    expect(records).toHaveLength(0);

    // File should be deleted
    const files = await readdir(sessionsDir());
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    expect(jsonFiles).toHaveLength(0);
  });

  it("6. corrupt JSON in store → readAllRecords skips it without throwing", async () => {
    await writeRecord(makeRecord({ sessionId: "ses-good" }));

    // Manually write a corrupt file
    const corruptPath = join(sessionsDir(), "host-9999--ses-bad.json");
    await writeFile(corruptPath, "{ this is not valid json", "utf8");

    const records = await readAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe("ses-good");
  });
});

describe("writeSummary", () => {
  it("5. summary contains all 6 state keys with correct counts", async () => {
    const records: SessionRecord[] = [
      makeRecord({ instanceId: "h", sessionId: "s1", state: "running" }),
      makeRecord({ instanceId: "h", sessionId: "s2", state: "running" }),
      makeRecord({ instanceId: "h", sessionId: "s3", state: "error" }),
    ];
    // Set timestamps so they are valid
    const ts = new Date().toISOString();
    for (const r of records) {
      r.updatedAt = ts;
      r.createdAt = ts;
    }

    const summary = await writeSummary(records);

    expect(Object.keys(summary.counts).sort()).toEqual(
      ["done", "error", "idle", "running", "waiting_answer", "waiting_permission"]
    );
    expect(summary.counts.running).toBe(2);
    expect(summary.counts.error).toBe(1);
    expect(summary.counts.idle).toBe(0);
    expect(summary.counts.done).toBe(0);
    expect(summary.counts.waiting_permission).toBe(0);
    expect(summary.counts.waiting_answer).toBe(0);

    // readSummary should return the same data
    const read = await readSummary();
    expect(read).not.toBeNull();
    expect(read!.counts.running).toBe(2);
  });
});
