#!/usr/bin/env node
/**
 * Generates each track's `/<fw>/api/*` Starlight pages from TSDoc, and is
 * the gate that keeps them honest: every symbol the three packages export
 * (core, react, vue), type-only exports included, must carry a TSDoc
 * summary and at least one `@example`. Every property or method an
 * exported interface or class declares itself (not one it only inherits,
 * e.g. through `extends Pick<AdapterHandle, ...>`) must carry a summary of
 * its own, so `RiffleOptions`'s fields cannot hide behind the interface's
 * one example. `@example` stays required once per exported symbol, never
 * per member.
 *
 * Vanilla's track carries every core page; react's and vue's each carry
 * their own package plus whatever core pages `coreTypesReferencedBy` finds
 * their own public export signatures actually reach, so a React page never
 * links out to a Vue-only concept and vice versa. A track's own package's
 * pages live directly under `/<fw>/api/<kind>/<symbol>/` (no repeated
 * package segment: there is only one, so it is implicit); react's and
 * vue's referenced-core subset sits alongside it, at
 * `/<fw>/api/core/<kind>/<symbol>/`. `/<fw>/api/` itself is a landing page
 * this script authors directly (`buildLandingPage`), not one of TypeDoc's
 * own generated pages: it introduces the track's own package, lists its
 * exports by kind, and, for react and vue, lists the core types their own
 * surface references. This must run after
 * generate-tracks.mjs in every script that runs both (dev, build,
 * check:api): generate-tracks.mjs deletes each track's whole content
 * directory on every run, `<fw>/api/` included, so writing this after it
 * is what keeps this script's own output from being wiped the moment it
 * lands (see generate-tracks.test.mjs's package.json ordering test).
 *
 * Both `pnpm --filter @rpxl/docs build` and `check:api` run this script.
 * It validates before it writes anything: a missing doc fails loudly, here,
 * rather than shipping a half-documented page. The generated output
 * (`src/content/docs/<fw>/api`) is not committed; every build regenerates
 * it from source, so it can never drift from the TSDoc it was built from.
 * A record of every old (pre-track) API URL mapped to where that page
 * lives now is written to `src/generated/api-redirects.json`, also not
 * committed, for the redirects a later script wires up.
 *
 * TypeDoc's own `validation.notDocumented` only checks that a comment
 * exists, not that it carries an `@example`, so the check below walks the
 * converted reflection tree itself instead of relying on that option.
 * `starlight-typedoc` was considered in its place: as of writing its
 * peer range does not cover this repo's pinned Starlight 0.42 / Astro 7.3,
 * and it also owns its own page shape and sidebar with less room for the
 * summary+example rule above, so a plain TypeDoc + typedoc-plugin-markdown
 * run, post-processed here into Starlight frontmatter, is the more direct
 * fit for a hard documentation gate.
 *
 * The same walk also fails on an internal-only reference leaking into
 * public doc text, such as a citation to an implementation ticket or
 * review round (`RiffleOptions.getLabel`'s summary once rendered one
 * live on the site). That class of leak is made structurally impossible
 * here rather than relying on catching it by re-reading prose by eye. See
 * ./internal-reference-pattern.mjs for the pattern itself (shared with its
 * own unit test, so the tested pattern and the one gating the build can
 * never drift apart); the pattern requires a reference shape per
 * alternative, not just the bare word, to avoid false positives.
 */
import { Application, ReflectionKind } from 'typedoc'
import { fileURLToPath } from 'node:url'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative, basename, sep, posix } from 'node:path'
import { findInternalReference } from './internal-reference-pattern.mjs'
import {
  ADAPTER_FRAMEWORKS,
  API_KINDS,
  FRAMEWORKS,
  SITE_TITLE,
  TRACK_LABELS,
  TRACK_PACKAGE_NAMES,
} from './lib/tracks.mjs'

const docsRoot = fileURLToPath(new URL('..', import.meta.url))
const typedocOptions = join(docsRoot, 'typedoc.json')
const contentDocsRoot = join(docsRoot, 'src/content/docs')
const redirectsPath = join(docsRoot, 'src/generated/api-redirects.json')

/**
 * TypeDoc names a multi-entry-point module after its entry file's path
 * relative to the common root the three entry points share
 * (`packages/core/src`): the engine's own `index.ts` sits directly at that
 * root, so TypeDoc names it `index`; the adapters' `react/index.ts` and
 * `vue/index.ts` each live one directory down, so TypeDoc names them after
 * that directory rather than repeating `index`. Renamed here, after
 * convert(), to the plain package name: this is the package directory
 * `generateApi()` reads TypeDoc's own generated pages from (`<tmpOut>/core/...`,
 * not `<tmpOut>/index/...`), and the name react's and vue's referenced-core
 * subset directory is written under (`/<fw>/api/core/...`).
 */
