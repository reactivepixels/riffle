import { defineConfig } from 'vitest/config'

// Dedicated config for the frame-budget work: `vitest run --config
// vitest.bench.config.ts` runs the assertion test (write-frame.perf.test.ts,
// matched by test.include below); `vitest bench --config
// vitest.bench.config.ts` runs the informational tinybench report
// (write-frame.bench.ts, matched by the benchmark command's own default
// include, *.bench.ts, which this file does not narrow). Kept out of the
// default vitest.config.ts (see its `exclude`) so `pnpm -r test` stays fast.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['bench/**/*.perf.test.ts'],
    // A single worker process, so nothing else competes for the CPU while
    // frame timings are taken.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
