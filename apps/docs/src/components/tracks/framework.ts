/**
 * Shared by the track components: which framework track the page being
 * rendered belongs to, read from the `framework` frontmatter field that
 * scripts/generate-tracks.mjs adds to every track page. A track component
 * used on any other page fails the build with a message naming it, rather
 * than silently rendering nothing.
 */
import { FRAMEWORKS } from '../../../scripts/lib/tracks.mjs'
import type { Framework } from '../../lib/track-snippets'

// Framework (the registries' key type) and FRAMEWORKS (the list the
// generator and the content schema use) must name the same tracks.
type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const frameworksMatch: SameUnion<(typeof FRAMEWORKS)[number], Framework> = true
void frameworksMatch

export function isFramework(value: unknown): value is Framework {
  return typeof value === 'string' && (FRAMEWORKS as readonly string[]).includes(value)
}

export function pageFramework(component: string, data: { framework?: unknown }): Framework {
  const fw = data.framework
  if (!isFramework(fw)) {
    throw new Error(
      `<${component}> only works on a framework track page (one generated from src/tracks/), ` +
        `but this page has no \`framework\` in its frontmatter`,
    )
  }
  return fw
}

/** Parses `<Only fw="react, vue">` into a list, rejecting any unknown name. */
export function parseFrameworkList(value: string): Framework[] {
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) throw new Error('<Only> needs at least one framework in `fw`')
  for (const name of names) {
    if (!isFramework(name)) {
      throw new Error(
        `<Only fw="${value}"> names an unknown framework "${name}" (known: ${FRAMEWORKS.join(', ')})`,
      )
    }
  }
  return names as Framework[]
}
