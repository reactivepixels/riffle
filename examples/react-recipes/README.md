# Riffle: React recipes

Four small React apps in one, one per route, each demonstrating a single Riffle recipe:

- **Clamp with controls** (`#/clamp`): `bounds: 'clamp'` on the headless `useRiffle` hook,
  with Prev and Next bound to `state.canPrev`/`state.canNext` through `useRiffleState`, so
  they are genuinely disabled at either end.
- **Programmatic control** (`#/programmatic-control`): a thumbnail rail, a sibling
  component that never touches `<Riffle>`, drives the stack entirely through the
  imperative handle's `goTo`.
- **Forms inside cards** (`#/forms-in-cards`): every card holds a real text input; only
  the active one is ever reachable, and `onChange` moves focus into the new card's field.
- **Custom layout** (`#/custom-layout`): `spread()`, the hand-written `LayoutStrategy`
  from `examples/custom-layout`, wired up with the core's vanilla `createRiffle` API and
  sized to the available width.

Each recipe component (`src/ClampStack.tsx`, `src/ExternalControlStack.tsx`,
`src/FormCardsStack.tsx`, `src/CustomLayoutStack.tsx`) is a self-contained, default-exported
component with no props: `App.tsx` is page chrome only (a nav and a hash router with no
router dependency), and `ExternalControlStack` and `FormCardsStack` are also rendered live
on the docs site's recipe pages.

Run `pnpm --filter react-recipes dev` from the repository root and open the printed URL.
