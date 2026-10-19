import type { ContentVisibility, MediaAsset } from '../contracts/content.js';

/**
 * Requested raster encoder format, or original to preserve the input file.
 */
export type MediaOptimizationFormat = 'original' | 'webp' | 'avif' | 'jpeg';

/**
 * Optional image bounds in pixels, requested output format, and encoder quality from 0 to 1.
 */
export interface MediaOptimizationOptions {
  /** Maximum width in pixels; normalization floors supplied values to at least 1. */
  maxWidth?: number;
  /** Maximum height in pixels; normalization floors supplied values to at least 1. */
  maxHeight?: number;
  /** Requested output format; normalization defaults to webp. */
  format?: MediaOptimizationFormat;
  /** Encoder quality from 0 to 1; normalization defaults to 0.82. */
  quality?: number;
}

/**
 * Host-supplied asynchronous image transformation boundary independent of upload storage.
 */
export interface MediaOptimizer {
  /**
   * Transforms image bytes using a host-supplied encoder.
   * @param input - Source image bytes.
   * @param options - Requested dimensions, format and quality; supported settings are implementation-specific.
   * @returns The transformed image bytes; this contract does not upload them.
   * @remarks Format support, validation, defaults and rejection behavior belong to the implementation.
   * @example
   * ```ts
   * import type { MediaOptimizer } from '@alneas/sitekit/media';
   * type Callback = NonNullable<MediaOptimizer['optimize']>;
   * export function invoke(host: MediaOptimizer, ...args: Parameters<Callback>) {
   *   return host.optimize(...args);
   * }
   * ```
   */
  optimize(input: Blob, options?: MediaOptimizationOptions): Promise<Blob>;
}

/**
 * Upload bytes, declared filename/MIME type, and optional visibility and display metadata.
 */
export interface MediaUploadRequest {
  /**
   * Filename requested for storage; validation and path handling belong to the upload adapter.
   */
  fileName: string;
  /**
   * Declared payload MIME type or CMS content category, according to the enclosing contract.
   */
  contentType: string;
  /**
   * Media bytes to store; the adapter owns validation, transformation and durable persistence.
   */
  body: Blob | ArrayBuffer | Uint8Array;
  /** Requested content visibility for the host upload implementation to enforce. */
  visibility?: ContentVisibility;
  /**
   * Accessible text describing the media; hosts should supply context-appropriate wording.
   */
  alt?: string;
  /**
   * Host-defined metadata retained for downstream consumers.
   */
  metadata?: Record<string, string>;
}

/**
 * Host-owned upload boundary returning the normalized stored media descriptor.
 */
export interface MediaUploadAdapter {
  /**
   * Stores media through the configured host adapter.
   * @param request - Bytes, declared file metadata and requested access scope.
   * @returns The stored media descriptor supplied by the adapter.
   * @remarks Validation, access enforcement, transformations and rejection behavior are implementation-specific.
   * @example
   * ```ts
   * import type { MediaUploadAdapter } from '@alneas/sitekit/media';
   * type Callback = NonNullable<MediaUploadAdapter['upload']>;
   * export function invoke(host: MediaUploadAdapter, ...args: Parameters<Callback>) {
   *   return host.upload(...args);
   * }
   * ```
   */
  upload(request: MediaUploadRequest): Promise<MediaAsset>;
}

/**
 * Fills format and quality defaults and bounds supplied image dimensions and quality.
 *
 * @param options - Optional dimension limits, output format, and quality.
 * @returns Options defaulting to webp and quality 0.82; dimensions are floored to at least 1 and quality clamped to 0–1.
 * @remarks Does not reject non-finite numeric inputs; callers should validate untrusted numbers before normalization.
 * @example
 * ```ts
 * import { normalizeMediaOptimizationOptions } from '@alneas/sitekit/media';
 * const options = normalizeMediaOptimizationOptions({ maxWidth: 1200, quality: 0.9 });
 * ```
 */
export function normalizeMediaOptimizationOptions(
  options: MediaOptimizationOptions = {},
): Required<Pick<MediaOptimizationOptions, 'format' | 'quality'>> &
  Pick<MediaOptimizationOptions, 'maxWidth' | 'maxHeight'> {
  const quality = Math.min(1, Math.max(0, options.quality ?? 0.82));
  return {
    ...(options.maxWidth !== undefined ? { maxWidth: Math.max(1, Math.floor(options.maxWidth)) } : {}),
    ...(options.maxHeight !== undefined ? { maxHeight: Math.max(1, Math.floor(options.maxHeight)) } : {}),
    format: options.format ?? 'webp',
    quality,
  };
}
