# Releasing

Riffle uses [Changesets](https://github.com/changesets/changesets) to version and
publish its one package, `@rpxl/riffle` (`packages/core`), which ships the engine at
its root, and the React and Vue adapters as its `./react` and `./vue` subpath entries.
There is no separate adapter package to keep in version lockstep: the engine and both
adapters ship together, in the same tarball, at the same version.

## The boundary

Anyone preparing a release may go as far as adding a changeset and running
`pnpm publish --dry-run`. Creating the git tag, running `pnpm publish`, and anything that
touches the npm registry listing are the maintainer's alone, and are never delegated.

## First release: repository setup

Done once, before anything is published. Order matters here.

1. Create the empty `reactivepixels/riffle` repository on GitHub, with no generated
   README, license or `.gitignore`.
2. Push `main` on its own, first, and make sure it is the default branch before any other
   branch is pushed. The `github-pages` environment that `.github/workflows/docs.yml`
   deploys through only accepts deployments from the default branch, and GitHub makes the
   first branch pushed to an empty repository its default.

   ```
   git remote add origin git@github.com:reactivepixels/riffle.git
   git push -u origin main
   gh repo edit reactivepixels/riffle --default-branch main
   ```

3. Switch GitHub Pages to the GitHub Actions source (Settings, Pages, Build and
   deployment, Source: GitHub Actions, or
   `gh api -X POST repos/reactivepixels/riffle/pages -f build_type=workflow`). From then on
   every push to `main` deploys the docs.
4. Only now push the feature branches, and merge each into `main` through its own pull
   request, in dependency order. After each merge, update your local `main` before
   opening the next one: `git checkout main && git pull`.

## Steps

1. Run the manual accessibility pass in
   [`docs/accessibility-checklist.md`](./docs/accessibility-checklist.md) (VoiceOver on
   iOS, NVDA on Windows). Automation (`e2e/specs/a11y.spec.ts`) only catches roughly
   40% of real accessibility problems, so this manual pass is its own gate, not covered
   by a green `pnpm e2e`.
2. Add a changeset for the change: `pnpm changeset`. Pick a semver bump for
   `@rpxl/riffle` and write a summary a consumer would want to read in the changelog.
3. Run `pnpm changeset version`. This bumps the package version and writes a
   `CHANGELOG.md` entry from the changesets that have accumulated since the last
   release. It touches only the one published package (private workspace packages are
   excluded in `.changeset/config.json`), and needs no lockfile refresh afterwards.
4. Review the generated `CHANGELOG.md` for em dashes or en dashes. Changesets writes
   changelog prose from summaries written by hand, so it is not covered by the
   automated prose gate until it is committed and checked on the next run: read it
   yourself before it lands.
5. Run `pnpm build` so the version bump is reflected in what gets packed.
6. Update the core README's measured size: `pnpm --filter @rpxl/riffle
update-readme-size`. It reads `size-limit`'s own JSON output (never hand-typed) and
   rewrites the `<!-- size:start --> ... <!-- size:end -->` section in
   `packages/core/README.md`. Diff the result: a change here means the engine's
   gzipped size actually moved since the last release, worth a glance at whether the
   `size-limit` gate in `packages/core/package.json` still has a reasonable margin
   above it.
7. Dry-run the package and confirm the packed tarball contains only `dist`,
   `package.json`, `README.md`, and `LICENSE` (npm always adds the README and LICENSE;
   `files` in `package.json` declares `dist`). The dry run passes `--no-git-checks`
   because pnpm's git checks (publish branch, clean and up-to-date tree) would
   otherwise stop it while the version bump is still uncommitted. A dry run publishes
   nothing, so skipping those checks here is safe; the real publish below keeps them.

   ```
   pnpm --filter @rpxl/riffle publish --dry-run --no-git-checks
   ```

8. Check that the tarball ships all three entries. `npm pack` and `pnpm pack` both
   read straight from `dist`, so pack it and confirm each entry's files are present:

   ```
   cd packages/core && pnpm pack --pack-destination /tmp/riffle-pack && cd ../..
   tar -tzf /tmp/riffle-pack/rpxl-riffle-<version>.tgz | grep -E 'dist/(index|react/index|vue/index)\.(js|cjs|d\.ts|d\.cts)$'
   ```

   All twelve files (root, react and vue, `.js`/`.cjs`/`.d.ts`/`.d.cts` each, minus the
   map files this grep excludes) must be present: a missing one means
   `tsup.config.ts`'s entries or `package.json`'s `files` drifted apart.

9. Hand over to the maintainer. They create the git tag and run the real publish:
   `pnpm --filter @rpxl/riffle publish`.
