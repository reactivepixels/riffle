import { defineWorkspace } from 'vitest/config'

// One package builds three entries (the engine, the React adapter and the
// Vue adapter). This workspace runs each suite under its own vitest
// environment and its own `@rpxl/riffle` alias to `src/index.ts`, the way
// three separate packages once did.
//
// Named vitest.all.config.ts, not vitest.workspace.ts or vitest.projects.ts:
// vitest 2 hardcodes both of those names (WORKSPACES_NAMES in its own
// constants module) as an auto-detected workspace, applied to every `vitest`
// and `vitest run` invocation in this directory regardless of `--config` or
// `--workspace`. That would pull the frame-budget bench and the GC burst
// (vitest.bench.config.ts, vitest.gc.config.ts, each its own dedicated
// `--config` invocation, see package.json) into this workspace's three
// projects too. The `test` and `test:watch` scripts instead pass
// `--workspace vitest.all.config.ts` explicitly, so `pnpm --filter
// @rpxl/riffle test` still runs every suite in one command, and the bench
// and GC configs stay untouched by it.
export default defineWorkspace([
  './vitest.config.ts',
  './vitest.react.config.ts',
  './vitest.vue.config.ts',
])
