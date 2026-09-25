# Accessibility checklist (manual, per release)

Automation (`e2e/specs/a11y.spec.ts`, `axe-core` against every
example and every built docs page) catches roughly 40% of real accessibility problems.
This manual pass is the other 60%, a release gate, not a formality. Run it once per
release, before publishing (see `RELEASING.md`), on both:

- **VoiceOver on iOS** (Safari)
- **NVDA on Windows** (Firefox or Chrome; NVDA's own docs recommend Firefox first)

Test against `react-movie-stack` (`examples/react-movie-stack`), built and served
locally (`pnpm --filter react-movie-stack build && pnpm --filter react-movie-stack
preview`). It carries a real `getLabel` (each card's film title) and a real container
label (`aria-label="Films"`), so the utterances below are exact strings the engine
produces, not placeholders. Every expected utterance is derived directly from
`packages/core/src/a11y.ts`'s `formatCardLabel` and the attributes `update()` writes:

- Container: `role="group"`, `aria-roledescription="carousel"`, and whatever
  `aria-label` the host app gave it (`"Films"` on this example).
- Each card: `role="group"`, `aria-roledescription="slide"`, and
  `aria-label="${title}, ${n} of ${count}"` (or the bare `"${n} of ${count}"` when no
  `getLabel` is configured).
- Exactly one card at a time carries `tabindex="0"`; every other card is `inert`, not
  just visually hidden.
- The live region (`aria-live="polite"`, `aria-atomic="true"`) announces the same
  `formatCardLabel` string as the landed card's own `aria-label`, debounced 150ms after
  the last change (`packages/core/src/riffle.ts`'s `syncActive`).

Screen readers phrase `aria-roledescription` slightly differently by product and
version. What must hold in every case is the _content_: the label text, the position
("2 of 8"), and a word identifying it as a carousel or slide rather than a generic
group. Treat the "expected utterance" lines below as that content, not a transcript to
match character for character.

## Setup

**VoiceOver on iOS:** Settings > Accessibility > VoiceOver > on. Swipe right/left to
move the VoiceOver cursor, double-tap to activate, and use the rotor (twist two
fingers) to jump by heading or landmark. Open the page in Safari.

**NVDA on Windows:** install from nvaccess.org, launch it, open the page in Firefox.
Insert (or Caps Lock) + Down Arrow toggles browse/focus mode; the checks below mostly
need focus mode, since they exercise real Tab and arrow-key navigation, not NVDA's own
virtual cursor.

## Checks

### 1. Landing on the carousel

Tab into the page until focus reaches the stack.

- **Expected utterance (VoiceOver):** "Films, carousel" (the container's `aria-label`
  plus its `aria-roledescription`), then, as focus lands on the front card, "Neon
  Harbor, 1 of 8, slide" (or 8's actual first film in the build under test).
- **Expected utterance (NVDA):** "Films carousel", then "Neon Harbor, 1 of 8 slide".
- **Pass:** both the container and the front card are announced as something other than
  a bare, unlabelled "group", and the front card's position ("1 of 8") is spoken.
- **Fail:** either is announced as just "group" (the `aria-roledescription` was not
  read) or the position is missing.

### 2. Announcement on change, no focus loss

With focus still on the front card, press the "next" key for the stack's axis (Right
Arrow for this horizontal example) once.

- **Expected utterance:** "The Quiet Orbit, 2 of 8, slide" (or equivalent NVDA
  phrasing), spoken once, without re-announcing "Films, carousel" or repeating the
  previous card.
- **Pass:** the screen reader announces the new card's title and position, and
  immediately afterward, pressing Tab or an arrow key again still operates from the
  stack, meaning focus followed the active card, or, if you were on the front card
  itself, focus is now visibly on the new front card.
- **Fail:** silence (nothing announced), the announcement names the wrong card, or
  focus silently lands somewhere outside the stack (the browser's document body, the
  page's next landmark, and so on) after the change.

### 3. No focus loss across several changes

Press the "next" key three more times in a row, at a normal reading pace (roughly one
press per second, not rapid).

- **Pass:** each press produces one announcement naming the card just landed on (5 of
  8, then 6, 7 as you go, following whichever card is now active), and focus is never
  dropped to the page body between presses; VoiceOver's or NVDA's cursor stays on the
  stack throughout.
- **Fail:** focus escapes the stack at any point (the next arrow-key or Tab press does
  something other than move within the carousel), or an announcement is skipped.

### 4. Background card controls are unreachable

With the front card active, Tab forward through the rest of the page (past the stack's
Previous/Next buttons and any other controls on the page).

- **Pass:** the screen reader never lands on a control that visually belongs to a
  background card (a card other than the one currently active). Only the active card's
  own content, and controls genuinely outside the stack (Previous/Next buttons, page
  footer links, and so on), receive focus.
- **Fail:** Tab reaches something inside a card that is not the active one. This is the
  same property `e2e/specs/a11y.spec.ts`'s "background card controls are unreachable"
  test asserts automatically (`inert` on every non-active card); if this fails
  manually but the automated test is green, treat it as a genuine screen-reader-specific
  regression and file it, since it means something the DOM-level check cannot see (a
  browser or AT quirk around `inert`) is exposing background controls in practice.

### 5. Live region not flooding during rapid swipes

On a touch device (VoiceOver) or with rapid key presses (NVDA), advance the stack
quickly several times in under a second (a fast series of swipes, or holding the next
key/clicking the next button repeatedly).

- **Expected:** one announcement, naming wherever the stack actually lands, spoken
  after the swiping stops. Not one announcement per swipe.
- **Pass:** the screen reader speaks once (or is silent until it catches up, then
  speaks once), and what it says matches the card actually left on screen when the
  motion stops.
- **Fail:** the screen reader queues and reads out every intermediate card in turn
  (a "flood"), talking well after your fingers or key presses have stopped, or gets far
  enough behind that navigating further becomes confusing. `e2e/specs/a11y.spec.ts`'s
  live-region flood check covers the DOM side of this (the live region's text changes
  at most twice for ten rapid changes); this step is what a real screen reader user
  actually experiences from that debounce.

### 6. Keyboard-only pass

Unplug the mouse, or ignore the touchscreen entirely. Using only the keyboard: Tab to
the stack, then Right Arrow / Left Arrow to move through every card to the last one,
then Home to jump back to the first, then End to jump to the last.

- **Pass:** every card is reachable, Home and End jump to the first and last card
  respectively, and the visible focus ring is visible on the front card at every step:
  the focus ring on the root is visible and never removed.
- **Fail:** any card is unreachable by keyboard, Home/End do nothing or go to the wrong
  place, or the focus ring disappears at any point.

## Recording the result

Note the browser, OS, and screen reader version tested (`VoiceOver, iOS 18.x, Safari`
or `NVDA 2025.x, Firefox`) alongside pass/fail for each check, in the release's own
notes. A failure here blocks the release the same way a failing automated gate does;
see `RELEASING.md`.
