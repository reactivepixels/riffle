#!/usr/bin/env node
/**
 * Generates the three framework tracks (`/vanilla/`, `/react/`, `/vue/`)
 * from one set of templates. Every `.mdx` file under `src/tracks/` is
 * written once per framework into `src/content/docs/<fw>/<same path>`, with
 * `framework: <fw>` added to its frontmatter. The track components
 * (src/components/tracks/) read that field to decide what to render, so a
 * template is written once, in neutral prose, and the framework-specific
 * parts come from `<Only>`, `<Snippet>` and `<Demo>`.
 *
 * A template whose frontmatter has `only: [vue]` (a flow list of one or
 * more framework names) is written for the listed frameworks alone.
 *
 * Two more things are resolved here rather than at render time:
 * - A block-level `<Only fw="...">` (its opening and closing tags each on a
 *   line of their own) is removed outright from every other track's page.
 *   Rendering it as nothing is not enough: Starlight builds the table of
 *   contents from every heading in the compiled MDX, so a heading inside a
 *   Vue-only block would still be listed on the React page.
 * - Each page's document `<title>` names its track ("Gestures: React |
 *   Riffle"), through a `head` entry, so three tracks never show three
 *   identical titles in a browser tab or a search result. The visible page
 *   title (the H1) stays the template's own neutral `title`.
 * - `/_track_/` in a link becomes the page's own track (`/react/`).
 *
 * Both the `dev`/`build` scripts and `check:api` run this before
 * generate-api.mjs. The output directories are not committed (see
 * apps/docs/.gitignore): each run deletes them and writes them afresh, so a
 * removed or renamed template never leaves a stale page behind.
 */
import { fileURLToPath } from 'node:url'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { FRAMEWORKS, SITE_TITLE, TRACK_LABELS } from './lib/tracks.mjs'

const FRONTMATTER_OPEN = '---\n'
const FRONTMATTER_CLOSE = '\n---\n'

/**
 * Splits a template into its frontmatter (without the fences) and the rest
 * of the file, on the first `---\n ... \n---\n` block, the same shape
 * generate-api.mjs writes.
 */
function splitFrontmatter(text) {
  if (!text.startsWith(FRONTMATTER_OPEN)) {
    throw new Error('A track template must start with a --- frontmatter block')
  }
  const closeIndex = text.indexOf(FRONTMATTER_CLOSE, FRONTMATTER_OPEN.length - 1)
  if (closeIndex === -1) {
    throw new Error('A track template has an unterminated --- frontmatter block')
  }
  return {
    frontmatter: text.slice(FRONTMATTER_OPEN.length, closeIndex),
    rest: text.slice(closeIndex + FRONTMATTER_CLOSE.length),
  }
}

/** The frameworks an `only:` line allows, or null when there is no `only:` line. */
function parseOnly(frontmatter) {
  const line = frontmatter.split('\n').find((l) => /^only\s*:/.test(l))
  if (line === undefined) return null
  const match = line.match(/^only\s*:\s*\[([^\]]*)\]\s*$/)
  if (!match) {
    throw new Error(`\`only\` must be a flow list such as \`only: [vue]\`, got "${line}"`)
  }
  const names = match[1]
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  for (const name of names) {
    if (!FRAMEWORKS.includes(name)) {
      throw new Error(
        `\`only\` names an unknown framework "${name}" (known: ${FRAMEWORKS.join(', ')})`,
      )
    }
  }
  return names
}

/** The template's `title`, unquoted. Every track page needs one for its document title. */
function parseTitle(frontmatter) {
  const line = frontmatter.split('\n').find((l) => /^title\s*:/.test(l))
  const raw = line?.replace(/^title\s*:\s*/, '').trim()
  if (!raw) throw new Error('A track template needs a `title` in its frontmatter')
  if (raw.startsWith('"')) return JSON.parse(raw)
  if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'")
  return raw
}

/**
 * A link to another page in the same track is written `/riffle/_track_/...`
 * in a template, and becomes `/riffle/react/...` on the React page. Links
 * stay absolute this way, and the link validator checks them: it does not
 * check relative links at all (see errorOnRelativeLinks in astro.config.mjs).
 */
const TRACK_PLACEHOLDER = '/_track_/'

const ONLY_OPEN_RE = /^<Only fw="([^"]*)">\s*$/
const ONLY_CLOSE_RE = /^<\/Only>\s*$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/**
 * Removes every block-level `<Only>` whose `fw` list excludes `fw`, and
 * replaces every `/_track_/` with `/${fw}/`, in one line walk. Lines inside
 * a code fence are never treated as an `<Only>` tag, and never have
 * `/_track_/` replaced either: a fenced example showing that literal
 * placeholder (documenting the convention itself, for instance) must not
 * silently turn into a real, framework-specific link.
 */
