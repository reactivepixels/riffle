import ts from 'typescript'

/**
 * Strips `/** ... *​/` block comments longer than `maxLines` lines from
 * `source`, leaving the code, every short comment, and every `//` line
 * comment untouched. Used by `apps/docs/src/lib/snippets.ts` for
 * `spreadLayoutSource`: `spread-layout.ts`'s own top-of-function TSDoc is a
 * deliberately long, review-verified walkthrough (it is the source the
 * layouts page's prose is written from), but showing it verbatim on the
 * page as well means a reader scrolls through the same explanation twice,
 * once as prose and once again as a wall of comments above the code that
 * prose just covered. This changes only what the docs page renders: the
 * real file (and its TSDoc) is untouched, so the file stays the actual
 * source of truth and the snippet-drift gate still holds.
 *
 * Tokenizes `source` with TypeScript's own scanner (`ts.createScanner`, the
 * same lexer the compiler itself uses) and only ever removes a token the
 * scanner itself classifies as `MultiLineCommentTrivia`, rather than
 * matching `/**` and `*​/` as plain text with a regex. A regex approach
 * matches those markers wherever they appear, including inside a string,
 * template, or regex literal: a `/**` inside a string literal, with an
 * unrelated real `*​/` appearing later in the file (closing an actual
 * comment, or even just from an unrelated `/* ... *​/`), would make it
 * consume every line of real code in between as if it were one giant
 * comment, and silently delete it if that span happened to be longer than
 * `maxLines`. The scanner does not have that problem: a string, template,
 * or regex literal is always one single opaque token to it, never
 * re-entered looking for comment-like text inside it, so a `/**` or `*​/`
 * inside one can never be mistaken for a real comment's boundary.
 */
export function stripLongDocComments(source, maxLines = 8) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    source,
  )
  let output = ''
  let kind = scanner.scan()
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    const text = source.slice(scanner.getTokenPos(), scanner.getTextPos())
    const isLongDocComment =
      kind === ts.SyntaxKind.MultiLineCommentTrivia &&
      text.startsWith('/**') &&
      text.split('\n').length > maxLines
    if (!isLongDocComment) output += text
    kind = scanner.scan()
  }
  // Collapse the run of blank lines a removed block leaves behind, and drop
  // a leading blank line if the removed block was the file's first thing.
  return output.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
}
