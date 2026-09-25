import { act, cleanup, render } from '@testing-library/react'
import { createRef, StrictMode, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRiffle, type RiffleHandle } from '../../src/react/useRiffle'
import { useRiffleState } from '../../src/react/useRiffleState'

/** happy-dom does not implement pointer capture or layout; the engine only calls these. */
function stubRoot(el: HTMLElement): void {
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 }) as DOMRect
}

function fire(node: Element, type: string, init: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(
    event,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 },
    init,
  )
  node.dispatchEvent(event)
}

// A stable ref identity, module scoped rather than an inline closure created
// fresh per render. It is still good practice to use one (an unstable ref
// re-registers the card with the engine on every render, wasted work, see
// getCardProps's own doc), but an unstable
// *root* ref no longer destroys and recreates the engine: the core handle
// defers rootRef(null)'s teardown by a microtask specifically so a fresh
// composed ref on every render (the detach/reattach round trip that
// produces) is a safe no-op, not a rebuild. See the dedicated test below.
const attachStub = (el: HTMLElement | null): void => {
  if (el) stubRoot(el)
}

function Basic({ count = 3 }: { count?: number }) {
  const riffle = useRiffle({ count, cardWidth: 300, cardHeight: 400 })
  return (
    <section {...riffle.getRootProps({ ref: attachStub })}>
      {Array.from({ length: count }, (_, i) => (
        <article key={i} {...riffle.getCardProps(i)} />
      ))}
    </section>
  )
}

afterEach(() => {
  cleanup()
})

