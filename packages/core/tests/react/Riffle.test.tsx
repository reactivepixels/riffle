import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Riffle, type RiffleInstance } from '../../src/react/Riffle'

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

/** pointerdown plus three pointermoves, enough to clear slop and stay in a drag. No pointerup. */
function drag(root: Element): void {
  act(() => {
    fire(root, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(root, 'pointermove', { clientX: 120, clientY: 200 })
    fire(root, 'pointermove', { clientX: 140, clientY: 200 })
    fire(root, 'pointermove', { clientX: 160, clientY: 200 })
  })
}

function getRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('[data-riffle-root]') as HTMLElement | null
  if (!root) throw new Error('root not found')
  return root
}

afterEach(() => {
  cleanup()
})

interface Counter {
  value: number
}

function TestChild({ counter }: { counter: Counter }) {
  counter.value++
  return null
}

describe('Riffle', () => {
  it('renders zero times during a drag (zero re-render budget)', () => {
    const counter: Counter = { value: 0 }
    const { container } = render(
      <Riffle cards={[1, 2, 3]} cardWidth={300} cardHeight={400}>
        {() => <TestChild counter={counter} />}
      </Riffle>,
    )
    const root = getRoot(container)
    stubRoot(root)
    const beforeDrag = counter.value
    expect(beforeDrag).toBeGreaterThan(0)
    drag(root)
    expect(counter.value).toBe(beforeDrag)
  })
  // Break-it proof: add
  // `useRiffleState(riffle, (s) => s)` inside Riffle's own function body.
  // Selecting the whole snapshot re-renders Riffle (and therefore every
  // card) on the `isDragging` flip, and `counter.value` grows past
  // `beforeDrag` once the drag starts. Restore afterwards.

  it('does not re-render a sibling tracking activeIndex through onChange during a drag either', () => {
    const cardCounter: Counter = { value: 0 }
    const siblingCounter: Counter = { value: 0 }

    function Sibling({ activeIndex }: { activeIndex: number }) {
      siblingCounter.value++
      return <span>{activeIndex}</span>
    }

    function Harness() {
      const [activeIndex, setActiveIndex] = useState(0)
      return (
        <>
          <Riffle
            cards={[1, 2, 3]}
            cardWidth={300}
            cardHeight={400}
            onChange={(event) => setActiveIndex(event.index)}
          >
            {() => <TestChild counter={cardCounter} />}
          </Riffle>
          <Sibling activeIndex={activeIndex} />
        </>
      )
    }

    const { container } = render(<Harness />)
    const root = getRoot(container)
    stubRoot(root)
    const beforeDrag = siblingCounter.value
    expect(beforeDrag).toBeGreaterThan(0)
    drag(root)
    expect(siblingCounter.value).toBe(beforeDrag)
  })
  // Break-it proof: subscribe the harness to the
  // 'drag' event instead of 'change' (`riffle.on('drag', ...)` in Riffle.tsx's
  // onChange effect). The sibling then re-renders on every pointer move and
  // the equality assertion fails.

  it('focuses a field in the new active card from onChange, and it stays there', () => {
    let handle: RiffleInstance | null = null
    const inputs: Array<HTMLInputElement | null> = []
    render(
      <Riffle
        cards={['a', 'b', 'c']}
        cardWidth={300}
        cardHeight={400}
        riffleRef={(h) => {
          handle = h
        }}
        onChange={(event) => {
          // happy-dom does not enforce the platform rule that focus cannot
          // land inside an inert subtree, so this checks for it directly:
          // a real browser would refuse the .focus() call below on its own
          // if the new card were still inert at this point.
          const el = inputs[event.index]
          if (el && !el.closest('[inert]')) el.focus()
        }}
      >
        {(_card, index) => (
          <input
            ref={(el) => {
              inputs[index] = el
            }}
          />
        )}
      </Riffle>,
    )
    act(() => handle!.next())
    expect(document.activeElement).toBe(inputs[1])
  })

  it('fires onChange, and swapping the callback does not resubscribe', () => {
    let handle: RiffleInstance | null = null
    const onChangeA = { calls: 0 }
    const onChangeB = { calls: 0 }

    function Harness({ which }: { which: 'a' | 'b' }) {
      return (
        <Riffle
          cards={[1, 2, 3]}
          cardWidth={300}
          cardHeight={400}
          riffleRef={(h) => {
            handle = h
          }}
          onChange={which === 'a' ? () => onChangeA.calls++ : () => onChangeB.calls++}
        >
          {(card) => <span>{card}</span>}
        </Riffle>
      )
    }

    const { rerender } = render(<Harness which="a" />)
    act(() => handle!.next())
    expect(onChangeA.calls).toBe(1)
    expect(onChangeB.calls).toBe(0)

    rerender(<Harness which="b" />)
    act(() => handle!.next())
    expect(onChangeA.calls).toBe(1)
    expect(onChangeB.calls).toBe(1)
  })
  // Break-it proof: change the effect dependency
  // array from `[riffle]` to `[riffle, onChangeRef.current]`, or drop the
  // `onChangeRef` indirection and pass `onChange` itself straight into
  // `riffle.on('change', onChange)`. Either way, `onChangeA` keeps firing
  // after the swap because the old subscription is never released, and
  // `onChangeA.calls` ends up 2 instead of 1.

  it('gives riffleRef the handle, and clears it to null on unmount', () => {
    let handle: RiffleInstance | null = 'unset' as never
    const { unmount } = render(
      <Riffle
        cards={[1, 2, 3]}
        cardWidth={300}
        cardHeight={400}
        riffleRef={(h) => {
          handle = h
        }}
      >
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    expect(handle).not.toBeNull()
    expect(handle).not.toBe('unset')
    unmount()
    expect(handle).toBeNull()
  })
  // Break-it proof: remove the cleanup function
  // from the riffleRef effect (`return () => setRef(riffleRef, null)`), so
  // the effect only sets the ref and never clears it. The precondition
  // (`handle` is set, not the sentinel, before unmount) still passes, but
  // after `unmount()` the assertion `handle` is `null` fails: it stays the
  // last live handle.

  it('keeps each card element identity through a reorder when getKey is provided', () => {
    interface Card {
      id: number
    }
    const cards: Card[] = [{ id: 1 }, { id: 2 }, { id: 3 }]

    function Harness({ list }: { list: Card[] }) {
      return (
        <Riffle cards={list} cardWidth={300} cardHeight={400} getKey={(c) => c.id}>
          {(card) => <span data-testid={`card-${card.id}`}>{card.id}</span>}
        </Riffle>
      )
    }

    const { container, rerender } = render(<Harness list={cards} />)
    const before = container.querySelector('[data-testid="card-1"]')
    expect(before).not.toBeNull()
    rerender(<Harness list={[...cards].reverse()} />)
    const after = container.querySelector('[data-testid="card-1"]')
    expect(after).not.toBeNull()
    expect(after).toBe(before)
  })
  // Break-it proof: default the key to
  // `getKey ? getKey(card, index) : card.id` swapped for always `index`
  // (drop `getKey` support, i.e. `key={index}`). After reversing the list,
  // React keys every position identically across renders regardless of
  // which card object now sits there, so it reuses the DOM node at index 0
  // (now rendering card 3) rather than moving card 1's node; the captured
  // reference for card 1 is a *different* node (or null, since content
  // moved), and `after).toBe(before)` fails.

  it('applies className and cardClassName to the root and card elements', () => {
    const { container } = render(
      <Riffle
        cards={[1, 2]}
        cardWidth={300}
        cardHeight={400}
        className="my-root"
        cardClassName="my-card"
      >
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    const root = getRoot(container)
    expect(root.className).toBe('my-root')
    const card0 = container.querySelector('[data-riffle-card="0"]') as HTMLElement
    expect(card0.className).toBe('my-card')
  })
  // Break-it proof: drop `className` and
  // `cardClassName` from the destructured props passed to `getRootProps` and
  // `getCardProps` in Riffle.tsx (stop forwarding them). `root.className`
  // and `card0.className` are then both the empty string.

  it('forwards HTML attributes to the root, merging style and className, and keeps its own props off it', () => {
    const { container } = render(
      <Riffle
        cards={[1, 2]}
        cardWidth={300}
        cardHeight={400}
        getKey={(card) => card}
        id="films"
        aria-label="Films"
        data-testid="stack"
        className="my-root"
        style={{ color: 'red' }}
      >
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    const root = getRoot(container)
    expect(root.getAttribute('aria-label')).toBe('Films')
    expect(root.id).toBe('films')
    expect(root.getAttribute('data-testid')).toBe('stack')
    expect(root.className).toBe('my-root')
    expect(root.style.color).toBe('red')
    expect(root.style.display).toBe('grid')
    // Options and the adapter's own props are not attributes.
    for (const name of ['cardwidth', 'cardWidth', 'getkey', 'getKey', 'cards']) {
      expect(root.hasAttribute(name)).toBe(false)
    }
    // The engine still sets its own roles alongside the forwarded name.
    expect(root.getAttribute('aria-roledescription')).toBe('carousel')
  })

  it('exposes next, prev, goTo, on, instance, activeIndex and state through riffleRef, and no prop getters', () => {
    let handle: RiffleInstance | null = null
    render(
      <Riffle
        cards={[1, 2, 3]}
        cardWidth={300}
        cardHeight={400}
        riffleRef={(h) => {
          handle = h
        }}
      >
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    const h = handle as RiffleInstance | null
    expect(h).not.toBeNull()
    expect(Object.keys(h!).sort()).toEqual(
      ['activeIndex', 'goTo', 'instance', 'next', 'on', 'prev', 'state'].sort(),
    )
    expect(h!.instance).not.toBeNull()
    expect(h!.activeIndex).toBe(0)

    const onChange = vi.fn()
    const off = h!.on('change', onChange)
    act(() => h!.next())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(h!.activeIndex).toBe(1)
    expect(h!.state.activeIndex).toBe(1)
    act(() => h!.goTo(0, { animate: false }))
    expect(h!.activeIndex).toBe(0)
    act(() => h!.prev())
    expect(h!.activeIndex).toBe(2)
    off()
  })

  it('types riffleRef with the same member set as the Vue drop-in', () => {
    expectTypeOf<keyof RiffleInstance>().toEqualTypeOf<
      'next' | 'prev' | 'goTo' | 'on' | 'instance' | 'activeIndex' | 'state'
    >()
  })

  it('gives a callback ref the root element, alongside riffleRef, and the engine still works', () => {
    let handle: RiffleInstance | null = null
    let callbackEl: HTMLElement | null = null
    const { container } = render(
      <Riffle
        cards={[1, 2, 3]}
        cardWidth={300}
        cardHeight={400}
        riffleRef={(h) => {
          handle = h
        }}
        ref={(el) => {
          callbackEl = el
        }}
      >
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    const root = getRoot(container)
    // Precondition: the callback ref actually ran, with the real root node.
    expect(callbackEl).not.toBeNull()
    expect(callbackEl).toBe(root)

    act(() => handle!.next())
    expect(handle!.activeIndex).toBe(1)
  })
  // Break-it proof: in Riffle.tsx, drop `ref` from
  // `RiffleInner`'s `attrs` (leave the object empty instead of
  // `{ ref }`), so the render prop's own ref never reaches `getRootProps`.
  // `callbackEl` then stays `null` and the `not.toBeNull()` assertion fails.

  it('gives an object ref the root element', () => {
    const objectRef = { current: null as HTMLDivElement | null }
    const { container } = render(
      <Riffle cards={[1, 2, 3]} cardWidth={300} cardHeight={400} ref={objectRef}>
        {(card) => <span>{card}</span>}
      </Riffle>,
    )
    const root = getRoot(container)
    expect(objectRef.current).toBe(root)
  })
  // Break-it proof: same removal as above (drop
  // `ref` from `attrs` in `RiffleInner`). `objectRef.current` stays `null`
  // and the assertion fails.

  it('keeps position when cardWidth switches between a number and auto on a rerender', () => {
    let handle: RiffleInstance | null = null
    function Harness({ cardWidth }: { cardWidth: number | 'auto' }) {
      return (
        <Riffle
          cards={[1, 2, 3, 4]}
          cardWidth={cardWidth}
          cardHeight={400}
          riffleRef={(h) => {
            handle = h
          }}
        >
          {(card) => <span>{card}</span>}
        </Riffle>
      )
    }
    const { rerender } = render(<Harness cardWidth={300} />)
    act(() => handle!.goTo(2, { animate: false }))
    // Precondition: the position moved.
    expect(handle!.activeIndex).toBe(2)

    expect(() => rerender(<Harness cardWidth="auto" />)).not.toThrow()
    expect(handle!.activeIndex).toBe(2)
    expect(() => rerender(<Harness cardWidth={280} />)).not.toThrow()
    expect(handle!.activeIndex).toBe(2)
  })

  describe('card registration', () => {
    interface Card {
      id: string
    }
    let handle: RiffleInstance | null = null
    const captureHandle = (h: RiffleInstance | null) => {
      handle = h
    }
    function Harness({ list }: { list: Card[] }) {
      return (
        <Riffle
          cards={list}
          cardWidth={300}
          cardHeight={400}
          getKey={(c) => c.id}
          riffleRef={captureHandle}
        >
          {(card) => <span data-id={card.id} />}
        </Riffle>
      )
    }
    function cardOf(container: HTMLElement, id: string): HTMLElement {
      return container.querySelector(`[data-id="${id}"]`)!.parentElement as HTMLElement
    }

    it('labels every card correctly after a keyed swap, and keeps every card posed', () => {
      const { container, rerender } = render(<Harness list={[{ id: 'A' }, { id: 'B' }]} />)
      // Precondition: before the swap, A is first and B second.
      expect(cardOf(container, 'A').getAttribute('aria-label')).toBe('1 of 2')
      expect(cardOf(container, 'B').getAttribute('aria-label')).toBe('2 of 2')

      rerender(<Harness list={[{ id: 'B' }, { id: 'A' }]} />)
      const a = cardOf(container, 'A')
      const b = cardOf(container, 'B')
      expect(b.getAttribute('aria-label')).toBe('1 of 2')
      expect(a.getAttribute('aria-label')).toBe('2 of 2')

      // Force a recompute: a card the engine lost track of would keep its old
      // pose.
      //
      // Asserted on opacity, not transform: with count 2 and this exact
      // goTo, each card crosses between depth -1 (the invisible exit slot)
      // and depth 0 (the front card). Core's applyPose
      // (packages/core/src/render/transform.ts; see
      // packages/core/tests/adapter.test.ts's own copy of this same swap
      // for the full explanation) writes an invisible card's transform as
      // the neutral translate(0,0)/rotate(0)/scale(1), identical to the
      // front card's own real pose at depth 0, so the transform string
      // alone does not reliably differ across this one transition. Opacity
      // (0 at depth -1, 1 at depth 0) still does.
      const aOpacityBefore = a.style.opacity
      const bOpacityBefore = b.style.opacity
      act(() => handle!.goTo(1, { animate: false }))
      expect(a.style.opacity).not.toBe(aOpacityBefore)
      expect(b.style.opacity).not.toBe(bOpacityBefore)
    })

    it('labels a pushed card against the new count', () => {
      const list = [{ id: 'A' }, { id: 'B' }]
      const { container, rerender } = render(<Harness list={list} />)
      // Precondition: two cards.
      expect(cardOf(container, 'B').getAttribute('aria-label')).toBe('2 of 2')

      rerender(<Harness list={[...list, { id: 'C' }]} />)
      expect(cardOf(container, 'A').getAttribute('aria-label')).toBe('1 of 3')
      expect(cardOf(container, 'B').getAttribute('aria-label')).toBe('2 of 3')
      expect(cardOf(container, 'C').getAttribute('aria-label')).toBe('3 of 3')
    })
  })
})
