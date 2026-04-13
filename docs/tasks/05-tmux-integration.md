# Task 05 — tmux Side Panel + Statusline

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Tasks 02 + 04 gemerged.

## Ziel

Ein persistentes seitliches tmux-Pane, das alle Sessions kompakt anzeigt und sich automatisch aktualisiert — plus ein compact icon string für die tmux-Statusline, der **nur in tmux-Windows sichtbar ist, in denen OpenCode läuft**.

## Deliverable 1: Panel-Renderer (`packages/cli/src/panel.ts` — neu)

Funktion `renderPanel(records, opts: { colors: boolean; termWidth: number; selectedIndex?: number })`:

- 2 Zeilen pro Session:
  - Zeile 1: `<icon> <state padded>  <duration>`
  - Zeile 2: `  <projectName> › <sessionTitle>` (truncated auf `termWidth - 2`)
- Leerzeile zwischen Sessions
- Selected-Row: ANSI inverse auf beiden Zeilen
- Wiederverwendet: `colorState()`, `formatDuration()`, `truncate()` aus `format.ts`
- **Bei 0 Records**: Hinweistext ausgeben, kein leeres Pane. Beispiel:
  ```
  No active opencode
  sessions. Waiting…
  ```

### Glyphen-Anforderung

Jede `SessionState`-Variante bekommt eine **eindeutige** Glyphe, die auch ohne Farbe unterscheidbar ist (für terminals ohne ANSI-Support und für colorblind users):

| State | Glyphe |
|---|---|
| `waiting_permission` | `⏸` |
| `waiting_answer` | `❓` |
| `error` | `✗` |
| `running` | `▶` |
| `done` | `✓` |
| `idle` | `·` |

Diese Glyphen werden in **allen** drei Oberflächen konsistent verwendet: `renderPanel()`, `renderTable()` (Task 04 retrofit falls nötig) und `tmux-status.sh` / `--print-status`. Bitte als Konstante in `packages/core/src/icons.ts` anlegen und von beiden Paketen importieren.

Beispiel-Output (45 Zeichen breit):
```
⏸ waiting_permission  2m
  myproject › Fix auth bug

✗ error                5m
  otherproject › Refactor DB

▶ running             12m
  thirdproject › Add tests
```

Unit-Tests in `packages/cli/src/panel.test.ts`.

## Deliverable 2: `watch.tsx` — Auto-Switch auf Panel-Layout

- `termWidth < 60` → `renderPanel()` statt `renderTable()`
- Kein neues Flag nötig (Side-Pane ist immer schmal, auto-detect reicht)
- Footer (State-Counts + Keybindings) bleibt identisch
- **SIGWINCH-Handling**: Bei Terminal-Resize muss der Renderer ohne Neustart zwischen Tabelle und Panel umschalten. Ink handhabt Resize grundsätzlich, aber bitte explizit prüfen, dass die Layout-Wahl auf jedem Render neu evaluiert wird (kein Caching der Entscheidung beim Mount).

## Deliverable 3: Shell-Skripte (`packages/cli/scripts/`)

### `tmux-panel.sh` — öffnet persistentes Side-Panel

```sh
#!/bin/sh
# Validiert opencode-dispatch im PATH, sonst Fehlermeldung.
command -v opencode-dispatch >/dev/null 2>&1 || {
  echo "opencode-dispatch not found in PATH" >&2
  exit 1
}
tmux split-window -h -l 45 "opencode-dispatch --watch"
```

User-Integration:
```tmux
bind-key O run-shell '~/path/to/tmux-panel.sh'
```

### `tmux-status.sh` — compact icon string für Statusline

- Liest `summary.json` aus dem Store (respektiert `XDG_STATE_HOME`)
- Gibt nur Counts > 0 aus, z.B. `⏸2 ❓1`
- Reine POSIX-sh (keine bash-isms: kein `[[ ]]`, keine Arrays). `sh -n` und `shellcheck -s sh` müssen sauber sein.
- `jq` falls vorhanden, sonst `grep`/`sed`-Fallback
- Bei leerem/fehlendem Store: **exit 0 und leerer String** (sonst bricht die tmux-Statusline).
- `chmod +x` setzen.

## Deliverable 4: CLI-Flag `--print-status`

`opencode-dispatch --print-status` — dasselbe wie `tmux-status.sh`, reines Node:
- Liest `readSummary()` aus `@opencode-dispatch/core`
- Icon-String ausgeben; bei fehlender Summary → leerer String, exit 0
- Alternative für User ohne `jq`

**Äquivalenz-Anforderung**: `tmux-status.sh` und `--print-status` müssen bei identischer `summary.json` **byte-identischen** Output liefern. Es gibt einen gemeinsamen Unit-Test, der bei drei Summary-Zuständen (leer, nur waiting, gemischt) beide Outputs vergleicht. Wenn `jq` im Test-Runner nicht verfügbar ist, wird der `grep`/`sed`-Fallback-Pfad getestet.