const MODULE_LABELS = {
  index: 'core',
  react: 'react',
  vue: 'vue',
}

function hasText(parts) {
  if (!Array.isArray(parts)) return false
  return parts.some(
    (part) => (part.kind === 'text' || part.kind === 'code') && part.text.trim().length > 0,
  )
}

function hasSummary(comment) {
  return !!comment && hasText(comment.summary)
}

function hasExample(comment) {
  return !!comment?.blockTags?.some((tag) => tag.tag === '@example' && hasText(tag.content))
}

/** Every word of text a comment renders publicly: its summary, plus every block tag's content (including @example code). */
function commentText(comment) {
  if (!comment) return ''
  const parts = []
  if (Array.isArray(comment.summary)) parts.push(...comment.summary)
  for (const tag of comment.blockTags ?? []) {
    if (Array.isArray(tag.content)) parts.push(...tag.content)
  }
  return parts.map((part) => part.text ?? '').join(' ')
}

function checkNoInternalReferences(label, comment) {
  const found = findInternalReference(commentText(comment))
  if (found !== null)
    failures.push(`${label}: internal reference leak ("${found}") in public doc text`)
}

const failures = []

function requireSummary(label, comment) {
  if (!hasSummary(comment)) failures.push(`${label}: missing a TSDoc summary`)
  checkNoInternalReferences(label, comment)
}

function requireSummaryAndExample(label, comment) {
  requireSummary(label, comment)
  if (!hasExample(comment)) failures.push(`${label}: missing an @example`)
}

/** A method's comment lives on its signature; a property carries its own. */
function memberComment(member) {
  if (member.kindOf(ReflectionKind.Method) || member.kindOf(ReflectionKind.Accessor)) {
    return member.signatures?.[0]?.comment ?? null
  }
  return member.comment ?? null
}

/**
 * Every member an interface or class declares itself needs a summary.
 * `inheritedFrom` is set (e.g. React's `RiffleHandle extends Pick<AdapterHandle,
 * ...>`) for a member that already got this check at its own declaration, so
 * those are skipped here rather than double-required. A constructor is not
 * public API surface for either exported class in this project (nothing
 * calls `new RiffleError(...)` itself); skipped for the same reason.
 */
function checkOwnMembers(label, container) {
  for (const member of container.children ?? []) {
    if (member.inheritedFrom) continue
    if (member.kindOf(ReflectionKind.Constructor)) continue
    requireSummary(`${label}.${member.name}`, memberComment(member))
  }
}

function checkModule(mod) {
  for (const child of mod.children ?? []) {
    // A type-only re-export (react/vue re-exporting core's RiffleOptions
    // etc.) resolves, via the paths mapping in typedoc.tsconfig.json, to
    // the very same reflection already checked at its own module. Checking
    // it again here would just repeat the same failure or success twice.
    if (child.kindOf(ReflectionKind.Reference)) continue

    const label = `${mod.name}: ${child.name}`
    if (child.kindOf(ReflectionKind.Function)) {
      requireSummaryAndExample(label, child.signatures?.[0]?.comment ?? null)
    } else if (child.kindOf(ReflectionKind.Class) || child.kindOf(ReflectionKind.Interface)) {
      requireSummaryAndExample(label, child.comment ?? null)
      checkOwnMembers(label, child)
    } else {
      // Variable (e.g. the `Riffle` component, SPRING_PRESETS) and
      // TypeAlias (e.g. Axis, RiffleHandle in vue): both carry their own
      // top-level comment.
      requireSummaryAndExample(label, child.comment ?? null)
    }
  }
}

/**
 * Every `Type` node one level inside `type`, regardless of its own shape
 * (union, array, generic, mapped, ...): every construct this project's
 * source actually produces once converted. `type.reference`'s own
 * `typeArguments` (e.g. `Pick<AdapterHandle, 'x'>`'s `AdapterHandle`) is
 * covered by the `reference` case so a reference wrapped in a generic is
 * still walked into, not just the generic's own outer name.
 */
