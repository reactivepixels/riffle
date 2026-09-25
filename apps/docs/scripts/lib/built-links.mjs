/**
 * A crawl of the built docs site (`apps/docs/dist`) for internal links that
 * point at nothing. starlight-links-validator checks links at build time,
 * but only absolute ones inside Markdown content (errorOnRelativeLinks is
 * off in astro.config.mjs), and it never sees the links a component renders
 * (the track switcher, the sidebar, the landing page's cards) or where a
 * redirect stub finally lands. This reads the HTML that actually ships.
 *
 * Every `<a href>` on every built page is resolved against that page's own
 * URL (a page at `dist/react/api/index.html` is served at
 * `/riffle/react/api/`, so a relative `../x` resolves the way a browser
 * would resolve it), then looked up in `dist`. A redirect stub (Astro's
 * `<meta http-equiv="refresh">` page) counts as present only when its own
 * target does, followed to the end of the chain.
 *
 * A link to the `/choose/` page carries the page it is really after in its
 * `next` query (`/riffle/choose/?next=guides/gestures`), which that page
 * sends the visitor on to once a track is picked. It passes only when at
 * least one track has that page (`dist/<track>/<next>/index.html`); a
 * mistyped `next` would otherwise land every visitor on a track overview
 * with nothing to say why.
 *
 * External links (another origin, `mailto:` and so on) and a bare
 * `#fragment` on the same page are out of scope; so is whether a fragment
 * names a real heading, which the build-time validator already checks.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** The origin every relative href is resolved against; only its path matters. */
const SITE_ORIGIN = 'https://docs.invalid'

const ANCHOR_HREF_RE = /<a\b[^>]*?\shref=(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi
const REFRESH_RE = /<meta\s+http-equiv=["']?refresh["']?\s+content=["']?\d+\s*;\s*url=([^"'>]+)/i

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function htmlFiles(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) found.push(...htmlFiles(full))
    else if (name.endsWith('.html')) found.push(full)
  }
  return found
}

/** The URL path `dist/<rel>` is served at, under `base`: `react/index.html` is `/riffle/react/`. */
function servedPath(distRel, base) {
  const posixRel = distRel.split(sep).join('/')
  if (posixRel === 'index.html') return `${base}/`
  if (posixRel.endsWith('/index.html')) return `${base}/${posixRel.slice(0, -'index.html'.length)}`
  return `${base}/${posixRel}`
}

/**
 * The file in `distDir` that serves URL path `path`, or null: `/riffle/x/`
 * is `x/index.html`, and `/riffle/x` (no trailing slash) is `x`, `x.html`
 * or `x/index.html`, the way a static host would try them.
 */
function fileFor(distDir, path, base) {
  if (path !== base && !path.startsWith(`${base}/`)) return null
  let rel
  try {
    rel = decodeURIComponent(path.slice(base.length)).replace(/^\/+/, '')
  } catch {
    return null
  }
  const candidates =
    rel === '' || rel.endsWith('/')
      ? [`${rel}index.html`]
      : [rel, `${rel}.html`, `${rel}/index.html`]
  for (const candidate of candidates) {
    const full = join(distDir, candidate)
    if (existsSync(full) && statSync(full).isFile()) return full
  }
  return null
}

/**
 * Every broken internal link in the built site at `distDir`.
 *
 * @param {string} distDir the built site's root
 * @param {{ base?: string, tracks?: readonly string[] }} [options] the site's base path
 *   (astro.config.mjs's `base`) and the track directories a `/choose/?next=` slug may name
 * @returns {{ pages: number, links: number, broken: Array<{ page: string, href: string, reason: string }> }}
 */
export function checkBuiltLinks(
  distDir,
  { base = '/riffle', tracks = ['vanilla', 'react', 'vue'] } = {},
) {
  const files = htmlFiles(distDir)
  /** @type {Map<string, string | null>} a redirect stub's own target path, cached per file */
  const refreshTargets = new Map()

  function refreshTargetOf(file) {
    if (!refreshTargets.has(file)) {
      const match = readFileSync(file, 'utf8').match(REFRESH_RE)
      refreshTargets.set(file, match ? decodeEntities(match[1].trim()) : null)
    }
    return refreshTargets.get(file)
  }

  /** Null when `path` resolves to a real page, possibly through redirect stubs; otherwise why not. */
  function resolveOrReason(path) {
    const seen = new Set()
    let current = path
    while (true) {
      const file = fileFor(distDir, current, base)
      if (file === null) {
        return current === path
          ? 'no such page in dist'
          : `redirects to ${current}, which does not exist`
      }
      const target = refreshTargetOf(file)
      if (target === null) return null
      if (seen.has(file)) return `redirect loop through ${current}`
      seen.add(file)
      // A stub's own target resolves against the stub's URL, not the page
      // that linked to it.
      const next = new URL(target, `${SITE_ORIGIN}${current}`)
      if (next.origin !== SITE_ORIGIN) return null
      current = next.pathname
    }
  }

  /** Null unless `url` is a `/choose/?next=<slug>` link whose slug no track has. */
  function chooseNextReason(url) {
    if (url.pathname !== `${base}/choose/`) return null
    const next = (url.searchParams.get('next') ?? '').replace(/^\/+|\/+$/g, '')
    if (next === '') return null
    const found = tracks.some((fw) => fileFor(distDir, `${base}/${fw}/${next}/`, base) !== null)
    return found ? null : `?next=${next} names a page no track has`
  }

  const broken = []
  let links = 0
  for (const file of files) {
    const pagePath = servedPath(relative(distDir, file), base)
    const html = readFileSync(file, 'utf8')
    for (const match of html.matchAll(ANCHOR_HREF_RE)) {
      const raw = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim()
      if (raw === '' || raw.startsWith('#')) continue
      const url = new URL(raw, `${SITE_ORIGIN}${pagePath}`)
      if (url.origin !== SITE_ORIGIN) continue
      links += 1
      const reason = resolveOrReason(url.pathname) ?? chooseNextReason(url)
      if (reason !== null) broken.push({ page: pagePath, href: raw, reason })
    }
  }
  return { pages: files.length, links, broken }
}
