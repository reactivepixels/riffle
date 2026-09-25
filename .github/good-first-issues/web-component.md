# A native web component: `<riffle-stack>` (`@rpxl/riffle-element`)

## Context

Riffle's engine (`@rpxl/riffle`) has zero runtime dependencies and never imports a
framework. `@rpxl/riffle/react` and `@rpxl/riffle/vue` both wrap the same glue layer,
`createAdapterHandle` (see `packages/core/src/adapter.ts`), to bind the engine to a
specific framework's lifecycle. A native custom element is the natural fourth binding:
usable from plain HTML, and from any framework that can render an unknown tag (which
is effectively all of them), with no adapter of its own needed on the consuming side.

`vanilla-basic` (`examples/vanilla-basic/index.html`) already shows the engine driven
directly with `createRiffle` and manual `registerNode` calls. This issue is to package
that same idea as a real custom element, `<riffle-stack>`, backed by
`createAdapterHandle` rather than a raw `createRiffle` call: the handle's deferred
teardown and option-diffing already solve problems a custom element runs into for
real (an element temporarily moved in the DOM re-triggers `disconnectedCallback` then
`connectedCallback`; an attribute changing every animation frame should not rebuild
the engine each time).

## The `createAdapterHandle` contract to build on

From `packages/core/src/adapter.ts` (read the file directly before starting; this is a
summary, not a substitute):

```ts
export interface AdapterHandle {
  readonly instance: Riffle | null
  readonly rootRef: (el: HTMLElement | null) => void
  cardRef(index: number): (el: HTMLElement | null) => void
  registerCard(index: number, el: HTMLElement): void
  unregisterCard(index: number, el: HTMLElement): void
  setOptions(next: RiffleOptions): void
  subscribe(listener: () => void): () => void
  getSnapshot(): RiffleSnapshot
  on<K extends keyof RiffleEventMap>(event: K, fn: (payload: RiffleEventMap[K]) => void): () => void
  next(): void
  prev(): void
  goTo(index: number, opts?: { animate?: boolean }): void
}

export function createAdapterHandle(initial: RiffleOptions): AdapterHandle
```

How the element's own lifecycle maps onto it:

- `connectedCallback`: call `rootRef(this)` (the host element itself is the
  container Riffle measures and positions cards within), then walk `this.children`
  (the slotted, author-provided card elements, in document order) and call
  `registerCard(index, child)` for each.
- `disconnectedCallback`: call `rootRef(null)`. The handle defers the actual teardown
  by one microtask, so a `disconnectedCallback` immediately followed by
  `connectedCallback` with the same children (an element reparented in the same tick,
  which the DOM does for, e.g., a `<slot>` reassignment or certain layout libraries)
  does not tear down and rebuild the engine, exactly the same guarantee
  `packages/core/src/react`'s `useRiffle` relies on for React's own ref churn.
- `attributeChangedCallback`: parse the changed attribute (`card-width`, `card-height`,
  `gap`, `max-visible`, `axis`, `bounds`, `threshold`, at minimum; see
  `packages/core/src/types.ts`'s `RiffleOptions` for the full option set) and call
  `setOptions` with the merged, current set of parsed attributes. The handle diffs
  against what is already applied, so setting the same attribute value repeatedly (a
  framework re-rendering the same props onto the custom element on every parent
  re-render, which is common) does not call the engine's `update()` unnecessarily.
- A `MutationObserver` on `childList` (light DOM children being added, removed, or
  reordered) should call `registerCard`/`unregisterCard` to keep the handle's card map
  in sync, the direct equivalent of React/Vue calling refs on every render.
- `next()`/`prev()`/`goTo()` as plain methods on the element, delegating to the
  handle's own.
- `subscribe`/`getSnapshot` back an internal re-render of whatever the element shows
  for its own chrome (an index readout, if the element renders one itself); most
  consumers will read `activeIndex` off a `change` event instead (see below), not by
  polling the snapshot.

## Files to add

A new package, `packages/element/`:

- `package.json`: name `@rpxl/riffle-element`, `@rpxl/riffle` as a `workspace:^`
  dependency, no framework peer dependency (this is the point), `tsup` for the build,
  `vitest` with `happy-dom` (already a devDependency elsewhere in this workspace) for
  tests, `size-limit` with a budget (see below), `check-exports`
  (`attw --pack . && publint`).
- `packages/element/src/riffle-stack.ts`: the `RiffleStack` class (`extends
HTMLElement`), `static get observedAttributes()`, and the lifecycle wiring above.
  Dispatches a `change` CustomEvent (`detail: { activeIndex, count }`, mirroring
  `RiffleEventMap`'s own `change` payload from `packages/core/src/types.ts`) whenever
  the engine's own `change` event fires, via `handle.on('change', ...)`.
- `packages/element/src/register.ts`: the side-effecting entry
  (`customElements.define('riffle-stack', RiffleStack)`), imported for its effect only
  (`import '@rpxl/riffle-element/register'`), kept separate from the class export so a
  consumer who wants a different tag name can `customElements.define` it themselves
  instead.
- `packages/element/src/index.ts`: exports the `RiffleStack` class and its options
  type, not the registration side effect.
- `packages/element/README.md` and `packages/element/LICENSE` (MIT, copy
  `packages/core/LICENSE`'s holder line verbatim). The README's usage example is
  plain HTML plus one `<script type="module">` import, no build step, in the same
  spirit as `examples/vanilla-basic/index.html`.
- `packages/element/tsup.config.ts`, `packages/element/tsconfig.json`, matching
  `packages/core`'s otherwise.
- A new example, `examples/web-component/`, a plain HTML page using `<riffle-stack>`
  directly (no bundler needed beyond what every other example already uses for its own
  dev server), the equivalent of `vanilla-basic` for this adapter.
- Docs: `apps/docs/src/content/docs/adapters/web-component.mdx`, and add it to
  `apps/docs/astro.config.mjs`'s `sidebar` (`Adapters` group) and `API_PACKAGES` list.
- `.github/workflows/ci.yml`: add `pnpm --filter @rpxl/riffle-element` build/test/
  typecheck/check-exports/size-limit steps, and a `pnpm --filter web-component build`
  step alongside the other examples.

## Acceptance tests

- A test creating a `<riffle-stack>` in `happy-dom`, appending N child `<div>`s as
  cards, appending it to `document.body`, and asserting the front child ends up with
  the engine's own positioning attributes/styles applied (mirrors how
  `packages/core/tests` asserts `registerNode` results in a written pose).
- A test calling `.next()` on the element and asserting a `change` event fires with
  the expected `detail.activeIndex`.
- A test setting `card-width`/`card-height` attributes after connection and asserting
  the engine's measured geometry updates without the element being removed and
  re-added (no `disconnectedCallback` observed in between; spy on it).
- A test disconnecting and immediately reconnecting the same element within one
  microtask tick (simulating a light DOM reparent) and asserting the engine instance
  is the same object across that round trip, not torn down and rebuilt (the same
  guarantee `packages/core/tests/react` already asserts for React's ref churn via
  `createAdapterHandle`).
- `pnpm --filter @rpxl/riffle-element typecheck` and `check-exports` both clean.

## Size budget

Follow `packages/core/package.json`'s own `react entry` `size-limit` entry as the
template: gzip, `ignore: ["@rpxl/riffle"]` (the core is not this package's own
weight), and a limit tighter than the React entry's (currently 1272 B): there is no
framework reconciliation layer to interoperate with here, only the custom element
class itself, so this should land meaningfully under 1 kB.
