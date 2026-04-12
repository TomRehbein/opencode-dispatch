#!/usr/bin/env node
import { readAllRecords } from "@opencode-overview/core";
import { filterRecords, sortRecords } from "./sort.js";
import type { FilterMode } from "./sort.js";
import { renderTable } from "./table.js";

const USAGE = `Usage: opencode-overview [options]

Options:
  --watch            Live TUI (press q to exit)
  --json             Output session records as JSON
  --filter=<mode>    Filter sessions: all | waiting | errors  (default: all)
  --help, -h         Show this help

Exit codes: 0=ok  1=store unreadable  2=invalid args
`;

function parseArgs(args: string[]): {
  watch: boolean;
  json: boolean;
  filter: FilterMode;
} | never {
  let watch = false;
  let json = false;
  let filter: FilterMode = "all";

  for (const arg of args) {
    if (arg === "--watch") {
      watch = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg.startsWith("--filter=")) {
      const value = arg.slice("--filter=".length);
      if (value !== "all" && value !== "waiting" && value !== "errors") {
        process.stderr.write(
          `opencode-overview: invalid --filter value '${value}'. Must be: all | waiting | errors\n`
        );
        process.exit(2);
      }
      filter = value;
    } else {
      process.stderr.write(`opencode-overview: unknown option '${arg}'\n${USAGE}`);
      process.exit(2);
    }
  }

  return { watch, json, filter };
}

async function main() {
  const { watch, json, filter } = parseArgs(process.argv.slice(2));

  if (json) {
    try {
      const records = await readAllRecords();
      process.stdout.write(JSON.stringify(records, null, 2) + "\n");
      process.exit(0);
    } catch {
      process.stderr.write("opencode-overview: cannot read store\n");
      process.exit(1);
    }
  }

  if (watch) {
    const { render } = await import("ink");
    const { WatchApp } = await import("./watch.js");
    const React = await import("react");
    const { waitUntilExit } = render(React.createElement(WatchApp));
    await waitUntilExit();
    process.exit(0);
  }

  // One-shot table
  try {
    const records = await readAllRecords();
    const filtered = filterRecords(sortRecords(records), filter);
    const colors = Boolean(process.stdout.isTTY);
    const termWidth = process.stdout.columns ?? 80;
    process.stdout.write(renderTable(filtered, { colors, termWidth }) + "\n");
    process.exit(0);
  } catch {
    process.stderr.write("opencode-overview: cannot read store\n");
    process.exit(1);
  }
}

void main();
