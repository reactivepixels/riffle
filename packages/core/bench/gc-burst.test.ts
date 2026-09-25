import { constants, PerformanceObserver } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createDragRig } from './harness'

// Guards the zero-allocation constraint on the animation loop's per-frame
// path (integrate + write). A heap-growth check with a forced GC
// only measures what SURVIVES; short-lived per-frame garbage is collected
// before heapUsed is read and goes unseen entirely.
// Observing GC directly catches it instead: register a
// PerformanceObserver for 'gc' entries, run a burst of drag frames, and
// assert no minor (scavenge) collection happened during the burst. A
// scavenge only runs when the young generation fills up, so seeing zero of
// them across a real burst is direct evidence of zero per-frame
// allocation, not an inference from retained memory.
const BURST_FRAMES = 1000
const WARMUP_FRAMES = 50

declare const global: typeof globalThis & { gc?: () => void }

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('GC burst: the drag frame loop allocates nothing', () => {
  it(`runs ${BURST_FRAMES} held-position drag frames with zero minor GCs`, async () => {
    if (typeof global.gc !== 'function') {
      throw new Error(
        'bench/gc-burst.test.ts requires --expose-gc. Run it via `pnpm --filter @rpxl/riffle test:gc` ' +
          '(vitest.gc.config.ts sets poolOptions.forks.execArgv), not a plain vitest invocation.',
      )
    }

    const rig = createDragRig(50)
    // Warm-up frames legitimately allocate: a Pose per card the first time
    // it is written (writeNode's poses/written Maps), plus JIT warm-up.
    // None of that is what this test guards.
    for (let i = 0; i < WARMUP_FRAMES; i += 1) rig.holdFrame()

    // Force a full collection so nothing warm-up or setup left behind can
    // fire a GC once the burst below starts.
    global.gc()
    await nextMacrotask()

    const minorGcCount: number[] = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // entry.kind is the older accessor (deprecated, DEP0152); detail.kind
        // is the same value without the deprecation warning on newer Node.
        const detail = (entry as unknown as { detail?: { kind?: number }; kind?: number }).detail
        const kind = detail?.kind ?? (entry as unknown as { kind?: number }).kind
        if (kind === constants.NODE_PERFORMANCE_GC_MINOR) minorGcCount.push(kind)
      }
    })
    observer.observe({ entryTypes: ['gc'] })

    for (let i = 0; i < BURST_FRAMES; i += 1) rig.holdFrame()

    // 'gc' perf entries are delivered asynchronously, soon after the
    // collection but not synchronously with it; give the observer a couple
    // of macrotask turns to flush before reading it.
    await nextMacrotask()
    await nextMacrotask()
    observer.disconnect()
    rig.destroy()

    expect(minorGcCount).toEqual([])
  })
})
