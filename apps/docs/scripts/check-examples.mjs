#!/usr/bin/env node
/**
 * Typechecks every `@example` block in the package's engine, React and Vue
 * source against the package's own *built* declarations (`dist/index.d.ts`).
 * Temp files are written under `apps/docs/.check-examples-tmp/`, not the OS
 * temp directory: apps/docs already depends on the package, so ordinary
 * upward node_modules resolution from there finds `@rpxl/riffle`,
 * `@rpxl/riffle/react` and `@rpxl/riffle/vue` exactly the way a consumer's
 * own project would, resolved to the package's real `dist`. Run
 * `pnpm --filter @rpxl/riffle build` first; a missing `dist` fails loudly
 * rather than silently skipping.
 *
 * Extraction is text-based, not TypeDoc's reflection tree: it finds every
 * `/** ... *​/` block containing `@example`, then the first fenced code
 * block after that tag. `ts` and `tsx` examples are typechecked; `vue`
 * examples (there is exactly one, `<Riffle>`'s own drop-in doc, a full
 * single-file component) are not, since a `<template>`/`<script setup>`
 * block is not standalone TypeScript and needs a real `.vue` compiler
 * (`packages/core/tests/vue/fixtures/GenericCardSlot.vue`, checked by
 * `vue-tsc` as part of `pnpm --filter @rpxl/riffle typecheck`, already
 * covers the same generic-slot behaviour that example demonstrates).
 *
 * A failure is reported as `file:line: message`, `line` being the real
 * line in the original `.ts`/`.tsx` file the bad code sits on (the
 * comment's own starting line, plus the doc prose, `@example` tag and
 * fence-open line ahead of the code, via `extractExample`'s `lineOffset`,
 * plus wherever inside the example itself the bad line is, via
 * `lib/typecheck-batch.mjs`'s `mapTempLineToCodeLine` undoing the
 * import-hoist and block-wrap it also does): not a line number relative to
 * the fenced block, which said nothing about where to actually go looking.
 *
 * A small shared prelude declares the conventional context variables every
 * package's examples lean on for a value they do not construct themselves:
 * `riffle` (a live Riffle instance), `handle` (an AdapterHandle), `el` and
 * `stack` (HTMLElements), and `geometry` (a LayoutGeometry). An example
 * that needs anything else (a `films` array, a component's own props)
 * declares it locally, exactly as real consumer code would; many examples
 * also declare their OWN `riffle`/`handle`/`stack` from scratch rather than
 * reading the ambient one, which is exactly the realistic style ("prefer
 * short examples that mirror real usage"). To let a local `const riffle =
 * ...` legally shadow the ambient one instead of colliding with it, each
 * example's own leading `import` lines are hoisted to the file's real top
 * level (imports cannot appear inside a block) and the rest of its body is
 * wrapped in a bare `{ ... }` block, a fresh scope nested under the
 * prelude's. The prelude itself imports the core package under a namespace
 * (`__RiffleCore`), not by named import, so it never introduces a bare
 * `Riffle` binding of its own to collide with react's or vue's own
 * same-named export.
 */
import { fileURLToPath } from 'node:url'
import { rmSync, mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { typecheckBatch } from './lib/typecheck-batch.mjs'

const docsRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = join(docsRoot, '.check-examples-tmp')

const SOURCE_DIRS = [join(repoRoot, 'packages/core/src')]

const TYPECHECKED_LANGS = new Set(['ts', 'tsx'])

const PRELUDE_LINES = [
  "import type * as __RiffleCore from '@rpxl/riffle'",
  '',
  'declare const riffle: __RiffleCore.Riffle',
  'declare const handle: __RiffleCore.AdapterHandle',
  'declare const el: HTMLElement',
  'declare const stack: HTMLElement',
  'declare const geometry: __RiffleCore.LayoutGeometry',
]

function walkTsFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...walkTsFiles(full))
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full)
    }
  }
  return found
}

/**
 * Every `/** ... *​/` block in `source` that contains `@example`, with the
 * doc-comment's own leading ` * ` stripped from each line so the fenced
 * block inside reads as plain markdown.
 */
