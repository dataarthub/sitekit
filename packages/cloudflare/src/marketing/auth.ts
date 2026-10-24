import { parseMarketingScope } from '@alneas/sitekit/marketing';
import type { MarketingScope } from '@alneas/sitekit/marketing';
import type { MarketingAuthorizationContext, MarketingOperation, MarketingPrincipal } from './handler.js';

/** One server-owned signing key and its least-privilege integration policy. */
export interface MarketingSigningKey {
  /** Public key selector; never used as proof of identity. */
  id: string;
  /** Secret from a server secret binding; use at least 32 random UTF-8 bytes. */
  secret: string;
  /** Verified scope granted to this key. */
  scope: MarketingScope;
  /** Exact operations permitted for this key. */
  operations: readonly MarketingOperation[];
  /** Confirmed outcome source permitted for this key. */
  outcomeSource?: string;
}
/**
 * Host key resolution and clock for HMAC verification.
 * @typeParam TEnv - Server binding environment.
 */
export interface MarketingHmacOptions<TEnv> {
  /**
   * Reads configured keys without exposing them to the browser or responses.
   * @param env - Server bindings containing secret values.
   * @returns Currently accepted keys, including overlap during a controlled rotation.
   * @example
   * import type { MarketingHmacOptions } from '@alneas/sitekit-cloudflare/marketing';
   * export function keys(o: MarketingHmacOptions<unknown>) { return o.keys({}); }
   */
  keys(env: TEnv): readonly MarketingSigningKey[];
  /**
   * Supplies the current time for the five-minute signature validity window.
   * @returns A valid date; invalid clocks deny authorization.
   * @example
   * import type { MarketingHmacOptions } from '@alneas/sitekit-cloudflare/marketing';
   * export function now(o: MarketingHmacOptions<unknown>) { return o.now?.() ?? new Date(); }
   */
  now?: () => Date;
}
/**
 * Verifies a signed request against a server-owned integration policy.
 * @typeParam TEnv - Server binding environment.
 * @param context - Request and exact protected operation.
 * @returns A verified scoped principal or null; the request body remains readable.
 * @example
 * import type { MarketingAuthorizer, MarketingAuthorizationContext } from '@alneas/sitekit-cloudflare/marketing';
 * export function authorize(a: MarketingAuthorizer<unknown>, c: MarketingAuthorizationContext<unknown>) { return a(c); }
 */
export type MarketingAuthorizer<TEnv> = (context: MarketingAuthorizationContext<TEnv>) => Promise<MarketingPrincipal | null>;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
async function payload(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.clone().body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 128 * 1024) { void reader.cancel().catch(() => {}); return null; }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

/**
 * Creates HMAC-SHA256 authorization for trusted outcome/report/import integrations.
 * @typeParam TEnv - Server binding environment.
 * @param options - Server key policies and optional clock.
 * @returns A fail-closed authorizer for createMarketingHandler.
 * @remarks Headers are X-SiteKit-Key-Id, X-SiteKit-Timestamp (Unix seconds) and
 * X-SiteKit-Signature (lowercase hex). Sign six newline-separated UTF-8 values:
 * sitekit-marketing-v1, key ID, timestamp, method, full request URL and SHA-256 body hex.
 * Signature age is at most five minutes; immutable event/import IDs prevent duplicate
 * effects inside that window. Keys must never be sent to browser code. This is a server
 * integration authorizer, not a user login/session implementation.
 * @example
 * import { createHmacMarketingAuthorizer, type MarketingHmacOptions } from '@alneas/sitekit-cloudflare/marketing';
 * export function authorizer(options: MarketingHmacOptions<unknown>) { return createHmacMarketingAuthorizer(options); }
 */
export function createHmacMarketingAuthorizer<TEnv>(options: MarketingHmacOptions<TEnv>): MarketingAuthorizer<TEnv> {
  return async ({ request, env, operation }) => {
    const id = request.headers.get('X-SiteKit-Key-Id');
    const timestamp = request.headers.get('X-SiteKit-Timestamp');
    const signature = request.headers.get('X-SiteKit-Signature');
    if (!id || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
    const time = (options.now?.() ?? new Date()).getTime();
    if (!Number.isFinite(time) || Math.abs(time - Number(timestamp) * 1000) > 300000) return null;
    const policies = options.keys(env).filter(key => key.id === id);
    if (policies.length !== 1) return null;
    const policy = policies[0]!;
    if (!policy.operations.includes(operation) || new TextEncoder().encode(policy.secret).byteLength < 32 || (operation === 'outcome' && !policy.outcomeSource)) return null;
    const bytes = await payload(request); if (!bytes) return null;
    const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
    const canonical = ['sitekit-marketing-v1', id, timestamp, request.method, request.url, digest].join('\n');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(policy.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(signature.match(/../g)!, value => parseInt(value, 16));
    if (!await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(canonical))) return null;
    return { scope: parseMarketingScope(policy.scope), ...(policy.outcomeSource ? { outcomeSource: policy.outcomeSource } : {}) };
  };
}
