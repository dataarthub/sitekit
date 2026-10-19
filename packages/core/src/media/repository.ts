import type { MediaAdapter, MediaAsset, MediaQuery } from '../contracts/content.js';

/**
 * Media adapter querying ordered sources with fallback rather than merging provider results.
 */
export interface MediaRepository extends MediaAdapter {}

/**
 * Failed media operation, zero-based provider index, and original thrown value.
 */
export interface MediaRepositoryErrorContext {
  /**
   * Adapter operation that failed before fallback continued.
   */
  operation: 'getMedia' | 'listMedia';
  /**
   * Zero-based position of the failing source in the configured fallback chain.
   */
  sourceIndex: number;
  /**
   * Structured provider failure; distinct from exceptions or rejected operations.
   */
  error: unknown;
}

/**
 * Optional awaited error callback; callback failures stop provider fallback.
 */
export interface MediaRepositoryOptions {
  /**
   * Reports a failed source operation before fallback continues; rejection stops the query.
   *
   * @param context - Execution context passed to the host callback.
   * @returns No value; completion allows fallback to continue, while rejection stops the query.
   * @example
   * ```ts
   * import type { MediaRepositoryOptions } from '@alneas/sitekit/media';
   * type Callback = NonNullable<MediaRepositoryOptions['onError']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  onError?: (context: MediaRepositoryErrorContext) => void | Promise<void>;
}

/**
 * Queries media adapters in priority order and falls through on missing results or source errors.
 *
 * @param sources - Adapters in descending priority; at least one is required.
 * @param options - Optional error callback awaited before trying the next source.
 * @returns A repository returning the first matching asset or nonempty list, otherwise null or an empty list.
 * @throws An Error if no sources are supplied.
 * @remarks Lists are not merged across providers. Sources without listMedia are skipped for list queries. An onError failure stops fallback.
 * @example
 * ```ts
 * import { createFallbackMediaRepository } from '@alneas/sitekit/media';
 * import type { MediaAdapter } from '@alneas/sitekit/contracts';
 * export async function readCover(primary: MediaAdapter, fallback: MediaAdapter) {
 *   const repository = createFallbackMediaRepository([primary, fallback]);
 *   return repository.getMedia({ id: 'cover' });
 * }
 * ```
 */
export function createFallbackMediaRepository(
  sources: readonly MediaAdapter[],
  options: MediaRepositoryOptions = {},
): MediaRepository {
  if (sources.length === 0) {
    throw new Error('At least one media source is required');
  }

  const getMedia = async (query: MediaQuery): Promise<MediaAsset | null> => {
    for (const [sourceIndex, source] of sources.entries()) {
      try {
        const asset = await source.getMedia(query);
        if (asset) return asset;
      } catch (error) {
        await options.onError?.({ operation: 'getMedia', sourceIndex, error });
      }
    }
    return null;
  };

  const listMedia = async (query: { tags?: string[]; limit?: number }): Promise<MediaAsset[]> => {
    for (const [sourceIndex, source] of sources.entries()) {
      if (!source.listMedia) continue;
      try {
        const assets = await source.listMedia(query);
        if (assets.length > 0) return assets;
      } catch (error) {
        await options.onError?.({ operation: 'listMedia', sourceIndex, error });
      }
    }
    return [];
  };

  return { getMedia, listMedia };
}
