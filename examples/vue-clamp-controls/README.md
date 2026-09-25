# Riffle: Vue clamp controls

A stack of five trail waypoints built with `@rpxl/riffle/vue` and
`bounds: 'clamp'`, so the ends are meaningful instead of wrapping around. The
prev and next buttons bind `:disabled` to `state.canPrev` and
`state.canNext`, so they are genuinely inert at either end, not just styled
to look that way, and a "Card k of n" readout tracks the active waypoint.
Run `pnpm --filter vue-clamp-controls dev` from the repository root and open
the printed URL.
