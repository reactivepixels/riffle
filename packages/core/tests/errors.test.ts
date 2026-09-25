import { describe, expect, it } from 'vitest'
import { RiffleError } from '../src/errors'

describe('RiffleError', () => {
  it('carries a machine-readable code so consumers never match on message text', () => {
    const error = new RiffleError('INVALID_COUNT', 'count must be a non-negative integer')
    expect(error.code).toBe('INVALID_COUNT')
  })

  it('defaults to not recoverable', () => {
    expect(new RiffleError('DESTROYED', 'instance destroyed').recoverable).toBe(false)
  })

  it('can be marked recoverable', () => {
    expect(new RiffleError('NODE_NOT_FOUND', 'no node at index 3', true).recoverable).toBe(true)
  })

  it('is an Error and identifies itself by name', () => {
    const error = new RiffleError('INVALID_OPTION', 'threshold must be between 0 and 1')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('RiffleError')
  })

  it('survives instanceof across the transpiled class boundary', () => {
    expect(new RiffleError('DESTROYED', 'x')).toBeInstanceOf(RiffleError)
  })
})
