import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { Application, ReflectionKind } from 'typedoc'
import {
  coreTypesReferencedBy,
  generateApi,
  pageUrl,
  renderTrackPage,
  rewriteInternalLinks,
} from './generate-api.mjs'
import { FRAMEWORKS, TRACK_LABELS } from './lib/tracks.mjs'

/**
 * Run with `node --test scripts/generate-api.test.mjs` (from apps/docs).
 * Wired into check:api, alongside the other script tests.
 *
 * The first group of tests converts the real packages with TypeDoc once
 * (the same `typedoc.json` generate-api.mjs itself uses) rather than a
 * hand-built fake reflection tree: `coreTypesReferencedBy` walks TypeDoc's
 * own reflection/type graph, and a fake tree built by hand could shape that
 * graph exactly the way the function expects it, passing for reasons that
 * have nothing to do with whether the function is actually right about the
 * live packages. The last group (Pick/Omit narrowing) uses a synthetic
 * reflection fixture instead, on purpose: narrowing a `Pick<X, 'a'>` down
 * to member `a` alone is easiest to prove correct against a type with a
 * second, unrelated member that must NOT be pulled in, and nothing in the
 * real packages happens to shape that exactly.
 */

const docsRoot = fileURLToPath(new URL('.', import.meta.url)).replace(/scripts\/?$/, '')
const typedocOptions = join(docsRoot, 'typedoc.json')

/** @type {import('typedoc').ProjectReflection} */
let project
let tmpOut

before(async () => {
  tmpOut = mkdtempSync(join(tmpdir(), 'riffle-api-test-'))
  const app = await Application.bootstrapWithPlugins({ options: typedocOptions, out: tmpOut })
  project = await app.convert()
  assert.ok(project, 'TypeDoc conversion failed; fix the source before trusting this test')
  // generateApi() renames each module from its TypeDoc-assigned 'index' etc. to
  // the plain package name before calling coreTypesReferencedBy; mirrored
  // here so the function sees the same module names it does in the real run
  // (see generate-api.mjs's own MODULE_LABELS doc comment for why 'index').
  const MODULE_LABELS = { index: 'core', react: 'react', vue: 'vue' }
  for (const mod of project.children ?? []) {
    const label = MODULE_LABELS[mod.name]
    if (label) mod.name = label
  }
})

after(() => {
  rmSync(tmpOut, { recursive: true, force: true })
})

function moduleNamed(name) {
  const mod = project.children?.find((m) => m.name === name)
  assert.ok(mod, `no '${name}' module in the converted project`)
  return mod
}

test('react: includes the required minimum core types', () => {
  const found = coreTypesReferencedBy(moduleNamed('react'))
  for (const name of [
    'RiffleOptions',
    'RiffleSnapshot',
    'Riffle',
    'RiffleEventMap',
    'LayoutStrategy',
    'AdapterHandle',
  ]) {
    assert.ok(
      found.has(name),
      `expected react's referenced core types to include ${name}, got: ${[...found]}`,
    )
  }
})

test('react: excludes a core export nothing in its signatures references', () => {
  const found = coreTypesReferencedBy(moduleNamed('react'))
  // `wrap()` is a plain exported function from core's math/wrap.ts; nothing
  // in react's own exported functions, interfaces or type aliases mentions
  // it in a type position (react only calls createAdapterHandle, whose
  // return type is AdapterHandle, and never touches wrap's type at all).
  assert.ok(!found.has('wrap'), `expected 'wrap' to be excluded, got: ${[...found]}`)
  // Precondition: 'wrap' really is one of core's own exports, so this
  // exclusion is meaningful rather than a typo that could never have passed.
  const core = moduleNamed('core')
  assert.ok(
    core.children?.some((c) => c.name === 'wrap'),
    "precondition failed: core does not export 'wrap'",
  )
})

test('react: excludes an unreferenced type even when added to the expected set (break-it target)', () => {
  const found = coreTypesReferencedBy(moduleNamed('react'))
  // RiffleError is core's exported error class; nothing in react's own
  // exported signatures throws or types against it. Asserting it is present
  // here, the way the two tests above assert their expectations, is the
  // shape this test's own break-it proof flips: change the assertion below
  // from `!found.has` to `found.has` and the test starts failing, because
  // the implementation correctly leaves RiffleError out.
  assert.ok(!found.has('RiffleError'), `expected 'RiffleError' to be excluded, got: ${[...found]}`)
})

