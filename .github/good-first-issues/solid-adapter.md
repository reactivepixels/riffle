# Solid adapter: `@rpxl/riffle/solid`

## Context

Riffle's engine (`@rpxl/riffle`) is framework agnostic: it never imports React, Vue,
or any other framework, and exposes a single glue layer, `createAdapterHandle`, that
every binding wraps. `@rpxl/riffle/react` and `@rpxl/riffle/vue` (see
`packages/core/src/react` and `packages/core/src/vue`) are both thin wrappers over
that same handle, built and published as entries of the one `@rpxl/riffle` package
rather than separate packages. This issue is to add a third: a Solid binding,
`@rpxl/riffle/solid`, as a new entry alongside them.

Solid is a particularly good fit for the handle's own shape: `solid-js` ships `from()`,
a helper built exactly for "wrap an external subscribe/read source as a Solid signal,"
which is a near-literal match for the handle's `subscribe(listener)` /
`getSnapshot()` pair. Most of this adapter is `from()` plus the ref-callback wiring;
resist the urge to hand-roll a `createSignal`/`createEffect` pair to do what `from()`
already does.

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

Key behaviors already handled for you, so the adapter does not have to re-solve them:

- `rootRef(null)` defers teardown by one microtask, so a `ref` prop that Solid tears
  down and immediately re-attaches to the same element (a conditional `<Show>` around
  the same node, for instance) does not kill an in-flight drag.
- `setOptions` diffs against the previously applied options and only calls the
  engine's `update()` with what changed; a `createMemo`-wrapped `spring` or `rotation`
  object is compared shallowly, so recomputing it with the same values is not itself a
  change.
- `getSnapshot()` is referentially stable while nothing has changed, which is exactly
  what lets `from()` avoid notifying Solid's reactivity graph on a no-op tick.

Read `packages/core/src/react/useRiffle.ts` first: it already solves "wrap this handle
idiomatically for one framework, exposing prop getters plus imperative methods," and
the Solid version's job is the same problem in Solid's own idiom (signals and props,
not hooks), not a new design.

## Files to add

A new entry inside the existing package, `packages/core/src/solid/`, mirroring
`packages/core/src/react/`'s shape:

- `packages/core/package.json`: a `./solid` export (`import`/`require` conditions,
  `types` first, matching the `./react` and `./vue` entries already there), a
  `typesVersions` entry for it, `solid-js` added to `peerDependencies` (`^1.9.0`) and
  `peerDependenciesMeta` as optional, and `solid-js` plus `@solidjs/testing-library`
  added to `devDependencies` for its own tests.
- `packages/core/tsup.config.ts`: a further build entry for `src/solid/index.ts`,
  external `@rpxl/riffle` and `solid-js`, using `solid-plugin`'s tsup config (or
  Solid's documented `rollup`-based dual build, since Solid's JSX compiles
  differently for its own package export condition, `"solid"`), matching the React
  and Vue entries' shape otherwise. `tsconfig.json` needs a `paths` entry so
  `'@rpxl/riffle'` resolves to `./src/index.ts` for the new sources and tests, the
  same way it already does for react and vue, plus `jsx: "preserve"`,
  `jsxImportSource: "solid-js"` scoped to the Solid sources.
- `packages/core/src/solid/useRiffle.ts`: `useRiffle(getOptions: () => RiffleOptions):
RiffleHandle`, using `from(handle.subscribe, handle.getSnapshot)` (or the
  equivalent explicit `subscribe`/`getSnapshot` wiring if `from`'s type signature
  does not fit directly) for the reactive snapshot, plus `rootRef`/`cardRef`/
  `next`/`prev`/`goTo` passed through.
- `packages/core/src/solid/Riffle.tsx`: the drop-in component, a `cards` prop plus a
  render-prop `children`, mirroring `packages/core/src/react/Riffle.tsx`'s shape
  (Solid's JSX is close enough to React's here that the component's own structure,
  not just its behavior, is a reasonable starting point to adapt from, keeping in
  mind Solid props must stay destructure-free to preserve reactivity).
- `packages/core/src/solid/index.ts`: re-exports both.
- `packages/core/README.md`: a `### Solid` usage block alongside `### React` and
  `### Vue`, checked the same way by `apps/docs/scripts/check-readme-examples.mjs`.
- `packages/core/tests/solid/`: this entry's own test suite, plus a
  `vitest.solid.config.ts` (matching `vitest.react.config.ts`/`vitest.vue.config.ts`'s
  shape) wired into `vitest.all.config.ts`'s projects.
- Docs: `apps/docs/src/content/docs/adapters/solid.mdx`, and add it to
  `apps/docs/astro.config.mjs`'s `sidebar` (`Adapters` group) and the track list in
  `apps/docs/scripts/lib/tracks.mjs`.
- `.github/workflows/ci.yml`: add a `solid-matrix` job installing the matrix Solid
  version into `@rpxl/riffle` and running that package's Solid test project, alongside
  the existing `react-matrix`/`vue-matrix` jobs.

## Acceptance tests

- A test importing `useRiffle` and asserting the returned snapshot accessor reads
  `activeIndex: 0` before any element mounts (the pre-mount snapshot, same as
  `packages/core/tests/react`'s equivalent).
- A test mounting `<Riffle cards={...}>`, registering card elements, calling `next()`,
  and asserting the snapshot's `activeIndex` advances (the same shape as
  `packages/core/tests/react/Riffle.test.tsx`).
- A test asserting that a `createMemo`'d `spring` object with the same values on a
  re-render does not call the underlying engine's `update()` (mirrors
  `packages/core/tests`' own shallow-equal coverage for `optionChanged`, engine and
  React alike).
- `pnpm --filter @rpxl/riffle typecheck` and `check-exports` both stay clean with the
  Solid entry included.

## Size budget

Follow `packages/core/package.json`'s own `size-limit` entries for `react entry` and
`vue entry` as the template: a `solid entry`, gzip, `ignore: ["@rpxl/riffle",
"solid-js"]` (the peer and the core are not this entry's own weight), and a limit in
the same range as the React entry's (currently 1272 B): a Solid binding with a
comparable surface (a hook plus one drop-in component) should land near there, likely
smaller given Solid's own lack of a virtual DOM diffing layer to interoperate with.
