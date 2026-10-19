import type { MediaAsset } from '../contracts/content.js';

/**
 * Request-scoped media entitlements expressed as asset identifiers.
 */
export interface MediaDeliveryContext {
  /** Asset identifiers the caller may access for nonpublic media. */
  entitlements?: readonly string[];
}

/**
 * Delivery policy hints for the host to enforce; contains no generated URL or provider side effects.
 */
export interface MediaDeliveryDecision {
  /** Whether this policy check permits delivery. */
  allowed: boolean;
  /** Recommended cache scope; the host must set and enforce response headers. */
  cache: 'public' | 'private' | 'no-store';
  /** Whether delivery should use a signed URL; no URL is signed here. */
  requiresSignedUrl: boolean;
  /** Optional expiry hint copied from the asset policy when truthy. */
  expiresInSeconds?: number;
}

/**
 * Evaluates an asset visibility policy against entitlements containing asset identifiers.
 *
 * @param asset - Media asset and optional access policy.
 * @param context - Entitled asset identifiers for the current request.
 * @returns An allow decision, cache policy, signing requirement, and optional expiry hint.
 * @remarks This is a policy decision only: it does not authenticate users, sign URLs, enforce HTTP caching, or contact a storage provider. Assets without access policies are public.
 * @example
 * ```ts
 * import { resolveMediaDelivery } from '@alneas/sitekit/media';
 * const decision = resolveMediaDelivery({ id: 'cover', url: 'https://example.org/cover.webp', alt: 'Cover', tags: [], provider: 'local', metadata: {} });
 * ```
 */
export function resolveMediaDelivery(
  asset: MediaAsset,
  context: MediaDeliveryContext = {},
): MediaDeliveryDecision {
  const policy = asset.access;
  if (!policy || policy.visibility === 'public') {
    return { allowed: true, cache: 'public', requiresSignedUrl: policy?.signedUrlRequired ?? false, ...(policy?.expiresInSeconds ? { expiresInSeconds: policy.expiresInSeconds } : {}) };
  }

  const allowed = context.entitlements?.includes(asset.id) ?? false;
  return {
    allowed,
    cache: allowed ? 'private' : 'no-store',
    requiresSignedUrl: true,
    ...(policy.expiresInSeconds ? { expiresInSeconds: policy.expiresInSeconds } : {}),
  };
}