function* nestedTypes(type) {
  if (!type) return
  switch (type.type) {
    case 'reference':
      yield* type.typeArguments ?? []
      return
    case 'array':
    case 'optional':
    case 'rest':
      if (type.elementType) yield type.elementType
      return
    case 'union':
    case 'intersection':
      yield* type.types ?? []
      return
    case 'tuple':
      yield* type.elements ?? []
      return
    case 'namedTupleMember':
      if (type.element) yield type.element
      return
    case 'conditional':
      for (const t of [type.checkType, type.extendsType, type.trueType, type.falseType]) {
        if (t) yield t
      }
      return
    case 'indexedAccess':
      if (type.objectType) yield type.objectType
      if (type.indexType) yield type.indexType
      return
    case 'mapped':
      for (const t of [type.parameterType, type.templateType, type.nameType]) {
        if (t) yield t
      }
      return
    case 'predicate':
      if (type.targetType) yield type.targetType
      return
    case 'query':
      if (type.queryType) yield type.queryType
      return
    case 'typeOperator':
      if (type.target) yield type.target
      return
    case 'templateLiteral':
      for (const [t] of type.tail ?? []) if (t) yield t
      return
    default:
      // 'reflection' (an inline object/function type) is handled by the
      // caller, which walks its declaration as a reflection rather than a
      // type. 'intrinsic', 'literal', 'unknown' and 'inferred' are leaves.
      return
  }
}

/** Every `Type` a reflection's own signatures, members and heritage clauses carry directly (not its children's, which the caller walks on its own). */
function* ownTypes(reflection) {
  if (reflection.type) yield reflection.type
  for (const sig of reflection.signatures ?? []) {
    if (sig.type) yield sig.type
    for (const param of sig.parameters ?? []) if (param.type) yield param.type
  }
  if (reflection.getSignature?.type) yield reflection.getSignature.type
  if (reflection.setSignature) {
    if (reflection.setSignature.type) yield reflection.setSignature.type
    for (const param of reflection.setSignature.parameters ?? []) {
      if (param.type) yield param.type
    }
  }
  for (const t of reflection.extendedTypes ?? []) yield t
  for (const t of reflection.implementedTypes ?? []) yield t
  for (const sig of reflection.indexSignatures ?? []) {
    if (sig.type) yield sig.type
    for (const param of sig.parameters ?? []) if (param.type) yield param.type
  }
}

/**
 * True when `target` is itself one of core's own top-level exports (a
 * function, class, interface, type alias or variable declared directly in
 * the module, the only things generate-api.mjs ever writes a page for), as
 * opposed to a nested member or a type parameter that merely happens to
 * live somewhere inside core (`on<K extends keyof RiffleEventMap>`'s own
 * `K`, for instance, resolves to a real reflection whose top-level module
 * is core, but `K` is not an export and no page named `K` exists to link
 * to: `target.parent` for a top-level export is the module reflection
 * itself, which `K`'s is not, being nested inside the `on` signature).
 */
function isCoreTopLevelExport(target) {
  return target.parent?.name === 'core' && target.parent.kindOf(ReflectionKind.Module)
}

/**
 * TypeScript's own `Pick`/`Omit` utility types, as they show up in a
 * `ReferenceType`: unresolved within this project (`type.reflection` is
 * undefined for them, since they live in `typescript`'s own lib types, not
 * in core/react/vue), named `Pick`/`Omit`, with `package: 'typescript'`.
 */
function isPickOrOmit(type) {
  return type.package === 'typescript' && (type.name === 'Pick' || type.name === 'Omit')
}

/**
 * The literal string keys a `Pick<X, K>` / `Omit<X, K>` key argument names:
 * a single `'x'` literal, or a union of them. Anything else (a computed key
 * type, such as `keyof Y`) returns null, so the caller falls back to
 * visiting every member rather than silently narrowing to none of them.
 */
function literalKeyNames(type) {
  if (!type) return null
  if (type.type === 'literal' && typeof type.value === 'string') return [type.value]
  if (type.type === 'union') {
    const names = []
    for (const t of type.types ?? []) {
      if (t.type !== 'literal' || typeof t.value !== 'string') return null
      names.push(t.value)
    }
    return names
  }
  return null
}

