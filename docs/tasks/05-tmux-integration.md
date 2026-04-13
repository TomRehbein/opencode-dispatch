# Task 05 — tmux-Integration

**Lies zuerst `00-PROJECT.md`.** Voraussetzung: Tasks 02 + 04 gemerged.

## Ziel

Zwei kleine Shell-Helfer, damit der User den Status **ohne** das CLI zu öffnen direkt in der tmux-Statusline sieht — und per einem Keybinding zur wartenden Session springt.

## Deliverable 1: Statusline-Snippet

Neue Datei `packages/cli/scripts/tmux-status.sh`. Liest `summary.json` aus dem Store, gibt einen kompakten String aus:

```
⏸2 ❓1 ✗0
```

Regeln:
- Nur Icons für Counts > 0 anzeigen. Wenn alle 0 → leerer String.
- Reine POSIX-sh, **kein** bash-ism. Nutze `jq` falls vorhanden, sonst fallback auf `grep`/`sed` (dokumentiere beides).
- Script ist self-contained, keine Abhängigkeit zu installiertem npm-Paket.
- `chmod +x` setzen.
- Default-Store-Pfad respektiert `XDG_STATE_HOME` (siehe `00-PROJECT.md`).

User-Integration (im README erklären):
```tmux
set -g status-right '#(~/path/to/tmux-status.sh) | %H:%M'
set -g status-interval 2
```

## Deliverable 2: Jump-Keybinding

Neue Datei `packages/cli/scripts/tmux-jump.sh`. Öffnet `opencode-dispatch --watch` in einem neuen tmux-Popup:

```sh
tmux display-popup -E -w 90% -h 80% 'opencode-dispatch --watch'
```

User-Integration:
```tmux
bind-key O run-shell '~/path/to/tmux-jump.sh'
```

Script prüft, ob `opencode-dispatch` im PATH ist, sonst Fehlermeldung mit Install-Hinweis.

## Deliverable 3: CLI-Flag `--print-status`

Ergänze das CLI um `opencode-dispatch --print-status`, das **dasselbe** wie `tmux-status.sh` ausgibt — reines Node, für User ohne `jq`. Damit kann `tmux-status.sh` optional einfach `opencode-dispatch --print-status` aufrufen, wenn das CLI installiert ist:

```sh
set -g status-right '#(opencode-dispatch --print-status) | %H:%M'
```

Implementierung: liest `summary.json` via `readSummary()`, baut den Icon-String. Bei fehlender Summary → leerer String, exit 0.

## Tests

- Unit für die Icon-Builder-Funktion (States-Counts → String).
- Manuelle Test-Checkliste im PR-Body:
  1. `tmux-status.sh` mit leerem Store → leerer Output.
  2. Mit 2 waiting_permission → `⏸2`.
  3. tmux popup öffnet sich.
  4. `Enter` im Popup auf eine Session springt korrekt in die tmux-Session.

## Doku

Neuer Abschnitt im Root-`README.md` → „tmux Integration" mit den zwei Snippets oben.

## Nicht-Ziele

- Keine tmux-plugin-manager-Integration (tpm). Shell-Scripts reichen.
- Kein automatisches `source`-File-Generieren.

## Deliverable

Commit `feat(cli): tmux statusline script and jump-to-session popup`.
