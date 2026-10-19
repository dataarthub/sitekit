import {
  createAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsEventInput,
  type AnalyticsProvider,
} from './events.js';

/** Site-wide event identity and fallback browser or page context. */
export interface AnalyticsClientDefaults {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Optional analytics session identifier.
   */
  sessionId?: string;
  /**
   * Optional analytics visitor identifier.
   */
  anonymousId?: string;
  /**
   * Fallback page pathname used when an event omits its path.
   */
  pagePath?: string;
}

/** Analytics input with siteId supplied by the client and an optional path override. */
export type TrackInput = Omit<AnalyticsEventInput, 'siteId' | 'pagePath'> & {
  /**
   * Fallback page pathname used when an event omits its path.
   */
  pagePath?: string;
};

/**
 * Creates a client that validates events and forwards them to a provider.
 *
 * @param provider - Transport or sink receiving normalized events.
 * @param defaults - Required site identifier and optional session, anonymous, and path defaults.
 * @returns A client with an asynchronous track method.
 * @remarks track always uses the configured siteId; path defaults to /. Validation and provider failures reject track. This client does not gate consent or batch events.
 * @example
 * ```ts
 * import { createAnalyticsClient } from '@alneas/sitekit/analytics';
 * const events: unknown[] = [];
 * const client = createAnalyticsClient({ track: event => { events.push(event); } }, { siteId: 'example' });
 * await client.track({ event: 'page_view' });
 * ```
 */
export function createAnalyticsClient(
  provider: AnalyticsProvider,
  defaults: AnalyticsClientDefaults,
): {
  /**
 * Accepts one analytics event for host delivery.
 * @param input - Input data supplied by the host.
 * @returns Completion after validation and provider delivery; provider failures reject.
 * @example
 * ```ts
 * import { createAnalyticsClient } from '@alneas/sitekit/analytics';
 * import type { AnalyticsProvider } from '@alneas/sitekit/analytics';
 * export function send(provider: AnalyticsProvider) {
 *   const client = createAnalyticsClient(provider, { siteId: 'example' });
 *   return client.track({ event: 'page_view', pagePath: '/' });
 * }
 * ```
 */
     track(input: TrackInput): Promise<void> } {
  return {
    async track(input) {
      await provider.track(createAnalyticsEvent({
        ...input,
        siteId: defaults.siteId,
        sessionId: input.sessionId ?? defaults.sessionId,
        anonymousId: input.anonymousId ?? defaults.anonymousId,
        pagePath: input.pagePath ?? defaults.pagePath ?? '/',
      }));
    },
  };
}
