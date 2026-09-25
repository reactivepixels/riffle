# Svelte adapter: `@rpxl/riffle/svelte`

## Context

Riffle's engine (`@rpxl/riffle`) is framework agnostic: it never imports React, Vue,
or any other framework, and exposes a single glue layer, `createAdapterHandle`, that
every binding wraps. `@rpxl/riffle/react` and `@rpxl/riffle/vue` (see
`packages/core/src/react` and `packages/core/src/vue`) are both thin wrappers over
that same handle, built and published as entries of the one `@rpxl/riffle` package
rather than separate packages. This issue is to add a third: a Svelte binding,
`@rpxl/riffle/svelte`, as a new entry alongside them.

Svelte 5's runes (`$state`, `$derived`, `$effect`) make this a good fit: the handle's
`subscribe`/`getSnapshot` pair is exactly the shape Svelte 5's own `$state.raw` plus an
external store convention expects, and its ref-callback style (`rootRef`, `cardRef`)
maps onto Svelte's `use:` actions almost directly.

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

- `rootRef(null)` defers teardown by one microtask (handles Svelte's own action
  `destroy`-then-`update` pattern on a re-run without tearing down a live drag).
- `setOptions` diffs against the previously applied options and only calls the
  engine's `update()` with what changed; `spring` and `rotation` compare shallowly, so
  a fresh object literal with the same values on every re-run is not itself a change.
- `getSnapshot()` is referentially stable while nothing has changed, so it is safe to
  read on every reactive re-run without causing one.

Read `packages/core/src/react/useRiffle.ts` and `packages/core/src/vue/useRiffle.ts`
first: both already solve "wrap this handle idiomatically for one framework," and the
Svelte version's job is the same problem in Svelte's own idiom, not a new design.

## Files to add

A new entry inside the existing package, `packages/core/src/svelte/`, mirroring
`packages/core/src/react/`'s shape:

- `packages/core/package.json`: a `./svelte` export (`import`/`require` conditions,
  `types` first, matching the `./react` and `./vue` entries already there), a
  `typesVersions` entry for it, `svelte` added to `peerDependencies` (`^5.0.0`; Svelte
  5 for runes) and `peerDependenciesMeta` as optional, and `svelte` plus
  `@testing-library/svelte` added to `devDependencies` for its own tests.
- `packages/core/tsup.config.ts`: a further build entry for `src/svelte/index.ts`,
  external `@rpxl/riffle` and `svelte`, matching the React and Vue entries' shape
  otherwise, so root scripts (`pnpm --filter @rpxl/riffle build`,
  `pnpm --filter @rpxl/riffle test`, and so on) pick the new entry up for free.
  `tsconfig.json` needs a `paths` entry so `'@rpxl/riffle'` resolves to
  `./src/index.ts` for the new sources and tests, the same way it already does for
  react and vue.
- `packages/core/src/svelte/useRiffle.svelte.ts`: a runes-based composable, `useRiffle(getOptions: () => RiffleOptions): RiffleHandle`, returning the reactive state plus `rootRef`/`cardRef`/`next`/`prev`/`goTo`, reading `getSnapshot()` into `$state.raw` and resyncing via `subscribe`.
- `packages/core/src/svelte/Riffle.svelte`: the drop-in component, `cards` prop plus a
  `card` snippet, mirroring `packages/core/src/react/Riffle.tsx`'s `cards`/render-prop
  shape and `packages/core/src/vue/Riffle.ts`'s `#card` slot shape.
- `packages/core/src/svelte/index.ts`: re-exports both.
- `packages/core/README.md`: a `### Svelte` usage block alongside `### React` and
  `### Vue`, checked the same way by `apps/docs/scripts/check-readme-examples.mjs`.
- `packages/core/tests/svelte/`: this entry's own test suite, plus a
  `vitest.svelte.config.ts` (matching `vitest.react.config.ts`/`vitest.vue.config.ts`'s
  shape) wired into `vitest.all.config.ts`'s projects.
- Docs: `apps/docs/src/content/docs/adapters/svelte.mdx`, and add it to
  `apps/docs/astro.config.mjs`'s `sidebar` (`Adapters` group) and the track list in
  `apps/docs/scripts/lib/tracks.mjs`.
- `.github/workflows/ci.yml`: add a `svelte-matrix` job installing the matrix Svelte
  version into `@rpxl/riffle` and running that package's Svelte test project,
  alongside the existing `react-matrix`/`vue-matrix` jobs.

## Acceptance tests

- A test importing `useRiffle` and asserting `getSnapshot()` reads `activeIndex: 0`
  before any element mounts (the pre-mount snapshot, same as
  `packages/core/tests/react`'s equivalent).
- A test mounting `<Riffle cards={...}>`, registering card elements, calling `next()`,
  and asserting the snapshot's `activeIndex` advances (the same shape as
  `packages/core/tests/react/Riffle.test.tsx`).
- A test asserting that passing a new `spring` object literal with the same values on
  a re-run does not call the underlying engine's `update()` (mirrors
  `packages/core/tests`' own shallow-equal coverage for `optionChanged`, engine and
  React alike).
- `pnpm --filter @rpxl/riffle typecheck` and `check-exports` both stay clean with the
  Svelte entry included.

## Size budget

Follow `packages/core/package.json`'s own `size-limit` entries for `react entry` and
`vue entry` as the template: a `svelte entry`, gzip, `ignore: ["@rpxl/riffle",
"svelte"]` (the peer and the core are not this entry's own weight), and a limit in the
same range as the React entry's (currently 1272 B): a Svelte binding with a comparable
surface (a composable plus one drop-in component) should land near there, not
meaningfully larger.
