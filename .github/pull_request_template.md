## What this changes

<!-- One or two sentences: what does this PR do, and why. -->

## Tests

<!--
What test(s) cover this change, and how do they cover it. A change with no
behavior (docs, formatting) can say so instead.
-->

## Break-it proof

<!--
Required for any behavioral test you added or changed (see CONTRIBUTING.md's
"The test rule"): temporarily break the line the test covers, run the test, paste the
real failure message below, then restore the line. "I confirmed the test works" is not
evidence; the actual RED output is.

Example:
  Broke: packages/core/src/riffle.ts, changed `progress > threshold` to
  `progress >= threshold`.
  Ran: pnpm --filter @rpxl/riffle test commit-threshold
  Got: FAIL  the drag commits past the configured threshold
       expected true to be false
  Restored the line; test passes again.
-->

## Checklist

- [ ] `pnpm -r test` passes
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm gates` passes
- [ ] No em dashes or en dashes were added (see CONTRIBUTING.md's writing style section)
- [ ] Docs updated, if this changes public behavior
