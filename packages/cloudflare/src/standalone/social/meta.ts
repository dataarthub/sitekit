import { ConsoleFault, type SocialDeliveryDriver, type SocialDeliveryResult } from './types.js';
import { metaNode, metaRequest, metaVersion, type MetaReply } from './meta-http.js';

/**
 * Facebook Page text/photo and linked Instagram single-image feed delivery. API version is host-selected.
 * @param options - Verified server operation input.
 * @returns Authoritative result, or a safe admission/validation failure.
 * @example import {createMetaDeliveryDriver} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (...args:Parameters<typeof createMetaDeliveryDriver>) => createMetaDeliveryDriver(...args);
 */
export function createMetaDeliveryDriver(options: { /** Operator-selected supported Graph API version. */
  /** Operator-selected supported Graph API version. */
  apiVersion: string; /** Allowed HTTPS media origins. */
  /** Allowed HTTPS media origins. */
  allowedMediaOrigins: readonly string[]; /** Optional trusted server HTTP transport. */
  /** Optional trusted server HTTP transport. */
  fetch?: typeof fetch
}): SocialDeliveryDriver {
  const version = metaVersion(options.apiVersion), fetcher = options.fetch ?? fetch;
  const url = (node: string, edge?: string) => new URL(`https://graph.facebook.com/${version}/${metaNode(node)}${edge ? '/' + edge : ''}`);
  const failure = (reply: Extract<MetaReply, { /** Server-owned operation value. */
    /** Server-owned operation value. */
    ok: false
  }>, preparation = false): SocialDeliveryResult => reply.kind === 'reconnect' ? { status: 'failed', errorCode: 'reconnect_required', reconnect: true } : reply.kind === 'retry' ? { status: 'retry', errorCode: 'rate_limited' } : reply.kind === 'rejected' ? { status: 'failed', errorCode: 'provider_rejected' } : { status: preparation ? 'retry' : 'unknown', errorCode: 'provider_unavailable' };
  return {
    async publish({ account, job, progress }, checkpoint) {
      metaNode(account.externalId);
      if (job.imageUrl) { const media = new URL(job.imageUrl); if (media.protocol !== 'https:' || media.username || media.password || !options.allowedMediaOrigins.includes(media.origin)) throw new ConsoleFault('invalid'); }
      if (account.platform === 'facebook') {
        await checkpoint({ phase: 'dispatching' });
        const result = await metaRequest(url(account.externalId, job.imageUrl ? 'photos' : 'feed'), account.token, 'POST', fetcher, job.imageUrl ? { url: job.imageUrl, caption: job.text, published: true } : { message: job.text });
        if (!result.ok) return failure(result);
        const id = result.data.post_id ?? result.data.id;
        return typeof id === 'string' && /^\d+(?:_\d+)?$/.test(id) ? { status: 'published', externalId: id, externalUrl: 'https://www.facebook.com/' + id } : { status: 'unknown' };
      }
      if (!job.imageUrl || [...job.text].length > 2200) throw new ConsoleFault('invalid');
      let containerId = progress?.containerId;
      if (!containerId) {
        const prepared = await metaRequest(url(account.externalId, 'media'), account.token, 'POST', fetcher, { image_url: job.imageUrl, caption: job.text });
        if (!prepared.ok) return failure(prepared, true);
        if (typeof prepared.data.id !== 'string' || !/^\d+$/.test(prepared.data.id)) return { status: 'retry', errorCode: 'preparation_unavailable' };
        containerId = prepared.data.id;
        await checkpoint({ phase: 'prepared', containerId });
      }
      const statusUrl = url(containerId); statusUrl.searchParams.set('fields', 'status_code');
      const status = await metaRequest(statusUrl, account.token, 'GET', fetcher);
      if (!status.ok) return failure(status, true);
      if (status.data.status_code === 'PUBLISHED') return { status: 'published' };
      if (['ERROR', 'EXPIRED'].includes(String(status.data.status_code))) return { status: 'failed', errorCode: 'container_expired' };
      if (status.data.status_code !== 'FINISHED') return { status: 'pending', errorCode: 'media_processing' };
      await checkpoint({ phase: 'dispatching', containerId });
      const result = await metaRequest(url(account.externalId, 'media_publish'), account.token, 'POST', fetcher, { creation_id: containerId });
      if (!result.ok) return failure(result);
      return typeof result.data.id === 'string' && /^\d+$/.test(result.data.id) ? { status: 'published', externalId: result.data.id } : { status: 'unknown' };
    },
    async reconcile({ account, job, progress }) {
      if (job.externalId) {
        const check = url(job.externalId); check.searchParams.set('fields', 'id,permalink');
        const result = await metaRequest(check, account.token, 'GET', fetcher);
        if (result.ok && result.data.id === job.externalId) return { status: 'published', externalId: job.externalId };
      }
      if (account.platform === 'instagram' && progress?.containerId) {
        const check = url(progress.containerId); check.searchParams.set('fields', 'status_code');
        const result = await metaRequest(check, account.token, 'GET', fetcher);
        if (result.ok && result.data.status_code === 'PUBLISHED') return { status: 'published' };
      }
      return { status: 'unknown', errorCode: 'manual_confirmation_required' };
    },
  };
}
