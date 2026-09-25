# Riffle: custom layout

A hand-written `LayoutStrategy` (`src/spread-layout.ts`) that fans seven
swatches along an arc instead of straight behind one another, wired up with
`createRiffle({ layout })` and no framework at all. Unlike `vanilla-basic`,
which imports `@rpxl/riffle` from an esm.sh URL, this example imports it as a
workspace dependency through Vite, so it builds and typechecks offline. Run
`pnpm --filter custom-layout dev` from the repository root and open the
printed URL.
