#!/usr/bin/env node
/**
 * Typechecks the three per-framework usage blocks in the monorepo root
 * README against the package's own *built* declarations, the same way
 * check-examples.mjs typechecks every `@example` doc comment: both share
 * `lib/typecheck-batch.mjs`'s temp-file build and diagnostic-to-source-line
 * mapping, so "typechecked against the built package" cannot quietly mean
 * something different in the two places. Run `pnpm --filter @rpxl/riffle
 * build` first; a missing `dist` fails loudly rather than silently skipping
 * (see `builtDeclarationsExist` in check-examples.mjs, re-checked here the
 * same way).
 *
 * The README's own Vanilla and React blocks (tagged `ts` and `tsx`) are
 * real, self-contained snippets and are typechecked directly, with no
 * preamble: unlike an in-source `@example`, which often deliberately reads
 * ambient context (see check-examples.mjs's own PRELUDE_LINES), a README
 * quickstart is meant to be copy-pasteable as-is, so it should need nothing
 * beyond its own imports to typecheck clean.
 *
 * The Vue block is a full single-file component, so it is written out as a
 * real `.vue` file and checked with `vue-tsc`, template included: the slot's
 * `card` must be inferred from `:cards`, so a template expression that reads
 * a property the card type does not have fails here, not in a user's
 * editor. `vue-tsc` is resolved from packages/core, which already depends on
 * it for its own typecheck.
 *
 * The package README carries the same usage block(s) as the root README's
 * matching section (Vanilla, React, Vue). Rather than typecheck a second
 * copy, this requires it to be identical to the root block that is
 * typechecked, so the package README cannot drift from it. The same goes
 * for each quickstart's real example file (QUICKSTART_FILES).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { typecheckBatch } from './lib/typecheck-batch.mjs'

const docsRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const readmePath = join(repoRoot, 'README.md')
const tmpDir = join(docsRoot, '.check-readme-examples-tmp')

/**
 * The first fenced block of `lang` after `heading` in `markdown`, plus the
 * 1-based line in `markdown` its first code line starts on. Mirrors
 * apps/docs/src/lib/snippets.ts's own `extractFencedBlock`: a heading is
 * often followed by an install command's own untagged or `bash` fence
 * before the real usage fence, so this must find the first fence of the
 * *given* language, not just the first fence.
 */
function extractFencedBlock(markdown, heading, lang, file = 'README.md') {
  const headingIndex = markdown.indexOf(heading)
  if (headingIndex === -1) {
    throw new Error(`check-readme-examples: no "${heading}" heading in ${file}`)
  }
  const fenceOpen = '```' + lang + '\n'
  const openIndex = markdown.indexOf(fenceOpen, headingIndex)
  if (openIndex === -1) {
    throw new Error(`check-readme-examples: no \`${lang}\` fence after "${heading}" in ${file}`)
  }
  const codeStart = openIndex + fenceOpen.length // past the fence marker and its newline
  const closeIndex = markdown.indexOf('```', codeStart)
  if (closeIndex === -1) {
    throw new Error(`check-readme-examples: unterminated fence after "${heading}" in ${file}`)
  }
  const code = markdown.slice(codeStart, closeIndex).replace(/\n$/, '')
  const codeStartLine = markdown.slice(0, codeStart).split('\n').length
  return { code, codeStartLine }
}

function builtDeclarationsExist() {
  return (
    existsSync(join(repoRoot, 'packages/core/dist/index.d.ts')) &&
    existsSync(join(repoRoot, 'packages/core/dist/react/index.d.ts')) &&
    existsSync(join(repoRoot, 'packages/core/dist/vue/index.d.ts'))
  )
}

const VUE_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'preserve',
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
  include: ['*.vue'],
}

/**
 * Writes the Vue block to a real .vue file and runs vue-tsc over it. The
 * temp directory sits inside apps/docs, so `vue` and `@rpxl/riffle`
 * resolve from this app's own dependencies (the latter to its built dist).
 * Returns one "README.md:<line>: <message>" string per diagnostic.
 */
