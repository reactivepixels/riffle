import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }

describe('package contract', () => {
  it('has zero runtime dependencies', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([])
  })

  it('keeps react and vue as peer dependencies, not runtime dependencies', () => {
    // 3.4.20 is the first Vue release that ships DefineSetupFnComponent, which
    // the generic <Riffle> type is built on. A wider range would admit
    // versions where consumers' vue-tsc fails.
    expect(pkg.peerDependencies).toEqual({
      react: '^18.0.0 || ^19.0.0',
      vue: '^3.4.20',
    })
    expect(pkg.dependencies).not.toHaveProperty('react')
    expect(pkg.dependencies).not.toHaveProperty('vue')
  })

  it('marks both peer dependencies optional, since a consumer imports at most one framework entry', () => {
    expect(pkg.peerDependenciesMeta).toEqual({
      react: { optional: true },
      vue: { optional: true },
    })
  })

  it('gates the gzip size at measured plus 256 B for the engine alone', () => {
    // The size budget is "min+gzip", and size-limit measures brotli
    // unless told otherwise, so the entry must opt into gzip explicitly.
    // The gate was raised to 7.5 kB against the original 6 kB hard fail to
    // make room for scheduled features, then a size pass profiled the
    // minified engine, removed four provably dead spots
    // the mutation pass flagged, and ratcheted the gate to the measured
    // gzip size (6716 B after the trims) plus a 256 B margin: 6972 B.
    //
    // The array budgets the vanilla engine separately from the
    // engine plus adapter handle, since a bundler with sideEffects: false
    // drops the handle for callers who only import createRiffle.
    const entries = pkg['size-limit'] as Array<{ name?: string; gzip?: boolean; limit?: string }>
    const engine = entries.find((entry) => entry.name === 'engine')
    expect(engine?.gzip).toBe(true)
    expect(engine?.limit).toBe('6972 B')
  })

  it('gates the gzip size at measured plus 256 B for the engine plus adapter handle', () => {
    // Measured 7553 B plus a 256 B margin: 7809 B.
    const entries = pkg['size-limit'] as Array<{ name?: string; gzip?: boolean; limit?: string }>
    const withHandle = entries.find((entry) => entry.name === 'engine + adapter handle')
    expect(withHandle?.gzip).toBe(true)
    expect(withHandle?.limit).toBe('7809 B')
  })

  it('gates the gzip size at measured plus 128 B for the react entry, ignoring the engine and react', () => {
    // Measured 1144 B plus a 128 B margin: 1272 B.
    const entries = pkg['size-limit'] as Array<{
      name?: string
      gzip?: boolean
      limit?: string
      ignore?: string[]
    }>
    const react = entries.find((entry) => entry.name === 'react entry')
    expect(react?.gzip).toBe(true)
    expect(react?.limit).toBe('1272 B')
    expect(react?.ignore).toEqual(expect.arrayContaining(['@rpxl/riffle', 'react', 'react-dom']))
  })

  it('gates the gzip size at measured plus 128 B for the vue entry, ignoring the engine and vue', () => {
    // Measured 1214 B plus a 128 B margin: 1342 B.
    const entries = pkg['size-limit'] as Array<{
      name?: string
      gzip?: boolean
      limit?: string
      ignore?: string[]
    }>
    const vue = entries.find((entry) => entry.name === 'vue entry')
    expect(vue?.gzip).toBe(true)
    expect(vue?.limit).toBe('1342 B')
    expect(vue?.ignore).toEqual(expect.arrayContaining(['@rpxl/riffle', 'vue']))
  })

  it('ships only dist', () => {
    expect(pkg.files).toEqual(['dist'])
  })

  it('publishes publicly, since a scoped package defaults to restricted', () => {
    // npm treats a scoped name (@rpxl/...) as private on its first publish
    // unless the manifest says otherwise, and a free account cannot publish
    // a private package at all.
    expect(pkg.publishConfig).toEqual({ access: 'public' })
  })

  it('is side-effect free so bundlers can tree-shake it', () => {
    expect(pkg.sideEffects).toBe(false)
  })

  it('has no em dashes or en dashes in its description', () => {
    // Built from code points, never literal dashes in source, so this file
    // cannot itself trip a dash lint that scans for the characters.
    const dashes = [0x2014, 0x2013].map((code) => String.fromCharCode(code))
    expect(dashes.some((dash) => pkg.description.includes(dash))).toBe(false)
  })
})
