# Task 03 — OpenCode Plugin

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Task 02 gemerged.

## Ziel

`@opencode-dispatch/plugin` ist ein OpenCode-Plugin, das bei jedem relevanten Event einen `SessionRecord` via `core.writeRecord` aktualisiert. Ein Plugin-Load pro OpenCode-Instanz, ein Record pro OpenCode-Session.

## Referenz

Als Vorlage für Plugin-Struktur und Hook-Namen dient https://github.com/mohak34/opencode-notifier (`src/index.ts`). Die dort verwendeten Events (`permission`, `complete`, `error`, `question`, `subagent_complete`) sind auch für uns die primären Trigger. OpenCode-Plugin-API-Docs: https://opencode.ai/docs/plugins — **der Agent muss diese Doku konsultieren**, bevor er Hook-Signaturen rät.

## Public API

`package.json` mit `"name": "@opencode-dispatch/plugin"`, publishConfig auf public. Entry-Point exportiert default eine Funktion nach OpenCode-Plugin-Spec.

User installiert via `opencode.json`:
```json
{ "plugin": ["@opencode-dispatch/plugin@latest"] }
```

## State-Mapping

Event → neuer `state`:

| OpenCode-Event | `SessionState` |
|---|---|
| session gestartet / message beginnt | `running` |
| `permission` wird angefragt | `waiting_permission` |
| `question` tool invoked | `waiting_answer` |
| `complete` (generation fertig, kein Fehler) | `done` |
| `error` | `error` |
| `subagent_complete` | **kein State-Change** des Haupt-Records; nur `lastMessage` updaten |
| idle-Timer (kein Event für 60s nach `done`) | `idle` |

Implementiere als pure Mapping-Funktion `eventToState(event, prevState)` → leicht testbar.

## Record-Aufbau

Beim ersten Event einer Session:
- `instanceId = core.makeInstanceId()`
- `sessionId` aus OpenCode-Event-Payload
- `projectPath = process.cwd()` (OpenCode wird im Projektverzeichnis gestartet)
- `projectName = path.basename(projectPath)`
- `sessionTitle` aus Event-Payload, fallback `"(untitled)"`
- `tmuxTarget = parseTmuxTarget(process.env.TMUX)` — siehe unten
- `createdAt = updatedAt = now`

Bei Folge-Events: existing record holen (via direkten `recordPath`-read, nicht `readAllRecords`), Felder aktualisieren, `writeRecord`.

## tmux-Detection

```typescript
function parseTmuxTarget(tmuxEnv: string | undefined): string | undefined {
  // $TMUX format: "/tmp/tmux-1000/default,12345,0"  → session name via `tmux display -p '#S'`
  // fallback: undefined
}
```

Einfachster robuster Weg: synchron `execFileSync("tmux", ["display", "-p", "#S"])` beim Plugin-Start, Ergebnis cachen. Bei Fehler → `undefined`.

## Shutdown / Cleanup

- Registriere `process.on("exit")` und `SIGINT`/`SIGTERM`: für jede in dieser Instanz aktive Session `state = "idle"` setzen und Record schreiben (damit CLI „läuft nicht mehr" erkennt) — **nicht löschen**, weil der User evtl. später den Verlauf sehen will. Stale-Cleanup nach 24h erledigt `core`.

## Fehlerverhalten

- Plugin darf OpenCode **niemals** crashen. Alle Store-Writes in `try/catch`, bei Fehler `console.error` und weiter.
- Kein Netzwerk, kein User-Prompt, keine Notifications.

## Tests

- Unit: `eventToState` für alle Mappings inkl. `subagent_complete`-No-op.
- Unit: `parseTmuxTarget` mit mock env.
- Integration (optional, falls OpenCode-SDK mockbar): zwei fake-Events → Store enthält einen Record mit erwartetem finalen State.

## Nicht-Ziele

- Keine Desktop-Notifications (macht `opencode-notifier`, kann parallel laufen).
- Kein Socket, keine Daemon-Kommunikation.
- Kein Lesen des Stores — Plugin ist write-only.

## Deliverable

Commit `feat(plugin): write session state to shared store on opencode events`. README-Snippet in `packages/plugin/README.md` mit Install-Instructions.
