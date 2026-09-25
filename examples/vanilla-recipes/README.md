# Riffle: vanilla recipes

Five small recipes, each a standalone HTML page, all built with no
framework: `@rpxl/riffle`'s `createRiffle` is called directly.

- **Vertical fan** (`vertical.html`): `axis: 'y'`, `bounds: 'clamp'`, and the
  up/down arrow keys, ported from `examples/vertical-stack`.
- **Clamped bounds** (`clamp.html`): `bounds: 'clamp'` with prev and next
  buttons that are genuinely `disabled` at the ends, read from
  `riffle.getSnapshot().canPrev`/`canNext`, ported from
  `examples/vue-clamp-controls`.
- **Infinite feed** (`infinite-feed.html`): a stack that grows by eight cards
  once the active card is within two of the end, behind a simulated 300ms
  fetch, ported from `examples/react-infinite-feed`. The growth guard
  (`src/growth.ts`) is unit tested in `src/growth.test.ts`.
- **Programmatic control** (`programmatic-control.html`): a thumbnail rail
  that jumps the stack straight to a card via `riffle.goTo(index)`, ported
  from `examples/react-movie-stack/src/ExternalControlStack.tsx`.
- **Forms inside cards** (`forms-in-cards.html`): a real text input per
  card, where the `change` listener focuses the new card's field directly
  once accessibility state (and its own focus-follow) has already updated,
  ported from `examples/react-movie-stack/src/FormCardsStack.tsx`.

Each recipe's module (`src/{vertical,clamp,infinite-feed,programmatic-control,forms-in-cards}.ts`)
exports `mount(el: HTMLElement): () => void`, which builds its own markup
inside `el`, creates the Riffle, wires listeners, and returns a cleanup that
destroys the Riffle and removes every listener it added. None of the five
touch `document.body` or define a global style: every CSS rule in
`src/app.css` is nested under that recipe's own root class
(`.recipe-vertical`, `.recipe-clamp`, and so on), so a module is safe to
import and mount elsewhere, such as a docs live demo. Each recipe's own HTML
page carries the page-level chrome (the `html`/`body` reset and background)
separately.

Run `pnpm --filter vanilla-recipes dev` from the repository root and open
the printed URL.
