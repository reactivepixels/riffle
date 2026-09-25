import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'engine',
    environment: 'node',
    // Non-recursive: matches only tests/*.test.ts, not tests/react/** or
    // tests/vue/**, which vitest.react.config.ts and vitest.vue.config.ts
    // own instead (see vitest.all.config.ts).
    include: ['tests/*.test.ts'],
    environmentMatchGlobs: [
      [
        'tests/{render,pointer,a11y,riffle,keyboard,measure,options,lifecycle,adapter}.test.ts',
        'happy-dom',
      ],
    ],
    // The frame-budget bench, its assertion test and the GC burst live
    // under bench/, each with its own dedicated vitest config
    // (vitest.bench.config.ts, vitest.gc.config.ts): they are slow, noisy
    // under parallel test workers, or need --expose-gc, so they are kept
    // out of the plain `vitest run` this package's `test` script runs.
    exclude: [...configDefaults.exclude, 'bench/**'],
  },
})
