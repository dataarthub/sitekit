/** Fixed public error codes; no underlying storage/provider diagnostics. */
export type ManagementErrorCode = 'invalid' | 'forbidden' | 'conflict' | 'unavailable' | 'capacity';
/**
 * Safe shared fault. Hosts map invalid/forbidden/conflict/unavailable/capacity to 400/403/409/503/413.
 * @example
 * import { ManagementFault } from '@alneas/sitekit/management';
 * export const invalid = () => new ManagementFault('invalid');
 */
export class ManagementFault extends Error {
  /** Fixed machine-readable code. */
  readonly code: ManagementErrorCode;
  /**
   * Creates a safe fault without copying an internal exception.
   * @param code - Fixed public error code.
   * @example
   * import { ManagementFault } from '@alneas/sitekit/management';
   * export const conflict = () => new ManagementFault('conflict');
   */
  constructor(code: ManagementErrorCode) { super(code); this.name = 'ManagementFault'; this.code = code; }
}
