/**
 * Keeps the previous/next links at the foot of a page inside its own
 * sidebar topic, so the Vue overview never offers "Next: Getting Started"
 * from another track.
 *
 * starlight-sidebar-topics means to do this itself, clearing `prev` on a
 * topic's first page and `next` on its last, but it compares the sidebar's
 * hrefs (which carry this site's /riffle base) against the base-less page
 * id, so under a base path neither edge ever matches. Starlight computes
 * prev/next from the whole sidebar, and every topic is one contiguous run of
 * it, so the only wrong links are the ones that cross a topic edge: this
 * clears any link that is not in the current topic's own sidebar. It runs
 * after the plugin's middleware, which has already narrowed
 * `starlightRoute.sidebar` to the current topic.
 */
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data'

/**
 * The two locals this reads. Named here, rather than taken from App.Locals,
 * because Starlight and the plugin declare those through Astro's generated
 * types, which the plain `tsc` typecheck of this directory does not load.
 */
interface TrackLocals {
  starlightRoute: StarlightRouteData
  starlightSidebarTopics?: { isPageWithTopic: boolean }
}

function hrefs(entries: StarlightRouteData['sidebar'], into = new Set<string>()): Set<string> {
  for (const entry of entries) {
    if (entry.type === 'link') into.add(entry.href)
    else hrefs(entry.entries, into)
  }
  return into
}

export const onRequest = defineRouteMiddleware((context) => {
  const locals = context.locals as unknown as TrackLocals
  const route = locals.starlightRoute
  if (!route.hasSidebar || !locals.starlightSidebarTopics?.isPageWithTopic) return
  const inTopic = hrefs(route.sidebar)
  const { prev, next } = route.pagination
  if (prev && !inTopic.has(prev.href)) route.pagination.prev = undefined
  if (next && !inTopic.has(next.href)) route.pagination.next = undefined
})
