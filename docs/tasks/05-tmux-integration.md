# Task 05 — tmux Side Panel + Statusline

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Tasks 02 + 04 gemerged.

## Ziel

Ein persistentes seitliches tmux-Pane, das alle Sessions kompakt anzeigt und sich automatisch aktualisiert — plus ein compact icon string für die tmux-Statusline.

## Deliverable 1: Panel-Renderer (`packages/cli/src/panel.ts` — neu)

Funktion `renderPanel(records, opts: { colors: boolean; termWidth: number; selectedIndex?: number })`:
- 2 Zeilen pro Session:
  - Zeile 1: `<icon> <state padded>  <duration>`
  - Zeile 2: `  <projectName> › <sessionTitle>` (truncated auf termWidth-2)
- Leerzeile zwischen Sessions
- Selected-Row: ANSI inverse auf beiden Zeilen
- Wiederverwendet: `colorState()`, `formatDuration()`, `truncate()` aus `format.ts`

Beispiel-Output (45 Zeichen breit):
```
● waiting_permission  2m
  myproject › Fix auth bug

● error               5m
  otherproject › Refactor DB

▶ running            12m
  thirdproject › Add tests
```

Unit-Tests in `packages/cli/src/panel.test.ts`.

## Deliverable 2: `watch.tsx` — Auto-Switch auf Panel-Layout

- `termWidth < 60` → `renderPanel()` statt `renderTable()`
- Kein neues Flag nötig (Side-Pane ist immer schmal, auto-detect reicht)
- Footer (State-Counts + Keybindings) bleibt identisch

## Deliverable 3: Shell-Skripte (`packages/cli/scripts/`)

**`tmux-panel.sh`** — öffnet persistentes Side-Panel:
```sh
#!/bin/sh
# Validiert opencode-dispatch im PATH, sonst Fehlermeldung
tmux split-window -h -l 45 "opencode-dispatch --watch"
```

User-Integration:
```tmux
bind-key O run-shell '~/path/to/tmux-panel.sh'
```

**`tmux-status.sh`** — compact icon string für Statusline:
- Liest `summary.json` aus dem Store (respektiert `XDG_STATE_HOME`)
- Gibt nur Counts > 0 aus, z.B. `⏸2 ❓1`
- Reine POSIX-sh, `jq` falls vorhanden, sonst `grep`/`sed`-Fallback
- `chmod +x`

User-Integration:
```tmux
set -g status-right '#(~/path/to/tmux-status.sh) | %H:%M'
set -g status-interval 2
```

## Deliverable 4: CLI-Flag `--print-status`

`opencode-dispatch --print-status` — dasselbe wie `tmux-status.sh`, reines Node:
- Liest `readSummary()` aus `@opencode-dispatch/core`
- Icon-String ausgeben; bei fehlender Summary → leerer String, exit 0
- Alternative für User ohne `jq`

```sh
set -g status-right '#(opencode-dispatch --print-status) | %H:%M'
```

## Tests

- Unit-Tests für `renderPanel()` (happy path, leere Liste, selected row).
- Unit für die Icon-Builder-Funktion (States-Counts → String).
- Manuelle Test-Checkliste im PR-Body:
  1. `tmux-status.sh` mit leerem Store → leerer Output.
  2. Mit 2 waiting_permission → `⏸2`.
  3. `tmux-panel.sh` öffnet Split-Pane mit laufendem Watch-Mode.
  4. Panel-Layout erscheint automatisch im 45-Zeichen-Pane.
  5. Tabellen-Layout bleibt bei 80+ Zeichen erhalten.
  6. `Enter` auf eine Session springt korrekt via `tmux switch-client`.

## Doku

Neuer Abschnitt im Root-`README.md` → „tmux Integration" mit den zwei Snippets oben.

## Nicht-Ziele

- Kein `--panel`-Flag (auto-detect via termWidth reicht)
- Keine tmux-plugin-manager-Integration (tpm).
- Kein automatisches `source`-File-Generieren.
- Kein Socket-Daemon (das ist Task 06).

## Commit

`feat(cli): tmux side panel with compact panel renderer`