/**
 * Every core symbol name an adapter package's (react's or vue's) public
 * export signatures reference, directly or transitively: a referenced
 * interface's own fields pulling in further core types counts too (core's
 * `RiffleOptions.layout` field is typed `LayoutStrategy`, so a page that
 * exists only to document `RiffleOptions` still needs `LayoutStrategy`
 * alongside it, or its own link to `LayoutStrategy` would be a page that
 * does not exist in that track).
 *
 * Walks TypeDoc's reflection graph itself, following every `ReferenceType`
 * (and every re-exported `ReferenceReflection`, e.g. react/vue's own `export
 * type { RiffleOptions } from '@rpxl/riffle'`) that resolves to a
 * reflection under the `core` module, rather than a hand-kept list: a field
 * added to a type this package already exports is picked up the next time
 * this runs, with no list to remember to update alongside it.
 *
 * A `Pick<AdapterHandle, 'instance' | 'subscribe' | ...>` (react's and vue's
 * own `RiffleHandle extends Pick<AdapterHandle, ...>`) is narrowed to only
 * the picked members (an `Omit<...>` to everything but the omitted ones),
 * rather than pulling in whatever every member of `AdapterHandle`
 * references: an unpicked member referencing some other core type must not
 * drag that type into the set just because it lives on the same interface.
 *
 * @param {import('typedoc').Reflection} pkgReflection the package's own
 *   top-level module reflection (e.g. `project.children.find((m) => m.name
 *   === 'react')`, after the core/react/vue rename)
 * @returns {Set<string>}
 */
export function coreTypesReferencedBy(pkgReflection) {
  const found = new Set()
  const visited = new Set()

  function visitType(type) {
    if (!type) return
    if (type.type === 'reference') {
      const target = type.reflection
      if (target && target !== pkgReflection) {
        if (isCoreTopLevelExport(target)) found.add(target.name)
        visitReflection(target)
      }
      if (!target && isPickOrOmit(type)) {
        const [objectArg, keysArg] = type.typeArguments ?? []
        const objectTarget = objectArg?.type === 'reference' ? objectArg.reflection : null
        const keyNames = literalKeyNames(keysArg)
        if (objectTarget && keyNames) {
          if (isCoreTopLevelExport(objectTarget)) found.add(objectTarget.name)
          visitPickedMembers(objectTarget, keyNames, type.name === 'Omit')
          return
        }
      }
      for (const nested of nestedTypes(type)) visitType(nested)
      return
    }
    if (type.type === 'reflection') {
      visitReflection(type.declaration)
      return
    }
    for (const nested of nestedTypes(type)) visitType(nested)
  }

  /** Visits only `reflection`'s members named in `keyNames` (or every member NOT named in it, for `Omit`), never the whole interface. */
  function visitPickedMembers(reflection, keyNames, isOmit) {
    const named = new Set(keyNames)
    for (const child of reflection.children ?? []) {
      if (named.has(child.name) === isOmit) continue
      visitReflection(child)
    }
  }

  function visitReflection(reflection) {
    if (!reflection || visited.has(reflection.id)) return
    visited.add(reflection.id)
    if (reflection.kindOf(ReflectionKind.Reference)) {
      const target = reflection.tryGetTargetReflectionDeep?.()
      if (target) {
        if (isCoreTopLevelExport(target)) found.add(target.name)
        visitReflection(target)
      }
      return
    }
    for (const type of ownTypes(reflection)) visitType(type)
    for (const child of reflection.children ?? []) visitReflection(child)
  }

  visitReflection(pkgReflection)
  return found
}

/**
 * typedoc-plugin-markdown headings read "Function: createRiffle()",
 * "Interface: RiffleOptions", "Type Alias: RiffleProps\<T\>": a kind
 * prefix the sidebar and page title do not need (the surrounding sidebar
 * group already says "Functions", "Interfaces", ...), and markdown-escaped
 * punctuation (`\_`, `\<`, `\>`) so the raw heading text does not get
 * misread as italics or an HTML tag when the *body* renders it as markdown.
 * A YAML frontmatter string is not markdown, so that escaping has no job
 * to do there and was rendering as a literal backslash in the title
 * ("DEFAULT\_ROTATION") before this unescaped it.
 */
const KIND_PREFIX_RE = /^(Function|Class|Interface|Type Alias|Variable|Enum|Namespace|Module):\s*/

