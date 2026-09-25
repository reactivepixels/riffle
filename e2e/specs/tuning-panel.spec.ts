/**
 * The Gestures guide's tuning panel copy flow (apps/docs/src/components/TuningPanel.tsx),
 * on every framework track. Moves a handful of sliders off their defaults,
 * clicks "Copy config", reads the real OS/browser clipboard, and asserts the
 * copied text is genuinely useful: it is written in that track's own idiom
 * (a `Partial<RiffleOptions>` for vanilla, `<Riffle>` props for React and
 * Vue), it TYPECHECKS standalone against the real built package (for
 * vanilla, an options object, not a `createRiffle(container, {...})`
 * wrapping, which is not valid TypeScript on its own since `count` is
 * required and there is no `container` in scope), it names the values just
 * set, and it leaves out every option still at its default (spring.damping,
 * flingVelocity, leverFactor, crossFollow).
 *
 * Chromium only: clipboard-read/clipboard-write are Chromium-only Permissions
 * Policy entries in Playwright (`context.grantPermissions`); Firefox and
 * WebKit do not support granting them, so this spec would only fail to grant
 * on those projects, not exercise anything different (interaction.spec.ts's
 * `skipUnlessMobile`-style helpers are the precedent for this pattern; see
 * playwright.config.ts's own comment on why a11y.spec.ts is Chromium-only
 * for the same "would not buy additional coverage" reason).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { Page } from '@playwright/test'

const DOCS_ORIGIN = 'http://localhost:4340'

/** What each track's copied config must contain: its own package's type, in its own idiom. */
const TRACKS = [
  {
    fw: 'vanilla',
    expected: [
      "import type { RiffleOptions } from '@rpxl/riffle'",
      'const options: Partial<RiffleOptions> =',
    ],
  },
  {
    fw: 'react',
    expected: [
      "import type { RiffleProps } from '@rpxl/riffle/react'",
      '<Riffle {...tuning}',
      '} satisfies Partial<RiffleProps<unknown>>',
    ],
  },
  {
    fw: 'vue',
    expected: [
      "import type { RiffleProps } from '@rpxl/riffle/vue'",
      '<Riffle v-bind="tuning"',
      '} satisfies Partial<RiffleProps<unknown>>',
    ],
  },
] as const

function gesturesUrl(fw: string): string {
  return `${DOCS_ORIGIN}/riffle/${fw}/guides/gestures/`
}

function skipUnlessChromium(testInfo: { project: { name: string } }): void {
  test.skip(
    testInfo.project.name !== 'chromium',
    'clipboard-read/clipboard-write permission grants are Chromium-only in Playwright',
  )
}

/**
 * Waits for the panel's React island to actually hydrate, the same signal
 * hydration.spec.ts uses: `aria-roledescription="carousel"` is written by
 * the engine's own a11y module (packages/core/src/a11y.ts), only ever from
 * a client-side mount path, never present in the server-rendered markup.
 * Without this, a click dispatched before hydration lands on a button with
 * no listener attached yet and silently does nothing.
 */
async function waitForPanelHydration(page: Page): Promise<void> {
  await expect(page.locator('[aria-roledescription="carousel"]')).toBeVisible()
}

