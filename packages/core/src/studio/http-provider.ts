import type { ContentItem } from '../contracts/content.js';
import type { StudioListResult, StudioProvider } from './contracts.js';

/** Same-origin endpoint and optional authenticated fetch implementation for the public HTTP bridge. */
export interface HttpStudioProviderOptions {
  /** Same-origin absolute path; authentication and tenant authorization belong to the server. */
  endpoint?: string;
  /** Host fetch wrapper; receives same-origin credentials and no-store cache settings. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates the browser-side adapter for the public Content Studio HTTP handler.
 * @param options - Optional same-origin endpoint path and host fetch wrapper.
 * @returns A StudioProvider implementing list, get, saveDraft and publish over GET/POST.
 * @throws {Error} If the endpoint is not an absolute same-origin path or contains a query/fragment.
 * @remarks Each request uses same-origin cookie credentials and no-store caching.
 * Non-2xx responses reject with a status-bearing error; network and JSON failures also reject.
 * The host must authenticate and authorize the server endpoint. This helper does not implement
 * login, tenant scoping, retries, revision history or automatic conflict resolution.
 * @example
 * ```typescript
 * import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
 * const provider = createHttpStudioProvider({ endpoint: '/api/studio/content' });
 * // Run in an authenticated browser after mounting the server handler.
 * const result = await provider.list({ collection: 'posts', locale: 'ja' });
 * console.log(result.items.length);
 * ```
 */
export function createHttpStudioProvider(options: HttpStudioProviderOptions = {}): StudioProvider {
  const endpoint = options.endpoint ?? '/api/studio/content';
  if (!/^\/(?!\/)/.test(endpoint) || /[\\?#]/.test(endpoint)) throw new Error('Studio endpoint must be a same-origin path');
  const request = options.fetch ?? globalThis.fetch;
  async function call<T>(query: Record<string, unknown> = {}, body?: unknown): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, String(value));
    const response = await request(`${endpoint}${search.size ? `?${search}` : ''}`, {
      credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`操作に失敗しました (${response.status})。権限や接続を確認して再試行してください。`);
    return response.json() as Promise<T>;
  }
  return {
    list: query => call<StudioListResult>({ ...query }),
    async get(id) { return (await call<{ document: ContentItem | null }>({ id })).document; },
    async saveDraft(document, saveOptions) {
      return (await call<{ document: ContentItem }>({}, { operation: 'saveDraft', document: { ...document, body: document.body ?? '' }, options: saveOptions })).document;
    },
    async publish(documentId, publishOptions) {
      return (await call<{ document: ContentItem }>({}, { operation: 'publish', documentId, options: publishOptions })).document;
    },
  };
}
