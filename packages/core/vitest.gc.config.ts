import { defineConfig } from 'vitest/config'

// Dedicated config for the GC burst (bench/gc-burst.test.ts): run with
// `vitest run --config vitest.gc.config.ts` under Node's --expose-gc flag
// (see the package.json test:gc script and CI), which this config passes
// to the worker via poolOptions.forks.execArgv so global.gc() exists
// inside the test process. A single forked worker process, with no other
// test file sharing it and no coverage instrumentation, keeps GC noise
// from other work out of the observation window; the burst itself makes no
// vitest/expect calls until after the observer has been read, so nothing
// but the drag frames allocates while it is running.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['bench/gc-burst.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--expose-gc'],
      },
    },
  },
})
