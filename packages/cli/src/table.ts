import type { SessionRecord } from "@opencode-dispatch/core";
import { formatLine } from "./format.js";

export interface RenderOpts {
    colors: boolean;
    termWidth: number;
    /** Row index (into `records`) to highlight via ANSI inverse. Only applied when colors=true. */
    selectedIndex?: number;
}

const ANSI_INVERSE = "\x1b[7m";
const ANSI_RESET = "\x1b[0m";

/** Renders session records as a compact list:
 *
 *  ```
 *  ▪ alpha - Fix auth (2m)
 *  ▶ beta - Add tests (10m)
 *  ```
 *
 *  When `records` is empty, a single placeholder line is returned.
 *  The selected row (if any) is wrapped in ANSI inverse when colors=true. */
export function renderList(records: SessionRecord[], opts: RenderOpts): string {
    const { colors, selectedIndex } = opts;

    if (records.length === 0) {
        return "(keine aktiven Sessions)";
    }

    return records
        .map((r, i) => {
            const line = formatLine(r, colors && i !== selectedIndex);
            if (colors && i === selectedIndex) {
                return `${ANSI_INVERSE}${line}${ANSI_RESET}`;
            }
            return line;
        })
        .join("\n");
}

// ---------------------------------------------------------------------------
// Legacy table renderer — kept for reference, not currently used in the CLI.
// ---------------------------------------------------------------------------
//
// import { colorState, formatDuration, MAX_STATE_LABEL_WIDTH, truncate } from "./format.js";
//
// const COL_SEP = " | ";
// const SEP_LEN = COL_SEP.length; // 3
//
// const HEADERS = {
//     project: "Project",
//     session: "Session",
//     state: "State",
//     since: "Wartet seit",
//     msg: "Letzte Nachricht",
// };
//
// const STATE_W = MAX_STATE_LABEL_WIDTH;
// const SINCE_W = 11;
//
// function displayState(state: string, colors: boolean, colWidth: number): string {
//     const colored = colors ? colorState(state as Parameters<typeof colorState>[0]) : state;
//     const padding = " ".repeat(Math.max(0, colWidth - state.length));
//     return colored + padding;
// }
//
// function pad(str: string, width: number): string {
//     return str.padEnd(width);
// }
//
// export function renderTable(records: SessionRecord[], opts: RenderOpts): string {
//     const { colors, termWidth, selectedIndex } = opts;
//
//     const maxProjectLen = records.reduce(
//         (m, r) => Math.max(m, r.projectName.length),
//         HEADERS.project.length
//     );
//     const maxSessionLen = records.reduce(
//         (m, r) => Math.max(m, r.sessionTitle.length),
//         HEADERS.session.length
//     );
//
//     const projectW = Math.min(20, Math.max(HEADERS.project.length, maxProjectLen));
//     const sessionW = Math.min(30, Math.max(HEADERS.session.length, maxSessionLen));
//     const stateW = Math.max(STATE_W, HEADERS.state.length);
//     const sinceW = Math.max(SINCE_W, HEADERS.since.length);
//
//     const fixedWidth = projectW + sessionW + stateW + sinceW + SEP_LEN * 4;
//     const msgW = Math.max(10, termWidth - fixedWidth);
//
//     function buildRow(project: string, session: string, stateCell: string, since: string, msg: string): string {
//         return [
//             pad(truncate(project, projectW), projectW),
//             pad(truncate(session, sessionW), sessionW),
//             stateCell,
//             pad(since, sinceW),
//             msg,
//         ].join(COL_SEP);
//     }
//
//     const header = buildRow(HEADERS.project, HEADERS.session, pad(HEADERS.state, stateW), HEADERS.since, HEADERS.msg);
//
//     const separator = [
//         "-".repeat(projectW),
//         "-".repeat(sessionW),
//         "-".repeat(stateW),
//         "-".repeat(sinceW),
//         "-".repeat(msgW),
//     ].join(COL_SEP);
//
//     const rows = records.map((r, i) => {
//         const since = formatDuration(Date.now() - Date.parse(r.updatedAt));
//         const msg = truncate(r.lastMessage, msgW).padEnd(msgW);
//         const useColors = colors && i !== selectedIndex;
//         const stateCell = displayState(r.state, useColors, stateW);
//         const row = buildRow(r.projectName, r.sessionTitle, stateCell, since, msg);
//         if (colors && i === selectedIndex) {
//             return `${ANSI_INVERSE}${row}${ANSI_RESET}`;
//         }
//         return row;
//     });
//
//     return [header, separator, ...rows].join("\n");
// }
