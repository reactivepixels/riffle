import { describe, expect, it } from 'vitest'
import { createDragRig } from './harness'

// The frame budget: one writeFrame, 50 registered cards mid-drag,
// should cost well under a millisecond. CI hardware varies and shares the
// runner with other work, so the CI bound is 2x the local one; both are
// generous relative to the measured baseline.
const LOCAL_LIMIT_MS = 1
const CI_LIMIT_MS = 2
const LIMIT_MS = process.env.CI ? CI_LIMIT_MS : LOCAL_LIMIT_MS

const WARMUP_FRAMES = 50
const SAMPLE_FRAMES = 500

describe('writeFrame frame budget', () => {
  it(`averages under ${LIMIT_MS}ms per frame over ${SAMPLE_FRAMES} frames, 50 cards mid-drag`, () => {
    const rig = createDragRig(50)
    // Warm up the JIT and the pose/written Maps' steady-state shape before
    // timing: the first handful of frames pay one-off costs (createPose
    // allocations for indices not yet in `poses`/`written`) that a real
    // drag only pays once, not every frame.
    for (let i = 0; i < WARMUP_FRAMES; i += 1) rig.frame()

    const start = performance.now()
    for (let i = 0; i < SAMPLE_FRAMES; i += 1) rig.frame()
    const elapsed = performance.now() - start
    const meanMs = elapsed / SAMPLE_FRAMES

    rig.destroy()

    expect(meanMs).toBeLessThan(LIMIT_MS)
  })
})
