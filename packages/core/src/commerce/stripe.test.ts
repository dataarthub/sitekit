import { describe, expect, it } from 'vitest';
import {
  createStripePaymentAdapter,
  verifyStripeWebhookSignature,
} from './stripe.js';

const now = 1_700_000_000;

async function signature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${now}.${payload}`),
  );
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `t=${now},v1=${hex}`;
}

describe('Stripe payment adapter', () => {
  it('creates a provider-neutral checkout session with stable commerce metadata', async () => {
    let requestBody = '';
    const adapter = createStripePaymentAdapter({
      secretKey: 'sk_test_example',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: async (url, init) => {
        expect(url).toBe('https://stripe.example/v1/checkout/sessions');
        expect(init.headers.Authorization).toMatch(/^Basic /);
        requestBody = init.body ?? '';
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.example/cs_test_123',
            expires_at: now + 1800,
          }),
        };
      },
    });

    await expect(adapter.createCheckout({
      siteId: 'site-1',
      referenceId: 'purchase-1',
      contentId: 'article-1',
      entitlementKey: 'article:article-1',
      description: 'Paid article',
      amount: { amount: 1200, currency: 'JPY' },
      returnUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
      subjectId: 'member-1',
    })).resolves.toMatchObject({
      id: 'cs_test_123',
      provider: 'stripe',
    });

    const params = new URLSearchParams(requestBody);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('1200');
    expect(params.get('metadata[reference_id]')).toBe('purchase-1');
    expect(params.get('metadata[entitlement_key]')).toBe('article:article-1');
    expect(params.get('payment_intent_data[metadata][content_id]')).toBe('article-1');
  });

  it('accepts a signed completed webhook and returns a purchase record', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_intent: 'pi_test_123',
          created: now,
          amount_total: 1200,
          currency: 'jpy',
          payment_status: 'paid',
          client_reference_id: 'purchase-1',
          metadata: {
            site_id: 'site-1',
            content_id: 'article-1',
            entitlement_key: 'article:article-1',
            subject_id: 'member-1',
          },
        },
      },
    });
    const webhookSignature = await signature(payload, 'whsec_example');
    const adapter = createStripePaymentAdapter({
      secretKey: 'sk_test_example',
      webhookSecret: 'whsec_example',
      now: () => now * 1000,
    });

    const result = await adapter.handleWebhook?.(new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': webhookSignature },
      body: payload,
    }));

    expect(result).toMatchObject({
      accepted: true,
      eventId: 'evt_test_123',
      status: 'paid',
      purchase: {
        id: 'purchase-1',
        siteId: 'site-1',
        contentId: 'article-1',
        entitlementKey: 'article:article-1',
        subjectId: 'member-1',
        providerReference: 'pi_test_123',
      },
    });
  });

  it('retrieves checkout status without exposing Stripe objects to the host', async () => {
    const adapter = createStripePaymentAdapter({
      secretKey: 'sk_test_example',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: async (url, init) => {
        expect(url).toBe('https://stripe.example/v1/checkout/sessions/cs_test_123');
        expect(init.method).toBe('GET');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: 'cs_test_123',
            status: 'complete',
            payment_status: 'paid',
            client_reference_id: 'purchase-1',
          }),
        };
      },
    });

    await expect(adapter.retrieveCheckout?.('cs_test_123')).resolves.toEqual({
      id: 'cs_test_123',
      url: '',
      provider: 'stripe',
      status: 'complete',
      paymentStatus: 'paid',
      referenceId: 'purchase-1',
    });
  });

  it('rejects stale or forged webhook signatures', async () => {
    await expect(verifyStripeWebhookSignature(
      '{}',
      't=1,v1=forged',
      'whsec_example',
      { now, toleranceSeconds: 300 },
    )).resolves.toBe(false);
  });
});
