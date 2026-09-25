// A Server Component. It never touches window or document itself, and the
// only thing it renders is the client component below, which is the one
// place in this page window or document could leak in at render time.
import { PosterStack } from './PosterStack'

// Forced dynamic so `next start` renders this page on every request rather
// than serving a build-time prerender: this is what makes check:ssr's fetch
// actually exercise the server render (and so what makes a window or
// document read surface as a server log line check:ssr can assert on,
// rather than as a next build failure before check:ssr ever runs).
export const dynamic = 'force-dynamic'

export default function Page() {
  return <PosterStack />
}
