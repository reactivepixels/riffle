# Riffle: Vanilla movie stack

A fanned poster stack of eight invented films, built with no framework:
`@rpxl/riffle`'s `createRiffle` is called directly, with the markup built by
hand in `src/main.ts` and registered onto the engine with `registerNode`.
Behaviour and look match `examples/react-movie-stack`: the same films, the
same poster shrink at 520px and below, prev and next buttons, and the title
plus year readout below the stack. Run `pnpm --filter vanilla-movie-stack
dev` from the repository root and open the printed URL.

`src/main.ts` exports `mount(el: HTMLElement): () => void`, which builds the
stack inside `el` and returns a cleanup that destroys the Riffle instance
and removes every listener it added. The module also calls `mount` on
itself against `#vanilla-movie-stack-root` when that element is present, so
the page works standalone; a caller that imports `mount` directly (such as
a docs live demo) gets a self-contained function with no side effects of
its own.
