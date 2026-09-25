/**
 * The live tuning panel on each track's Gestures guide (src/tracks/guides/gestures.mdx).
 * Seven sliders drive a real `@rpxl/riffle/react` stack: the adapter's own
 * option diffing (documented in the React track's Getting Started, "Options between
 * renders") is what turns each slider change into a live `riffle.update()`
 * call, exactly the same mechanism every React demo on the site
 * relies on, so this panel needs no direct core import to stay live.
 *
 * Every slider's range comes from the engine itself, not a guess:
 *
 * - `threshold`: `assertOptions` in `packages/core/src/riffle.ts` requires
 *   `threshold > 0 && threshold <= 1` ("threshold must be in (0, 1]"), so the
 *   slider spans (0, 1]; 0 itself is unreachable, so the minimum is the
 *   smallest step above it.
 * - `crossFollow`: the same function requires `crossFollow >= 0 && <= 1`
 *   ("crossFollow must be in [0, 1]"), so the slider spans exactly [0, 1].
 * - `flingVelocity`: `assertOptions` only requires it finite and > 0
 *   (`isPositive`); there is no engine-enforced upper bound. The slider's
 *   upper bound (3 px/ms) is a judgment call informed by the default (0.5)
 *   and the velocity tracker's own 100ms window (`gesture/velocity.ts`):
 *   sustained speeds much past a few pixels per millisecond are already a
 *   very fast flick.
 * - `spring.stiffness` / `spring.damping`: `assertOptions` only requires
 *   both finite and > 0. The slider bounds are centred on the three shipped
 *   presets (`SPRING_PRESETS` in `packages/core/src/animation/spring.ts`:
 *   stiffness 260-600, damping 30-48 across `smooth`/`snappy`/`stiff`), with
 *   margin on both sides so every preset's feel sits mid-slider rather than
 *   at an edge.
 * - `rotation.maxRotation` / `rotation.leverFactor`: `RotationOptions` has no
 *   `assertOptions` validation at all (see `packages/core/src/riffle.ts`);
 *   `computeRotation` (`math/rotation.ts`) only clamps its own *output* to
 *   `[-maxRotation, maxRotation]`, and clamps the lever term's `pull`/`lever`
 *   inputs to `[-1, 1]`, neither of which bounds the option values
 *   themselves. Both ranges below are therefore a judgment call: 0-45
 *   degrees for `maxRotation` (0 disables tilt, 45 is already a dramatic
 *   fan), and 0-1 for `leverFactor`, matching how `baseFactor` and
 *   `trajFactor` are shaped as fractional contributions in the same formula.
 *
 * `threshold`, `flingVelocity` and `crossFollow` default to
 * `DEFAULT_THRESHOLD` (0.25), `DEFAULT_FLING_VELOCITY` (0.5) and
 * `DEFAULT_CROSS_FOLLOW` (0.18): all three are exported constants from
 * `@rpxl/riffle`, and the engine's own `DEFAULTS` reads them too, so this
 * panel, the engine, and the API reference can never drift apart on what
 * "default" means.
 */
import { useMemo, useRef, useState } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import {
  DEFAULT_CROSS_FOLLOW,
  DEFAULT_FLING_VELOCITY,
  DEFAULT_ROTATION,
  DEFAULT_SPRING,
  DEFAULT_THRESHOLD,
} from '@rpxl/riffle'
import type { Framework } from '../lib/track-snippets'
import './tuning-panel.css'
import '../components/demo-stack.css'

const SWATCHES: readonly string[] = [
  'linear-gradient(150deg, #1f2a44, #5087c9)',
  'linear-gradient(150deg, #2a1a3c, #a85fc9)',
  'linear-gradient(150deg, #3a1526, #e14e73)',
  'linear-gradient(150deg, #3a2410, #e6913f)',
  'linear-gradient(150deg, #243a17, #8fc94e)',
]

