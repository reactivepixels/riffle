# Riffle: Nuxt

A page whose server render proves the one defect this shape of library most
commonly ships: touching `window` or `document` at import or render time on the
server. `app/pages/index.vue` uses `@rpxl/riffle/vue`'s `useRiffle` composable
directly, with `v-riffle-root` and `v-riffle-card` on its own markup. The eight
invented films are the same generated-gradient poster data as `vue-movie-stack`.

Run `pnpm --filter nuxt-example dev` from the repository root and open the printed URL.

## SSR proof

This example must be built against the workspace package's built output, the same
way a real consumer would resolve `@rpxl/riffle/vue` from its package `exports`.
Build the package first:

```
pnpm --filter @rpxl/riffle build
pnpm --filter nuxt-example build
pnpm --filter nuxt-example check:ssr
```

`check:ssr` starts the built Nitro server (`node .output/server/index.mjs`) on a
fixed port, polls until it accepts connections, fetches the page with plain
`fetch` (no JavaScript runs), and asserts against the raw HTML:

- the element carrying `data-active-title` (the `<h1>` naming the active film)
  contains exactly "Neon Harbor", not just anywhere on the page: every card's own
  title renders unconditionally further up the markup, so a page-wide substring
  search cannot tell a correctly rendered active film from a hardcoded wrong one;
- the "1 / 8" readout is present, driven by `useRiffle`'s reactive `state` and
  `activeIndex`;
- the stack is already stacked: the element carrying `data-riffle-root` has
  `display:grid` in its own opening tag, and every element carrying
  `data-riffle-card` has `grid-area:1 / 1` in its own opening tag. This is scoped to
  each marked element's own tag rather than the page as a whole: this page's own
  `<style scoped>` block, inlined into the document by Nuxt, contains an unrelated
  `.control { display: grid; ... }` rule (the prev/next button styling) that would
  satisfy a page-wide `display:grid` search regardless of whether the root element
  itself was actually stacked;
- the response status is `200`, and the response body plus the server's combined
  stdout and stderr contain no `ReferenceError`, `TypeError`, `"is not defined"`, or
  a Nitro JSON error response (`"statusCode":5xx`). This general detector is what
  actually catches a render failure on this framework: the two literal
  `"window is not defined"`/`"document is not defined"` string checks kept
  alongside it (for parity with the Next example) are dead code here. Verified
  directly: Nitro's `node-server` preset (via unenv) defines `window` and
  `document` as globals that are themselves `undefined`, rather than leaving them
  unresolved identifiers, so a top-level `document.title` read throws
  `TypeError: Cannot read properties of undefined (reading 'title')`, never a
  `ReferenceError` with that literal text, and the response is Nitro's own JSON
  error body, `{"error":true,"statusCode":500,"statusMessage":"Server
Error",...}`. The general detector still fails correctly on that defect: wrong
  status plus the `TypeError` match.

The server is always stopped afterward, including when an assertion fails.

## Only one route here

Unlike the Next.js example, this example has no build-time/request-time split: Nuxt
does not statically prerender a page just because it has no dynamic data (that
requires an explicit `routeRules` prerender entry, which this page does not set),
so `nuxt build`'s default output already renders this page server side on every
request, the same failure mode `/`'s `export const dynamic = 'force-dynamic'`
exists to force in the Next.js example.