test('vue: includes the same required set as react (both wrap RiffleOptions the same way)', () => {
  const found = coreTypesReferencedBy(moduleNamed('vue'))
  for (const name of [
    'RiffleOptions',
    'RiffleSnapshot',
    'Riffle',
    'RiffleEventMap',
    'LayoutStrategy',
    'AdapterHandle',
  ]) {
    assert.ok(
      found.has(name),
      `expected vue's referenced core types to include ${name}, got: ${[...found]}`,
    )
  }
})

test('every name returned actually names a core export, never a react/vue-only symbol', () => {
  const core = moduleNamed('core')
  const coreNames = new Set((core.children ?? []).map((c) => c.name))
  for (const pkg of ['react', 'vue']) {
    const found = coreTypesReferencedBy(moduleNamed(pkg))
    assert.ok(found.size > 0, `expected ${pkg} to reference at least one core type`)
    for (const name of found) {
      assert.ok(coreNames.has(name), `${pkg} referenced '${name}', which core does not export`)
    }
  }
})

test("react: reaches AdapterHandle only through RiffleHandle's `extends Pick<AdapterHandle, ...>` heritage clause", () => {
  // React's RiffleHandle never mentions AdapterHandle in a parameter or
  // return type; the only path to it is `ownTypes`' extendedTypes walk
  // (interface heritage), which is how `extends Pick<AdapterHandle, ...>`
  // is represented in TypeDoc's reflection graph. If that walk were ever
  // disabled, this is the one thing left that would still exercise it: the
  // other required-set tests above pass through RiffleOptions (a plain
  // parameter type), never through a heritage clause at all.
  const react = moduleNamed('react')
  const riffleHandle = react.children?.find((c) => c.name === 'RiffleHandle')
  assert.ok(riffleHandle, 'precondition failed: react does not export RiffleHandle')
  assert.ok(
    (riffleHandle.extendedTypes?.length ?? 0) > 0,
    'precondition failed: RiffleHandle has no extendedTypes (heritage clause) to walk',
  )
  const found = coreTypesReferencedBy(react)
  assert.ok(found.has('AdapterHandle'), `expected AdapterHandle to be found, got: ${[...found]}`)
})

// --- Pick/Omit narrowing, against a synthetic reflection fixture ---------

/**
 * The minimal shape `coreTypesReferencedBy` (and the `ownTypes`/`nestedTypes`
 * helpers it calls) reads off a reflection: `id`, `name`, `parent`,
 * `children`, `kindOf`, and, for a function, `signatures`.
 */
function fakeReflection({ id, name, kind, parent = undefined, children = [], signatures = [] }) {
  return {
    id,
    name,
    parent,
    children,
    signatures,
    kindOf(k) {
      return k === kind
    },
  }
}

/**
 * A fake project shaped like the real one just enough to exercise Pick/Omit
 * narrowing in isolation: a `core` module with an interface,
 * `FakeAdapterHandle`, with two members, `kept` (typed `KeptCoreType`) and
 * `dropped` (typed `DroppedCoreType`); and an `adapter` module (standing in
 * for react/vue) with one function whose parameter is typed
 * `Pick<FakeAdapterHandle, 'kept'>` (or `Omit<FakeAdapterHandle, 'kept'>`
 * for the Omit variant). Narrowing done correctly, `coreTypesReferencedBy`
 * on the `adapter` module finds `FakeAdapterHandle` and `KeptCoreType`, but
 * never `DroppedCoreType`, since only `kept`'s own type was ever walked.
 */