interface TuningState {
  stiffness: number
  damping: number
  threshold: number
  flingVelocity: number
  maxRotation: number
  leverFactor: number
  crossFollow: number
}

const DEFAULT_STATE: TuningState = {
  stiffness: DEFAULT_SPRING.stiffness,
  damping: DEFAULT_SPRING.damping,
  threshold: DEFAULT_THRESHOLD,
  flingVelocity: DEFAULT_FLING_VELOCITY,
  maxRotation: DEFAULT_ROTATION.maxRotation,
  leverFactor: DEFAULT_ROTATION.leverFactor,
  crossFollow: DEFAULT_CROSS_FOLLOW,
}

interface SliderField {
  key: keyof TuningState
  testId: string
  label: string
  code: string
  min: number
  max: number
  step: number
  /** Only set where the raw number needs units to be unambiguous. */
  valueText?: (value: number) => string
}

const FIELDS: readonly SliderField[] = [
  {
    key: 'stiffness',
    testId: 'stiffness',
    label: 'Spring stiffness',
    code: 'spring.stiffness',
    min: 100,
    max: 700,
    step: 10,
  },
  {
    key: 'damping',
    testId: 'damping',
    label: 'Spring damping',
    code: 'spring.damping',
    min: 10,
    max: 80,
    step: 1,
  },
  {
    key: 'threshold',
    testId: 'threshold',
    label: 'Commit threshold',
    code: 'threshold',
    min: 0.05,
    max: 1,
    step: 0.01,
    valueText: (v) => `${v.toFixed(2)} of a step`,
  },
  {
    key: 'flingVelocity',
    testId: 'fling-velocity',
    label: 'Fling velocity',
    code: 'flingVelocity',
    min: 0.1,
    max: 3,
    step: 0.05,
    valueText: (v) => `${v.toFixed(2)} pixels per millisecond`,
  },
  {
    key: 'maxRotation',
    testId: 'max-rotation',
    label: 'Max rotation',
    code: 'rotation.maxRotation',
    min: 0,
    max: 45,
    step: 1,
    valueText: (v) => `${v.toFixed(0)} degrees`,
  },
  {
    key: 'leverFactor',
    testId: 'lever-factor',
    label: 'Lever factor',
    code: 'rotation.leverFactor',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'crossFollow',
    testId: 'cross-follow',
    label: 'Cross follow',
    code: 'crossFollow',
    min: 0,
    max: 1,
    step: 0.01,
  },
]

interface ConfigDiff {
  spring?: { stiffness: number; damping: number }
  threshold?: number
  flingVelocity?: number
  rotation?: { maxRotation?: number; leverFactor?: number }
  crossFollow?: number
}

function buildDiff(state: TuningState): ConfigDiff {
  const diff: ConfigDiff = {}
  if (state.stiffness !== DEFAULT_STATE.stiffness || state.damping !== DEFAULT_STATE.damping) {
    diff.spring = { stiffness: state.stiffness, damping: state.damping }
  }
  if (state.threshold !== DEFAULT_STATE.threshold) diff.threshold = state.threshold
  if (state.flingVelocity !== DEFAULT_STATE.flingVelocity) diff.flingVelocity = state.flingVelocity
  const rotation: { maxRotation?: number; leverFactor?: number } = {}
  if (state.maxRotation !== DEFAULT_STATE.maxRotation) rotation.maxRotation = state.maxRotation
  if (state.leverFactor !== DEFAULT_STATE.leverFactor) rotation.leverFactor = state.leverFactor
  if (Object.keys(rotation).length > 0) diff.rotation = rotation
  if (state.crossFollow !== DEFAULT_STATE.crossFollow) diff.crossFollow = state.crossFollow
  return diff
}

