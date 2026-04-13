# @opencode-dispatch/plugin

OpenCode plugin that tracks session states across multiple OpenCode instances and writes them to a shared file store for [`opencode-dispatch`](https://github.com/TomRehbein/opencode-dispatch).

## Installation

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["@opencode-dispatch/plugin@latest"]
}
```

OpenCode will install it automatically on next start.

## What it does

The plugin hooks into OpenCode events and maintains one JSON record per session under `~/.local/state/opencode-dispatch/sessions/`. Each record tracks:

| State | Meaning |
|---|---|
| `running` | Model is generating |
| `waiting_permission` | Waiting for a tool-permission decision |
| `waiting_answer` | Model asked a question via the `question` tool |
| `done` | Generation finished, awaiting next prompt |
| `idle` | Session inactive for >60 s after finishing |
| `error` | Last run failed |

A summary of counts is kept in `~/.local/state/opencode-dispatch/summary.json` (useful for tmux status lines).

## Notes

- The plugin is **write-only** — it never reads the store except to update an existing record.
- All writes are atomic (write tmp → rename) so the CLI viewer never reads a partial file.
- On shutdown (`SIGINT`/`SIGTERM`), all active sessions are set to `idle` so the viewer shows them as inactive.
- The plugin never throws — errors are logged to stderr and OpenCode continues normally.