describe('useRiffle', () => {
  it('mounts and wires the engine', () => {
    const { container } = render(<Basic />)
    const root = container.querySelector('[role="group"]')
    expect(root).not.toBeNull()
    const card0 = container.querySelector('[data-riffle-card="0"]') as HTMLElement
    expect(card0.getAttribute('aria-label')).toBe('1 of 3')
    expect(card0.style.transform).not.toBe('')
  })
  // Break-it proof: comment out the `stubRoot` ref assignment so
  // getBoundingClientRect stays the jsdom/happy-dom default (all zeros). The
  // mount assertions above still pass, because they do not depend on layout;
  // this test only proves the engine actually wired up and positioned the
  // card, which the a11y label and non-empty transform jointly establish.
  // Genuine break-it: rename `getRootProps` internally so the root ref never
  // attaches (e.g. return `{ ...props, style }` without `ref`). Then
  // `container.querySelector('[role="group"]')` is null.

  it('updates state through useRiffleState and next()', () => {
    let handle!: RiffleHandle
    function WithState() {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      const activeIndex = useRiffleState(riffle, (s) => s.activeIndex)
      return (
        <section {...riffle.getRootProps({ ref: attachStub })}>
          <span data-testid="active">{activeIndex}</span>
        </section>
      )
    }
    const { getByTestId } = render(<WithState />)
    expect(getByTestId('active').textContent).toBe('0')
    act(() => handle.next())
    expect(getByTestId('active').textContent).toBe('1')
  })
  // Break-it proof: replace `s.activeIndex` with a selector that always
  // returns 0, e.g. `() => 0`. The precondition (initial render shows "0")
  // still passes, but the post-next() assertion ("1") fails, proving the
  // test actually observes the subscription rather than a frozen value.

  /** Let every deferred teardown (one microtask) run, inside act. */
  async function flush(): Promise<void> {
    await act(async () => {})
  }

  /** Exactly one engine is live on `root`, it is still `instance`, and it navigates. */
  function expectOneLiveEngine(handle: RiffleHandle, instance: unknown, root: Element): void {
    expect(handle.instance).not.toBeNull()
    expect(handle.instance).toBe(instance)
    expect(root.querySelectorAll('[aria-live]').length).toBe(1)
    const before = handle.getSnapshot().activeIndex
    act(() => handle.next())
    expect(handle.getSnapshot().activeIndex).toBe((before + 1) % 3)
  }

  it('creates exactly one live engine under StrictMode, and it survives the microtask and rerenders', async () => {
    let handle!: RiffleHandle
    let bump!: () => void
    function StrictBasic() {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      const [, setTick] = useState(0)
      bump = () => setTick((n) => n + 1)
      return (
        <section {...riffle.getRootProps({ ref: attachStub })}>
          {[0, 1, 2].map((i) => (
            <article key={i} {...riffle.getCardProps(i)} />
          ))}
        </section>
      )
    }
    const { container } = render(
      <StrictMode>
        <StrictBasic />
      </StrictMode>,
    )
    const root = container.querySelector('[data-riffle-root]') as HTMLElement
    const instance = handle.instance
    // Precondition: a real instance mounted.
    expect(instance).not.toBeNull()

    await flush()
    expectOneLiveEngine(handle, instance, root)
    for (let i = 0; i < 3; i += 1) {
      act(() => bump())
      await flush()
      expectOneLiveEngine(handle, instance, root)
    }
  })

  it('keeps the identical instance across re-renders with an unstable root ref, and a drag survives a re-render mid-gesture', async () => {
    // `getRootProps({ ref: el => ... })`, an ordinary inline React ref, is a
    // fresh closure every render, so the composed ref's identity changes
    // every render too: React detaches the old one (rootRef(null)) and
    // attaches the new one (rootRef(el)) on every render. The handle must
    // treat that round trip as a no-op, not a rebuild.
    let handle!: RiffleHandle
    let bump!: () => void
    function WithInlineRef() {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      const [, setTick] = useState(0)
      bump = () => setTick((n) => n + 1)
      return (
        <section
          {...riffle.getRootProps({
            // Deliberately NOT `attachStub`: a fresh closure every render.
            ref: (el) => {
              if (el) stubRoot(el)
            },
          })}
        />
      )
    }
    const { container } = render(<WithInlineRef />)
    const root = container.querySelector('[data-riffle-root]') as HTMLElement
    const instance = handle.instance
    // Precondition: a real instance mounted.
    expect(instance).not.toBeNull()

    await flush()
    expectOneLiveEngine(handle, instance, root)
    for (let i = 0; i < 3; i += 1) {
      act(() => bump())
      await flush()
      expectOneLiveEngine(handle, instance, root)
    }

    // Settle at rest, start a drag, then let a state change re-render
    // mid-gesture.
    act(() => handle.goTo(0, { animate: false }))
    const rest = handle.instance!.position
    act(() => {
      fire(root, 'pointerdown', { clientX: 100, clientY: 200 })
      fire(root, 'pointermove', { clientX: 130, clientY: 200 })
    })
    act(() => bump())
    await flush()

    expect(handle.instance).toBe(instance)
    // The drag is still in progress: continuous position has moved off rest.
    expect(handle.getSnapshot().isDragging).toBe(true)
    expect(handle.instance!.position).not.toBe(rest)
  })
  // Break-it proof: delete the same-element
  // cancellation branch at the top of core's rootRef, so every null call's
  // teardown runs. Both tests above then fail at the first flush(): the
  // instance is null (or a different one) after the microtask.

  it('tears the engine down when the root unmounts in the same commit as an axis change', async () => {
    let handle!: RiffleHandle
    function Toggle({ show, axis }: { show: boolean; axis: 'x' | 'y' }) {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400, axis })
      handle = riffle
      return <>{show && <section {...riffle.getRootProps({ ref: attachStub })} />}</>
    }
    const { rerender } = render(<Toggle show axis="x" />)
    // Precondition: mounted.
    expect(handle.instance).not.toBeNull()

    rerender(<Toggle show={false} axis="y" />)
    await flush()
    await flush()
    expect(handle.instance).toBeNull()
  })

  it('destroys the engine on unmount, after a microtask', async () => {
    // The core handle defers rootRef(null)'s
    // teardown by one microtask (so StrictMode's and an unstable consumer
    // ref's spurious detach/reattach round trips don't rebuild the engine),
    // so `instance` is not null the instant `unmount()` returns.
    let handle!: RiffleHandle
    function ForUnmount() {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      return <section {...riffle.getRootProps({ ref: attachStub })} />
    }
    const { unmount } = render(<ForUnmount />)
    expect(handle.instance).not.toBeNull()
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(handle.instance).toBeNull()
  })
  // Break-it proof: assert only `expect(handle.instance).toBeNull()` after
  // unmount with no precondition. Removing the ref's null-call handling (in
  // core's rootRef, guard `if (el === container) return`) still passes that
  // lone assertion when instance was never wired in the first place; the
  // precondition line above (`not.toBeNull()` before unmount) is what forces
  // the engine to have actually mounted.

  it('propagates prop changes to the engine', () => {
    let handle!: RiffleHandle
    function Resizable({ count }: { count: number }) {
      const riffle = useRiffle({ count, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      const cnt = useRiffleState(riffle, (s) => s.count)
      return (
        <section {...riffle.getRootProps({ ref: attachStub })}>
          <span data-testid="count">{cnt}</span>
        </section>
      )
    }
    const { rerender, getByTestId } = render(<Resizable count={3} />)
    expect(getByTestId('count').textContent).toBe('3')
    rerender(<Resizable count={5} />)
    expect(getByTestId('count').textContent).toBe('5')
  })
  // Break-it proof: remove the `useIsomorphicLayoutEffect(() => adapter.setOptions(options))`
  // call from useRiffle.ts. The precondition ("3" on first render) still
  // passes, but after rerendering with count 5 the count stays "3" and the
  // assertion fails.

  it('merges the consumer ref and style on card props', () => {
    const cardRef = createRef<HTMLElement>()
    function WithConsumerRef() {
      const riffle = useRiffle({ count: 1, cardWidth: 300, cardHeight: 400 })
      return (
        <section {...riffle.getRootProps({ ref: attachStub })}>
          <article {...riffle.getCardProps(0, { ref: cardRef, style: { color: 'red' } })} />
        </section>
      )
    }
    render(<WithConsumerRef />)
    expect(cardRef.current).not.toBeNull()
    expect(cardRef.current!.style.gridArea).toBe('1 / 1')
    expect(cardRef.current!.style.color).toBe('red')
  })
  // Break-it proof: in getCardProps, return `ref: adapter.cardRef(index)`
  // instead of `mergeRef(adapter.cardRef(index), props?.ref)`. The
  // precondition (element registers, style has grid-area) still passes, but
  // `cardRef.current` stays null because the consumer's own ref is dropped.

  it('bounds re-renders when the selector returns a fresh object each time', () => {
    let handle!: RiffleHandle
    let renders = 0
    function ObjectSelector() {
      const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
      handle = riffle
      useRiffleState(riffle, (s) => ({ i: s.activeIndex }))
      renders++
      return <section {...riffle.getRootProps({ ref: attachStub })} />
    }
    render(<ObjectSelector />)
    const afterMount = renders
    expect(afterMount).toBeGreaterThan(0)
    act(() => handle.next())
    expect(renders).toBeLessThan(afterMount + 10)
  })
  // Break-it proof: in useRiffleState, drop the cache
  // and call `selector(riffle.getSnapshot())` directly from `read`. Every
  // `getSnapshot` call then returns a fresh object, and either React logs
  // "The result of getSnapshot should be cached" and re-renders in a loop
  // (Vitest's console.error spy would catch it) or `renders` blows past the
  // bound. Restore afterwards.
})