/**
 * How each framework track's reader writes these options, so "Copy config"
 * hands them something they can paste as is. Each is a typed, standalone
 * TypeScript snippet (e2e/specs/tuning-panel.spec.ts typechecks the exact
 * copied text on every track against the real built packages):
 *
 * - vanilla: a `Partial<RiffleOptions>`, not a `createRiffle(...)` call. A
 *   `createRiffle(container, {...})` wrapping would not be valid TypeScript
 *   on its own (`count` is required and there is no `container` in scope),
 *   so the object alone, which the reader merges into their own call, is
 *   what is copied.
 * - React: an object of `<Riffle>` props, spread onto the component.
 * - Vue: an object of `<Riffle>` props, bound with `v-bind`.
 *
 * The React and Vue objects use `satisfies` rather than a type annotation:
 * checked against the component's props, but keeping their own literal type,
 * so spreading them never widens the card type the component infers from
 * `cards`.
 */
const IDIOMS: Record<Framework, { head: string[]; open: string; close: string }> = {
  vanilla: {
    head: [
      "import type { RiffleOptions } from '@rpxl/riffle'",
      '',
      '// Merge into your own createRiffle options.',
    ],
    open: 'const options: Partial<RiffleOptions> = {',
    close: '}',
  },
  react: {
    head: [
      "import type { RiffleProps } from '@rpxl/riffle/react'",
      '',
      '// Spread onto your own <Riffle>: <Riffle {...tuning} cards={cards}>',
    ],
    open: 'const tuning = {',
    close: '} satisfies Partial<RiffleProps<unknown>>',
  },
  vue: {
    head: [
      "import type { RiffleProps } from '@rpxl/riffle/vue'",
      '',
      '// Bind onto your own <Riffle>: <Riffle v-bind="tuning" :cards="cards">',
    ],
    open: 'const tuning = {',
    close: '} satisfies Partial<RiffleProps<unknown>>',
  },
}

/**
 * Formatted TypeScript, containing only the options that differ from
 * their defaults, in `framework`'s idiom (see IDIOMS). Unquoted,
 * comma-terminated fields (ordinary object-literal style, not
 * `JSON.stringify` output): idiomatic TypeScript a reader would actually
 * write.
 */
function formatConfig(diff: ConfigDiff, framework: Framework): string {
  const lines: string[] = []
  if (diff.spring) {
    lines.push(
      `  spring: { stiffness: ${diff.spring.stiffness}, damping: ${diff.spring.damping} },`,
    )
  }
  if (diff.threshold !== undefined) lines.push(`  threshold: ${diff.threshold},`)
  if (diff.flingVelocity !== undefined) lines.push(`  flingVelocity: ${diff.flingVelocity},`)
  if (diff.rotation) {
    const parts: string[] = []
    if (diff.rotation.maxRotation !== undefined) {
      parts.push(`maxRotation: ${diff.rotation.maxRotation}`)
    }
    if (diff.rotation.leverFactor !== undefined) {
      parts.push(`leverFactor: ${diff.rotation.leverFactor}`)
    }
    lines.push(`  rotation: { ${parts.join(', ')} },`)
  }
  if (diff.crossFollow !== undefined) lines.push(`  crossFollow: ${diff.crossFollow},`)

  const body = lines.length === 0 ? ['  // Every slider is already at its default.'] : lines
  const idiom = IDIOMS[framework]
  return [...idiom.head, idiom.open, ...body, idiom.close].join('\n')
}