function buildPickFixture(utilityName, key) {
  const core = fakeReflection({ id: 1, name: 'core', kind: ReflectionKind.Module })
  const keptType = fakeReflection({
    id: 2,
    name: 'KeptCoreType',
    kind: ReflectionKind.Interface,
    parent: core,
  })
  const droppedType = fakeReflection({
    id: 3,
    name: 'DroppedCoreType',
    kind: ReflectionKind.Interface,
    parent: core,
  })
  const adapterHandle = fakeReflection({
    id: 4,
    name: 'FakeAdapterHandle',
    kind: ReflectionKind.Interface,
    parent: core,
  })
  const keptMember = fakeReflection({
    id: 5,
    name: 'kept',
    kind: ReflectionKind.Property,
    parent: adapterHandle,
  })
  keptMember.type = {
    type: 'reference',
    reflection: keptType,
    name: 'KeptCoreType',
    typeArguments: [],
  }
  const droppedMember = fakeReflection({
    id: 6,
    name: 'dropped',
    kind: ReflectionKind.Property,
    parent: adapterHandle,
  })
  droppedMember.type = {
    type: 'reference',
    reflection: droppedType,
    name: 'DroppedCoreType',
    typeArguments: [],
  }
  adapterHandle.children = [keptMember, droppedMember]
  core.children = [keptType, droppedType, adapterHandle]

  const adapterModule = fakeReflection({ id: 10, name: 'adapter', kind: ReflectionKind.Module })
  const useSomething = fakeReflection({
    id: 11,
    name: 'useSomething',
    kind: ReflectionKind.Function,
    parent: adapterModule,
  })
  useSomething.signatures = [
    {
      parameters: [
        {
          type: {
            type: 'reference',
            reflection: undefined, // Pick/Omit are TypeScript lib types, never resolved in-project
            name: utilityName,
            package: 'typescript',
            typeArguments: [
              {
                type: 'reference',
                reflection: adapterHandle,
                name: 'FakeAdapterHandle',
                typeArguments: [],
              },
              { type: 'literal', value: key },
            ],
          },
        },
      ],
    },
  ]
  adapterModule.children = [useSomething]
  return adapterModule
}

test("Pick<FakeAdapterHandle, 'kept'> reaches the kept member's type, not the dropped member's", () => {
  const found = coreTypesReferencedBy(buildPickFixture('Pick', 'kept'))
  assert.ok(found.has('FakeAdapterHandle'), `expected FakeAdapterHandle, got: ${[...found]}`)
  assert.ok(found.has('KeptCoreType'), `expected KeptCoreType, got: ${[...found]}`)
  assert.ok(!found.has('DroppedCoreType'), `expected DroppedCoreType excluded, got: ${[...found]}`)
})

test("Omit<FakeAdapterHandle, 'kept'> reaches the OTHER member's type (the one not named)", () => {
  const found = coreTypesReferencedBy(buildPickFixture('Omit', 'kept'))
  assert.ok(found.has('FakeAdapterHandle'), `expected FakeAdapterHandle, got: ${[...found]}`)
  assert.ok(found.has('DroppedCoreType'), `expected DroppedCoreType, got: ${[...found]}`)
  assert.ok(!found.has('KeptCoreType'), `expected KeptCoreType excluded, got: ${[...found]}`)
})

// pageUrl's `{ base }` option: the two `oldUrl` call sites in generateApi() (the
// old, pre-track API redirect source keys) must produce a base-less path,
// or the built site's stray `dist/riffle/api/...` directory comes back (one
// directory too deep for GitHub Pages, which adds the `/riffle/` prefix
// itself; see the doc comment on pageUrl). ownPageUrl/corePageUrl, which
// double as landing-page link hrefs, keep the default `base: true`.
test('pageUrl defaults to a base-prefixed URL', () => {
  const page = { relInPkg: 'functions/createRiffle.md' }
  assert.equal(pageUrl('api/core', page), '/riffle/api/core/functions/createriffle/')
})

test('pageUrl with { base: false } drops the /riffle prefix, for an old-URL redirect source key', () => {
  const page = { relInPkg: 'functions/createRiffle.md' }
  assert.equal(pageUrl('api/core', page, { base: false }), '/api/core/functions/createriffle/')
})

// --- Generated pages: framework, document title, absolute links ----------

/**
 * One real generateApi() run into a scratch directory (never the site's own
 * content directory), shared by the tests below: every page it writes is
 * read back as it would reach Astro.
 */
let generatedRoot
let generatedPages

