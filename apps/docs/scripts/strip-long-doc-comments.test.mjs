import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripLongDocComments } from './strip-long-doc-comments.mjs'

/**
 * Run with `node --test scripts/strip-long-doc-comments.test.mjs` (from
 * apps/docs), same as internal-reference-pattern.test.mjs. Wired into
 * check:api, so a regression in the token-aware scanner fails the same gate
 * the function itself protects.
 */

test('removes a block comment longer than maxLines', () => {
  const longComment = ['/**', ...Array.from({ length: 9 }, (_, i) => ` * line ${i}`), ' */'].join(
    '\n',
  )
  const source = `${longComment}\nexport const x = 1\n`
  const result = stripLongDocComments(source, 8)
  assert.doesNotMatch(result, /line 0/)
  assert.match(result, /export const x = 1/)
})

test('keeps a block comment at or under maxLines', () => {
  const shortComment = ['/**', ' * short', ' */'].join('\n')
  const source = `${shortComment}\nexport const x = 1\n`
  const result = stripLongDocComments(source, 8)
  assert.match(result, /short/)
  assert.match(result, /export const x = 1/)
})

test('never touches a // line comment, however many of them there are', () => {
  const source = Array.from({ length: 12 }, (_, i) => `// line ${i}`).join('\n') + '\nconst x = 1\n'
  const result = stripLongDocComments(source, 8)
  assert.match(result, /line 0/)
  assert.match(result, /line 11/)
})

test('the real spread-layout.ts strips its long top-of-function TSDoc but keeps every short comment and every code line', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const path = fileURLToPath(
    new URL('../../../examples/custom-layout/src/spread-layout.ts', import.meta.url),
  )
  const source = readFileSync(path, 'utf8')
  const result = stripLongDocComments(source, 8)

  // The long top-of-function walkthrough is gone.
  assert.doesNotMatch(result, /What a `LayoutStrategy` is/)
  assert.doesNotMatch(result, /never allocate/)
  // The short SpreadOptions doc survives.
  assert.match(result, /Options for \{@link spread\}/)
  // Every line comment inside pose() survives.
  assert.match(result, /The exit slot: borrowed from the reference fan/)
  assert.match(result, /The arc: each card behind the front sits/)
  // The actual code survives, unabridged.
  assert.match(result, /export function spread\(options: SpreadOptions = \{\}\): LayoutStrategy/)
  assert.match(result, /out\.zIndex = Math\.round\(geometry\.count - depth\)/)
})

// An adversarial case for a regex-based approach: a plain-text match on
// `/**` and `*/` (rather than the token-aware scanner this file actually
// uses) would see a `/**` inside a string literal, then an unrelated real
// `*/` appearing later (here, closing a short, genuine block comment
// further down), and treat everything between the two as one giant comment,
// deleting it, real code included, if that span was longer than maxLines.
test('does not delete real code between a fake /** inside a string literal and a later, unrelated real comment close', () => {
  const lines = [
    `const warning = "never write /** inside a string, like this"`,
    ...Array.from({ length: 10 }, (_, i) => `const line${i} = ${i}`),
    `/* a short, real, unrelated comment */`,
    `export const sentinel = "REAL_CODE_SURVIVED"`,
  ]
  const source = lines.join('\n')
  const result = stripLongDocComments(source, 8)

  assert.match(result, /REAL_CODE_SURVIVED/)
  assert.match(result, /const line0 = 0/)
  assert.match(result, /const line9 = 9/)
  assert.match(result, /never write \/\*\* inside a string/)
})

test('does not delete real code between a fake /** inside a template literal and a later real comment close', () => {
  const lines = [
    'const t = `template with /** fake doc comment start`',
    ...Array.from({ length: 10 }, (_, i) => `function real${i}() { return ${i} }`),
    '/* closes */',
    'export const sentinel2 = "TEMPLATE_CASE_SURVIVED"',
  ]
  const source = lines.join('\n')
  const result = stripLongDocComments(source, 8)

  assert.match(result, /TEMPLATE_CASE_SURVIVED/)
  assert.match(result, /function real0\(\) \{ return 0 \}/)
  assert.match(result, /function real9\(\) \{ return 9 \}/)
})
