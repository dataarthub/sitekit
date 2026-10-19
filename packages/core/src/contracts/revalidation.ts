/** Site cache invalidation request scoped by revision, tags, URLs, or full purge. */
export interface RevalidationRequest {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Immutable revision identifier or expected publication revision.
   */
  revision?: string;
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags?: readonly string[];
  /**
   * Specific URLs to invalidate, when supported by the provider.
   */
  urls?: readonly string[];
  /**
   * Whether to request a full-site purge; providers must authorize broad invalidation.
   */
  purgeEverything?: boolean;
}

/** Provider response describing acceptance and invalidation count. */
export interface RevalidationResult {
  /**
   * Whether the provider accepted invalidation, or the number of accepted events for ingestion.
   */
  accepted: boolean;
  /**
   * Number of cache entries the provider reports as invalidated.
   */
  invalidated: number;
  /**
   * Immutable revision identifier or expected publication revision.
   */
  revision?: string;
  /**
   * Structured provider failure; distinct from exceptions or rejected operations.
   */
  error?: {
  /**
   * Machine-readable failure identifier supplied by the producer.
   */
  code: string;
  /**
   * Human-readable explanation of the failure; avoid including secrets.
   */
  message: string };
}

/** Consumer/provider boundary for cache invalidation after a published revision. */
export interface RevalidationAdapter {
  /**
   * Requests cache invalidation for published site content.
   *
   * @param request - Site and selected invalidation targets.
   * @returns Acceptance state and invalidation count.
   * @example
   * ```ts
   * import type { RevalidationAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<RevalidationAdapter['revalidate']>;
   * export function invoke(host: RevalidationAdapter, ...args: Parameters<Callback>) {
   *   return host.revalidate(...args);
   * }
   * ```
   */
  revalidate(request: RevalidationRequest): Promise<RevalidationResult>;
}
