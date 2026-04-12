import type { SessionRecord } from "@opencode-overview/core";
import { colorState, formatDuration, truncate } from "./format.js";

export interface RenderOpts {
  colors: boolean;
  termWidth: number;
}

const COL_SEP = " | ";
const SEP_LEN = COL_SEP.length; // 3

const HEADERS = {
  project: "Project",
  session: "Session",
  state: "State",
  since: "Wartet seit",
  msg: "Letzte Nachricht",
};

const STATE_W = 18;  // longest state label: "waiting_permission" = 18
const SINCE_W = 11;  // "Wartet seit" = 11

function displayState(state: string, colors: boolean, colWidth: number): string {
  const colored = colors ? colorState(state as Parameters<typeof colorState>[0]) : state;
  const padding = " ".repeat(Math.max(0, colWidth - state.length));
  return colored + padding;
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

export function renderTable(records: SessionRecord[], opts: RenderOpts): string {
  const { colors, termWidth } = opts;

  const maxProjectLen = records.reduce(
    (m, r) => Math.max(m, r.projectName.length),
    HEADERS.project.length
  );
  const maxSessionLen = records.reduce(
    (m, r) => Math.max(m, r.sessionTitle.length),
    HEADERS.session.length
  );

  const projectW = Math.min(20, Math.max(HEADERS.project.length, maxProjectLen));
  const sessionW = Math.min(30, Math.max(HEADERS.session.length, maxSessionLen));
  const stateW = Math.max(STATE_W, HEADERS.state.length);
  const sinceW = Math.max(SINCE_W, HEADERS.since.length);

  // 4 separators between 5 columns
  const fixedWidth = projectW + sessionW + stateW + sinceW + SEP_LEN * 4;
  const msgW = Math.max(10, termWidth - fixedWidth);

  function buildRow(
    project: string,
    session: string,
    stateCell: string,
    since: string,
    msg: string
  ): string {
    return [
      pad(truncate(project, projectW), projectW),
      pad(truncate(session, sessionW), sessionW),
      stateCell,
      pad(since, sinceW),
      msg,
    ].join(COL_SEP);
  }

  const header = buildRow(
    HEADERS.project,
    HEADERS.session,
    pad(HEADERS.state, stateW),
    HEADERS.since,
    HEADERS.msg
  );

  const separator = [
    "-".repeat(projectW),
    "-".repeat(sessionW),
    "-".repeat(stateW),
    "-".repeat(sinceW),
    "-".repeat(msgW),
  ].join(COL_SEP);

  const rows = records.map((r) => {
    const since = formatDuration(Date.now() - Date.parse(r.updatedAt));
    const msg = truncate(r.lastMessage, msgW).padEnd(msgW);
    const stateCell = displayState(r.state, colors, stateW);
    return buildRow(r.projectName, r.sessionTitle, stateCell, since, msg);
  });

  return [header, separator, ...rows].join("\n");
}
