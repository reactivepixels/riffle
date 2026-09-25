/**
 * Matches an internal-only reference that has no business rendering in
 * public source or docs text: a spec/appendix/plan/task/round/item pointer,
 * a bracketed finding code, or a "the controller"/"the reviewer"/"the
 * implementer"/"the brief" role reference, written the shape this project's
 * own internal comments actually wrote them in before a sweep removed them.
 * Every numeric alternative requires the real reference shape (one or more
 * following digits, or a following capital letter for `Appendix`), not just
 * the bare word, so it does not fire on ordinary English that happens to
 * contain one of these words: "specification", "special", "a history
 * ledger", "fix round-trip", "ruling out an option", "around 2 corners".
 * `\d+`, not `\d`, on every numeric alternative: `\d` alone matches one
 * digit then requires a word boundary right after it, which a two-digit
 * reference like "Task 11" can never satisfy (a digit followed by another
 * digit is never a boundary).
 *
 * The finding-code alternatives (`(C1)`, `(B5.10)`, `F3:`) are restricted to
 * the letters this project's own review process actually used
 * (A, B, C, F, I, M), not the full alphabet: a wider class would risk
 * flagging an unrelated letter+digit token (a heading level, a priority
 * label, a cell reference) that happens to share the shape. The role
 * alternatives (`the controller`, `the reviewer`, `the implementer`) require
 * the leading "the " article, the exact shape this project's own prose used
 * for them, so "AbortController", "a controlled component" and "review the
 * diff" cannot match: none of them puts the role noun right after the word
 * "the".
 *
 * Each alternative carries its own `\b` (or an equivalent literal boundary
 * such as `(` and `)`) rather than sharing one wrapping the whole
 * alternation: several alternatives end in a non-word character (`:`, `)`),
 * and a `\b` immediately after a non-word character only matches if a word
 * character follows, which is not guaranteed at the end of a sentence.
 *
 * See internal-reference-pattern.test.mjs for the exact cases this was
 * tuned against, and import this same export from there and from
 * generate-api.mjs, rather than each keeping its own copy, so the tested
 * pattern and the one that actually gates the build can never drift apart.
 *
 * "ledger" and "ruling" (this pattern's original, untightened pair) are
 * dropped rather than shape-constrained: unlike spec/appendix/plan/task/
 * round, this project's own actual usage of "ledger" (its own progress
 * notes call themselves an "SDD ledger") has no consistent trailing-number
 * shape to require, and both words are common enough in ordinary English
 * that a bare match would false-positive too often to be worth what little
 * they would still catch.
 *
 * "the spec", "design spec" and "spec asks" name the design document
 * itself without a section number ("the visible label the spec asks for").
 * Each needs its whole phrase, and `spec` must end the word, so
 * "specification", "special", "specifier", "the specs" and "test specs" (a
 * test file, in the code sense) never match; `the spec` also must not be
 * followed by a hyphen, so "the spec-compliant parser" does not either. A
 * comment about one test file says "this test" rather than "the spec".
 *
 * Tooling names (`superpowers`, `Claude`, `Anthropic`) are whole words, so
 * "a superpower", "Claudette" and "anthropology" do not match. The bare word
 * "agent" is deliberately not matched at all: "user agent" and the
 * `agent-base` dependency are ordinary text.
 */
export const INTERNAL_REFERENCE_RE =
  /\bsuperpowers\b|\bclaude\b|\banthropic\b|\bfix round \d+\b|\bround \d+\b|\bitem \d+\b|\btask[- ]?\d+\b|\bspec(?:ification)? (?:section )?\d+\b|\bAppendix [A-Z]\b|\bPlan \d+\b|\([ABCFIM]\d{1,2}(?:\.\d+)?\)|\b[ABCFIM]\d{1,2}(?:\.\d+)?:|\bthe (?:controller|reviewer|implementer)\b|\bthe brief\b|\bthe spec\b(?!-)|\bdesign spec\b|\bspec asks\b/i

/**
 * An absolute home-directory path (`/Users/<name>` on macOS, `/home/<name>`
 * on Linux), which only means something on one machine. Case-sensitive,
 * unlike INTERNAL_REFERENCE_RE, so an API route such as `/users/:id/` is not
 * mistaken for one, and it must start the text or follow whitespace, a
 * quote, a backtick, `(` or `=`, so a URL path segment
 * (`https://example.com/home/docs/`) does not match either.
 */
export const HOME_PATH_RE = /(?:^|[\s'"`(=])\/(?:Users|home)\/[\w.-]+/

/**
 * The first internal reference in `text` (either pattern above), or null.
 * Both gates call this rather than testing one pattern themselves, so the
 * two can never disagree about what counts.
 */
export function findInternalReference(text) {
  const match = text.match(INTERNAL_REFERENCE_RE) ?? text.match(HOME_PATH_RE)
  return match ? match[0].trim() : null
}
