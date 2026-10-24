import { ConsoleFault, type ConnectedAccount, type SocialOAuthDriver } from './types.js';
import { boundedMetaJson, metaRequest, metaVersion } from './meta-http.js';

/**
 * Facebook Login flow for Page accounts and their linked professional Instagram accounts.
 * @param options - Verified server operation input.
 * @returns Authoritative result, or a safe admission/validation failure.
 * @example import {createMetaOAuth} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (...args:Parameters<typeof createMetaOAuth>) => createMetaOAuth(...args);
 */
export function createMetaOAuth(options: {
  /** Operator-registered Meta app identifier. */
  appId: string;
  /** Server-only Meta app secret. */
  appSecret: string;
  /** Operator-selected supported Graph API version. */
  apiVersion: string;
  /** Exact registered HTTPS OAuth callback. */
  redirectUri: string;
  /** Required Meta permissions. */
  permissions: readonly string[];
  /** Optional trusted server HTTP transport. */
  fetch?: typeof fetch;
  /** Trusted server clock. */
  /**
   * Trusted server clock.
   * @returns Current valid server date.
   * @example import {createMetaOAuth} from '@alneas/sitekit-cloudflare/management';
   * export const clock = (o:Parameters<typeof createMetaOAuth>[0]) => o.now?.();
   */
  now?: () => Date
}): SocialOAuthDriver {
  const version = metaVersion(options.apiVersion), fetcher = options.fetch ?? fetch, redirect = new URL(options.redirectUri);
  if (!/^\d+$/.test(options.appId) || !options.appSecret || redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || !options.permissions.length || options.permissions.some(value => !/^[a-z_]+$/.test(value))) throw new ConsoleFault('invalid');
  const token = async (params: Record<string, string>) => {
    const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    for (const [key, value] of Object.entries({ client_id: options.appId, client_secret: options.appSecret, ...params })) url.searchParams.set(key, value);
    // Meta's code/token exchange uses query parameters; never log this URL or provider diagnostics.
    const response = await fetcher(url.href, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) throw new ConsoleFault('unavailable');
    const result = await boundedMetaJson(response);
    if (!response.ok || result.error || typeof result.access_token !== 'string' || typeof result.expires_in !== 'number' || !Number.isFinite(result.expires_in) || result.expires_in <= 0 || result.expires_in > 365 * 86400) throw new ConsoleFault('unavailable');
    return { accessToken: result.access_token, expiresIn: result.expires_in };
  };
  return {
    authorizationUrl(state) {
      const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      for (const [key, value] of Object.entries({ client_id: options.appId, redirect_uri: redirect.href, response_type: 'code', scope: options.permissions.join(','), state })) url.searchParams.set(key, value);
      return url.href;
    },
    async exchange(code) {
      const short = await token({ redirect_uri: redirect.href, code });
      const long = await token({ grant_type: 'fb_exchange_token', fb_exchange_token: short.accessToken });
      const permissionUrl = new URL(`https://graph.facebook.com/${version}/me/permissions`);
      const permissions = await metaRequest(permissionUrl, long.accessToken, 'GET', fetcher);
      if (!permissions.ok || !Array.isArray(permissions.data.data) || options.permissions.some(permission => !(permissions.data.data as Record<string, unknown>[]).some(row => row.permission === permission && row.status === 'granted'))) throw new ConsoleFault('forbidden');
      const expiresAt = new Date((options.now?.() ?? new Date()).getTime() + long.expiresIn * 1000).toISOString();
      const accounts: ConnectedAccount[] = []; let after: string | undefined;
      for (let page = 0; page < 3; page++) {
        const list = new URL(`https://graph.facebook.com/${version}/me/accounts`);
        list.searchParams.set('fields', 'id,name,access_token,tasks,instagram_business_account{id,username}'); list.searchParams.set('limit', '10'); if (after) list.searchParams.set('after', after);
        const response = await metaRequest(list, long.accessToken, 'GET', fetcher);
        if (!response.ok || !Array.isArray(response.data.data)) throw new ConsoleFault('unavailable');
        for (const raw of response.data.data) {
          if (!raw || typeof raw !== 'object') throw new ConsoleFault('unavailable');
          const row = raw as Record<string, unknown>;
          if (typeof row.id !== 'string' || !/^\d+$/.test(row.id) || typeof row.access_token !== 'string' || typeof row.name !== 'string' || !Array.isArray(row.tasks) || !row.tasks.some(task => task === 'CREATE_CONTENT' || task === 'MANAGE')) continue;
          accounts.push({ id: 'facebook:' + row.id, externalId: row.id, platform: 'facebook', name: row.name.slice(0, 200), token: row.access_token, expiresAt });
          const ig = row.instagram_business_account as Record<string, unknown> | undefined;
          if (ig && typeof ig.id === 'string' && /^\d+$/.test(ig.id)) accounts.push({ id: 'instagram:' + ig.id, externalId: ig.id, platform: 'instagram', name: typeof ig.username === 'string' ? ig.username.slice(0, 200) : 'Instagram', token: row.access_token, expiresAt });
        }
        if (accounts.length > 20) throw new ConsoleFault('capacity');
        const paging = response.data.paging as {
  /** Server-owned operation value. */
          next?: unknown;
  /** Server-owned operation value. */
          cursors?: {
  /** Server-owned operation value. */
            after?: unknown
          }
        } | undefined;
        if (!paging?.next) return accounts;
        if (typeof paging.cursors?.after !== 'string') throw new ConsoleFault('unavailable');
        after = paging.cursors.after;
      }
      throw new ConsoleFault('capacity');
    },
  };
}
