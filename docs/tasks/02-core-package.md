# Task 02 — Core Package: Types + Store

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Task 01 gemerged.

## Ziel

Paket `@opencode-overview/core` implementiert das Daten-Schema und den File-basierten Store. **Keine** OpenCode- oder CLI-Logik — nur reiner, unit-getesteter Kern.

## Exports (public API)

Alles aus `src/index.ts`:

```typescript
export type SessionState = ...;          // exakt wie in 00-PROJECT.md
export interface SessionRecord { ... };  // exakt wie in 00-PROJECT.md
export interface Summary { updatedAt: string; counts: Record<SessionState, number>; };

export function storeDir(): string;       // default: ~/.local/state/opencode-overview (respektiert $XDG_STATE_HOME)
export function sessionsDir(): string;    // storeDir() + "/sessions"
export function summaryPath(): string;    // storeDir() + "/summary.json"
export function recordPath(instanceId: string, sessionId: string): string;

export async function writeRecord(rec: SessionRecord): Promise<void>;
export async function deleteRecord(instanceId: string, sessionId: string): Promise<void>;
export async function readAllRecords(): Promise<SessionRecord[]>;
export async function writeSummary(records: SessionRecord[]): Promise<Summary>;
export async function readSummary(): Promise<Summary | null>;

// helper: wird vom plugin beim Start aufgerufen
export function makeInstanceId(): string; // `${os.hostname()}-${process.pid}`
```

## Verhalten

### `writeRecord`
1. Stellt sicher dass `sessionsDir()` existiert (`mkdir -p`).
2. Setzt `updatedAt = new Date().toISOString()`. Wenn `createdAt` leer → setzt es auch.
3. Schreibt nach `<recordPath>.tmp`, dann `rename` auf Ziel → atomar.
4. Ruft intern `writeSummary(await readAllRecords())` auf, damit `summary.json` synchron ist.

### `readAllRecords`
1. Liest alle `*.json` aus `sessionsDir()`.
2. Parsed. Bei Parse-Fehler: record wird **übersprungen**, Warnung auf stderr.
3. Filtert Stale-Records raus: `Date.now() - Date.parse(updatedAt) > 24h` → Datei wird gelöscht und nicht zurückgegeben.
4. Stabile Sortierung: nach `projectName`, dann `sessionTitle`.

### `writeSummary`
1. Aggregiert Counts pro State. Alle States aus dem Union müssen als Keys existieren, auch wenn 0.
2. Atomar schreiben wie `writeRecord`.

### Pfade & XDG
- `storeDir()` ist `process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local/state")` gefolgt von `"opencode-overview"`.

## Tests (vitest)

Mindestens diese Fälle, alle mit `tmpdir`-basierter Isolation (setze `XDG_STATE_HOME` auf `mkdtemp`-Pfad vor jedem Test):

1. `writeRecord` legt Datei an, `readAllRecords` liest sie zurück.
2. Zwei Writes zum selben `(instanceId, sessionId)` → nur **eine** Datei, letzte Version gewinnt.
3. Parallele Writes (10x `Promise.all`) → keine halben Dateien, finaler State konsistent.
4. Stale-Cleanup: Record mit `updatedAt` von vor 25h wird bei `readAllRecords` entfernt (Datei gelöscht).
5. `writeSummary` enthält alle 6 State-Keys, Counts stimmen.
6. Kaputte JSON-Datei im Store → `readAllRecords` überspringt sie, crasht nicht.

## Anti-Ziele

- Kein watch/subscribe-API in diesem Task (kommt in 04 via `fs.watch` im CLI).
- Keine Plugin- oder TUI-Imports.

## Deliverable

Commit `feat(core): session record store with atomic writes`. Alle Tests grün, `bun -r typecheck` sauber.
