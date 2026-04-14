import type { SessionRecord, SessionState } from "@opencode-dispatch/core";

export type FilterMode = "all" | "waiting" | "errors" | "hidden";

// Tier 0 = states requiring user action; Tier 1 = rest (spec: "dann Rest").
const STATE_TIER: Record<SessionState, number> = {
    waiting_permission: 0,
    waiting_answer: 0,
    error: 0,
    running: 1,
    idle: 1,
    done: 1,
};

export function sortRecords(records: SessionRecord[]): SessionRecord[] {
    return [...records].sort((a, b) => {
        const tierDiff = STATE_TIER[a.state] - STATE_TIER[b.state];
        if (tierDiff !== 0) return tierDiff;
        const byProject = a.projectName.localeCompare(b.projectName);
        if (byProject !== 0) return byProject;
        return a.sessionTitle.localeCompare(b.sessionTitle);
    });
}

export function filterRecords(records: SessionRecord[], mode: FilterMode): SessionRecord[] {
    if (mode === "hidden") return records.filter((r) => r.hidden === true);
    if (mode === "waiting") {
        return records.filter(
            (r) => !r.hidden && (r.state === "waiting_permission" || r.state === "waiting_answer")
        );
    }
    if (mode === "errors") return records.filter((r) => !r.hidden && r.state === "error");
    // mode === "all": exclude hidden sessions
    return records.filter((r) => !r.hidden);
}

export function cycleFilter(current: FilterMode): FilterMode {
    if (current === "all") return "waiting";
    if (current === "waiting") return "errors";
    if (current === "errors") return "hidden";
    return "all";
}
