// A Server Component, same as the home page's, but with no route segment
// config: no dynamic data here, so Next prerenders this route at build
// time (confirmed by `next build`'s route table: "/static" reports as
// "Static", not "Dynamic"). This is what makes the home page and this route
// complementary proofs rather than redundant ones: "/" proves the render is
// window/document safe at request time, this route proves it at build time,
// and it is also the only place in this example the drop-in <Riffle>
// component itself gets server rendered at all (the home page uses the
// headless useRiffle composition instead; see StaticPosterStack.tsx).
import { StaticPosterStack } from './StaticPosterStack'

export default function StaticPage() {
  return <StaticPosterStack />
}
