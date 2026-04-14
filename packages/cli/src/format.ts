import type { SessionRecord, SessionState } from "@opencode-dispatch/core";

export function formatDuration(ms: number): string {
    // Guard against negative values (e.g. clock skew between machines).
    if (ms < 0) return "< 1m";
    if (ms < 60_000) return "< 1m";

    const totalMinutes = Math.floor(ms / 60_000);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    if (totalDays > 0) {
        const remainHours = totalHours % 24;
        return remainHours > 0 ? `${totalDays}d ${remainHours}h` : `${totalDays}d`;
    }
    if (totalHours > 0) {
        const remainMinutes = totalMinutes % 60;
        return remainMinutes > 0 ? `${totalHours}h ${remainMinutes}m` : `${totalHours}h`;
    }
    return `${totalMinutes}m`;
}

const STATE_COLORS: Record<SessionState, string> = {
    waiting_permission: "\x1b[33m",
    waiting_answer: "\x1b[36m",
    error: "\x1b[31m",
    running: "\x1b[34m",
    done: "\x1b[32m",
    idle: "\x1b[90m",
};

/** Single-width Unicode symbols per state. All symbols are exactly 1 column
 *  wide so list output stays aligned regardless of font or terminal. */
export const STATE_SYMBOLS: Record<SessionState, string> = {
    waiting_permission: "▪",
    waiting_answer: "?",
    error: "✕",
    running: "▶",
    done: "✓",
    idle: "·",
};

/** Max width across all SessionState label strings. Derived so adding a new
 *  state doesn't silently break column alignment. */
export const MAX_STATE_LABEL_WIDTH = Object.keys(STATE_COLORS).reduce(
    (m, s) => Math.max(m, s.length),
    0
);

export function colorState(state: SessionState): string {
    const open = STATE_COLORS[state];
    return `${open}${state}\x1b[0m`;
}

/** Formats a single session record as one line:
 *  `<symbol> <project> - <session> (<since>)`
 *
 *  When `colors` is true the symbol is wrapped with the state's ANSI color. */
export function formatLine(record: SessionRecord, colors: boolean): string {
    const symbol = STATE_SYMBOLS[record.state];
    const since = formatDuration(Date.now() - Date.parse(record.updatedAt));
    const line = `${symbol} ${record.projectName} - ${record.sessionTitle} (${since})`;
    if (!colors) return line;
    const color = STATE_COLORS[record.state];
    return `${color}${symbol}\x1b[0m ${record.projectName} - ${record.sessionTitle} (${since})`;
}

export function truncate(str: string, max: number): string {
    if (max <= 0) return "";
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
}
