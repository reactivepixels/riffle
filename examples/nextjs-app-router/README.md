# Riffle: Next.js App Router

Two App Router pages whose server render proves the one defect this shape of
library most commonly ships: touching `window` or `document` at import or render
time on the server. The eight invented films are the same generated-gradient
poster data as `react-movie-stack`.

- **`/`** (`app/page.tsx`): a Server Component that renders `app/PosterStack.tsx`,
  a `'use client'` component built from `@rpxl/riffle/react`'s headless `useRiffle`
  and `useRiffleState`. Marked `export const dynamic = 'force-dynamic'`, so `next
start` renders it fresh on every request. This route proves the render is safe
  **at request time**: a window or document leak here surfaces as a server log line
  while the app is running, the shape of failure a real production deploy would hit.
- **`/static`** (`app/static/page.tsx`): a Server Component that renders
  `app/static/StaticPosterStack.tsx`, built on the drop-in `<Riffle>` component
  itself (the only place in this example `<Riffle>` gets server rendered; `/` uses
  the headless composition instead so `useRiffleState` can drive its readout, see
  below), with an `onChange`-driven `useState` readout starting at 0. No route
  segment config, so Next prerenders it at build time (`next build`'s route table
  reports it `○ Static`, `/` reports `ƒ Dynamic`). This route proves the render is
  safe **at build time**: a window or document leak in a module this route imports
  fails `next build` itself, which is what actually turns CI red, before `next
start` or `check:ssr` ever runs. `/` alone cannot prove this: forcing it dynamic
  is exactly what defers its own render past build time.

Run `pnpm --filter nextjs-app-router dev` from the repository root and open the
printed URL for either route.

## Why `/` uses the headless composition, not `<Riffle>`

`useRiffleState(riffle, selector)` needs a handle with `subscribe`/`getSnapshot`,
which only `useRiffle()` returns; the drop-in `<Riffle>` component's own
`riffleRef`/`RiffleInstance` does not expose one. So `/` is built on `useRiffle()` +
`getRootProps`/`getCardProps` (the same shape as the `HeadlessStack.tsx` example) so
its "N / 8" readout can be driven by `useRiffleState`, and `/static` is built on
`<Riffle>` directly so the drop-in component itself gets exercised server side too.

## SSR proof

This example must be built against the workspace package's built output, the same
way a real consumer would resolve `@rpxl/riffle/react` from its package `exports`.
Build the package first:

```
pnpm --filter @rpxl/riffle build
pnpm --filter nextjs-app-router build
pnpm --filter nextjs-app-router check:ssr
```

`check:ssr` starts the production server (`next start`) on a fixed port, polls
until it accepts connections, then fetches both `/` and `/static` with plain
`fetch` (no JavaScript runs) and asserts against each route's raw HTML:

- the element carrying `data-active-title` (the `<h1>` naming the active film)
  contains exactly "Neon Harbor", not just anywhere on the page: every card's own
  title renders unconditionally further up the markup, so a page-wide substring
  search cannot tell a correctly rendered active film from a hardcoded wrong one;
- the "1 / 8" readout is present;
- the stack is already stacked: the element carrying `data-riffle-root` has
  `display:grid` in its own opening tag, and every element carrying
  `data-riffle-card` has `grid-area:1 / 1` in its own opening tag (not merely
  somewhere on the page, since a stray `<style>` block or unrelated element could
  otherwise satisfy a page-wide search regardless of whether the actual stack was
  stacked);
- the response status is `200`, and the response body plus the server's combined
  stdout and stderr contain no `ReferenceError`, `TypeError`, `"is not defined"`, or
  a Next.js error page (`id="__next_error__"`); this general detector is what
  actually catches a render failure, not the two literal
  `"window is not defined"`/`"document is not defined"` string checks kept
  alongside it for a friendlier message. On this framework a bare, never-shimmed
  `window` or `document` reference does throw that exact `ReferenceError` text
  (verified directly), so those two checks do fire here, but they are not load
  bearing: the general detector fires regardless, and is the only one that also
  works for a framework whose runtime does not fail that same way (see the Nuxt
  README).

Each route's log slice is scoped to that route's own request: the server runs once
for both routes, and a failure logged for one route must not fail the other's
otherwise-clean check.

The server is always stopped afterward, including when an assertion fails.
