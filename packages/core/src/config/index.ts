import type { z } from 'zod';
import { siteSchema } from './schema.js';
import { SiteKitError } from '../errors/index.js';

/**
 * Validated site identity and exactly one content source. Credentials are supplied separately through build options; an inline snapshot is validated only when read.
 */
export type SiteDefinition = z.infer<typeof siteSchema>;

/**
 * Validates one site identifier and exactly one inline, file, or HTTP content source.
 *
 * @param input - Site configuration to validate; unknown properties are rejected.
 * @returns A parsed configuration with trimmed identifiers and file paths.
 * @throws SiteKitError with SK_CONFIG_INVALID when the configuration shape, endpoint, or revision is invalid.
 * @remarks Credentials must be supplied through build options. HTTP is allowed only on loopback; remote endpoints require HTTPS without URL credentials. Inline snapshot contents are validated when loaded, not here.
 * @example
 * ```ts
 * import { defineSite } from '@alneas/sitekit/config';
 * const site = defineSite({ id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [] } } });
 * ```
 */
export function defineSite(input: SiteDefinition): SiteDefinition {
  const result = siteSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.') || 'site'))].join(', ');
    throw new SiteKitError('SK_CONFIG_INVALID', `Invalid site configuration (${fields}): provide an id and exactly one content source `
      + '(snapshot, file, or endpoint with an optional GET/POST method). '
      + 'Endpoints must use HTTPS (HTTP loopback is allowed locally). '
      + 'If specified, revision must be a positive safe integer. '
      + 'Use draftPreview only with a local file; pass credentials through build options.');
  }
  return result.data;
}