/** Sets a range input's value the way React observes it: through the native setter, not the attribute, so the controlled input's onChange actually fires. */
async function setSlider(page: Page, testId: string, value: number): Promise<void> {
  const locator = page.getByTestId(testId)
  await locator.evaluate((el, value) => {
    const input = el as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

/**
 * The exact text the copy button writes: an `import type` line, a one-line
 * comment, and `const <name>... = { ... }` (followed, for React and Vue, by
 * `satisfies ...`, which has no braces of its own). This extracts just the object literal to read the slider values
 * back out, quoting its bare keys and stripping the trailing commas
 * `JSON.parse` rejects: a small, mechanical transform, not a claim that the
 * source text itself needs it (it is valid TypeScript as written;
 * `typecheckCopiedConfig` below checks that directly). The object starts at
 * `= {`, not at the text's first `{`: the `import type { RiffleOptions }`
 * line has its own, earlier pair of braces that a naive
 * `text.indexOf('{')` would find instead.
 */
function parseCopiedConfig(text: string): Record<string, unknown> {
  const assignIndex = text.indexOf('= {')
  const objectStart = assignIndex + 2
  const objectText = text.slice(objectStart, text.lastIndexOf('}') + 1)
  const quoted = objectText.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '"$1":')
  const noTrailingCommas = quoted.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(noTrailingCommas)
}

const here = fileURLToPath(new URL('.', import.meta.url))
// apps/docs already depends on @rpxl/riffle (a workspace package), so
// ordinary node_modules resolution from a file placed under apps/docs finds
// it, resolved to the real built dist: the exact mechanism
// apps/docs/scripts/check-examples.mjs's own @example typechecking uses,
// reused here rather than duplicated as a child-process `tsc`
// invocation. `.check-examples-tmp` is already gitignored for this purpose.
const docsTmpDir = resolve(here, '../../apps/docs/.check-examples-tmp')

/**
 * Typechecks the exact text "Copy config" wrote to the clipboard, standalone,
 * against the real built package types (`@rpxl/riffle`, `@rpxl/riffle/react`
 * or `@rpxl/riffle/vue`, all the same dependency of apps/docs). Throws, with
 * every diagnostic message, if it does not typecheck clean.
 */
function typecheckCopiedConfig(source: string): void {
  mkdirSync(docsTmpDir, { recursive: true })
  const file = resolve(
    docsTmpDir,
    `tuning-panel-copy-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
  )
  writeFileSync(file, source)
  try {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    }
    const program = ts.createProgram([file], compilerOptions)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length > 0) {
      const messages = diagnostics.map((d) => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
        if (!d.file || d.start === undefined) return message
        const { line } = d.file.getLineAndCharacterOfPosition(d.start)
        return `line ${line + 1}: ${message}`
      })
      throw new Error(
        `Copied config failed to typecheck:\n${messages.join('\n')}\n\nSource:\n${source}`,
      )
    }
  } finally {
    rmSync(file, { force: true })
  }
}

for (const { fw, expected } of TRACKS) {
  test.describe(`tuning panel on the ${fw} track: copy config`, () => {
    test('copies only the sliders moved off their defaults, typechecks standalone, and parses back to those exact values', async ({
      page,
      context,
    }, testInfo) => {
      skipUnlessChromium(testInfo)
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DOCS_ORIGIN })

      await page.goto(gesturesUrl(fw))
      await expect(page.getByTestId('tuning-slider-stiffness')).toBeVisible()
      await waitForPanelHydration(page)

      // Precondition: the status live region starts empty, so "Copied" below
      // is really a change this test caused, not stale text from a previous run.
      await expect(page.getByTestId('tuning-status')).toHaveText('')

      // Move three of the seven sliders off their defaults (spring.stiffness
      // 340 -> 500, threshold 0.25 -> 0.4, rotation.maxRotation 16 -> 24);
      // leave spring.damping, flingVelocity, rotation.leverFactor and
      // crossFollow untouched, at their defaults.
      await setSlider(page, 'tuning-slider-stiffness', 500)
      await setSlider(page, 'tuning-slider-threshold', 0.4)
      await setSlider(page, 'tuning-slider-max-rotation', 24)

      // Precondition: the sliders themselves actually moved, so a parse
      // failure below is a real copy-flow bug, not sliders that silently
      // ignored setSlider.
      await expect(page.getByTestId('tuning-slider-stiffness')).toHaveValue('500')
      await expect(page.getByTestId('tuning-slider-threshold')).toHaveValue('0.4')
      await expect(page.getByTestId('tuning-slider-max-rotation')).toHaveValue('24')

      await page.getByTestId('tuning-copy').click()

      // The polite live-region confirmation.
      await expect(page.getByTestId('tuning-status')).toHaveText('Copied')

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
      for (const line of expected) expect(clipboardText).toContain(line)
      // Regression guard: an earlier format wrapped the diff in a call
      // requiring `count`, which this text must never do again.
      expect(clipboardText).not.toContain('createRiffle(')

      // The real check: this exact text, standalone, against the real
      // @rpxl/riffle types, not a hand-rolled parser's opinion of it.
      expect(() => typecheckCopiedConfig(clipboardText)).not.toThrow()

      const config = parseCopiedConfig(clipboardText)

      // Matches the slider values just set. spring is always the whole
      // { stiffness, damping } object when either differs (SpringConfig
      // requires both fields), so damping's own default value (34) is
      // present here even though only stiffness was moved.
      expect(config).toMatchObject({
        spring: { stiffness: 500, damping: 34 },
        threshold: 0.4,
        rotation: { maxRotation: 24 },
      })

      // Omits every option left at its default: flingVelocity and crossFollow
      // do not appear at the top level, and leverFactor does not appear
      // inside rotation (RotationOptions fields are independently optional,
      // unlike spring's).
      expect(config).not.toHaveProperty('flingVelocity')
      expect(config).not.toHaveProperty('crossFollow')
      expect(config.rotation as Record<string, unknown>).not.toHaveProperty('leverFactor')
    })

    test('the "every slider at its default" copy also typechecks standalone', async ({
      page,
      context,
    }, testInfo) => {
      skipUnlessChromium(testInfo)
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DOCS_ORIGIN })

      await page.goto(gesturesUrl(fw))
      await expect(page.getByTestId('tuning-copy')).toBeVisible()
      await waitForPanelHydration(page)

      await page.getByTestId('tuning-copy').click()
      await expect(page.getByTestId('tuning-status')).toHaveText('Copied')

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
      for (const line of expected) expect(clipboardText).toContain(line)
      expect(() => typecheckCopiedConfig(clipboardText)).not.toThrow()
    })

    test('resetting to defaults after copying clears the status text and returns every slider to its default', async ({
      page,
    }, testInfo) => {
      skipUnlessChromium(testInfo)

      await page.goto(gesturesUrl(fw))
      await expect(page.getByTestId('tuning-slider-damping')).toBeVisible()
      await waitForPanelHydration(page)

      await setSlider(page, 'tuning-slider-damping', 60)
      await expect(page.getByTestId('tuning-slider-damping')).toHaveValue('60')

      await page.getByTestId('tuning-reset').click()

      await expect(page.getByTestId('tuning-slider-damping')).toHaveValue('34')
      await expect(page.getByTestId('tuning-status')).toHaveText('')
    })
  })
}
