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