function walk(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

describe('generated API pages', () => {
  before(async () => {
    generatedRoot = mkdtempSync(join(tmpdir(), 'riffle-api-pages-'))
    const written = await generateApi({
      contentRoot: generatedRoot,
      redirectsFile: join(generatedRoot, 'redirects.json'),
    })
    generatedPages = walk(generatedRoot)
      .filter((file) => file.endsWith('.md'))
      .map((file) => ({
        rel: relative(generatedRoot, file).split(sep).join('/'),
        text: readFileSync(file, 'utf8'),
      }))
    // Precondition for every test below: a real, full set of pages, in all
    // three tracks, landing pages included.
    assert.equal(generatedPages.length, written.length)
    assert.ok(generatedPages.length > 40, `expected 40+ API pages, got ${generatedPages.length}`)
    for (const fw of FRAMEWORKS) {
      assert.ok(
        generatedPages.some((page) => page.rel === `${fw}/api/index.md`),
        `no ${fw}/api/index.md`,
      )
    }
  })

  test("every generated API page carries its own track's framework, the search filter's facet", () => {
    assert.ok(generatedPages?.length, 'precondition failed: generateApi wrote nothing')
    for (const page of generatedPages) {
      const fw = page.rel.split('/')[0]
      const frontmatter = page.text.split('\n---\n')[0]
      assert.match(
        frontmatter,
        new RegExp(`^framework: ${fw}$`, 'm'),
        `${page.rel} has no \`framework: ${fw}\` in its frontmatter`,
      )
    }
  })

  test('every symbol page names its track in its document title, so no two tracks share one', () => {
    assert.ok(generatedPages?.length, 'precondition failed: generateApi wrote nothing')
    // Keyed by symbol name: the same core page in several tracks (vanilla's
    // RiffleOptions, react's, vue's) must carry a different title in each.
    const titlesBySymbol = new Map()
    for (const page of generatedPages) {
      if (page.rel.endsWith('/api/index.md')) continue
      const fw = page.rel.split('/')[0]
      const match = page.text.match(/^ {4}content: (".*")$/m)
      assert.ok(match, `${page.rel} has no head <title> entry`)
      const documentTitle = JSON.parse(match[1])
      assert.ok(
        documentTitle.endsWith(`: ${TRACK_LABELS[fw]} | Riffle`),
        `${page.rel}: document title "${documentTitle}" does not name the ${fw} track`,
      )
      const symbol = page.rel.replace(/^[^/]+\/api\/(core\/)?/, '')
      const titles = titlesBySymbol.get(symbol) ?? []
      assert.ok(!titles.includes(documentTitle), `${page.rel} repeats "${documentTitle}"`)
      titlesBySymbol.set(symbol, [...titles, documentTitle])
    }
    // Precondition: RiffleOptions really is carried by all three tracks.
    assert.equal(titlesBySymbol.get('interfaces/RiffleOptions.md')?.length, 3)
  })

  test('within a track, no two pages share a document title or an H1; adapter tracks label core pages', () => {
    assert.ok(generatedPages?.length, 'precondition failed: generateApi wrote nothing')
    const seenByTrack = new Map()
    for (const page of generatedPages) {
      if (page.rel.endsWith('/api/index.md')) continue
      const [fw] = page.rel.split('/')
      const documentTitle = JSON.parse(page.text.match(/^ {4}content: (".*")$/m)[1])
      const h1 = JSON.parse(page.text.match(/^title: (".*")$/m)[1])
      const isAdapterCore = page.rel.startsWith(`${fw}/api/core/`)
      assert.equal(
        h1.endsWith(' (core)'),
        isAdapterCore,
        `${page.rel}: H1 "${h1}" should ${isAdapterCore ? '' : 'not '}carry "(core)"`,
      )
      const seen = seenByTrack.get(fw) ?? new Map()
      for (const title of [documentTitle, `h1:${h1}`]) {
        assert.ok(!seen.has(title), `${page.rel} and ${seen.get(title)} share "${title}"`)
        seen.set(title, page.rel)
      }
      seenByTrack.set(fw, seen)
    }
    // Precondition: the collision this guards against is really there to
    // collide: React's own Riffle component and core's Riffle interface.
    const react = generatedPages.map((page) => page.rel)
    assert.ok(react.includes('react/api/variables/Riffle.md'))
    assert.ok(react.includes('react/api/core/interfaces/Riffle.md'))
  })

  test("the React and Vue API landings label their core types (core); vanilla's does not", () => {
    const landing = (fw) => generatedPages.find((page) => page.rel === `${fw}/api/index.md`).text
    for (const fw of ['react', 'vue']) {
      const core = landing(fw).split('## Core types used by')[1]
      assert.ok(core, `${fw} landing has no core types section`)
      const items = core.split('\n').filter((line) => line.startsWith('- ['))
      assert.ok(items.length > 0, `${fw}: no core type links`)
      for (const item of items) assert.match(item, /^- \[[^\]]+ \(core\)\]\(/, `${fw}: ${item}`)
    }
    assert.doesNotMatch(landing('vanilla'), /\(core\)/)
  })

  test("every cross-link in a generated page is absolute and stays inside the page's own track", () => {
    assert.ok(generatedPages?.length, 'precondition failed: generateApi wrote nothing')
    let checked = 0
    for (const page of generatedPages) {
      const fw = page.rel.split('/')[0]
      for (const [, href] of page.text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^https?:/.test(href)) continue
        checked += 1
        assert.ok(
          href.startsWith(`/riffle/${fw}/api/`),
          `${page.rel} links to "${href}", not an absolute /riffle/${fw}/api/ URL`,
        )
        assert.ok(!href.includes('.md'), `${page.rel} links to a raw .md file: "${href}"`)
      }
    }
    // Precondition: the generated pages really do cross-link (RiffleOptions
    // to SpringConfig, useRiffle to RiffleHandle, ...), so this walked real links.
    assert.ok(checked > 100, `expected 100+ internal links, saw ${checked}`)
  })
})

