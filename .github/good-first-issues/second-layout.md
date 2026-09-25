# A second built-in layout: `carousel()`

## Context

`fan()` (`packages/core/src/layout/fan.ts`) is Riffle's one built-in `LayoutStrategy`
today: the front card full size, every card behind it stacked straight back at
decreasing scale. `examples/custom-layout/src/spread-layout.ts` shows a
`LayoutStrategy` can be written entirely against the public API (`pose`/`stepTravel`
over `LayoutGeometry`), as a worked example for the docs, but it ships only as an
example, not as a second choice a consumer can reach for out of the box.

This issue is to add that second built-in: `carousel()`, a traditional
side-by-side layout where the previous and next cards peek in at reduced scale on
either side of the front card, rather than stacking behind it. This is the other
common carousel shape (the one react-native-snap-carousel calls its default layout,
as distinct from its `"stack"` layout, which is the shape `fan()` already covers), and
having both built in means a consumer picks a look by passing a different `layout`
value instead of writing a `LayoutStrategy` from scratch.

## The `LayoutStrategy` contract to build on

From `packages/core/src/types.ts` (read the file directly before starting; this is a
summary, not a substitute):

```ts
export interface LayoutGeometry {
  cardExtent: number
  crossExtent: number
  gap: number
  maxVisible: number
  count: number
}

export interface LayoutStrategy {
  readonly name: string
  pose(depth: number, geometry: LayoutGeometry, out: Pose): Pose
  stepTravel(geometry: LayoutGeometry): number
}
```

`pose` is called once per visible card on every animation frame a stack is dragging
or settling, and must write into `out` rather than allocate (the engine reuses one
`Pose` object per card forever; see `spread-layout.ts`'s own doc comment, quoted
above, for exactly why this matters for frame budget). `depth` is continuous, not an
integer: 0 is the front card, negative depth is a card animating through the exit
slot, and positive depth is a card waiting behind. `carousel()` differs from `fan()`
precisely here: instead of every positive depth stacking straight back
(`out.main = -offset * depth`, `out.cross = 0`), it should place depth 1 at
`+stepTravel(geometry)` (peeking in from the right) and, symmetrically, treat the
approach from the other direction (a card becoming visible from the left as the user
drags backward) the same way `fan()`'s own negative-depth exit branch already does,
so the two sides are mirror images of each other rather than one being an afterthought.

For how a layout reaches the engine at all, see how `packages/core/src/riffle.ts`'s
`createRiffle` reads `options.layout` (defaulting to `fan()` when omitted) and how the
adapters forward it unchanged. Every adapter (React, Vue, and any future one) sits on
top of `createAdapterHandle` (`packages/core/src/adapter.ts`; read the file directly,
this is a summary):

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
```

`setOptions` compares `layout` by identity like any other object-valued option (see
`optionChanged` in `packages/core/src/adapter.ts`), so `carousel()` needs no special
handling there once it exists: a consumer passing
`layout: carousel({ peekFraction: 0.15 })` just needs that value to stay referentially
stable across renders (memoised once, not recreated on every render), exactly as
`fan()` already requires today.

## Files to add

- `packages/core/src/layout/carousel.ts`: the `CarouselOptions` interface and
  `carousel(options?: CarouselOptions): LayoutStrategy` function, following
  `fan.ts`'s own shape (a small options interface with defaults, then a returned
  object literal implementing `pose`/`stepTravel`). Suggested options: `peekFraction`
  (how much of a neighbor card's width shows past the front card's edge; default
  something like `0.15`) and `scaleStep` (scale lost per unit of depth, likely a
  gentler default than `fan()`'s, since a side-by-side layout reads oddly if a
  neighbor shrinks as much as a card stacked directly behind does).
- `packages/core/src/index.ts`: export `carousel` and `CarouselOptions` alongside the
  existing `fan`/`FanOptions` exports.
- `packages/core/tests/layout/carousel.test.ts`: unit tests against `pose`/
  `stepTravel` directly (no DOM, no engine), the same style as `fan()`'s own test file
  (find it alongside `fan.ts`'s tests).
- A new example, `examples/carousel-layout/`, passing `layout: carousel()` to whichever
  adapter is simplest to stand up (react or vue; copy the closest existing example's
  package.json and vite config), demonstrating the look side by side with
  `fan()` in its own README.
- Docs: a `## carousel()` section in the Layouts guide template,
  `apps/docs/src/tracks/guides/layouts.mdx`, alongside the existing `fan()` coverage, and
  a live toggle if the page's own demos support switching layouts (see the
  `custom-layout` entry in `apps/docs/src/lib/track-demos.ts`, which names the demo each
  framework track mounts).
- `.github/workflows/ci.yml`: add a build step for the new example alongside the
  existing ones, following the same one-line-per-example pattern already there.

## Acceptance tests

- `pose(0, geometry, out)` places the front card at `main: 0, scale: 1, opacity: 1`,
  same as `fan()`'s own front-card case (a layout swap should not change what the
  front card looks like at rest).
- `pose(1, geometry, out)` places the first card behind at
  `main: stepTravel(geometry) * peekFraction` (or whatever the exact peek formula
  works out to), not `fan()`'s straight-back offset, and at a shallower scale
  reduction than an equivalent depth in `fan()`.
- `stepTravel(geometry)` returns `geometry.cardExtent + geometry.gap`, matching
  `fan()`'s own (both layouts still need a full card-width-plus-gap drag to commit
  one step; only where the peeking cards sit differs, not how far a drag has to
  travel).
- A break-it proof for at least one of the above: change the peek formula's sign or
  factor, confirm the relevant test fails with the wrong `main` value, then restore it
  (see `CONTRIBUTING.md`'s "The test rule").
- `pnpm --filter @rpxl/riffle test` (the new test file included) and
  `pnpm --filter @rpxl/riffle typecheck` both clean.

## Size budget

`carousel()` adds to `@rpxl/riffle`'s own bundle (it is exported from the core, not a
separate package), so it counts against `packages/core/package.json`'s `size-limit`
entries. Check the measured gzip size before and after with
`pnpm --filter @rpxl/riffle exec size-limit`: a second layout of comparable complexity
to `fan()` should add on the order of a few hundred bytes gzipped, not push the
core meaningfully closer to its own configured limit. If it does, that is worth
flagging in the pull request rather than quietly landing.
