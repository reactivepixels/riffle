/**
 * Identifies why a {@link RiffleError} was thrown. `INVALID_COUNT` and
 * `INVALID_OPTION` are construction or `update()` validation failures,
 * `NODE_NOT_FOUND` is an internal-only code not currently thrown across the
 * public API, and `DESTROYED` means a method was called after `destroy()`.
 *
 * @example
 * ```ts
 * import type { RiffleErrorCode } from '@rpxl/riffle'
 *
 * const code: RiffleErrorCode = 'DESTROYED'
 * ```
 */
export type RiffleErrorCode = 'INVALID_COUNT' | 'INVALID_OPTION' | 'NODE_NOT_FOUND' | 'DESTROYED'

/**
 * Thrown by `createRiffle` and its returned instance for an invalid option or
 * a call after `destroy()`. Branch on `code`, never on `message`: messages
 * are not part of the API and may change between versions.
 *
 * @example
 * ```ts
 * import { createRiffle, RiffleError } from '@rpxl/riffle'
 *
 * try {
 *   createRiffle(el, { count: -1 })
 * } catch (error) {
 *   if (error instanceof RiffleError && error.code === 'INVALID_COUNT') {
 *     // count must be a non-negative integer
 *   }
 * }
 * ```
 */
export class RiffleError extends Error {
  /** Which validation failed. Branch on this, never on `message`. */
  readonly code: RiffleErrorCode
  /** Reserved for future use; always `false` today. */
  readonly recoverable: boolean

  constructor(code: RiffleErrorCode, message: string, recoverable = false) {
    super(message)
    this.name = 'RiffleError'
    this.code = code
    this.recoverable = recoverable
  }
}
