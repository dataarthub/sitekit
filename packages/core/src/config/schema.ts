// Internal canonical schema shared by runtime validation and JSON Schema generation.
import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const endpoint = z.string().url().refine(value => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}, 'Use HTTPS, or HTTP on loopback for local development, without URL credentials');
/** Strict alternatives for exactly one build-time publication source. */
const contentSchema = z.union([
  z.object({
    /** Inline publication DTO; its contents are validated when the configured source is read. */
    snapshot: z.unknown().refine(value => value !== undefined, 'Provide a snapshot')
  }).strict(),
  z.object({
    /** Nonempty local snapshot path, trimmed during configuration validation. */
    file: nonEmpty,
    /** Explicit local-file draft preview opt-in; the reader also requires an unexpired draft marker. */
    draftPreview: z.boolean().optional()
  }).strict(),
  z.object({
    /** HTTPS endpoint without URL credentials; loopback HTTP is permitted locally. */
    endpoint,
    /** HTTP request method; the snapshot reader defaults to POST when omitted. */
    method: z.enum(['GET', 'POST']).optional()
  }).strict(),
]);

/** Canonical strict configuration schema used before publication loading. */
export const siteSchema = z.object({
  /** Nonempty site identifier, trimmed during configuration validation. */
  id: nonEmpty,
  /** Optional positive integer expected publication revision; the reader additionally checks safe-integer bounds. */
  revision: z.number().int().positive().optional(),
  /** Exactly one strict inline snapshot, local file, or HTTP endpoint source. */
  content: contentSchema,
}).strict();
