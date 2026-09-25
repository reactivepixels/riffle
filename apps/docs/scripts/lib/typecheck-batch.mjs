/**
 * The reusable half of check-examples.mjs: given a batch of already
 * extracted code snippets, write each to a temp file (imports hoisted to
 * real top level, the rest wrapped in a block so a local declaration can
 * shadow an ambient one from the preamble) and typecheck the batch as one
 * TypeScript program against the workspace's built package declarations.
 * Shared by check-examples.mjs (the `@example` doc comments in
 * packages/*\/src) and check-readme-examples.mjs (the root README's
 * per-framework usage blocks), so the two can never quietly diverge on
 * what "typechecked against the built packages" means.
 *
 * Extraction (finding the snippets in the first place, and what ambient
 * declarations each caller's own snippets need) stays with each caller:
 * only the compiler options, the temp-file build, and the diagnostic to
 * source-line mapping live here.
 */
import ts from 'typescript'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  skipLibCheck: true,
  noEmit: true,
  types: [],
}

/**
 * Splits a snippet's leading `import ...` lines (and any blank lines among
 * them) from the rest, so the imports can stay at the file's real top level
 * while the rest is wrapped in a block. Only handles single-line import
 * statements; a multi-line one stops the split early and still typechecks
 * for real, just possibly with a less precise reported line number.
 */
export function splitLeadingImports(code) {
  const lines = code.split('\n')
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('import ')) {
      i += 1
    } else {
      break
    }
  }
  return { imports: lines.slice(0, i), body: lines.slice(i) }
}

/**
 * Wraps `code` behind `preambleLines`' ambient declarations, per
 * splitLeadingImports above. With no preamble at all (a self-contained
 * snippet needing no ambient shadowing, like a README quickstart), the
 * block wrap is skipped entirely rather than left empty: a top-level
 * `export` in the snippet's own body (a README example is realistic
 * consumer code, and consumer code exports things) is only valid at module
 * scope, not inside the `{ ... }` wrap the prelude case needs.
 */
export function buildExampleFile(code, preambleLines) {
  const { imports, body } = splitLeadingImports(code)
  if (preambleLines.length === 0) {
    return {
      content: code,
      importsCount: imports.length,
      bodyStartLine: imports.length,
      noWrap: true,
    }
  }
  const lines = [...imports, ...preambleLines, '{', ...body, '}']
  return {
    content: lines.join('\n'),
    importsCount: imports.length,
    bodyStartLine: imports.length + preambleLines.length + 2,
    noWrap: false,
  }
}

/**
 * Maps a 1-based line in the temp file buildExampleFile wrote back to a
 * 0-based line within the snippet's own `code` as authored. With no wrap,
 * the temp file's lines are the snippet's own lines verbatim, so the
 * mapping is a straight 1-based to 0-based shift. Wrapped: an import line
 * was copied verbatim at the top, so it maps 1:1; a body line was moved
 * into the wrapping block, offset by everything ahead of it (the imports,
 * the preamble, and the `{`), which is exactly `built.bodyStartLine`.
 */
export function mapTempLineToCodeLine(tempLine1Based, built) {
  if (built.noWrap) return tempLine1Based - 1
  if (tempLine1Based <= built.importsCount) return tempLine1Based - 1
  return built.importsCount + (tempLine1Based - built.bodyStartLine)
}

/**
 * Typechecks `examples` ({relFile, name, codeStartLine, lang, code}) as one
 * batch, writing temp files under `tmpDir` (the caller creates and cleans
 * it up), with `preambleLines` inserted after each example's own hoisted
 * imports. Returns failures as `"relFile:line (name): message"`, `line`
 * being the real line in the original source the bad code sits on.
 */
export function typecheckBatch(examples, { tmpDir, preambleLines, compilerOptions }) {
  const options = compilerOptions ?? DEFAULT_COMPILER_OPTIONS
  const built = examples.map((example) => buildExampleFile(example.code, preambleLines))
  const fileNames = examples.map((example, i) => {
    const ext = example.lang === 'tsx' ? 'tsx' : 'ts'
    const fileName = join(tmpDir, `example-${i}.${ext}`)
    writeFileSync(fileName, built[i].content)
    return fileName
  })

  const program = ts.createProgram(fileNames, options)
  const diagnostics = ts.getPreEmitDiagnostics(program)

  const failures = []
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) continue
    const index = fileNames.indexOf(diagnostic.file.fileName)
    if (index === -1) continue
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    const codeLine = mapTempLineToCodeLine(line + 1, built[index])
    const sourceLine = examples[index].codeStartLine + codeLine
    const { relFile, name } = examples[index]
    failures.push(`${relFile}:${sourceLine}${name ? ` (${name})` : ''}: ${message}`)
  }
  return failures
}