function resolveOnlyBlocks(body, fw) {
  const out = []
  let fence = null
  let open = null
  const lines = body.split('\n')
  /** Applies the `/_track_/` replacement, unless `line` is inside a fence. */
  const emit = (line) =>
    out.push(fence === null ? line.replaceAll(TRACK_PLACEHOLDER, `/${fw}/`) : line)
  lines.forEach((line, index) => {
    const fenceMatch = line.match(FENCE_RE)
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null
      }
      if (open === null || open.keep) emit(line)
      return
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      if (open === null || open.keep) emit(line)
      return
    }
    const openMatch = line.match(ONLY_OPEN_RE)
    if (openMatch) {
      if (open !== null) {
        throw new Error(`Nested <Only> blocks are not supported (line ${index + 1})`)
      }
      const names = openMatch[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
      for (const name of names) {
        if (!FRAMEWORKS.includes(name)) {
          throw new Error(
            `<Only fw="${openMatch[1]}"> names an unknown framework "${name}" (known: ${FRAMEWORKS.join(', ')})`,
          )
        }
      }
      open = { keep: names.includes(fw), line: index + 1 }
      if (open.keep) emit(line)
      return
    }
    if (ONLY_CLOSE_RE.test(line)) {
      if (open === null) throw new Error(`</Only> without an opening <Only> (line ${index + 1})`)
      if (open.keep) emit(line)
      open = null
      return
    }
    if (open === null || open.keep) emit(line)
  })
  if (open !== null) throw new Error(`Unterminated <Only> block opened on line ${open.line}`)
  return out.join('\n')
}

/**
 * One framework's page for a template, or null when the template's `only`
 * list excludes that framework. The output is the template with
 * `framework: <fw>` and a `head` entry for the document title appended to
 * its frontmatter, and every block-level `<Only>` for another framework
 * removed. Nothing else changes.
 *
 * @param {string} templateText
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @returns {string | null}
 */
export function generateTrack(templateText, fw) {
  const { frontmatter, rest } = splitFrontmatter(templateText)
  if (/^framework\s*:/m.test(frontmatter)) {
    throw new Error('A track template must not set `framework` itself: the generator adds it')
  }
  if (/^head\s*:/m.test(frontmatter)) {
    throw new Error('A track template must not set `head`: the generator adds the <title> entry')
  }
  const only = parseOnly(frontmatter)
  if (only !== null && !only.includes(fw)) return null
  const documentTitle = `${parseTitle(frontmatter)}: ${TRACK_LABELS[fw]} | ${SITE_TITLE}`
  const added = [
    `framework: ${fw}`,
    'head:',
    '  - tag: title',
    `    content: ${JSON.stringify(documentTitle)}`,
  ].join('\n')
  const body = resolveOnlyBlocks(rest, fw)
  return `${FRONTMATTER_OPEN}${frontmatter}\n${added}${FRONTMATTER_CLOSE}${body}`
}

function listTemplates(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) found.push(...listTemplates(full))
    else if (name.endsWith('.mdx')) found.push(full)
  }
  return found
}

/**
 * Writes every template for every framework it applies to, replacing each
 * `<outRoot>/<fw>/` directory wholesale. Returns the written paths, relative
 * to `outRoot`, with forward slashes.
 *
 * @param {{ templatesDir: string, outRoot: string }} dirs
 * @returns {string[]}
 */
export function writeTracks({ templatesDir, outRoot }) {
  const templates = listTemplates(templatesDir).map((file) => ({
    rel: relative(templatesDir, file).split(sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  const written = []
  for (const fw of FRAMEWORKS) {
    rmSync(join(outRoot, fw), { recursive: true, force: true })
    for (const { rel, text } of templates) {
      const page = generateTrack(text, fw)
      if (page === null) continue
      const dest = join(outRoot, fw, rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, page)
      written.push(`${fw}/${rel}`)
    }
  }
  return written
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const docsRoot = fileURLToPath(new URL('..', import.meta.url))
  const written = writeTracks({
    templatesDir: join(docsRoot, 'src/tracks'),
    outRoot: join(docsRoot, 'src/content/docs'),
  })
  console.log(`generate-tracks: wrote ${written.length} page(s) across ${FRAMEWORKS.join(', ')}`)
}
