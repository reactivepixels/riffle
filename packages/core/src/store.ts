export interface Store<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): T
  /** Recompute. Listeners fire only if something actually changed. */
  notify(): void
}

/**
 * Comparing only the keys of `a` is one-directional. A `b`
 * with extra keys `a` does not have would compare equal, which the handle
 * cannot afford: it runs this across snapshots built by two
 * different constructions (initialSnapshot's literal vs. the engine's own
 * computed snapshot), so a key-count mismatch must count as a difference.
 */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key in a) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * A snapshot store with a referentially stable snapshot.
 *
 * Stability is a correctness requirement, not an optimisation: React's
 * useSyncExternalStore re-renders forever if getSnapshot returns a fresh
 * object every call.
 */
export function createStore<T extends object>(compute: () => T): Store<T> {
  let snapshot = compute()
  const listeners = new Set<() => void>()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot() {
      return snapshot
    },

    notify() {
      const next = compute()
      if (shallowEqual(snapshot, next)) return
      snapshot = next
      // Snapshot the listener list so that subscribe or unsubscribe during
      // a notification applies to the next notification, not the current one.
      // This follows Redux semantics: the listener list is stable for the
      // duration of a notification cycle.
      for (const listener of [...listeners]) listener()
    },
  }
}
