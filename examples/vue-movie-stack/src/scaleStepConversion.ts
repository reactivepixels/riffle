/**
 * The migration guide's worked conversion from vue-card-stack's
 * `scaleMultiplier: 0.5` to Riffle's `fan({ scaleStep })`: shown on the
 * migration page (apps/docs/src/content/docs/migration.mdx) via a `?raw`
 * import, so the number in prose and the number that actually typechecks
 * against `fan()` can never drift apart.
 */
import { fan } from '@rpxl/riffle'

export const layout = fan({ scaleStep: 0.05 })
