import { ManagementFault } from '@alneas/sitekit/management';
import type { AuthorityExecutor } from '@alneas/sitekit/management';
import type { SocialDeliveryDriver, SocialDeliveryContext } from '../standalone/social/types.js';
/**
 * Wraps each exact external SNS attempt with a durable authority permit; reconciliation only resolves that same attempt.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createAuthorityDeliveryDriver} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof createAuthorityDeliveryDriver,...args:Parameters<typeof createAuthorityDeliveryDriver>) => operation(...args);
 */
export function createAuthorityDeliveryDriver(o: {
  /** Owning Meta protocol implementation; no fallback delivery queue. */

  driver: SocialDeliveryDriver;
  /** Scoped durable authority admission and reconciliation wrapper. */

  executor: AuthorityExecutor;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string
}): SocialDeliveryDriver {
  const input = (context: SocialDeliveryContext) => { if (!context.attemptId) throw new ManagementFault('unavailable'); return { id: 'delivery:' + context.attemptId, epoch: o.epoch, operation: 'sns:' + context.job.id, fingerprint: context.attemptId } };
  return { publish: (context, checkpoint) => o.executor.perform(input(context), () => o.driver.publish(context, checkpoint), result => result.status === 'unknown'), reconcile: context => o.executor.reconcile(input(context), () => o.driver.reconcile(context), result => ['unknown', 'pending'].includes(result.status)) };
}
