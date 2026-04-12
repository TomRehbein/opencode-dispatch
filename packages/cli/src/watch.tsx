import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { sessionsDir, readAllRecords } from "@opencode-overview/core";
import type { SessionRecord, SessionState } from "@opencode-overview/core";
import { sortRecords, filterRecords } from "./sort.js";
import type { FilterMode } from "./sort.js";
import { renderTable } from "./table.js";

function buildCounts(records: SessionRecord[]): Record<SessionState, number> {
  const counts: Record<SessionState, number> = {
    waiting_permission: 0,
    waiting_answer: 0,
    error: 0,
    running: 0,
    idle: 0,
    done: 0,
  };
  for (const r of records) {
    counts[r.state]++;
  }
  return counts;
}

function cycleFilter(current: FilterMode): FilterMode {
  if (current === "all") return "waiting";
  if (current === "waiting") return "errors";
  return "all";
}

export function WatchApp(): React.ReactElement {
  const { exit } = useApp();
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [statusMsg, setStatusMsg] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let watcher: fs.FSWatcher | null = null;

    async function reload() {
      const all = await readAllRecords();
      setRecords(sortRecords(all));
    }

    reloadRef.current = () => { void reload(); };

    void reload();

    function scheduleReload() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { void reload(); }, 100);
    }

    try {
      watcher = fs.watch(sessionsDir(), { persistent: false }, scheduleReload);
    } catch {
      // Directory may not exist yet; interval fallback covers it
    }

    const interval = setInterval(() => { void reload(); }, 500);

    return () => {
      watcher?.close();
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const displayed = filterRecords(records, filterMode);

  // Clamp selection when filter changes
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, displayed.length - 1)));
  }, [displayed.length]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      setStatusMsg("");
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(displayed.length - 1, i + 1));
      setStatusMsg("");
      return;
    }
    if (key.return) {
      const rec = displayed[selectedIndex];
      if (!rec) return;
      if (!rec.tmuxTarget) {
        setStatusMsg("No tmux target for this session");
        return;
      }
      try {
        execFileSync("tmux", ["switch-client", "-t", rec.tmuxTarget]);
        setStatusMsg("");
      } catch (err) {
        setStatusMsg(`tmux error: ${String(err)}`);
      }
      return;
    }
    if (input === "r") {
      reloadRef.current();
      return;
    }
    if (input === "f") {
      setFilterMode(cycleFilter);
      setStatusMsg("");
      return;
    }
  });

  const termWidth = process.stdout.columns ?? 120;
  const tableStr = renderTable(displayed, { colors: true, termWidth });
  const counts = buildCounts(records);
  const footer = statusMsg
    ? statusMsg
    : `⏸ ${counts.waiting_permission}  ❓ ${counts.waiting_answer}  ✗ ${counts.error}  ▶ ${counts.running}  | filter: ${filterMode}  | q:exit  ↑↓/jk:select  Enter:jump  r:refresh  f:filter`;

  return (
    <Box flexDirection="column">
      <Text>{tableStr}</Text>
      <Text dimColor>{footer}</Text>
    </Box>
  );
}
