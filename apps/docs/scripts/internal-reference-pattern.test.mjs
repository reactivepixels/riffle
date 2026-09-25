import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTERNAL_REFERENCE_RE, findInternalReference } from './internal-reference-pattern.mjs'

/**
 * Run with `node --test scripts/internal-reference-pattern.test.mjs` (from
 * apps/docs). No test framework dependency: node:test ships with Node
 * itself, which is the cheapest thing this small a check could ask for.
 * Wired into check:api, so a change to the pattern that reintroduces a
 * false positive fails the same gate the pattern itself protects.
 */

const POSITIVE_CASES = [
  'Spec 4.2',
  'spec Appendix B.6',
  'Plan 3',
  'Task 11',
  'fix round 2',
  'Fix round 9',
  'task-4',
  'round 3 finding 1',
  'item 5',
  '(F9)',
  '(B5.10)',
  'F3:',
  'the controller',
  'the reviewer',
  'the implementer',
  'per the brief',
  'the spec',
  'as the spec says',
  "the spec's own wording",
  'The spec allows a fallback',
  'the design spec',
  "the design spec's focus rule",
  'the visible label it spec asks for',
  'what the spec asks for',
]

const NEGATIVE_CASES = [
  'specification',
  'special',
  'history ledger',
  'fix round-trip',
  'ruling out',
  'around 2 corners',
  'AbortController',
  'a controlled component',
  'review the diff',
  'flex item',
  'a list item',
  'the specification',
  'the special case',
  'the specs',
  'test specs',
  'the e2e specs run in CI',
  'specifier',
  'a spec file',
  'respect the spec-compliant parser',
  'specificity',
  'the CSS specificity rules',
]

for (const text of POSITIVE_CASES) {
  test(`matches: ${JSON.stringify(text)}`, () => {
    assert.match(text, INTERNAL_REFERENCE_RE)
  })
}

for (const text of NEGATIVE_CASES) {
  test(`does not match: ${JSON.stringify(text)}`, () => {
    assert.doesNotMatch(text, INTERNAL_REFERENCE_RE)
  })
}

test('matches embedded in an ordinary sentence, not just standalone', () => {
  assert.match(
    'A caller-supplied label per card index (spec Appendix B.6). The card aria-label becomes...',
    INTERNAL_REFERENCE_RE,
  )
})

test('does not match ordinary prose with none of these words at all', () => {
  assert.doesNotMatch(
    'A caller-supplied label per card index. The card aria-label becomes...',
    INTERNAL_REFERENCE_RE,
  )
})

// Tooling names and absolute home-directory paths: matched through
// findInternalReference, which both gates call, since the path check is
// case-sensitive and the word checks are not.
const LOCAL_POSITIVE_CASES = [
  'see .superpowers/sdd for notes',
  'docs/superpowers/plan.md',
  'Superpowers',
  'written with Claude',
  'Claude Code',
  'the .claude/ directory',
  'Anthropic',
  'cd /Users/rod/Code/riffle',
  'open /Users/rodleviton',
  "'/home/runner/work/riffle'",
  '(/home/alice/)',
  '`/Users/someone/notes`',
]

const LOCAL_NEGATIVE_CASES = [
  'user agent',
  'the user agent string',
  'an agent',
  'agent-base',
  'a superpower',
  'Claudette',
  'anthropology',
  'GET /users/42/orders',
  'https://example.com/home/docs/',
  'the home page',
  'Users/guide',
  '/home',
]

for (const text of LOCAL_POSITIVE_CASES) {
  test(`findInternalReference matches: ${JSON.stringify(text)}`, () => {
    assert.notEqual(findInternalReference(text), null)
  })
}

for (const text of LOCAL_NEGATIVE_CASES) {
  test(`findInternalReference does not match: ${JSON.stringify(text)}`, () => {
    assert.equal(findInternalReference(text), null)
  })
}

test('findInternalReference still matches every process reference the plain pattern does', () => {
  for (const text of POSITIVE_CASES) assert.notEqual(findInternalReference(text), null, text)
  for (const text of NEGATIVE_CASES) assert.equal(findInternalReference(text), null, text)
})
