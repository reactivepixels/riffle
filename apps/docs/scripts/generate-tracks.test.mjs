import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { generateTrack, writeTracks } from './generate-tracks.mjs'
import {
  FRAMEWORK_STORAGE_KEY,
  FRAMEWORKS,
  chooseTarget,
  isFramework,
  switchTarget,
  trackPath,
} from './lib/tracks.mjs'

/**
 * Run with `node --test scripts/generate-tracks.test.mjs` (from apps/docs).
 * Wired into check:api, alongside the other script tests.
 */

const PLAIN =
  '---\ntitle: Overview\ndescription: A page.\n---\n\nimport X from "y"\n\n# Body\n\nText.\n'
const VUE_ONLY = '---\ntitle: Migration\nonly: [vue]\n---\n\nVue only body.\n'

function body(text) {
  return text.slice(text.indexOf('\n---\n', 4) + '\n---\n'.length)
}

test('a template without `only` yields a page for every framework, each tagged with it', () => {
  const outputs = FRAMEWORKS.map((fw) => generateTrack(PLAIN, fw))
  assert.equal(outputs.length, 3)
  FRAMEWORKS.forEach((fw, i) => {
    const out = outputs[i]
    assert.notEqual(out, null, `${fw} produced no page`)
    const frontmatter = out.slice(0, out.indexOf('\n---\n', 4))
    assert.match(frontmatter, new RegExp(`^framework: ${fw}$`, 'm'))
    // Exactly one framework line, and never another track's.
    assert.equal(frontmatter.match(/^framework:/gm)?.length, 1)
    // The original frontmatter survives.
    assert.match(frontmatter, /^title: Overview$/m)
  })
})

test('`only: [vue]` yields a page for vue and nothing for the other tracks', () => {
  assert.equal(generateTrack(VUE_ONLY, 'vanilla'), null)
  assert.equal(generateTrack(VUE_ONLY, 'react'), null)
  const vue = generateTrack(VUE_ONLY, 'vue')
  assert.notEqual(vue, null)
  assert.match(vue, /^framework: vue$/m)
})

test('`only` accepts several frameworks', () => {
  const text = '---\ntitle: T\nonly: [react, vue]\n---\n\nB\n'
  assert.equal(generateTrack(text, 'vanilla'), null)
  assert.notEqual(generateTrack(text, 'react'), null)
  assert.notEqual(generateTrack(text, 'vue'), null)
})

test('the body after the frontmatter is byte-identical to the template', () => {
  for (const fw of FRAMEWORKS) {
    const out = generateTrack(PLAIN, fw)
    assert.equal(body(out), body(PLAIN))
  }
  // And the frontmatter only gains the framework line and the title head entry.
  const out = generateTrack(PLAIN, 'react')
  const added = 'framework: react\nhead:\n  - tag: title\n    content: "Overview: React | Riffle"\n'
  assert.ok(out.includes(added), 'the added frontmatter lines are missing')
  assert.equal(out.replace(added, ''), PLAIN)
})

test("each track's document title names the track, while the page title (the H1) stays neutral", () => {
  const titles = FRAMEWORKS.map((fw) => {
    const out = generateTrack(PLAIN, fw)
    const frontmatter = out.slice(0, out.indexOf('\n---\n', 4))
    // The H1 comes from `title`, which is untouched.
    assert.match(frontmatter, /^title: Overview$/m)
    const match = frontmatter.match(/^head:\n {2}- tag: title\n {4}content: (.+)$/m)
    assert.ok(match, `${fw} has no <title> head entry`)
    return JSON.parse(match[1])
  })
  assert.deepEqual(titles, [
    'Overview: Vanilla JS | Riffle',
    'Overview: React | Riffle',
    'Overview: Vue | Riffle',
  ])
  // A quoted title with a colon survives, unquoted and then safely re-quoted.
  const quoted = generateTrack('---\ntitle: "Layout: overflow"\n---\n\nB\n', 'vue')
  assert.match(quoted, /^ {4}content: "Layout: overflow: Vue \| Riffle"$/m)
})

test('rejects a template with no title, or with its own `head`', () => {
  assert.throws(() => generateTrack('---\ndescription: D\n---\n\nB\n', 'react'), /title/)
  assert.throws(
    () => generateTrack('---\ntitle: T\nhead:\n  - tag: meta\n---\n\nB\n', 'react'),
    /head/,
  )
})

const WITH_ONLY = [
  '---',
  'title: T',
  '---',
  '',
  'Shared intro.',
  '',
  '<Only fw="vue">',
  '',
  '## Vue heading',
  '',
  'Vue text.',
  '',
  '</Only>',
  '',
  '<Only fw="react, vue">',
  '',
  '## Adapter heading',
  '',
  '</Only>',
  '',
  'Inline <Only fw="react">react words</Only> stay for the component to handle.',
  '',
  'Shared outro.',
  '',
].join('\n')