## Deliverable 5: Statusline nur in OpenCode-Windows sichtbar

Die `status-right`-Zeile ist in tmux session-weit, aber per-Refresh konditional auswertbar. Lösung:

### Plugin-Erweiterung (`packages/plugin/src/index.ts`)

Das Plugin setzt beim **Start** auf dem aktuellen tmux-Window eine User-Option, beim **Shutdown** wird sie entfernt:

```typescript
// on plugin init:
if (tmuxTarget) {
  execFileSync("tmux", ["set-option", "-w", "-t", tmuxWindowId, "@opencode-dispatch-active", "1"]);
}

// on shutdown:
if (tmuxTarget) {
  execFileSync("tmux", ["set-option", "-w", "-u", "-t", tmuxWindowId, "@opencode-dispatch-active"]);
}
```

`tmuxWindowId` wird via `tmux display-message -p '#{window_id}'` beim Start ermittelt und gecacht. Bei Fehlern (kein tmux, kein aktives Window) still überspringen — nie crashen.

### User-Integration in der Statusline

```tmux
set -g status-right '#{?#{==:#{@opencode-dispatch-active},1},#(opencode-dispatch --print-status) ,}%H:%M'
set -g status-interval 2
```

Der Conditional `#{?#{==:#{@opencode-dispatch-active},1},...,}` sorgt dafür, dass der Status nur in Windows mit gesetzter Flag angezeigt wird. In allen anderen Windows bleibt die Statusline „sauber".

### Alternative-Snippet für User ohne Shell-Skript

Analog mit dem Shell-Skript-Pfad:
```tmux
set -g status-right '#{?#{==:#{@opencode-dispatch-active},1},#(~/path/to/tmux-status.sh) ,}%H:%M'
```

## `Enter`-Jump-Verhalten (Klarstellung)

- `tmuxTarget` wird als **tmux-Session-Name** interpretiert.
- Kommando: `tmux switch-client -t <target>`.
- Konsequenz: Wenn der User im Panel-Pane ist und sich auf eine andere Session switcht, ist der Panel-Pane aus seiner aktuellen Sicht weg (er ist in einer anderen tmux-Session). Zurückspringen via `prefix + L` (last-client) oder durch erneutes Öffnen des Panels. **Das ist akzeptiertes Verhalten**, nicht zu umgehen — wer einen persistenten Panel in **jeder** tmux-Session will, bindet `tmux-panel.sh` eben pro Session.

## Tests

- Unit: `renderPanel()` — happy path, leere Liste (Hinweistext), selected row.
- Unit: Icon-Konstanten aus `core/src/icons.ts` — ein Test pro State, dass Glyphe existiert und eindeutig ist.
- Unit: Icon-Builder-Funktion (States-Counts → String) — leer, nur waiting, gemischt.
- Unit: Äquivalenz-Test `tmux-status.sh` ↔ `--print-status` (drei Summary-Fixtures).
- Manuelle Test-Checkliste im PR-Body:
  1. `tmux-status.sh` mit leerem Store → leerer Output, exit 0.
  2. Mit 2 waiting_permission → `⏸2`.
  3. `tmux-panel.sh` öffnet Split-Pane mit laufendem Watch-Mode.
  4. Panel-Layout erscheint automatisch im 45-Zeichen-Pane.
  5. Tabellen-Layout bleibt bei 80+ Zeichen erhalten.
  6. `Enter` auf eine Session springt via `tmux switch-client`; Zurück per `prefix + L`.
  7. Statusline-Conditional: In einem Window mit laufendem OpenCode (Plugin hat `@opencode-dispatch-active` gesetzt) ist die Status-Icon-Anzeige sichtbar; in einem Window ohne OpenCode nicht.
  8. Nach OpenCode-Shutdown: Statusline-Icons verschwinden in diesem Window.
  9. Terminal-Resize von 45 auf 120 Zeichen: Layout wechselt live von Panel zu Tabelle ohne Neustart.

## Doku

Neuer Abschnitt im Root-`README.md` → „tmux Integration" mit:
- Snippet für `tmux-panel.sh` + Keybinding.
- Snippet für die konditionale `status-right`-Zeile (beide Varianten: `--print-status` und Shell-Script).
- Kurzer Hinweis, dass Icons nur in Windows mit aktiver OpenCode-Instanz erscheinen.

## Nicht-Ziele

- Kein `--panel`-Flag (auto-detect via termWidth reicht).
- Keine tmux-plugin-manager-Integration (tpm).
- Kein automatisches `source`-File-Generieren.
- Kein Socket-Daemon (das ist Task 06).
- Keine Reconciliation, falls das Plugin crasht und die Window-Option nicht zurücksetzen konnte — der User startet OpenCode neu oder entfernt die Option manuell per `tmux set-option -w -u @opencode-dispatch-active`. (In der Doku erwähnen.)

## Commit

`feat(cli): tmux side panel with compact renderer and window-scoped statusline`
