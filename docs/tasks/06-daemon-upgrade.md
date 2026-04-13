# Task 06 — Socket-Daemon Upgrade *(optional, später)*

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Tasks 02–05 gemerged und im Alltag im Einsatz. Diesen Task **nur** angehen, wenn Schmerzen mit dem File-Store real werden (Latenz, `fs.watch`-Unzuverlässigkeit auf macOS, Race-Conditions).

## Motivation

File-Store ist einfach, aber hat Nachteile:
- `fs.watch` ist auf macOS nicht rekursiv-zuverlässig und emittiert dedupliziert.
- Jeder Writer rebuildet `summary.json` → bei vielen parallelen Instanzen unnötige Writes.
- Kein echtes Push — CLI muss pollen oder auf FS-Events warten.

Lösung: Ein kleiner **User-Space-Daemon** `opencode-dispatch-daemon`, der State im Speicher hält und per Unix-Socket Push-Updates an subscribe-te Clients schickt. File-Store bleibt als **Snapshot-Persistenz** bestehen, damit nichts verloren geht und das alte Interface weiter funktioniert.

## Architektur-Änderung

```
Plugin ──TCP/Unix-Socket──▶ Daemon ──in-memory state──▶ Clients (CLI --watch)
                              │
                              └──snapshot every 5s──▶ File-Store (bestehend)
```

Fallback: Wenn Daemon nicht erreichbar, schreibt Plugin direkt in File-Store wie bisher. CLI liest dann auch aus File-Store. **Zero config required.**

## Neues Paket: `@opencode-dispatch/daemon`

Bin: `opencode-dispatch-daemon`. Lauscht auf `${XDG_RUNTIME_DIR:-/tmp}/opencode-dispatch.sock`.

### Protokoll (JSON-Lines über Socket)

Client → Server:
```json
{"type":"upsert","record":{...SessionRecord}}
{"type":"delete","instanceId":"...","sessionId":"..."}
{"type":"subscribe"}
{"type":"snapshot"}
```

Server → Client:
```json
{"type":"snapshot","records":[...]}
{"type":"event","kind":"upsert"|"delete","record":{...}}
{"type":"ok"}
{"type":"error","message":"..."}
```

### Daemon-Verhalten

- Singleton via Lock-File `*.pid`. Zweiter Start detektiert laufenden Daemon und exit 0.
- Auto-start: `core` bekommt neuen Helper `ensureDaemon()`, der lazy `spawn detached` ausführt, falls Socket nicht connectable. Plugin ruft diesen bei erstem Event. Flag `OPENCODE_OVERVIEW_NO_DAEMON=1` erzwingt den alten File-Mode.
- Snapshot alle 5s in den bestehenden File-Store (gleiche Records/summary) → bestehendes CLI funktioniert ohne Änderung.
- Graceful Shutdown: SIGTERM → finaler Snapshot, Socket schließen.
- Kein root, kein System-Service. Pure user-space.

## Änderungen an bestehenden Paketen

### `core`
- Neuer Transport-Layer `src/transport/socket.ts` mit `SocketClient` (connect, upsert, subscribe). Bestehende File-API bleibt unverändert.
- Neuer High-Level-Helper `writeRecordPreferDaemon(rec)`: probiert Socket (50ms timeout), fallback auf `writeRecord`.

### `plugin`
- Ersetzt `writeRecord` durch `writeRecordPreferDaemon`. Keine weiteren Änderungen.

### `cli`
- `--watch`: Wenn Daemon erreichbar → `subscribe` statt `fs.watch`. Sonst bisheriges Verhalten.

## Tests

- Daemon: upsert + snapshot round-trip.
- Daemon: zwei Clients, einer pusht, der andere subscribt → zweiter bekommt Event innerhalb 100ms.
- Core: `writeRecordPreferDaemon` mit nicht-laufendem Daemon → File-Fallback funktioniert, Record liegt auf Platte.
- Daemon: kill während write → Snapshot-File ist konsistent (nicht halb geschrieben).

## Nicht-Ziele

- Kein Netzwerk-Listener (nur Unix-Socket). Windows-Support später via Named Pipes, separater Task.
- Keine Auth — alles user-local, durch Filesystem-Permissions geschützt (socket mode 0600).

## Deliverable

Mehrere Commits:
1. `feat(daemon): new daemon package with socket protocol`
2. `feat(core): socket transport and prefer-daemon write helper`
3. `feat(plugin): use prefer-daemon write path`
4. `feat(cli): subscribe to daemon in --watch when available`

README-Abschnitt „How it works" aktualisieren (Diagramm oben).