function unescapeMarkdown(text) {
  return text.replace(/\\([\\`*_{}[\]()#+.!<>~|-])/g, '$1')
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (!match) return null
  return unescapeMarkdown(match[1].trim()).replace(KIND_PREFIX_RE, '')
}

function stripLeadingHeading(markdown) {
  return markdown.replace(/^#\s+.+\n+/, '')
}

/**
 * typedoc-plugin-markdown's own cross-reference links point at other
 * generated `.md` files by their literal, mixed-case, relative filename,
 * e.g. `../../core/interfaces/RiffleOptions.md#spring`: a valid relative
 * link between plain markdown files, but not the route Astro actually
 * serves that page at. Every page is served as a directory
 * (`/riffle/react/api/functions/useriffle/`), so a relative `../x` resolves
 * one level deeper than it did between the two files, and the link breaks.
 * The link validator cannot see this (errorOnRelativeLinks is off in
 * astro.config.mjs), which is why every one of these is rewritten here to
 * an absolute, base-prefixed URL instead: the target is resolved against
 * the linking page's own place in TypeDoc's output (`srcRel`), then mapped
 * into the track the page is being written for. The `.md` is stripped, a
 * `README` target becomes its directory's own index, and the path and any
 * fragment are lowercased, matching the lowercase slug Astro's content
 * collection derives from a filename and the lowercase id rehype derives
 * from a rendered heading's text. scripts/check-built-links.mjs then
 * crawls the built site for any link that still misses.
 *
 * @param {string} markdown a page body, as TypeDoc wrote it
 * @param {{ fw: (typeof FRAMEWORKS)[number], srcRel: string }} where the
 *   track the page is written into, and the page's own path inside
 *   TypeDoc's output, package directory first (`react/functions/useRiffle.md`)
 * @returns {string}
 */
export function rewriteInternalLinks(markdown, { fw, srcRel }) {
  return markdown.replace(/\]\(([^)\s]+?)\.md(#[^)]*)?\)/g, (whole, path, fragment = '') => {
    if (/^[a-z]+:/i.test(path) || path.startsWith('/')) return whole
    const target = posix.normalize(posix.join(posix.dirname(srcRel), path))
    const [pkg, ...rest] = target.split('/')
    const inPkg = rest.join('/').replace(/(^|\/)README$/i, '$1index')
    const url = pageUrl(apiPrefixFor(fw, pkg, srcRel), { relInPkg: `${inPkg}.md` })
    return `](${url}${fragment.toLowerCase()})`
  })
}

/**
 * The URL prefix (as `pageUrl` takes it) that package `pkg`'s pages live
 * under inside track `fw`: the track's own package directly under
 * `<fw>/api`, core (for react and vue) under `<fw>/api/core`. Any other
 * pairing (a React page linking to a Vue page) has no page in this track
 * to point at, so it fails the build rather than shipping a dead link.
 */
function apiPrefixFor(fw, pkg, srcRel) {
  if (pkg === TRACK_OWN_PACKAGE[fw]) return `${fw}/api`
  if (pkg === 'core' && ADAPTER_FRAMEWORKS.includes(fw)) return `${fw}/api/core`
  throw new Error(
    `generate-api: ${srcRel} links to a ${pkg} page, which the ${fw} track does not carry`,
  )
}

/** The TypeDoc package directory each track's own pages come from. */
const TRACK_OWN_PACKAGE = { vanilla: 'core', react: 'react', vue: 'vue' }

function walkFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walkFiles(full))
    else found.push(full)
  }
  return found
}

/**
 * One generated page, read once from TypeDoc's own output and reused for
 * every track that carries it (vanilla copies every core page; react and
 * vue each copy their own package's pages, plus whichever of these same
 * core page records `coreTypesReferencedBy` says they need). TypeDoc emits
 * one `README.md` per directory (the project root and each module);
 * Starlight, like most static-site content collections, routes a
 * directory's own page from `index.md`, not `README.md`, so every README is
 * renamed on the way in. The leading `# Heading` TypeDoc writes becomes the
 * frontmatter title instead, so the page is not titled twice. The body's
 * cross-links are left relative here and rewritten per track on the way
 * out (`renderTrackPage`), since the same core page lands in more than one
 * track, at a different URL in each.
 *
 * @param {string} srcFile absolute path to the file inside TypeDoc's own tmp output
 * @param {string} outRoot TypeDoc's own tmp output root
 * @param {string} pkg the file's package directory inside that output (`core`, `react`, `vue`)
 */
function readPage(srcFile, outRoot, pkg) {
  const rel = relative(join(outRoot, pkg), srcFile)
  const relInPkg = rel.replace(/(^|[\\/])README\.md$/, '$1index.md')
  const raw = readFileSync(srcFile, 'utf8')
  const title = extractTitle(raw) ?? relInPkg
  const body = stripLeadingHeading(raw).trim()
  const srcRel = relative(outRoot, srcFile).split(sep).join('/')
  const isIndex = relInPkg === 'index.md'
  return {
    relInPkg,
    srcRel,
    title,
    body,
    isIndex,
    symbolName: isIndex ? null : basename(relInPkg, '.md'),
  }
}

