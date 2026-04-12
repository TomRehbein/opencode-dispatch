# opencode-overview — Task-Pakete für Agents

Dieses Verzeichnis enthält alle Dateien, um das Projekt `opencode-overview` schrittweise von mehreren Coding-Agents umsetzen zu lassen.

## Wie benutzen?

Jedem Agent gibst du **immer**:
1. `00-PROJECT.md` (Kontext, Architektur, Konventionen, Datenschema)
2. Genau **eine** Task-Datei (`01-*.md` bis `06-*.md`)

Der Agent soll nur seinen Task umsetzen, nicht auf andere vorgreifen. Jeder Task hat explizite Akzeptanzkriterien und Nicht-Ziele.

## Reihenfolge

| # | Datei | Abhängigkeiten | Optional? |
|---|---|---|---|
| 1 | `01-repo-setup.md` | — | nein |
| 2 | `02-core-package.md` | 01 | nein |
| 3 | `03-plugin.md` | 02 | nein |
| 4 | `04-cli-viewer.md` | 02 | nein |
| 5 | `05-tmux-integration.md` | 02, 04 | empfohlen |
| 6 | `06-daemon-upgrade.md` | 02–05 im Alltagsbetrieb | ja, erst bei echten Schmerzen |

Tasks 03 und 04 sind **parallelisierbar** (beide hängen nur an 02).

## Tipp für den Prompt an den Agent

> Lies `00-PROJECT.md` für den Gesamtkontext und `<task>.md` für deinen Scope. Halte dich strikt an Akzeptanzkriterien und Nicht-Ziele. Bei Unklarheiten frag nach, bevor du Annahmen triffst. Schreibe Tests wie im Task spezifiziert. Committe mit der vorgeschlagenen Commit-Message.
