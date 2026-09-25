# Riffle: Vue recipes

Five small Vue apps in one, one per route, each demonstrating a single Riffle recipe:

- **Vertical axis** (`#/vertical`): `axis: 'y'` on the `<Riffle>` drop-in, with the row
  fanned by a hand-tuned `fan({ offset: -32 })` layout, matching `examples/vertical-stack`.
- **Infinite feed** (`#/infinite-feed`): the stack grows by eight cards once the active card
  is within two of the end, guarded by `src/growth.ts`'s pure `shouldGrow` predicate so a
  300ms simulated fetch never fires more than once per approach.
- **Programmatic control** (`#/programmatic-control`): a thumbnail rail, a sibling component
  that never touches `<Riffle>`, drives the stack entirely through the template ref's `goTo`.
- **Forms inside cards** (`#/forms-in-cards`): every card holds a real text input; only the
  active one is ever reachable, and `@change` moves focus into the new card's field.
- **Custom layout** (`#/custom-layout`): `spread()`, the hand-written `LayoutStrategy` from
  `examples/custom-layout`, wired up with the core's vanilla `createRiffle` API and sized to
  the available width.

Each recipe component (`src/VerticalStack.vue`, `src/InfiniteFeed.vue`,
`src/ExternalControlStack.vue`, `src/FormCardsStack.vue`, `src/CustomLayoutStack.vue`) is a
self-contained, default-exported single-file component with no props: `App.vue` is page
chrome only (a nav and a hash router with no router dependency), and `ExternalControlStack`
and `FormCardsStack` are also rendered live on the docs site's recipe pages.

Run `pnpm --filter vue-recipes dev` from the repository root and open the printed URL.
