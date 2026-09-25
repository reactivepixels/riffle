import { createRiffle, type Riffle } from '@rpxl/riffle'
import { cardGradient, generateCards, type FeedCard } from './feed-cards'
import { shouldGrow } from './growth'
import './app.css'

const PAGE_SIZE = 8
const GROWTH_THRESHOLD = 2
const LATENCY_MS = 300
const CARD_WIDTH_DESKTOP = 240
const CARD_HEIGHT_DESKTOP = 320
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 200
const MOBILE_QUERY = '(max-width: 520px)'

function cardSize(mobile: boolean): { width: number; height: number } {
  return mobile
    ? { width: CARD_WIDTH_MOBILE, height: CARD_HEIGHT_MOBILE }
    : { width: CARD_WIDTH_DESKTOP, height: CARD_HEIGHT_DESKTOP }
}

/**
 * Builds a stack that grows as the reader nears the end inside `el`.
 * Mirrors examples/react-infinite-feed/src/App.tsx: `bounds: 'clamp'`, eight
 * generated cards appended once the active card is within two of the last
 * one, a simulated 300ms fetch, and a "Loading more" state shown while one
 * is in flight. `shouldGrow` (./growth.ts, ported from that example's own
 * growth.ts) is the same guard against firing more than once per approach.
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  page.className = 'recipe-feed'

  const stage = document.createElement('div')
  stage.className = 'stage'
  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Feed')
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'control'
  prevButton.setAttribute('aria-label', 'Previous card')
  prevButton.innerHTML = '<span aria-hidden="true">&#8249;</span>'
  const readout = document.createElement('p')
  readout.className = 'readout'
  readout.setAttribute('data-testid', 'readout')
  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'control'
  nextButton.setAttribute('aria-label', 'Next card')
  nextButton.setAttribute('data-testid', 'next-button')
  nextButton.innerHTML = '<span aria-hidden="true">&#8250;</span>'
  controls.appendChild(prevButton)
  controls.appendChild(readout)
  controls.appendChild(nextButton)
  page.appendChild(controls)

  const loading = document.createElement('p')
  loading.className = 'loading'
  loading.setAttribute('aria-live', 'polite')
  loading.setAttribute('data-testid', 'loading')
  page.appendChild(loading)

  el.appendChild(page)

  const mql = window.matchMedia(MOBILE_QUERY)
  let { width, height } = cardSize(mql.matches)

  let cards: FeedCard[] = generateCards(0, PAGE_SIZE)
  let nextId = PAGE_SIZE
  let isLoading = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const cardFaces: HTMLElement[] = []

  function buildCard(card: FeedCard): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'feed-card'
    wrapper.style.gridArea = '1 / 1'

    const face = document.createElement('div')
    face.className = 'feed-card-face'
    face.style.width = `${width}px`
    face.style.height = `${height}px`
    face.style.background = cardGradient(card)

    const id = document.createElement('span')
    id.className = 'feed-card-id'
    id.setAttribute('aria-hidden', 'true')
    id.textContent = `#${card.id + 1}`

    face.appendChild(id)
    wrapper.appendChild(face)
    cardFaces.push(face)
    return wrapper
  }

  cards.forEach((card) => stack.appendChild(buildCard(card)))

  const riffle: Riffle = createRiffle(stack, {
    count: cards.length,
    bounds: 'clamp',
    cardWidth: width,
    cardHeight: height,
  })

  Array.from(stack.children).forEach((child, index) =>
    riffle.registerNode(index, child as HTMLElement),
  )

  function updateReadout(): void {
    const index = riffle.getSnapshot().activeIndex
    readout.textContent = `Card ${index + 1} of ${cards.length}`
  }

  function updateLoadingText(): void {
    loading.textContent = isLoading ? 'Loading more' : ''
  }

  // #region growth-wiring
  /**
   * Checks the growth guard against the current state and, if it says yes,
   * starts the simulated fetch. Called after mount, after every `change`,
   * and after every append: the three moments either input to the guard
   * (the active index, or the card count) can change.
   */
  function checkGrowth(): void {
    const activeIndex = riffle.getSnapshot().activeIndex
    if (!shouldGrow({ activeIndex, count: cards.length, isLoading }, GROWTH_THRESHOLD)) return
    isLoading = true
    updateLoadingText()
    timer = setTimeout(() => {
      const page = generateCards(nextId, PAGE_SIZE)
      nextId += PAGE_SIZE
      page.forEach((card) => stack.appendChild(buildCard(card)))
      const startIndex = cards.length
      cards = [...cards, ...page]
      page.forEach((_, i) =>
        riffle.registerNode(startIndex + i, stack.children[startIndex + i] as HTMLElement),
      )
      riffle.setCount(cards.length)
      isLoading = false
      timer = null
      updateLoadingText()
      updateReadout()
      checkGrowth()
    }, LATENCY_MS)
  }
  // #endregion growth-wiring

  function onMobileChange(): void {
    const next = cardSize(mql.matches)
    if (next.width === width && next.height === height) return
    width = next.width
    height = next.height
    cardFaces.forEach((face) => {
      face.style.width = `${width}px`
      face.style.height = `${height}px`
    })
    riffle.update({ cardWidth: width, cardHeight: height })
  }
  mql.addEventListener('change', onMobileChange)

  function onPrev(): void {
    riffle.prev()
  }
  function onNext(): void {
    riffle.next()
  }
  prevButton.addEventListener('click', onPrev)
  nextButton.addEventListener('click', onNext)

  const unsubscribe = riffle.on('change', () => {
    updateReadout()
    checkGrowth()
  })
  updateReadout()
  updateLoadingText()
  checkGrowth()

  return function unmount(): void {
    if (timer) clearTimeout(timer)
    mql.removeEventListener('change', onMobileChange)
    prevButton.removeEventListener('click', onPrev)
    nextButton.removeEventListener('click', onNext)
    unsubscribe()
    riffle.destroy()
    el.innerHTML = ''
  }
}

const root = document.getElementById('infinite-feed-recipe-root')
if (root) mount(root)
