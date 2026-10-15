import { defineConfig } from 'vitest/config'

// One package builds three entries (the engine, the React adapter and the
// Vue adapter). This config runs each suite as its own vitest project, under
// its own environment and its own `@rpxl/riffle` alias to `src/index.ts`, the
// way three separate packages once did.
//
// Named vitest.all.config.ts, not vitest.config.ts: that name is the engine
// project itself (and the config Stryker picks up by default). The `test` and
// `test:watch` scripts pass `--config vitest.all.config.ts` explicitly, so
// `pnpm --filter @rpxl/riffle test` still runs every suite in one command,
// and the frame-budget bench and GC burst (vitest.bench.config.ts,
// vitest.gc.config.ts, each its own dedicated `--config` invocation, see
// package.json) stay out of it.
export default defineConfig({
  test: {
    projects: ['./vitest.config.ts', './vitest.react.config.ts', './vitest.vue.config.ts'],
  },
})
