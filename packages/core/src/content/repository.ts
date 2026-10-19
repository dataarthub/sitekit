import type {
  CollectionQuery,
  ContentAdapter,
  ContentPage,
  ContentQuery,
  ContentItem,
} from '../contracts/content.js';

/**
 * Content adapter composed from ordered sources with fallback on missing results or recoverable failures.
 */
export interface ContentRepository extends ContentAdapter {}

/**
 * Failed content operation and its zero-based source position in the fallback chain.
 */
export interface RepositoryErrorContext {
  /**
   * Adapter operation that failed before fallback continued.
   */
  operation: 'getPage' | 'listCollection' | 'validate';
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
 * Error reporting hook for fallback queries; a rejected hook stops the operation.
 */
export interface FallbackRepositoryOptions {
  /**
   * A source error is recoverable during migration. Consumers can report it
   * without coupling the repository to a logger or observability provider.
   * @param context - Execution context passed to the host callback.
   * @returns No value; completion allows fallback to continue, while rejection stops the query.
   * @example
   * ```ts
   * import type { FallbackRepositoryOptions } from '@alneas/sitekit/content';
   * type Callback = NonNullable<FallbackRepositoryOptions['onError']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  onError?: (context: RepositoryErrorContext) => void | Promise<void>;
}

/**
 * Queries content sources in priority order until a page, nonempty collection, or successful validation is found.
 *
 * @param sources - Adapters in descending priority; at least one is required.
 * @param options - Optional callback awaited whenever a source operation fails.
 * @returns A repository returning null or an empty list when all read sources miss or fail.
 * @throws An Error if sources is empty; errors thrown by onError propagate from repository operations.
 * @remarks Results are taken from the first successful source rather than merged. Source failures fall through unless onError throws. Validation, when available, rejects after all validators fail.
 * @example
 * ```ts
 * import { createFallbackContentRepository } from '@alneas/sitekit/content';
 * import type { ContentAdapter } from '@alneas/sitekit/contracts';
 * export async function readPosts(primary: ContentAdapter, fallback: ContentAdapter) {
 *   const repository = createFallbackContentRepository([primary, fallback]);
 *   return repository.listCollection({ collection: 'posts' });
 * }
 * ```
 */
export function createFallbackContentRepository(
  sources: readonly ContentAdapter[],
  options: FallbackRepositoryOptions = {},
): ContentRepository {
  if (sources.length === 0) {
    throw new Error('At least one content source is required');
  }

  const getPage = async (query: ContentQuery): Promise<ContentPage | null> => {
    for (const [sourceIndex, source] of sources.entries()) {
      try {
        const page = await source.getPage(query);
        if (page) return page;
      } catch (error) {
        await options.onError?.({ operation: 'getPage', sourceIndex, error });
      }
    }
    return null;
  };

  const listCollection = async (query: CollectionQuery): Promise<ContentItem[]> => {
    for (const [sourceIndex, source] of sources.entries()) {
      try {
        const items = await source.listCollection(query);
        if (items.length > 0) return items;
      } catch (error) {
        await options.onError?.({ operation: 'listCollection', sourceIndex, error });
      }
    }
    return [];
  };

  const validators = sources.filter(
    (source): source is ContentAdapter & Required<Pick<ContentAdapter, 'validate'>> =>
      typeof source.validate === 'function',
  );

  if (validators.length === 0) {
    return { getPage, listCollection };
  }

  const validate = async (collection: string, value: unknown): Promise<unknown> => {
    for (const [sourceIndex, source] of sources.entries()) {
      if (!source.validate) continue;
      try {
        return await source.validate(collection, value);
      } catch (error) {
        await options.onError?.({ operation: 'validate', sourceIndex, error });
      }
    }
    throw new Error(`Unable to validate content collection: ${collection}`);
  };

  return { getPage, listCollection, validate };
}
