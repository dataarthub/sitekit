import { describe, expect, it } from 'vitest';
import {
  createContentPaymentCheckoutRequest,
  createRepositoryEntitlementResolver,
  createAiPromptRegistry,
} from '../index.js';
import type { ContentItem } from '../contracts/content.js';

const content: ContentItem = {
  id: 'post-1',
  collection: 'posts',
  slug: 'post-1',
  locale: 'ja',
  title: 'Post',
  tags: [],
  access: { visibility: 'paid', entitlementKey: 'post:post-1' },
  data: {},
};

describe('commerce and prompt contracts', () => {
  it('bridges a repository into the access resolver without knowing the provider', async () => {
    let received: unknown;
    const resolver = createRepositoryEntitlementResolver({
      hasEntitlement: async check => {
        received = check;
        return true;
      },
    }, { siteId: 'webmedia' });

    await expect(resolver.hasEntitlement(content, { subjectId: 'member-1' })).resolves.toBe(true);
    expect(received).toEqual({
      siteId: 'webmedia',
      entitlementKey: 'post:post-1',
      subjectId: 'member-1',
    });
  });

  it('keeps prompt identity and version explicit', () => {
    const registry = createAiPromptRegistry([
      { id: 'ask', version: '1.0.0', system: 'system', buildUser: input => String(input) },
    ]);

    expect(registry.get('ask', '1.0.0')?.buildUser('hello')).toBe('hello');
    expect(() => registry.register({
      id: 'ask', version: '1.0.0', system: 'duplicate', buildUser: () => '',
    })).toThrow('already registered');
  });

  it('builds a provider-neutral checkout request from a paid content offer', () => {
    const request = createContentPaymentCheckoutRequest({
      ...content,
      title: 'Paid post',
      access: {
        visibility: 'paid',
        entitlementKey: 'post:post-1',
        offer: { id: 'offer-1', amount: 1200, currency: 'JPY', kind: 'one-time' },
      },
    }, {
      siteId: 'webmedia',
      referenceId: 'purchase-1',
      returnUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
      subjectId: 'member-1',
    });

    expect(request).toEqual({
      siteId: 'webmedia',
      referenceId: 'purchase-1',
      contentId: 'post-1',
      entitlementKey: 'post:post-1',
      description: 'Paid post',
      amount: { amount: 1200, currency: 'JPY' },
      returnUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
      subjectId: 'member-1',
    });
  });
});
