# opencode-dispatch

Siehe `docs/tasks/00-PROJECT.md` für vollständigen Projekt-Kontext.

## Arbeitsweise
- Immer erst `docs/tasks/00-PROJECT.md` lesen.
- Genau einen Task pro Session bearbeiten. Task-Datei wird explizit genannt.
- Nicht auf spätere Tasks vorgreifen.
- Akzeptanzkriterien und Nicht-Ziele aus der Task-Datei strikt einhalten.
- Nach jedem Task: `bun -r typecheck && bun -r test && bun -r build` muss grün sein.
- Commits in der vom Task vorgeschlagenen Form.

## Commit-Style
- Conventional Commits (feat/fix/chore/docs/test).
- Kleine Commits, nicht ein Monster-Commit pro Task.
