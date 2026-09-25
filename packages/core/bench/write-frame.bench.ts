import { bench, describe } from 'vitest'
import { createDragRig, type DragRig } from './harness'

// Informational only (run with `pnpm --filter @rpxl/riffle bench`, i.e.
// `vitest bench --config vitest.bench.config.ts`): tinybench's own report,
// not a pass/fail gate. The gate lives in write-frame.perf.test.ts, run in
// the same dedicated project.
describe('writeFrame (50 cards, mid-drag)', () => {
  let rig: DragRig

  bench(
    'one frame',
    () => {
      rig.frame()
    },
    {
      setup: () => {
        rig = createDragRig(50)
      },
    },
  )
})
