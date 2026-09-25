# Riffle: React infinite feed

A stack that grows as the user nears the end: once the active card is
within two of the last one, another eight generated cards are appended
through the `cards` prop after a simulated 300ms fetch, with a "Loading
more" state shown while it is in flight. `bounds: 'clamp'` makes the end
meaningful, and every card carries a stable id passed to `getKey`, so
growth never disturbs a card already on screen. The guard that stops the
fetch from firing more than once per approach (`src/growth.ts`) is unit
tested in `src/growth.test.ts`. Run `pnpm --filter react-infinite-feed dev`
from the repository root and open the printed URL.