export default function TuningPanel({ framework }: { framework: Framework }) {
  const [state, setState] = useState<TuningState>(DEFAULT_STATE)
  const [status, setStatus] = useState('')
  const riffleRef = useRef<RiffleInstance | null>(null)

  const set = (key: keyof TuningState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    setState((prev) => ({ ...prev, [key]: value }))
    setStatus('')
  }

  const configText = useMemo(() => formatConfig(buildDiff(state), framework), [state, framework])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(configText)
      setStatus('Copied')
    } catch {
      setStatus('Could not copy: your browser blocked clipboard access.')
    }
  }

  function handleReset() {
    setState(DEFAULT_STATE)
    setStatus('')
  }

  return (
    <div className="tuning-panel not-content">
      <div className="tuning-panel__stack-column">
        <p className="demo-stack__label">Live</p>
        {/* fan() (the default layout, used here since this panel never passes
            a `layout` prop) offsets each card behind the front by
            `rotation`-independent -32px * depth (packages/core/src/layout/fan.ts's
            own default `offset`), and this panel's own sliders never expose
            maxVisible, so the reach that matters is the *default* fan's:
            offset 32 times up to ~3 fully-visible depths (maxVisible
            defaults to 4; a card only fades to fully transparent as depth
            approaches 4). `__stage` reserves 120px to the left of the
            160px-wide card, comfortably past that reach, and holds the
            actual card flush right within it so the fan spreads into
            reserved space instead of overflowing into the sidebar. */}
        <div className="tuning-panel__stage">
          <Riffle<string>
            aria-label="Tuning demo"
            cards={SWATCHES}
            getKey={(_card, index) => index}
            getLabel={(index) => `Card ${index + 1}`}
            cardWidth={160}
            cardHeight={220}
            spring={{ stiffness: state.stiffness, damping: state.damping }}
            threshold={state.threshold}
            flingVelocity={state.flingVelocity}
            rotation={{ maxRotation: state.maxRotation, leverFactor: state.leverFactor }}
            crossFollow={state.crossFollow}
            riffleRef={riffleRef}
            style={{ width: 160, height: 220 }}
          >
            {(gradient) => (
              <div
                className="demo-stack__poster tuning-panel__card"
                style={{ background: gradient }}
              />
            )}
          </Riffle>
        </div>
        <div className="demo-stack__controls">
          <button
            type="button"
            aria-label="Previous card"
            data-testid="tuning-prev"
            onClick={() => riffleRef.current?.prev()}
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <button
            type="button"
            aria-label="Next card"
            data-testid="tuning-next"
            onClick={() => riffleRef.current?.next()}
          >
            <span aria-hidden="true">&#8250;</span>
          </button>
        </div>
      </div>

      <TuningControls
        state={state}
        set={set}
        onCopy={handleCopy}
        onReset={handleReset}
        status={status}
      />
    </div>
  )
}

/**
 * Split out only so the prev/next buttons above can reach the live
 * `RiffleInstance` via `riffleRef` while the sliders stay declarative. Kept
 * in this file (not a second component file) since it shares every type and
 * constant above and is never used anywhere else.
 */
function TuningControls(props: {
  state: TuningState
  set: (key: keyof TuningState) => (event: React.ChangeEvent<HTMLInputElement>) => void
  onCopy: () => void
  onReset: () => void
  status: string
}) {
  const { state, set, onCopy, onReset, status } = props
  return (
    <div className="tuning-panel__controls">
      {FIELDS.map((field) => {
        const value = state[field.key]
        return (
          <div className="tuning-panel__field" key={field.key}>
            <label className="tuning-panel__field-label" htmlFor={`tuning-${field.testId}`}>
              <span>
                {field.label} (<code>{field.code}</code>)
              </span>
              <span className="tuning-panel__field-value">{value}</span>
            </label>
            <input
              id={`tuning-${field.testId}`}
              data-testid={`tuning-slider-${field.testId}`}
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={value}
              onChange={set(field.key)}
              aria-valuetext={field.valueText ? field.valueText(value) : undefined}
            />
          </div>
        )
      })}

      <div className="tuning-panel__actions">
        <button type="button" data-testid="tuning-copy" onClick={onCopy}>
          Copy config
        </button>
        <button type="button" data-testid="tuning-reset" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
      <p
        className="tuning-panel__status"
        role="status"
        aria-live="polite"
        data-testid="tuning-status"
      >
        {status}
      </p>
    </div>
  )
}
