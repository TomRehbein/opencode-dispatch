import React, { useState, useEffect, useRef, useMemo } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { sessionsDir, readAllRecords, computeCounts } from "@opencode-dispatch/core";
import type { SessionRecord } from "@opencode-dispatch/core";
import { sortRecords, filterRecords } from "./sort.js";
import type { FilterMode } from "./sort.js";
import { renderTable } from "./table.js";

const TERM_WIDTH_FALLBACK = 80;

function cycleFilter(current: FilterMode): FilterMode {
    if (current === "all") return "waiting";
    if (current === "waiting") return "errors";
    return "all";
}

export interface WatchAppProps {
    initialFilter?: FilterMode;
}

export const WatchApp: React.FC<WatchAppProps> = ({ initialFilter = "all" }) => {
    const { exit } = useApp();
    const [records, setRecords] = useState<SessionRecord[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<FilterMode>(initialFilter);
    const [statusMsg, setStatusMsg] = useState("");

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reloadRef = useRef<() => void>(() => undefined);

    useEffect(() => {
        let watcher: fs.FSWatcher | null = null;

        async function reload() {
            try {
                const all = await readAllRecords();
                setRecords(sortRecords(all));
                setStatusMsg((prev) => (prev.startsWith("store error:") ? "" : prev));
            } catch (err) {
                setStatusMsg(`store error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        reloadRef.current = () => { void reload(); };

        void reload();

        function scheduleReload() {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => { void reload(); }, 100);
        }

        try {
            watcher = fs.watch(sessionsDir(), { persistent: true }, scheduleReload);
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

    const displayed = useMemo(
        () => filterRecords(records, filterMode),
        [records, filterMode]
    );

    // Map selectedId → current index, falling back to 0 when the id has vanished.
    const selectedIndex = useMemo(() => {
        if (displayed.length === 0) return -1;
        if (selectedId == null) return 0;
        const idx = displayed.findIndex((r) => r.sessionId === selectedId);
        return idx >= 0 ? idx : 0;
    }, [displayed, selectedId]);

    // Initialize selection once records arrive.
    useEffect(() => {
        if (selectedId == null && displayed.length > 0) {
            setSelectedId(displayed[0].sessionId);
        }
    }, [displayed, selectedId]);

    function moveSelection(delta: number) {
        if (displayed.length === 0) return;
        const next = Math.max(0, Math.min(displayed.length - 1, selectedIndex + delta));
        setSelectedId(displayed[next].sessionId);
        setStatusMsg("");
    }

    useInput((input, key) => {
        if (input === "q" || (key.ctrl && input === "c")) {
            exit();
            return;
        }
        if (key.upArrow || input === "k") {
            moveSelection(-1);
            return;
        }
        if (key.downArrow || input === "j") {
            moveSelection(1);
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

    const termWidth = process.stdout.columns ?? TERM_WIDTH_FALLBACK;
    const tableStr = renderTable(displayed, {
        colors: true,
        termWidth,
        selectedIndex: selectedIndex >= 0 ? selectedIndex : undefined,
    });
    const counts = computeCounts(records);
    const footer = statusMsg
        ? statusMsg
        : `⏸ ${counts.waiting_permission}  ❓ ${counts.waiting_answer}  ✗ ${counts.error}  ▶ ${counts.running}  | filter: ${filterMode}  | q:exit  ↑↓/jk:select  Enter:jump  r:refresh  f:filter`;

    return (
        <Box flexDirection="column">
            <Text>{tableStr}</Text>
            <Text dimColor>{footer}</Text>
        </Box>
    );
};
