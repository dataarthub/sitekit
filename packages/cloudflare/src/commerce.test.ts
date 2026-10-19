import { describe, expect, it } from 'vitest';
import { createD1CommerceRepository, createD1CommerceWebhookAdapter } from './commerce.js';

describe('Cloudflare D1 commerce repository', () => {
  it('fails closed without a subject and queries active entitlements', async () => {
    let prepared = '';
    let bound: unknown[] = [];
    const db = {
      prepare(query: string) {
        prepared = query;
        return {
          bind(...values: unknown[]) {
            bound = values;
            return this;
          },
          first: async () => ({ entitled: 1 }),
          all: async () => ({ results: [] }),
          run: async () => ({}),
        };
      },
    };
    const repository = createD1CommerceRepository(db, {
      now: () => '2026-09-19T00:00:00.000Z',
    });

    await expect(repository.hasEntitlement({
      siteId: 'site-1', entitlementKey: 'post:1',
    })).resolves.toBe(false);
    await expect(repository.hasEntitlement({
      siteId: 'site-1', entitlementKey: 'post:1', subjectId: 'member-1',
    })).resolves.toBe(true);
    expect(prepared).toContain('content_entitlements');
    expect(bound).toEqual(['site-1', 'post:1', 'member-1', '2026-09-19T00:00:00.000Z']);
  });

  it('rejects unsafe table identifiers before constructing SQL', () => {
    expect(() => createD1CommerceRepository({ prepare: () => { throw new Error('unused'); } }, {
      entitlementTable: 'content_entitlements; DROP TABLE posts',
    })).toThrow('Invalid D1 table identifier');
  });

  it('persists a paid webhook once and grants the entitlement', async () => {
    const calls: string[] = [];
    const repository = {
      claimEvent: async () => {
        calls.push('claim');
        return true;
      },
      recordPurchase: async () => { calls.push('purchase'); },
      setEntitlement: async () => { calls.push('entitlement'); },
      updatePurchaseStatus: async () => { calls.push('status'); },
    } as Parameters<typeof createD1CommerceWebhookAdapter>[0]['repository'];
    const adapter = createD1CommerceWebhookAdapter({
      paymentAdapter: {
        provider: 'stripe',
        handleWebhook: async () => ({
          accepted: true,
          eventId: 'evt_1',
          eventType: 'checkout.session.completed',
          status: 'paid',
          purchase: {
            id: 'purchase-1',
            siteId: 'site-1',
            contentId: 'article-1',
            entitlementKey: 'article:article-1',
            status: 'paid',
            amount: { amount: 1200, currency: 'JPY' },
            provider: 'stripe',
            subjectId: 'member-1',
          },
        }),
      },
      repository,
    });

    const result = await adapter.handle(new Request('https://example.test/webhook', { method: 'POST' }));
    expect(result.accepted).toBe(true);
    expect(calls).toEqual(['claim', 'purchase', 'entitlement']);
  });
});
