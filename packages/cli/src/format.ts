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
 *  When `maxWidth` is provided the visible text is constrained to that many
 *  columns. `sessionTitle` is shortened first; if the fixed skeleton alone
 *  exceeds the budget, `projectName` is shortened as well.
 *
 *  When `colors` is true the symbol is wrapped with the state's ANSI color. */
export function formatLine(record: SessionRecord, colors: boolean, maxWidth?: number): string {
    const symbol = STATE_SYMBOLS[record.state];
    const since = formatDuration(Date.now() - Date.parse(record.updatedAt));

    let projectName = record.projectName;
    let sessionTitle = record.sessionTitle;

    if (maxWidth !== undefined && maxWidth > 0) {
        // Fixed skeleton (excluding the two variable parts):
        // "<symbol> " (2) + " - " (3) + " (" (2) + since + ")" (1)
        const skeleton = 2 + 3 + 2 + since.length + 1; // symbol(1) + space(1) + " - " + " (" + since + ")"
        const budget = maxWidth - skeleton;

        if (budget <= 0) {
            // Extreme narrow pane — show as little as possible
            projectName = "";
            sessionTitle = "";
        } else {
            // Total visible chars available for projectName + sessionTitle
            const totalAvail = budget;
            const naturalLen = projectName.length + sessionTitle.length;

            if (naturalLen > totalAvail) {
                // First shorten sessionTitle, keep at least 6 chars if possible
                const minSession = Math.min(6, sessionTitle.length);
                const sessionBudget = Math.max(minSession, totalAvail - projectName.length);
                sessionTitle = truncate(sessionTitle, sessionBudget);

                // If still over budget, shorten projectName too
                const remaining = totalAvail - sessionTitle.length;
                if (remaining < projectName.length) {
                    projectName = truncate(projectName, Math.max(1, remaining));
                }
            }
        }
    }

    const line = `${symbol} ${projectName} - ${sessionTitle} (${since})`;
    if (!colors) return line;
    const color = STATE_COLORS[record.state];
    return `${color}${symbol}\x1b[0m ${projectName} - ${sessionTitle} (${since})`;
}

export function truncate(str: string, max: number): string {
    if (max <= 0) return "";
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
}