/**
 * The site-relative URL a page lands at once written to
 * `<contentDocsRoot>/<urlPrefix>/<relInPkg>`: lowercased and stripped of
 * `.md`, matching the lowercase slug Astro's content collection derives
 * from a filename, with an `index` basename dropped to its parent's own
 * trailing slash the way every other Starlight page's does.
 *
 * Base-prefixed (`/riffle/...`) by default: `ownPageUrl`/`corePageUrl` use
 * that form both as a literal `<a href>` in a landing page's own rendered
 * content (buildLandingPage) and as a redirect destination, and both need
 * the site's real base to resolve. The two `oldUrl` call sites below pass
 * `{ base: false }`: those values become the *source* key of a redirects
 * config entry (scripts/lib/redirects.mjs's `buildRedirects`), which,
 * exactly like every other old-URL key in that map (`/accessibility/`,
 * `/adapters/react/`, and so on), must be base-less. Astro's static
 * `redirects` option writes a redirect stub at that literal source path,
 * unprefixed; the `/riffle/` prefix that makes the final served URL is
 * added by GitHub Pages itself (a project site under the `riffle` repo),
 * not by anything in `dist/`. A base-prefixed source here would build a
 * stub at the wrong physical path (`dist/riffle/api/...` instead of
 * `dist/api/...`), one directory too deep for GitHub Pages to ever reach it
 * from the old, pre-track live URL a visitor might have bookmarked.
 */
export function pageUrl(urlPrefix, page, { base = true } = {}) {
  const withoutExt = page.relInPkg.replace(/\.md$/, '')
  const parts = `${urlPrefix}/${withoutExt}`.toLowerCase().split('/')
  if (parts.at(-1) === 'index') parts.pop()
  return base ? `/riffle/${parts.join('/')}/` : `/${parts.join('/')}/`
}

/**
 * A track's own package's pages: `<fw>/api/<relInPkg>`, no package segment
 * (the track's own package is implicit; there is only one). React's and
 * vue's referenced-core subset instead carries an explicit `core/` segment,
 * since it sits alongside that track's own package rather than being it.
 */
function ownPageUrl(fw, page) {
  return pageUrl(`${fw}/api`, page)
}

function corePageUrl(fw, page) {
  return pageUrl(`${fw}/api/core`, page)
}

/**
 * One API page as written into track `fw`: the same frontmatter shape
 * generate-tracks.mjs gives every track page, `framework: <fw>` (which
 * MarkdownContent.astro turns into the Pagefind filter the track-scoped
 * search depends on, so a page without it is invisible to that search) and
 * a document `<title>` naming the track ("useRiffle(): React | Riffle"), so
 * the three tracks' copies of a core page never share one title. A core
 * page inside the React or Vue track (`core: true`) is labelled "(core)" in
 * both its H1 and its document title ("Riffle (core): React | Riffle"), so
 * it never shares a title with the adapter's own export of the same name
 * (React's `Riffle` component). Vanilla's pages are core itself, so they
 * stay unlabelled. The body's cross-links are made absolute for this track
 * (`rewriteInternalLinks`).
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @param {{ title: string, body: string, srcRel: string }} page
 * @param {{ core?: boolean }} [options]
 * @returns {string}
 */
export function renderTrackPage(fw, page, { core = false } = {}) {
  const title = core ? coreTitle(page) : page.title
  const documentTitle = `${title}: ${TRACK_LABELS[fw]} | ${SITE_TITLE}`
  const frontmatter = [
    `title: ${JSON.stringify(title)}`,
    `framework: ${fw}`,
    'head:',
    '  - tag: title',
    `    content: ${JSON.stringify(documentTitle)}`,
  ].join('\n')
  const body = rewriteInternalLinks(page.body, { fw, srcRel: page.srcRel })
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

/** Writes `page` under `<contentRoot>/<fw>/api/<subdir>/<page.relInPkg>` (`subdir` is `''` for a track's own package, `'core'` for react's/vue's referenced-core subset). */
function writeTrackPage(contentRoot, fw, subdir, page) {
  const dest = join(contentRoot, fw, 'api', subdir, page.relInPkg)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, renderTrackPage(fw, page, { core: subdir === 'core' }))
}

/** A core page's title as the React and Vue tracks show it: "Riffle (core)". */
function coreTitle(page) {
  return `${page.title} (core)`
}