function typecheckVueBlock(vue) {
  const vueTscPackage = createRequire(join(repoRoot, 'packages/core/package.json')).resolve(
    'vue-tsc/package.json',
  )
  const vueTscBin = join(dirname(vueTscPackage), 'bin/vue-tsc.js')
  const sfcName = 'ReadmeStack.vue'
  writeFileSync(join(tmpDir, sfcName), vue.code + '\n')
  writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(VUE_TSCONFIG, null, 2))
  try {
    execFileSync(process.execPath, [vueTscBin, '--noEmit', '-p', join(tmpDir, 'tsconfig.json')], {
      cwd: tmpDir,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return []
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    const failures = []
    for (const match of output.matchAll(/ReadmeStack\.vue\((\d+),\d+\): (error .*)/g)) {
      failures.push(
        `README.md:${vue.codeStartLine + Number(match[1]) - 1} (Vue usage): ${match[2]}`,
      )
    }
    // A failure vue-tsc reports in some other shape (a config error, a crash)
    // must still fail the gate, not pass silently with nothing mapped.
    if (failures.length === 0) failures.push(`README.md (Vue usage): vue-tsc failed: ${output}`)
    return failures
  }
}

/**
 * The package README's usage blocks must be identical to the root README's
 * matching blocks, which are the ones this script typechecks.
 */
const PACKAGE_COPIES = [
  {
    file: 'packages/core/README.md',
    blocks: [
      ['### Vanilla', 'html'],
      ['### Vanilla', 'ts'],
      ['### React', 'tsx'],
      ['### Vue', 'vue'],
    ],
  },
]

function checkPackageCopies(readme) {
  const failures = []
  for (const { file, blocks } of PACKAGE_COPIES) {
    const copy = readFileSync(join(repoRoot, file), 'utf8')
    for (const [heading, lang] of blocks) {
      const root = extractFencedBlock(readme, heading, lang)
      const pkg = extractFencedBlock(copy, '## Usage', lang, file)
      if (pkg.code !== root.code) {
        failures.push(
          `${file}:${pkg.codeStartLine}: its \`${lang}\` usage block differs from README.md's ` +
            `"${heading}" block (README.md:${root.codeStartLine}); keep the two identical`,
        )
      }
    }
  }
  return failures
}

/**
 * Each quickstart also lives in a real example file, which the docs site
 * imports for its Getting Started snippet and renders as that page's live
 * demo, and which its example's own typecheck covers. The README block and
 * the file must be the same code, so the README, the docs and the demo can
 * never show three different quickstarts.
 */
const QUICKSTART_FILES = [
  ['### Vanilla', 'ts', 'examples/vanilla-movie-stack/src/quickstart.ts'],
  ['### React', 'tsx', 'examples/react-movie-stack/src/Quickstart.tsx'],
  ['### Vue', 'vue', 'examples/vue-movie-stack/src/Quickstart.vue'],
]

function checkQuickstartFiles(readme) {
  const failures = []
  for (const [heading, lang, file] of QUICKSTART_FILES) {
    const block = extractFencedBlock(readme, heading, lang)
    const source = readFileSync(join(repoRoot, file), 'utf8').replace(/\n$/, '')
    if (source !== block.code) {
      failures.push(
        `${file}: differs from README.md's "${heading}" block (README.md:${block.codeStartLine}); ` +
          'keep the two identical',
      )
    }
  }
  return failures
}

function main() {
  if (!builtDeclarationsExist()) {
    console.error(
      'check-readme-examples: packages/{core,react,vue}/dist is missing. Run `pnpm -r build` ' +
        'first: the README is typechecked against the built declarations, not source.',
    )
    process.exit(1)
  }

  const readme = readFileSync(readmePath, 'utf8')

  const vanilla = extractFencedBlock(readme, '### Vanilla', 'ts')
  const react = extractFencedBlock(readme, '### React', 'tsx')
  const vue = extractFencedBlock(readme, '### Vue', 'vue')

  const examples = [
    { relFile: 'README.md', name: 'Vanilla usage', ...vanilla, lang: 'ts' },
    { relFile: 'README.md', name: 'React usage', ...react, lang: 'tsx' },
  ]

  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  try {
    const failures = [
      ...typecheckBatch(examples, { tmpDir, preambleLines: [] }),
      ...typecheckVueBlock(vue),
      ...checkPackageCopies(readme),
      ...checkQuickstartFiles(readme),
    ]

    if (failures.length > 0) {
      console.error(
        `check-readme-examples: ${failures.length} README example(s) failed to typecheck.`,
      )
      for (const failure of failures) console.error(`  ${failure}`)
      process.exit(1)
    }

    console.log(
      `check-readme-examples: ${examples.length + 1} README example(s) typechecked ` +
        `(Vue with vue-tsc), ${PACKAGE_COPIES.length} package README(s) match, ` +
        `${QUICKSTART_FILES.length} quickstart file(s) match, 0 failures.`,
    )
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