function findExampleComments(source) {
  const comments = []
  const commentRe = /\/\*\*([\s\S]*?)\*\//g
  let match
  while ((match = commentRe.exec(source))) {
    const raw = match[1]
    if (!raw.includes('@example')) continue
    const text = raw
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
    comments.push({ text, index: match.index, endIndex: match.index + match[0].length })
  }
  return comments
}

/**
 * The first fenced code block after the `@example` tag in `text` (itself
 * already one comment's `/** ... *​/` content, `*`-prefix stripped per
 * line, so `text`'s own line count matches the original comment's line
 * count exactly). `lineOffset` is the 0-based line, within `text`, where
 * the code inside the fence starts: added to the comment's own starting
 * line in the real source file, it is what lets a typecheck failure be
 * reported at the exact source line the bad code sits on, not just
 * "somewhere in this example".
 */
function extractExample(text) {
  const tagIndex = text.indexOf('@example')
  if (tagIndex === -1) return null
  const after = text.slice(tagIndex)
  const fenceMatch = after.match(/```(\w*)\n([\s\S]*?)```/)
  if (!fenceMatch) return null
  const codeStartIndex = tagIndex + fenceMatch.index + fenceMatch[0].indexOf('\n') + 1
  const lineOffset = text.slice(0, codeStartIndex).split('\n').length - 1
  return { lang: fenceMatch[1].toLowerCase(), code: fenceMatch[2], lineOffset }
}

/** Best-effort label: the declaration name on the next non-blank line after the comment. */
function nearestDeclarationName(source, commentEndIndex) {
  const rest = source.slice(commentEndIndex)
  const declMatch = rest.match(
    /^\s*\n*\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z0-9_$]+)/,
  )
  return declMatch ? declMatch[1] : null
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

function collectExamples() {
  const examples = []
  let skipped = 0
  for (const dir of SOURCE_DIRS) {
    for (const file of walkTsFiles(dir)) {
      const source = readFileSync(file, 'utf8')
      for (const comment of findExampleComments(source)) {
        const example = extractExample(comment.text)
        if (!example) continue
        const relFile = relative(repoRoot, file)
        const commentLine = lineOf(source, comment.index)
        const name = nearestDeclarationName(source, comment.endIndex)
        if (!TYPECHECKED_LANGS.has(example.lang)) {
          skipped += 1
          continue
        }
        // The real source line the fenced block's own first code line sits
        // on: the comment's own line plus how many lines of doc prose,
        // @example, and the fence-open line came before the code, exactly
        // mirroring findExampleComments' line-preserving `*`-strip.
        const codeStartLine = commentLine + example.lineOffset
        examples.push({
          relFile,
          name,
          codeStartLine,
          lang: example.lang,
          code: example.code,
        })
      }
    }
  }
  return { examples, skipped }
}

function builtDeclarationsExist() {
  return (
    existsSync(join(repoRoot, 'packages/core/dist/index.d.ts')) &&
    existsSync(join(repoRoot, 'packages/core/dist/react/index.d.ts')) &&
    existsSync(join(repoRoot, 'packages/core/dist/vue/index.d.ts'))
  )
}

function main() {
  if (!builtDeclarationsExist()) {
    console.error(
      'check-examples: packages/core/dist is missing. Run `pnpm --filter @rpxl/riffle build` ' +
        'first: examples are typechecked against the built declarations, not source.',
    )
    process.exit(1)
  }

  const { examples, skipped } = collectExamples()
  if (examples.length === 0) {
    console.error(
      'check-examples: found no @example blocks. That is almost certainly a bug in this script.',
    )
    process.exit(1)
  }

  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  try {
    const failures = typecheckBatch(examples, { tmpDir, preambleLines: PRELUDE_LINES })

    if (failures.length > 0) {
      console.error(`check-examples: ${failures.length} example(s) failed to typecheck.`)
      for (const failure of failures) console.error(`  ${failure}`)
      process.exit(1)
    }

    console.log(
      `check-examples: ${examples.length} example(s) typechecked, ${skipped} skipped (non-ts/tsx), 0 failures.`,
    )
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