test('rewriteInternalLinks resolves a relative TypeDoc link against the page it sits in', () => {
  const md =
    '[`RiffleHandle`](../interfaces/RiffleHandle.md) and [`x`](../../core/interfaces/RiffleOptions.md#Spring)'
  assert.equal(
    rewriteInternalLinks(md, { fw: 'react', srcRel: 'react/functions/useRiffle.md' }),
    '[`RiffleHandle`](/riffle/react/api/interfaces/rifflehandle/) and ' +
      '[`x`](/riffle/react/api/core/interfaces/riffleoptions/#spring)',
  )
  // The same core page, written into vanilla, links within vanilla's own
  // (flat) core pages instead.
  assert.equal(
    rewriteInternalLinks('[a](../type-aliases/Axis.md)', {
      fw: 'vanilla',
      srcRel: 'core/interfaces/RiffleOptions.md',
    }),
    '[a](/riffle/vanilla/api/type-aliases/axis/)',
  )
  assert.equal(
    rewriteInternalLinks('[a](../type-aliases/Axis.md)', {
      fw: 'vue',
      srcRel: 'core/interfaces/RiffleOptions.md',
    }),
    '[a](/riffle/vue/api/core/type-aliases/axis/)',
  )
})

test('rewriteInternalLinks refuses a link into a package the track does not carry', () => {
  assert.throws(
    () =>
      rewriteInternalLinks('[a](../../vue/functions/useRiffle.md)', {
        fw: 'react',
        srcRel: 'react/functions/useRiffle.md',
      }),
    /does not carry/,
  )
})

test('renderTrackPage writes framework and a track-labelled document title', () => {
  const out = renderTrackPage('vue', {
    title: 'useRiffle()',
    body: 'Body.',
    srcRel: 'vue/functions/useRiffle.md',
  })
  assert.match(out, /^framework: vue$/m)
  assert.match(out, /^ {4}content: "useRiffle\(\): Vue \| Riffle"$/m)
  assert.match(out, /^title: "useRiffle\(\)"$/m)
})

after(() => {
  if (generatedRoot) rmSync(generatedRoot, { recursive: true, force: true })
})

test('renderTrackPage labels a core page (core) in an adapter track, in both titles', () => {
  const page = { title: 'Riffle', body: 'Body.', srcRel: 'core/interfaces/Riffle.md' }
  const out = renderTrackPage('react', page, { core: true })
  assert.match(out, /^title: "Riffle \(core\)"$/m)
  assert.match(out, /^ {4}content: "Riffle \(core\): React \| Riffle"$/m)
  // Vanilla's own pages are core itself, so they stay unlabelled.
  assert.match(renderTrackPage('vanilla', page), /^title: "Riffle"$/m)
})
