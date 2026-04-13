/**
 * Shared test helpers for all workspace packages.
 *
 * Import in tests via:
 *   import { makeRecord } from "@opencode-dispatch/core/test-fixtures"
 *
 * This module is intentionally NOT exported from the package's public index
 * so it is only ever a devDependency concern.
 */

import type { SessionRecord, SessionState } from "./index.js";

/**
 * Returns a minimal but fully valid SessionRecord.
 * All fields have sensible defaults; pass `overrides` to customise.
 */
export function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    const now = new Date().toISOString();
    return {
        instanceId: "host-1234",
        sessionId: "ses-abc",
        projectPath: "/home/user/work/myproject",
        projectName: "myproject",
        sessionTitle: "Fix auth bug",
        state: "running" as SessionState,
        lastMessage: "Thinking...",
        updatedAt: now,
        createdAt: now,
        ...overrides,
    };
}