/** A markdown bullet list linking to every page in `pages`, each `- [title](url)`, one per line. */
function linkList(pages, urlFor, titleFor = (page) => page.title) {
  return pages.map((page) => `- [${titleFor(page)}](${urlFor(page)})`).join('\n')
}

/**
 * The `/<fw>/api/` landing page: a short intro, the track's own package's
 * exports grouped by kind (the same kinds astro.config.mjs's sidebar
 * splits into, `API_KINDS`), and, for react and vue, a further section
 * listing the core types their own public surface references
 * (`coreTypesReferencedBy`'s result), each linking into that track's own
 * `api/core/` subset. This page is authored here rather than being one of
 * TypeDoc's own generated pages: TypeDoc's own per-module README links
 * every export unconditionally, which for react's and vue's filtered core
 * subset would link out to core pages that track does not carry.
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @param {ReturnType<typeof readPage>[]} ownPages this track's own package's pages (no `isIndex` entries)
 * @param {ReturnType<typeof readPage>[]} corePages this track's referenced-core subset (empty for vanilla)
 */
function buildLandingPage(fw, ownPages, corePages) {
  const pkgName = TRACK_PACKAGE_NAMES[fw]
  const sections = [`Every public export of \`${pkgName}\`, generated from its own TSDoc.`]

  for (const kind of API_KINDS) {
    const pages = ownPages.filter((page) => page.relInPkg.startsWith(`${kind.dir}/`))
    if (pages.length === 0) continue
    sections.push(`## ${kind.label}\n\n${linkList(pages, (page) => ownPageUrl(fw, page))}`)
  }

  if (corePages.length > 0) {
    sections.push(
      `## Core types used by ${TRACK_LABELS[fw]}\n\n${linkList(
        corePages,
        (page) => corePageUrl(fw, page),
        coreTitle,
      )}`,
    )
  }

  const body = sections.join('\n\n')
  // `framework` for the same reason every other API page carries it (see
  // renderTrackPage); the title already names the track, so the default
  // "<title> | Riffle" document title is distinct without a `head` entry.
  const title = JSON.stringify(`${TRACK_LABELS[fw]} API reference`)
  return `---\ntitle: ${title}\nframework: ${fw}\n---\n\n${body}\n`
}

/**
 * Validates every export's TSDoc, then writes every track's API pages under
 * `contentRoot` and the old-to-new redirect map to `redirectsFile`. The
 * defaults are the real site's; generate-api.test.mjs points both at a
 * scratch directory instead. Returns every page path written, relative to
 * `contentRoot`, with forward slashes.
 *
 * @param {{ contentRoot?: string, redirectsFile?: string }} [options]
 * @returns {Promise<string[]>}
 */
