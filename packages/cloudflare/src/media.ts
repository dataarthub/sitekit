import type { MediaAsset } from '@alneas/sitekit/contracts';
import type {
  MediaUploadAdapter,
  MediaUploadRequest,
} from '@alneas/sitekit/media';
import type { CloudflareR2Bucket } from './types.js';

/**
 * Object naming and delivery URL configuration for server-side R2 uploads.
 */
export interface R2MediaUploadOptions {
  /** Host-owned delivery base URL; concatenated with prefix/key without signing. */
  baseUrl: string;
  /** Object prefix, trimmed of surrounding slashes; defaults to `media`. */
  prefix?: string;
  /** Optional object ID generator from the upload request; output is sanitized.
   * @param request - Upload request used to choose a storage identifier; its body is not modified.
   * @returns Host-generated identifier; the owning adapter applies its documented identity rules.
   * @example
   * ```typescript
   * import type { R2MediaUploadOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: R2MediaUploadOptions, ...args: Parameters<NonNullable<R2MediaUploadOptions['idFactory']>>) {
   *   if (typeof adapter.idFactory !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.idFactory(...args);
   * }
   * ```
   */
  idFactory?: (request: MediaUploadRequest) => string;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'upload';
}

function safePrefix(prefix: string | undefined): string {
  return (prefix ?? 'media').replace(/^\/+|\/+$/g, '') || 'media';
}

function safeObjectId(id: string): string {
  const segments = id.split('/').map(safeFileName).filter(segment => segment !== '..');
  return segments.join('/') || 'upload';
}

/**
 * Creates an R2 byte uploader that returns provider-neutral media metadata.
 * @param bucket - Server-owned writable R2 binding.
 * @param options - Delivery base URL and optional object naming policy.
 * @returns An upload adapter that stores bytes with content-type metadata.
 * @remarks Authentication, upload size/type validation, URL signing, and delivery controls belong
 * to the host. A nonpublic visibility flag marks `signedUrlRequired` in metadata but does not
 * change bucket permissions or sign the returned URL. Default IDs use time and sanitized file
 * name, so inject a collision-resistant ID factory where concurrent uploads can share names.
 * @example
 * ```typescript
 * import { createR2MediaUploadAdapter, type CloudflareR2Bucket }
 *   from '@alneas/sitekit-cloudflare';
 * export function exampleUploader(bucket: CloudflareR2Bucket) {
 *   return createR2MediaUploadAdapter(bucket, {
 *     baseUrl: 'https://media.example.invalid', idFactory: () => crypto.randomUUID(),
 *   });
 * }
 * ```
 */
export function createR2MediaUploadAdapter(
  bucket: CloudflareR2Bucket,
  options: R2MediaUploadOptions,
): MediaUploadAdapter {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const prefix = safePrefix(options.prefix);

  return {
    async upload(request: MediaUploadRequest): Promise<MediaAsset> {
      const requestedId = options.idFactory?.(request) ?? `${Date.now()}-${safeFileName(request.fileName)}`;
      const id = safeObjectId(requestedId);
      const key = `${prefix}/${id}`;
      await bucket.put(key, request.body, {
        httpMetadata: { contentType: request.contentType },
      });
      const visibility = request.visibility ?? 'public';
      return {
        id,
        url: `${baseUrl}/${key}`,
        alt: request.alt ?? '',
        tags: [],
        provider: 'r2',
        ...(visibility !== 'public'
          ? { access: { visibility, signedUrlRequired: true } }
          : {}),
        source: { kind: 'r2', id: key },
        metadata: {
          key,
          contentType: request.contentType,
          visibility,
          ...(request.metadata ?? {}),
        },
      };
    },
  };
}
