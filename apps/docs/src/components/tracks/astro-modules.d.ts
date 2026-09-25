/**
 * Lets plain `tsc` (the docs `typecheck` script, tsconfig.typecheck.json)
 * read an `.astro` import in the registries. Astro's own tooling resolves
 * `.astro` files itself and never falls back to this.
 */
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
  const Component: AstroComponentFactory
  export default Component
}
