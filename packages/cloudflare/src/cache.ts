import type {
  RevalidationAdapter,
  RevalidationRequest,
  RevalidationResult,
} from '@alneas/sitekit';

/**
 * Server-only Cloudflare zone credentials and purge request transport.
 */
export interface CloudflareCachePurgeOptions {
  /** Host-configured Cloudflare zone ID. */
  zoneId: string;
  /** Server secret authorized to purge this zone; never pass to a browser. */
  apiToken: string;
  /** Base for relative purge paths; defaults to `https://example.invalid`. */
  siteUrl?: string;
  /** Optional fetch implementation for the Cloudflare API. */
  fetch?: typeof fetch;
}

interface CloudflarePurgeResponse {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

function normalizeUrls(request: RevalidationRequest, siteUrl: string): string[] {
  return (request.urls ?? []).map(url => {
    if (/^https?:\/\//.test(url)) return url;
    return `${siteUrl.replace(/\/$/, '')}/${url.replace(/^\/+/, '')}`;
  });
}

/**
 * Creates a server-side Cloudflare cache purge adapter.
 * @param options - Zone, secret API token, relative URL base, and optional transport.
 * @returns A revalidation adapter that sends URL purges or purge_everything requests.
 * @remarks Empty URL requests succeed without an API call. API rejection is returned as an
 * accepted: false result; network errors reject. Successful full purges report invalidated: -1.
 * The host must authorize callers and restrict which URLs or full-zone purges they may request.
 * @example
 * ```typescript
 * import { createCloudflareCachePurgeAdapter, type CloudflareCachePurgeOptions }
 *   from '@alneas/sitekit-cloudflare';
 * export function examplePurge(options: CloudflareCachePurgeOptions) {
 *   return createCloudflareCachePurgeAdapter(options);
 * }
 * ```
 */
export function createCloudflareCachePurgeAdapter(
  options: CloudflareCachePurgeOptions,
): RevalidationAdapter {
  const fetcher = options.fetch ?? fetch;
  const siteUrl = options.siteUrl ?? 'https://example.invalid';
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(options.zoneId)}/purge_cache`;

  return {
    async revalidate(request): Promise<RevalidationResult> {
      if (!request.purgeEverything && (!request.urls || request.urls.length === 0)) {
        return { accepted: true, invalidated: 0, ...(request.revision ? { revision: request.revision } : {}) };
      }

      const body = request.purgeEverything
        ? { purge_everything: true }
        : { files: normalizeUrls(request, siteUrl) };
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      let payload: CloudflarePurgeResponse = {};
      try {
        payload = await response.json() as CloudflarePurgeResponse;
      } catch {
        payload = {};
      }
      if (!response.ok || payload.success !== true) {
        return {
          accepted: false,
          invalidated: 0,
          ...(request.revision ? { revision: request.revision } : {}),
          error: {
            code: 'cloudflare_purge_failed',
            message: payload.errors?.[0]?.message ?? `Cloudflare purge failed (${response.status})`,
          },
        };
      }

      return {
        accepted: true,
        invalidated: request.purgeEverything ? -1 : (request.urls?.length ?? 0),
        ...(request.revision ? { revision: request.revision } : {}),
      };
    },
  };
}