describe('useRiffle types', () => {
  it('spreads getRootProps onto a section and getCardProps onto an article with no casts', () => {
    function TypedUsage() {
      const riffle = useRiffle({ count: 2, cardWidth: 300, cardHeight: 400 })
      return (
        <section {...riffle.getRootProps()}>
          <article {...riffle.getCardProps(0)} />
          <article {...riffle.getCardProps(1)} />
        </section>
      )
    }
    // This test's job is the typecheck, not the assertion; render just
    // proves the component is otherwise valid JSX.
    render(<TypedUsage />)
    expect(true).toBe(true)
  })

  it('spreads getRootProps and getCardProps onto a div with no casts', () => {
    // `div` is exactly the element `Riffle.tsx` uses, and the one that forced
    // the `Ref<HTMLElement>` to `RefCallback<HTMLElement>` narrowing on
    // getRootProps/getCardProps (a `div`'s ref type is `Ref<HTMLDivElement>`,
    // and `RefObject<HTMLElement>` is not assignable to `RefObject<HTMLDivElement>`
    // even though a callback ref safely is). Locking this in here means a
    // regression shows up even if Riffle.tsx itself ever stops using `div`.
    function TypedDivUsage() {
      const riffle = useRiffle({ count: 2, cardWidth: 300, cardHeight: 400 })
      return (
        <div {...riffle.getRootProps()}>
          <div {...riffle.getCardProps(0)} />
          <div {...riffle.getCardProps(1)} />
        </div>
      )
    }
    render(<TypedDivUsage />)
    expect(true).toBe(true)
  })
})
