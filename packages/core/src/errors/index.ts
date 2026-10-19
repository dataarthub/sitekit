/** Stable codes for SiteKit-owned configuration, publication and verified-image failures. */
export type SiteKitErrorCode =
  | 'SK_CONFIG_INVALID'
  | 'SK_CONTENT_MISSING'
  | 'SK_CONTENT_READ_FAILED'
  | 'SK_SNAPSHOT_INVALID'
  | 'SK_SITE_ID_MISMATCH'
  | 'SK_REVISION_MISMATCH'
  | 'SK_IMAGE_INVALID'
  | 'SK_IMAGE_HASH_MISSING'
  | 'SK_IMAGE_HASH_MISMATCH'
  | 'SK_IMAGE_FETCH_FAILED'
  | 'SK_IMAGE_TOO_LARGE';

const hints: Record<SiteKitErrorCode, string> = {
  "SK_CONFIG_INVALID": "Provide a nonempty site ID and exactly one supported content source; check endpoint and revision settings.",
  "SK_CONTENT_MISSING": "Configure an inline snapshot, a readable snapshot file or a reachable publication endpoint.",
  "SK_CONTENT_READ_FAILED": "Check the snapshot file or endpoint availability and build-only credentials, then retry the intended publication.",
  "SK_SNAPSHOT_INVALID": "Check the publication JSON, required fields, size and draft-preview permissions before building.",
  "SK_SITE_ID_MISMATCH": "Select the publication belonging to the configured site; do not change identity checks to accept foreign content.",
  "SK_REVISION_MISMATCH": "Select the expected pinned publication or intentionally update the configured revision.",
  "SK_IMAGE_INVALID": "Correct image URLs, MIME metadata and conflicting hashes in the publication.",
  "SK_IMAGE_HASH_MISSING": "Publish SHA-256 image hashes before building; do not weaken integrity checks to repair current publications.",
  "SK_IMAGE_HASH_MISMATCH": "Correct the image bytes and publication hash together before rebuilding.",
  "SK_IMAGE_FETCH_FAILED": "Check image availability, URL and host access; CMS credentials are not forwarded to image origins.",
  "SK_IMAGE_TOO_LARGE": "Reduce the image below the 25 MiB download limit and republish its hash."
};

/**
 * An Error carrying a stable SiteKit code, corrective guidance and a public documentation link.
 * @remarks Existing Error catches remain valid. The optional cause retains underlying failures and may contain sensitive transport details; do not return it verbatim to clients. This class does not retry operations. Host callback errors and APIs outside the documented scope retain their original error types.
 * @example
 * ```typescript
 * import { SiteKitError } from '@alneas/sitekit/errors';
 * const error = new SiteKitError('SK_CONFIG_INVALID', 'Invalid site configuration');
 * console.log(error.code, error.hint, error.docs);
 * ```
 */
export class SiteKitError extends Error {
  /** Error discriminator for ordinary Error tooling. */
  override readonly name = 'SiteKitError';
  /** Stable machine-readable identifier; use this instead of parsing message text. */
  readonly code: SiteKitErrorCode;
  /** Human-readable corrective action; wording may improve independently of the code. */
  readonly hint: string;
  /** Absolute public error-reference URL and code-specific anchor. */
  readonly docs: string;

  /**
   * Creates a coded error without performing any I/O or retry.
   * @param code - Supported failure identifier selecting guidance and documentation.
   * @param message - Context for the failure; callers should exclude secrets.
   * @param options - Optional standard Error options retaining the underlying cause.
   * @example
   * ```typescript
   * import { SiteKitError } from '@alneas/sitekit/errors';
   * const error = new SiteKitError('SK_CONTENT_READ_FAILED', 'Snapshot request failed', { cause: new Error('offline') });
   * console.log(error instanceof Error);
   * ```
   */
  constructor(code: SiteKitErrorCode, message: string, options?: ErrorOptions) {
    const hint = hints[code];
    const docs = `https://tech-docs.alneas.com/sitekit/docs/errors/#${code.toLowerCase()}`;
    super(`[${code}] ${message} ${hint} See ${docs}`, options);
    this.code = code;
    this.hint = hint;
    this.docs = docs;
  }
}
