# Project: `opencode-overview`

## Was ist das?

Ein Werkzeug, das über **mehrere parallel laufende OpenCode-Instanzen hinweg** anzeigt, welche Sessions gerade auf etwas warten (Permission, Rückfrage, Fehler) und welche fertig sind. OpenCode (https://opencode.ai) ist ein terminal-basiertes AI-Coding-Tool. Der Nutzer lässt in mehreren tmux-Sessions (verschiedene Projekte unter `~/work/*` und `~/personal/*`) jeweils eine OpenCode-Instanz laufen und verliert den Überblick, wo gerade was ansteht.

Bestehende OpenCode-Plugins wie `@mohak34/opencode-notifier` feuern pro Event eine Desktop-Notification — das löst das Problem nicht, weil es keinen **persistenten, abfragbaren Gesamtzustand** gibt.

## Architektur

Drei entkoppelte Komponenten, gemeinsames Daten-Schema:

```
┌──────────────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│ OpenCode Plugin      │ writes │ Store                 │ reads  │ CLI Viewer       │
│ (in jeder Instanz)   │──────▶ │ ~/.local/state/       │◀────── │ opencode-overview│
│ Hooks auf Events     │        │ opencode-overview/    │        │ TUI + tmux jump  │
└──────────────────────┘        └───────────────────────┘        └──────────────────┘
```

- **Producer** = Plugin, läuft in jeder OpenCode-Instanz, schreibt Session-Zustände.
- **Store** = File-basiert (MVP), pro Session eine JSON-Datei, atomar per `write + rename`.
- **Consumer** = CLI-Tool, liest Store, zeigt Tabelle, `--watch` via `fs.watch`.
- **Optional später**: Unix-Socket-Daemon für Push-Updates statt Polling.

## Daten-Schema (zentral!)

Diese Typen werden von Plugin **und** CLI gemeinsam genutzt und liegen im Paket `@opencode-overview/core`.

```typescript
export type SessionState =
  | "idle"               // Session existiert, nichts passiert
  | "running"            // Model generiert gerade
  | "waiting_permission" // wartet auf Tool-Permission vom User
  | "waiting_answer"     // Model hat Rückfrage gestellt (question tool)
  | "error"              // letzter Versuch fehlgeschlagen
  | "done";              // generation fertig, User kann weiter

export interface SessionRecord {
  instanceId: string;    // z.B. `${hostname}-${pid}`
  sessionId: string;     // OpenCode session id
  projectPath: string;   // absoluter Pfad zum Projekt
  projectName: string;   // basename(projectPath)
  sessionTitle: string;  // menschenlesbarer Titel
  state: SessionState;
  lastMessage: string;   // letzte event-message, truncated auf 200 chars
  tmuxTarget?: string;   // tmux session name/id, falls erkannt via $TMUX
  updatedAt: string;     // ISO 8601
  createdAt: string;     // ISO 8601
}
```

Store-Layout:
```
~/.local/state/opencode-overview/
├── sessions/
│   ├── <instanceId>--<sessionId>.json    # ein Record pro Datei
│   └── ...
└── summary.json                           # aggregierte Counts für tmux-statusline
```

`summary.json`:
```json
{ "updatedAt": "...", "counts": { "waiting_permission": 2, "waiting_answer": 1, "error": 0, "running": 3, "idle": 4, "done": 1 } }
```

## Konventionen

- **Sprache**: TypeScript, strict mode. Ziel-Runtime: Node 20+ und Bun (OpenCode läuft auf Bun).
- **Monorepo**: bun workspaces. Pakete: `core`, `plugin`, `cli`.
- **Keine** schweren Dependencies. `core` hat **null** runtime deps. `plugin` nur OpenCode-SDK-Typen. `cli` darf `blessed` oder `ink` nutzen.
- **Atomare File-Writes**: Immer `write tmp → rename`. Niemals direkt auf die Ziel-Datei schreiben (sonst sehen Reader halbe JSONs).
- **Stale-Cleanup**: Records älter als 24h oder mit `pid` der nicht mehr existiert → beim nächsten Lesen rausfiltern.
- **Testing**: `vitest`. Jede Komponente mit mindestens Happy-Path-Tests.
- **Kein Logging-Spam**: Plugin loggt nur bei echten Fehlern auf stderr.

## Reihenfolge der Tasks

1. `01-repo-setup.md` — Monorepo, tooling, Skeleton
2. `02-core-package.md` — Shared types + Store-Implementation
3. `03-plugin.md` — OpenCode-Plugin, das Events in Store schreibt
4. `04-cli-viewer.md` — TUI mit `--watch`
5. `05-tmux-integration.md` — Statusline-Script + jump-to-session
6. `06-daemon-upgrade.md` *(optional, später)* — Socket-Daemon für Push

Jeder Task ist so geschrieben, dass er **isoliert** von einem Agent umgesetzt werden kann, wenn Task N−1 gemerged ist. Agent bekommt **diese** Datei plus `00-PROJECT.md` plus seine Task-Datei.

## Repo-Wurzel

```
opencode-overview/
├── README.md
├── package.json          # root, workspaces
├── bun-workspace.yaml
├── tsconfig.base.json
├── .gitignore
└── packages/
    ├── core/
    ├── plugin/
    └── cli/
```

## Referenzen für Agents

- OpenCode Plugin API (TypeScript): https://opencode.ai/docs/plugins
- Beispiel-Plugin als Referenz für Hook-Namen & Payloads: https://github.com/mohak34/opencode-notifier (src/index.ts)
- tmux switch-client: `man tmux` → `switch-client -t <target>`
