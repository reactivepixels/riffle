/**
 * Page chrome only: a nav linking to each recipe, and a hash router that
 * mounts one recipe component per route. No router dependency: the hash
 * fragment never reaches the server, so `vite preview`'s static file server
 * needs no history-fallback configuration either.
 *
 * Every recipe component is self-contained (no props, no dependency on this
 * file's own app.css), so this shell's only real job beyond navigation is
 * reserving the room each recipe's fan needs so it never gets clipped: see
 * app.css's `.stage--fan` and `.stage--arc`. `stage--fan` covers the three
 * recipes built on the reference `fan()` layout, which spreads cards behind
 * the front one toward the negative (left) side; `stage--arc` covers
 * CustomLayoutStack, whose own `spread()` layout arcs the other way and
 * already sizes its own box to fit.
 */
import { useEffect, useState, type ComponentType } from 'react'
import ClampStack from './ClampStack'
import CustomLayoutStack from './CustomLayoutStack'
import ExternalControlStack from './ExternalControlStack'
import FormCardsStack from './FormCardsStack'

interface Recipe {
  /** The hash-route segment, e.g. `clamp` for `#/clamp`. */
  slug: string
  label: string
  description: string
  Component: ComponentType
  stage: 'fan' | 'arc'
}

const RECIPES: readonly Recipe[] = [
  {
    slug: 'clamp',
    label: 'Clamp with controls',
    description: "bounds: 'clamp', with Prev/Next genuinely disabled at either end.",
    Component: ClampStack,
    stage: 'fan',
  },
  {
    slug: 'programmatic-control',
    label: 'Programmatic control',
    description: 'A sibling component drives the stack entirely through the imperative handle.',
    Component: ExternalControlStack,
    stage: 'fan',
  },
  {
    slug: 'forms-in-cards',
    label: 'Forms inside cards',
    description: 'Every card holds a real text input; only the active one is ever reachable.',
    Component: FormCardsStack,
    stage: 'fan',
  },
  {
    slug: 'custom-layout',
    label: 'Custom layout',
    description: 'A hand-written LayoutStrategy, arcing cards out instead of stacking them.',
    Component: CustomLayoutStack,
    stage: 'arc',
  },
]

function readSlug(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hash.replace(/^#\/?/, '')
}

function useHashRoute(): string {
  const [slug, setSlug] = useState(readSlug)
  useEffect(() => {
    const onHashChange = () => setSlug(readSlug())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return slug
}

export function App() {
  const slug = useHashRoute()
  const active = RECIPES.find((recipe) => recipe.slug === slug)

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-title" href="#/">
          Riffle: React recipes
        </a>
        <nav className="app-nav" aria-label="Recipes">
          {RECIPES.map((recipe) => (
            <a
              key={recipe.slug}
              href={`#/${recipe.slug}`}
              aria-current={slug === recipe.slug ? 'page' : undefined}
            >
              {recipe.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {active ? (
          <div className="page">
            <div className={`stage stage--${active.stage}`}>
              <active.Component />
            </div>
            <p className="page-description">{active.description}</p>
          </div>
        ) : (
          <div className="page index-page">
            <h1>React recipes</h1>
            <p>
              Four small React apps, each demonstrating one Riffle recipe. Pick one from the nav
              above, or from the list below.
            </p>
            <ul className="index-list">
              {RECIPES.map((recipe) => (
                <li key={recipe.slug}>
                  <a href={`#/${recipe.slug}`}>{recipe.label}</a>
                  <p>{recipe.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