export async function generateApi({
  contentRoot = contentDocsRoot,
  redirectsFile = redirectsPath,
} = {}) {
  failures.length = 0
  const written = []
  const tmpOut = mkdtempSync(join(tmpdir(), 'riffle-api-'))
  try {
    const app = await Application.bootstrapWithPlugins({ options: typedocOptions, out: tmpOut })
    const project = await app.convert()
    if (!project) {
      console.error('TypeDoc conversion failed; see the errors above.')
      process.exit(1)
    }

    for (const mod of project.children ?? []) {
      const label = MODULE_LABELS[mod.name]
      if (label) mod.name = label
      checkModule(mod)
    }

    if (failures.length > 0) {
      console.error(
        `API reference validation failed: ${failures.length} problem(s). Every exported symbol needs a ` +
          'TSDoc summary and an @example; every property or method an exported interface or class declares ' +
          'itself needs a summary.',
      )
      for (const failure of failures) console.error(`  ${failure}`)
      process.exit(1)
    }

    // Computed from the live, renamed project (module names are 'core',
    // 'react', 'vue' by this point), before generateOutputs ever writes a
    // file, since the closure only needs the reflection graph itself.
    const referencedCoreNames = Object.fromEntries(
      ADAPTER_FRAMEWORKS.map((fw) => {
        const mod = project.children?.find((m) => m.name === fw)
        return [fw, mod ? coreTypesReferencedBy(mod) : new Set()]
      }),
    )

    await app.generateOutputs(project)

    // Every generated page, read once and grouped by its own package
    // directory ('core' | 'react' | 'vue', the renamed module name TypeDoc
    // wrote it under). TypeDoc's own combined project root README (its
    // title defaulting to the nearest package.json it finds, this
    // monorepo's own "@rpxl/riffle-monorepo") is not useful as a page and
    // is dropped here rather than shipped as a stray, unlabeled entry.
    const pagesByPackage = { core: [], react: [], vue: [] }
    for (const file of walkFiles(tmpOut)) {
      if (!file.endsWith('.md')) continue
      const rel = relative(tmpOut, file)
      if (rel === 'README.md') continue
      const [pkg] = rel.split(sep)
      if (!(pkg in pagesByPackage)) continue
      pagesByPackage[pkg].push(readPage(file, tmpOut, pkg))
    }
    for (const pkg of Object.keys(pagesByPackage)) {
      pagesByPackage[pkg].sort((a, b) => a.relInPkg.localeCompare(b.relInPkg))
    }

    for (const fw of FRAMEWORKS) {
      rmSync(join(contentRoot, fw, 'api'), { recursive: true, force: true })
    }

    // The exact old (pre-track, flat `/api/<pkg>/...`) URL every page used
    // to have, mapped to where that same content lives now, for a later
    // redirect layer to consume. A core page's old URL always redirects to
    // vanilla's own copy, never to react's or vue's core subset: vanilla is
    // the only track guaranteed to carry every core page (react and vue
    // each carry only the subset their own public surface references), so
    // it is the one target that always exists. A package's own old module
    // index (`/api/<pkg>/`) redirects to that track's new landing page,
    // which replaces it (see buildLandingPage).
    const redirects = {}
    let pageCount = 0

    // Every track's own package's pages (minus TypeDoc's own module index,
    // dropped everywhere in favour of the authored landing page below), and
    // react's and vue's referenced-core subset, collected while writing so
    // the landing pages can list them without a second TypeDoc-output walk.
    const ownPagesByTrack = { vanilla: [], react: [], vue: [] }
    const corePagesByTrack = { react: [], vue: [] }

    for (const page of pagesByPackage.core) {
      const oldUrl = pageUrl('api/core', page, { base: false })
      if (page.isIndex) {
        redirects[oldUrl] = '/riffle/vanilla/api/'
        continue
      }
      writeTrackPage(contentRoot, 'vanilla', '', page)
      written.push(`vanilla/api/${page.relInPkg}`)
      ownPagesByTrack.vanilla.push(page)
      redirects[oldUrl] = ownPageUrl('vanilla', page)
      pageCount += 1
    }

    for (const fw of ADAPTER_FRAMEWORKS) {
      for (const page of pagesByPackage[fw]) {
        const oldUrl = pageUrl(`api/${fw}`, page, { base: false })
        if (page.isIndex) {
          redirects[oldUrl] = `/riffle/${fw}/api/`
          continue
        }
        writeTrackPage(contentRoot, fw, '', page)
        written.push(`${fw}/api/${page.relInPkg}`)
        ownPagesByTrack[fw].push(page)
        redirects[oldUrl] = ownPageUrl(fw, page)
        pageCount += 1
      }
      // Core's own module index (a table linking every core export) is
      // dropped from this filtered subset rather than carried across: most
      // of what it links to is exactly what this track does not carry, so
      // keeping it would only ship a page whose own links do not resolve.
      const wanted = referencedCoreNames[fw]
      for (const page of pagesByPackage.core) {
        if (page.isIndex || !wanted.has(page.symbolName)) continue
        writeTrackPage(contentRoot, fw, 'core', page)
        written.push(`${fw}/api/core/${page.relInPkg}`)
        corePagesByTrack[fw].push(page)
        pageCount += 1
      }
    }

    for (const fw of FRAMEWORKS) {
      const dest = join(contentRoot, fw, 'api', 'index.md')
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buildLandingPage(fw, ownPagesByTrack[fw], corePagesByTrack[fw] ?? []))
      written.push(`${fw}/api/index.md`)
      pageCount += 1
    }

    mkdirSync(dirname(redirectsFile), { recursive: true })
    writeFileSync(redirectsFile, `${JSON.stringify(redirects, null, 2)}\n`)

    console.log(
      `API reference generated: ${pageCount} page(s) across ${FRAMEWORKS.join(', ')}, ` +
        `${Object.keys(redirects).length} redirect(s) recorded, 0 validation problems.`,
    )
    return written
  } finally {
    rmSync(tmpOut, { recursive: true, force: true })
  }
}

// Run only when invoked directly (`node scripts/generate-api.mjs`), never on
// import: generate-api.test.mjs imports this module's helpers, and must not
// rewrite the real site's content directory as a side effect of doing so.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateApi()
}
