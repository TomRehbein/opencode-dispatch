# Task 04 — CLI Viewer

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Task 02 gemerged (Task 03 nicht zwingend — Testdaten genügen).

## Ziel

`@opencode-overview/cli` liefert das Binary `opencode-overview`. Zeigt eine Tabelle aller aktiven Sessions, optional live-aktualisiert per `--watch`.

## Bin-Setup

`package.json` → `"bin": { "opencode-overview": "./dist/bin.js" }`. Shebang in `src/bin.ts`: `#!/usr/bin/env node`.

## Kommandos

```
opencode-overview                  # one-shot Tabelle, dann exit
opencode-overview --watch          # TUI, live-update via fs.watch
opencode-overview --json           # raw records als JSON auf stdout, für Scripting
opencode-overview --filter=waiting # nur states waiting_permission + waiting_answer
opencode-overview --help
```

## Tabellen-Format (nicht-watch)

Spalten (in dieser Reihenfolge, Farben nur wenn `process.stdout.isTTY`):

| Project | Session | State | Wartet seit | Letzte Nachricht |

- `State` farbcodiert:
  - `waiting_permission` → gelb
  - `waiting_answer` → cyan
  - `error` → rot
  - `running` → blau
  - `done` → grün
  - `idle` → grau
- `Wartet seit`: human-readable diff von `updatedAt` zu jetzt, z.B. `2m`, `1h 4m`.
- `Letzte Nachricht`: truncate auf verfügbare Terminalbreite minus andere Spalten.
- Sortierung: States mit User-Aktion zuerst (`waiting_permission`, `waiting_answer`, `error`), dann Rest.

Implementation-Tipp: Keine schwere Lib nötig, simple manuelle Spalten-Ausrichtung mit `string.padEnd` reicht. Farben via ANSI-Escape-Codes direkt (kein `chalk`).

## `--watch`-Modus (TUI)

- Nutze `ink` (React für Terminal) ODER `blessed`. Entscheide: **ink** (moderner, einfacher, bessere TS-Unterstützung).
- Initial-Load via `readAllRecords()`.
- Re-render bei:
  - `fs.watch(sessionsDir(), { persistent: true })` — debounced auf 100ms.
  - Fallback: `setInterval(500ms)` falls `fs.watch` auf dem System unzuverlässig (macOS bekanntlich).
- Keybindings:
  - `q` oder `Ctrl-C` → exit.
  - `↑`/`↓` oder `j`/`k` → Zeile selektieren.
  - `Enter` → falls Record `tmuxTarget` hat: `execFileSync("tmux", ["switch-client", "-t", tmuxTarget])`. Falls kein tmux-Kontext: Meldung in Statuszeile.
  - `r` → force refresh.
  - `f` → Filter-Zyklus: all → waiting-only → errors-only → all.
- Footer-Leiste zeigt Counts (`⏸ 2  ❓ 1  ✗ 0  ▶ 3`) und Keybinding-Hilfe.

## `--json`-Modus

Gibt `JSON.stringify(records, null, 2)` auf stdout und exitet 0. Keine Farben, keine TTY-Checks.

## Exit Codes

- 0 = normal
- 1 = Store nicht lesbar (z.B. Permissions)
- 2 = ungültige CLI-Args

## Tests

- Unit: Formatierung der Wartezeit (`formatDuration(ms)`).
- Unit: Sortier-Logik (waiting kommt vor running).
- Unit: Filter-Logik.
- Snapshot: Rendering einer Beispiel-Liste ohne Farben.
- **Kein** End-to-End-Test des TUI.

## Deliverable

Commit `feat(cli): opencode-overview binary with --watch tui`. README mit Screenshot oder ASCII-Beispiel.
