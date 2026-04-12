# Task 01 — Repo Setup

**Lies zuerst `00-PROJECT.md`.** Dieser Task legt ausschließlich das leere Grundgerüst an — keine Business-Logik.

## Ziel

Ein lauffähiges bun-Monorepo mit drei Workspace-Paketen (`core`, `plugin`, `cli`), TypeScript strict, Vitest, gemeinsame `tsconfig.base.json`, Build-Setup per `tsc`.

## Akzeptanzkriterien

1. `bun install` läuft fehlerfrei.
2. `bun -r build` baut alle drei Pakete nach `packages/*/dist/`.
3. `bun -r test` läuft (auch wenn keine Tests existieren → exit 0).
4. `bun -r typecheck` läuft fehlerfrei.
5. In jedem Paket existiert eine Dummy-Datei `src/index.ts` mit einem exportierten `VERSION = "0.0.0"`, damit Builds Output erzeugen.
6. `core` hat **keine** runtime dependencies (nur devDeps).
7. `plugin` hat `@opencode-overview/core` als workspace-dep (`"workspace:*"`).
8. `cli` hat `@opencode-overview/core` als workspace-dep.
9. `.gitignore` ignoriert `node_modules`, `dist`, `*.log`, `.DS_Store`.

## Anforderungen an Dateien

### `package.json` (root)
- `"private": true`
- Scripts: `build`, `test`, `typecheck`, `clean` — alle mit `bun -r`.
- devDependencies: `typescript@^5.4`, `vitest@^1`, `@types/node@^20`.
- `"packageManager"`: aktuelle bun Version.

### `bun-workspace.yaml`
- Enthält `packages/*`.

### `tsconfig.base.json`
- `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `declaration: true`, `sourceMap: true`, `outDir` wird vom child gesetzt.

### Pro Paket (`packages/<name>/`)
- `package.json` mit `"name": "@opencode-overview/<name>"`, `"version": "0.0.0"`, `"type": "module"`, `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, Scripts: `build: tsc -p tsconfig.json`, `typecheck: tsc --noEmit -p tsconfig.json`, `test: vitest run`.
- `tsconfig.json` extended `../../tsconfig.base.json`, `compilerOptions.outDir: ./dist`, `include: ["src"]`.
- `src/index.ts` mit `export const VERSION = "0.0.0";`.

### Root `README.md`
- Kurzer Abschnitt „What is this" (2 Sätze, aus `00-PROJECT.md` abgeleitet).
- Section „Dev": install/build/test Kommandos.
- Section „Packages": je ein Einzeiler zu core/plugin/cli.

## Nicht-Ziele

- Kein CI, kein Linter, keine Release-Pipeline. Kommt später.
- Kein `tsup`, `esbuild` etc. — `tsc` reicht für jetzt.

## Deliverable

Ein Commit `chore: initial monorepo scaffolding` der alles oben genannte enthält.