test("an `<Only>` block is removed from every other track's page, headings included", () => {
  const vanilla = generateTrack(WITH_ONLY, 'vanilla')
  const react = generateTrack(WITH_ONLY, 'react')
  const vue = generateTrack(WITH_ONLY, 'vue')
  // Precondition: the shared text is in every track.
  for (const out of [vanilla, react, vue]) {
    assert.match(out, /Shared intro\./)
    assert.match(out, /Shared outro\./)
    // An inline <Only> is not a block: it is left for the component.
    assert.match(out, /Inline <Only fw="react">react words<\/Only>/)
  }
  assert.doesNotMatch(vanilla, /Vue heading|Vue text|Adapter heading/)
  assert.doesNotMatch(react, /Vue heading|Vue text/)
  assert.match(react, /## Adapter heading/)
  assert.match(vue, /## Vue heading/)
  assert.match(vue, /## Adapter heading/)
  // A kept block keeps its wrapper, so <Only> still guards it at render time.
  assert.match(vue, /<Only fw="vue">\n\n## Vue heading/)
})

test('rejects an unterminated, nested or stray `<Only>` block, or an unknown framework in one', () => {
  const page = (body) => `---\ntitle: T\n---\n\n${body}\n`
  assert.throws(() => generateTrack(page('<Only fw="vue">\n\nText'), 'react'), /unterminated/i)
  assert.throws(
    () => generateTrack(page('<Only fw="vue">\n<Only fw="react">\n</Only>\n</Only>'), 'react'),
    /nested/i,
  )
  assert.throws(() => generateTrack(page('Text\n</Only>'), 'react'), /without an opening/i)
  assert.throws(() => generateTrack(page('<Only fw="svelte">\n</Only>'), 'react'), /svelte/)
})

test('an `<Only>` line inside a code fence is left alone', () => {
  const text = '---\ntitle: T\n---\n\n```sh\n<Only fw="vue">\n```\n'
  assert.match(generateTrack(text, 'react'), /```sh\n<Only fw="vue">\n```/)
})

test('rejects a template with no frontmatter, an unknown `only` entry, or its own framework', () => {
  assert.throws(() => generateTrack('# No frontmatter\n', 'react'), /frontmatter/)
  assert.throws(() => generateTrack('---\ntitle: T\nonly: [svelte]\n---\n', 'react'), /svelte/)
  assert.throws(() => generateTrack('---\ntitle: T\nonly: vue\n---\n', 'react'), /only/)
  assert.throws(() => generateTrack('---\ntitle: T\nframework: react\n---\n', 'react'), /framework/)
})

test('trackPath has a leading and trailing slash and no base', () => {
  assert.equal(trackPath('react', 'recipes/infinite-feed'), '/react/recipes/infinite-feed/')
  assert.equal(trackPath('vue', ''), '/vue/')
  assert.equal(trackPath('vanilla', '/guides/concepts/'), '/vanilla/guides/concepts/')
})

test('writeTracks writes every template for every framework, minus `only` exclusions', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracks-'))
  try {
    const templates = join(root, 'templates')
    const out = join(root, 'out')
    mkdirSync(join(templates, 'guides'), { recursive: true })
    writeFileSync(join(templates, 'index.mdx'), PLAIN)
    writeFileSync(join(templates, 'guides', 'concepts.mdx'), PLAIN)
    writeFileSync(join(templates, 'migration.mdx'), VUE_ONLY)
    // A stale page from an earlier run, for a template that no longer exists.
    mkdirSync(join(out, 'react'), { recursive: true })
    writeFileSync(join(out, 'react', 'removed.mdx'), PLAIN)
    assert.ok(existsSync(join(out, 'react', 'removed.mdx')))

    const written = writeTracks({ templatesDir: templates, outRoot: out })

    const expected = [
      ...FRAMEWORKS.flatMap((fw) => [`${fw}/guides/concepts.mdx`, `${fw}/index.mdx`]),
      'vue/migration.mdx',
    ].sort()
    assert.deepEqual([...written].sort(), expected)
    for (const path of expected) assert.ok(existsSync(join(out, path)), `${path} missing on disk`)
    assert.ok(!existsSync(join(out, 'react', 'migration.mdx')))
    assert.ok(!existsSync(join(out, 'react', 'removed.mdx')), 'a stale page survived regeneration')
    assert.match(readFileSync(join(out, 'vue', 'guides', 'concepts.mdx'), 'utf8'), /framework: vue/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('switchTarget lands on the same page in another track, or on its overview when missing', () => {
  const ids = new Set([
    'react',
    'vue',
    'vanilla',
    'react/guides/concepts',
    'vue/guides/concepts',
    'vue/migration',
  ])
  // Precondition: the page exists in the source and the target track.
  assert.ok(ids.has('react/guides/concepts') && ids.has('vue/guides/concepts'))
  assert.equal(switchTarget('react/guides/concepts', 'vue', ids), '/vue/guides/concepts/')
  assert.equal(switchTarget('react', 'vue', ids), '/vue/')
  // Missing in the target track: that track's overview.
  assert.ok(!ids.has('vanilla/guides/concepts'))
  assert.equal(switchTarget('react/guides/concepts', 'vanilla', ids), '/vanilla/')
  assert.equal(switchTarget('vue/migration', 'react', ids), '/react/')
  // Not a track page: the overview.
  assert.equal(switchTarget('gestures', 'react', ids), '/react/')
})

test('chooseTarget lands on the requested slug in a track, or that track overview when missing', () => {
  const ids = new Set(['react', 'vue', 'vanilla', 'react/getting-started', 'vue/migration'])
  // Precondition: the requested page exists in this exact track.
  assert.ok(ids.has('react/getting-started'))
  assert.equal(chooseTarget('react', 'getting-started', ids), '/react/getting-started/')
  // A leading/trailing slash on the requested slug does not change the result.
  assert.equal(chooseTarget('react', '/getting-started/', ids), '/react/getting-started/')
  // Missing in this track (migration is vue-only): falls back to the overview.
  assert.ok(!ids.has('react/migration'))
  assert.equal(chooseTarget('react', 'migration', ids), '/react/')
  // An empty slug is the overview itself.
  assert.equal(chooseTarget('vue', '', ids), '/vue/')
})

test('isFramework accepts only the known framework names', () => {
  for (const fw of FRAMEWORKS) assert.ok(isFramework(fw), `${fw} should be a framework`)
  assert.equal(isFramework('svelte'), false)
  assert.equal(isFramework(''), false)
  assert.equal(isFramework(null), false)
  assert.equal(isFramework(undefined), false)
  assert.equal(isFramework(42), false)
})

test('FRAMEWORK_STORAGE_KEY is the namespaced localStorage key every track picker shares', () => {
  assert.equal(FRAMEWORK_STORAGE_KEY, 'riffle:framework')
})

test("`/_track_/` in a link becomes the page's own track, so links stay absolute and validated", () => {
  const text =
    '---\ntitle: T\n---\n\nSee [Gestures](/riffle/_track_/guides/gestures/#try-it) and [G](/riffle/_track_/).\n'
  // Precondition: the template carries the placeholder.
  assert.match(text, /_track_/)
  for (const fw of FRAMEWORKS) {
    const out = generateTrack(text, fw)
    assert.match(out, new RegExp(`\\(/riffle/${fw}/guides/gestures/#try-it\\)`))
    assert.match(out, new RegExp(`\\[G\\]\\(/riffle/${fw}/\\)`))
    assert.doesNotMatch(out, /_track_/)
  }
})

test('`/_track_/` inside a code fence is left alone, the same way an `<Only>` tag is', () => {
  const text =
    '---\ntitle: T\n---\n\nA template writes `/riffle/_track_/guides/x/` for a same-track link:\n\n' +
    '```md\nSee [G](/riffle/_track_/guides/x/).\n```\n'
  const out = generateTrack(text, 'react')
  // The fenced example still shows the literal placeholder, unresolved.
  assert.match(out, /```md\nSee \[G\]\(\/riffle\/_track_\/guides\/x\/\)\.\n```/)
  // Outside the fence, the same placeholder text (in this template's own
  // prose sentence above) is not itself a `(/riffle/_track_/...)` link, so
  // there is nothing there for `replaceAll` to touch; the fenced copy is the
  // one place a wrong, fence-unaware replace would reach.
})

test('writeTracks always runs before generate-api.mjs in every script that runs both', () => {
  // writeTracks deletes each track's whole `<fw>/` content directory on
  // every run (see the `rmSync` above), and generate-api.mjs now writes its
  // per-track API reference inside that same directory
  // (`<fw>/api/`). If generate-api.mjs ever ran first, or a script ran it
  // without generate-tracks.mjs at all, this wipe would delete the API
  // pages the moment it ran next; running tracks first, in the same
  // package.json script, is what keeps the two from racing. This test pins
  // that order directly in the one place all three scripts (dev, build,
  // check:api) declare it, so a reorder fails here instead of only
  // showing up as missing API pages in a later build.
  const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  for (const name of ['dev', 'build', 'check:api']) {
    const script = pkg.scripts[name]
    assert.ok(script, `package.json has no "${name}" script`)
    const tracksAt = script.indexOf('generate-tracks.mjs')
    const apiAt = script.indexOf('generate-api.mjs')
    assert.ok(tracksAt !== -1, `"${name}" never runs generate-tracks.mjs: ${script}`)
    assert.ok(apiAt !== -1, `"${name}" never runs generate-api.mjs: ${script}`)
    assert.ok(
      tracksAt < apiAt,
      `"${name}" must run generate-tracks.mjs before generate-api.mjs, got: ${script}`,
    )
  }
})
