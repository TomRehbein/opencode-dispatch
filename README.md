# opencode-overview

A tool that shows the state of multiple parallel OpenCode instances — which sessions are waiting for a permission, a question, or have finished. It runs across all your tmux sessions so you always know where action is needed.

## Dev

```bash
bun install            # install dependencies
bun run build      # build all packages → packages/*/dist/
bun run test       # run tests in all packages
bun run typecheck  # type-check all packages
bun run clean      # remove dist directories
```

## Packages

| Package | Description |
|---|---|
| `@opencode-overview/core` | Shared types and file-based store (read/write session records) |
| `@opencode-overview/plugin` | OpenCode plugin that hooks into events and writes session state |
| `@opencode-overview/cli` | Terminal UI viewer with `--watch` mode and tmux jump support |

## CLI Usage

After `bun run build`, the binary is available at `packages/cli/dist/bin.js`
(or via `bun link` as `opencode-overview`).

```
opencode-overview                  # one-shot table, then exit
opencode-overview --watch          # live TUI, updates via fs.watch
opencode-overview --json           # raw records as JSON (for scripting)
opencode-overview --filter=waiting # only waiting_permission + waiting_answer
opencode-overview --filter=errors  # only error records
opencode-overview --help
```

`--filter` applies to the one-shot table and `--watch` mode. `--json` always
emits the raw, unfiltered record set so it can be piped into `jq` or other
scripts without surprises. `--watch` and `--json` cannot be combined.

### Example output

```
Project | Session   | State              | Wartet seit | Letzte Nachricht
------- | --------- | ------------------ | ----------- | ---------------------------------------------------------------
alpha   | Fix auth  | waiting_permission | 2m          | Need approval to proceed
gamma   | Refactor  | waiting_answer     | 14m         | Should I keep the old adapter?
delta   | Migration | error              | 1h 3m       | psql: connection refused
beta    | Add tests | running            | 10m         | Generating test cases...
repo    | Cleanup   | idle               | 3h          |
```

Columns are fixed-width, space-padded and separated by ` | `; no markdown
pipes. In a TTY, the `State` cell is ANSI-colored per state.

Sort order: states needing user action (`waiting_permission`, `waiting_answer`,
`error`) come first, then the rest (`running`, `idle`, `done`), sorted by
project and session title within each tier.

### Watch mode keybindings

| Key | Action |
|---|---|
| `q` / `Ctrl-C` | exit |
| `↑` / `↓` or `j` / `k` | move selection |
| `Enter` | `tmux switch-client -t <tmuxTarget>` of selected row |
| `r` | force refresh |
| `f` | cycle filter: `all` → `waiting` → `errors` → `all` |

The selected row is highlighted via ANSI inverse. The footer shows counts
(`⏸ waiting_permission  ❓ waiting_answer  ✗ error  ▶ running`), the active
filter, and the keybindings.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | ok |
| `1` | store unreadable (e.g. permissions) |
| `2` | invalid CLI args |
