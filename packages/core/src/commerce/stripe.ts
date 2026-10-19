import type {
  CommerceWebhookResult,
  Money,
  PaymentAdapter,
  PaymentCheckoutRequest,
  PaymentCheckoutDetails,
  PaymentCheckoutSession,
  PaymentRefundRequest,
  PaymentRefundResult,
  PurchaseRecord,
} from './index.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Minimal HTTP response contract used by the Stripe adapter transport. */
export interface StripeFetchResponse {
  /**
   * Whether the HTTP response represents a successful status.
   */
  ok: boolean;
  /**
   * HTTP status code used when reporting provider errors.
   */
  status: number;
  /**
   * Reads the HTTP response body as text.
   * @returns Response body text, rejecting if the transport cannot read the body.
   * @example
   * ```ts
   * import type { StripeFetchResponse } from '@alneas/sitekit/commerce/stripe';
   * export function useText(host: StripeFetchResponse, ...args: Parameters<NonNullable<StripeFetchResponse['text']>>) {
   * return host.text(...args);
   * }
   * ```
   */
  text(): Promise<string>;
}

/**
 * Injectable HTTP transport for Stripe GET and form-encoded POST requests.
 * @param url - Absolute Stripe API endpoint for the request.
 * @param init - HTTP method, request headers and optional form-encoded POST body.
 * @returns The transport response, rejecting if the request fails.
 * @example
 * ```ts
 * import type { StripeFetch } from '@alneas/sitekit/commerce/stripe';
 * export function invoke(callback: StripeFetch, ...args: Parameters<StripeFetch>) {
 * return callback(...args);
 * }
 * ```
 */
export type StripeFetch = (
  url: string,
  init: {
    /**
     * HTTP method used for the Stripe request.
     */
    method: 'GET' | 'POST';
    /**
     * HTTP request headers including provider authorization.
     */
    headers: Record<string, string>;
    /**
     * Optional form-encoded POST body; omitted for retrieval requests.
     */
    body?: string;
  },
) => Promise<StripeFetchResponse>;

/** Server-only Stripe configuration and optional transport and clock overrides. */
export interface StripePaymentAdapterOptions {
  /** Server-only Stripe API credential; required at adapter creation. */
  secretKey: string;
  /** Server-only signing secret required by the webhook handler. */
  webhookSecret?: string;
  /**
   * Optional host transport used for provider requests.
   */
  fetch?: StripeFetch;
  /**
   * Optional Stripe API base URL; defaults to https://api.stripe.com/v1.
   */
  apiBaseUrl?: string;
  /**
   * Injectable current time in milliseconds since the Unix epoch.
   * @returns Current Unix time in milliseconds.
   * @example
   * ```ts
   * import type { StripePaymentAdapterOptions } from '@alneas/sitekit/commerce/stripe';
   * export function useNow(host: StripePaymentAdapterOptions, ...args: Parameters<NonNullable<StripePaymentAdapterOptions['now']>>) {
   * return host.now?.(...args);
   * }
   * ```
   */
  now?: () => number;
  /** Allowed webhook timestamp skew in seconds; defaults to 300. */
  webhookToleranceSeconds?: number;
}

interface StripeObject {
  id?: unknown;
  object?: unknown;
  livemode?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

interface StripeEvent {
  id?: unknown;
  type?: unknown;
  data?: { object?: StripeObject };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Stripe response is missing ${name}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === 'string'),
  ) as Record<string, string>;
}

function appendForm(form: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined) form.set(key, String(value));
}

function appendMetadata(
  form: URLSearchParams,
  metadata: Readonly<Record<string, string>>,
  prefix = 'metadata',
): void {
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`${prefix}[${key}]`, value);
  }
}

function stripeError(payload: string, status: number): Error {
  try {
    const parsed = JSON.parse(payload) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === 'string') return new Error(`Stripe API ${status}: ${message}`);
  } catch {
    // Preserve a useful status even when Stripe returns a non-JSON response.
  }
  return new Error(`Stripe API request failed with status ${status}`);
}

function toIsoTimestamp(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : undefined;
}

function moneyFromStripeObject(object: StripeObject, fallback?: Money): Money {
  const amount = object.amount_total ?? object.amount;
  const currency = object.currency;
  if (typeof amount === 'number' && typeof currency === 'string') {
    return { amount, currency: currency.toUpperCase() };
  }
  if (fallback) return fallback;
  throw new Error('Stripe event is missing amount and currency');
}

function purchaseFromCheckoutSession(
  object: StripeObject,
  eventType: string,
): PurchaseRecord {
  const metadata = asMetadata(object.metadata);
  const referenceId = optionalString(object.client_reference_id) ?? metadata.reference_id;
  const siteId = metadata.site_id;
  const contentId = metadata.content_id;
  const entitlementKey = metadata.entitlement_key;
  if (!referenceId || !siteId || !contentId || !entitlementKey) {
    throw new Error(
      'Stripe event metadata must include reference_id, site_id, content_id, and entitlement_key',
    );
  }

  const paymentStatus = optionalString(object.payment_status);
  const status: PurchaseRecord['status'] = eventType === 'checkout.session.expired'
    ? 'expired'
    : paymentStatus === 'paid' || eventType === 'checkout.session.completed'
      ? 'paid'
      : 'pending';

  const subjectId = metadata.subject_id;
  const purchasedAt = toIsoTimestamp(object.created);
  const expiresAt = toIsoTimestamp(object.expires_at);
  const paymentIntent = optionalString(object.payment_intent);
  return {
    id: referenceId,
    siteId,
    contentId,
    entitlementKey,
    status,
    amount: moneyFromStripeObject(object),
    provider: 'stripe',
    providerReference: paymentIntent ?? requiredString(object.id, 'checkout session id'),
    ...(subjectId ? { subjectId } : {}),
    ...(purchasedAt ? { purchasedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    metadata,
  };
}

function purchaseFromRefundObject(object: StripeObject): PurchaseRecord {
  const metadata = asMetadata(object.metadata);
  const referenceId = metadata.reference_id;
  const siteId = metadata.site_id;
  const contentId = metadata.content_id;
  const entitlementKey = metadata.entitlement_key;
  if (!referenceId || !siteId || !contentId || !entitlementKey) {
    throw new Error(
      'Stripe refund metadata must include reference_id, site_id, content_id, and entitlement_key',
    );
  }
  return {
    id: referenceId,
    siteId,
    contentId,
    entitlementKey,
    status: 'refunded',
    amount: moneyFromStripeObject(object),
    provider: 'stripe',
    providerReference: requiredString(object.id, 'refund id'),
    ...(metadata.subject_id ? { subjectId: metadata.subject_id } : {}),
    metadata,
  };
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Verifies Stripe webhook timestamp and v1 HMAC signatures using Web Crypto.
 *
 * @param payload - Unmodified raw request body.
 * @param signature - Stripe-Signature header value.
 * @param secret - Webhook signing secret supplied by the server.
 * @param options - Current Unix time in seconds and allowed clock skew (default 300 seconds).
 * @returns Whether at least one signature matches within the allowed time window.
 * @throws Propagates Web Crypto failures.
 * @remarks Requires crypto.subtle; verification does not parse or persist the event.
 * @example
 * ```ts
 * import { verifyStripeWebhookSignature } from '@alneas/sitekit/commerce/stripe';
 * async function verify(request: Request, signingSecret: string) {
 * return verifyStripeWebhookSignature(await request.text(), request.headers.get('stripe-signature') ?? '', signingSecret);
 * }
 * ```
 */
export async function verifyStripeWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  options: {
  /**
              * Current Unix time in seconds; defaults to Math.floor(Date.now() / 1000).
              */
             now?: number;
  /**
                            * Allowed webhook timestamp skew in seconds; defaults to 300.
                            */
                           toleranceSeconds?: number } = {},
): Promise<boolean> {
  const timestamp = signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
  const signatures = [...signature.matchAll(/(?:^|,)v1=([^,]+)(?:,|$)/g)].map(match => match[1]);
  if (!timestamp || signatures.length === 0) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;
  const expected = await hmacSha256(secret, `${timestamp}.${payload}`);
  return signatures.some(candidate => candidate !== undefined && safeEqual(candidate, expected));
}

function resultError(
  code: string,
  message: string,
  event?: { id?: string; type?: string },
): CommerceWebhookResult {
  return {
    accepted: false,
    ...(event?.id ? { eventId: event.id } : {}),
    ...(event?.type ? { eventType: event.type } : {}),
    error: { code, message },
  };
}

/**
 * Creates a server-side Stripe checkout, retrieval, webhook, and refund adapter.
 *
 * @param options - Server credentials, optional fetch transport, API base, and webhook clock policy.
 * @returns A provider-neutral payment adapter using Stripe HTTP APIs.
 * @throws If secretKey is empty; adapter operations reject on transport, response, or input errors.
 * @remarks Requires fetch, btoa, and Web Crypto. Webhooks return normalized results without claiming events, writing purchases, or granting entitlements; callers own persistence and deduplication. The now callback returns milliseconds, while webhookToleranceSeconds uses seconds.
 * @example
 * ```ts
 * import { createStripePaymentAdapter } from '@alneas/sitekit/commerce/stripe';
 * function configurePayments(secretKey: string, webhookSecret: string) {
 * return createStripePaymentAdapter({ secretKey, webhookSecret });
 * }
 * ```
 */
export function createStripePaymentAdapter(
  options: StripePaymentAdapterOptions,
): PaymentAdapter {
  if (!options.secretKey) throw new Error('Stripe secretKey is required');
  const request = options.fetch ?? (globalThis.fetch as unknown as StripeFetch);
  const baseUrl = (options.apiBaseUrl ?? STRIPE_API_BASE).replace(/\/$/, '');

  async function stripePost(path: string, form: URLSearchParams): Promise<StripeObject> {
    return stripeRequest(path, 'POST', form.toString());
  }

  async function stripeRequest(path: string, method: 'GET' | 'POST', body?: string): Promise<StripeObject> {
    const response = await request(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${options.secretKey}:`)}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
    const responseBody = await response.text();
    if (!response.ok) throw stripeError(responseBody, response.status);
    return JSON.parse(responseBody) as StripeObject;
  }

  const adapter: PaymentAdapter = {
    provider: 'stripe',

    async createCheckout(input: PaymentCheckoutRequest): Promise<PaymentCheckoutSession> {
      if (!Number.isInteger(input.amount.amount) || input.amount.amount <= 0) {
        throw new Error('Stripe checkout amount must be a positive integer in minor units');
      }
      const metadata: Record<string, string> = {
        ...(input.metadata ?? {}),
        reference_id: input.referenceId,
        site_id: input.siteId,
        content_id: input.contentId,
        entitlement_key: input.entitlementKey,
        ...(input.subjectId ? { subject_id: input.subjectId } : {}),
      };
      const form = new URLSearchParams();
      appendForm(form, 'mode', 'payment');
      appendForm(form, 'success_url', input.returnUrl);
      appendForm(form, 'cancel_url', input.cancelUrl);
      appendForm(form, 'client_reference_id', input.referenceId);
      appendForm(form, 'line_items[0][price_data][currency]', input.amount.currency.toLowerCase());
      appendForm(form, 'line_items[0][price_data][unit_amount]', input.amount.amount);
      appendForm(form, 'line_items[0][price_data][product_data][name]', input.description);
      appendForm(form, 'line_items[0][quantity]', 1);
      appendForm(form, 'customer_email', input.customerEmail);
      appendMetadata(form, metadata);
      appendMetadata(form, metadata, 'payment_intent_data[metadata]');

      const session = await stripePost('/checkout/sessions', form);
      const expiresAt = toIsoTimestamp(session.expires_at);
      return {
        id: requiredString(session.id, 'checkout session id'),
        url: requiredString(session.url, 'checkout session url'),
        provider: 'stripe',
        ...(expiresAt ? { expiresAt } : {}),
      };
    },

    async retrieveCheckout(sessionId: string): Promise<PaymentCheckoutDetails> {
      if (!sessionId.trim()) throw new Error('Stripe checkout session id is required');
      const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, 'GET');
      const status = optionalString(session.status);
      const paymentStatus = optionalString(session.payment_status);
      if (status !== 'open' && status !== 'complete' && status !== 'expired') {
        throw new Error('Stripe checkout session has an invalid status');
      }
      if (paymentStatus !== 'paid' && paymentStatus !== 'unpaid' && paymentStatus !== 'no_payment_required') {
        throw new Error('Stripe checkout session has an invalid payment status');
      }
      const referenceId = optionalString(session.client_reference_id)
        ?? asMetadata(session.metadata).reference_id;
      const metadata = asMetadata(session.metadata);
      const expiresAt = toIsoTimestamp(session.expires_at);
      return {
        id: requiredString(session.id, 'checkout session id'),
        url: optionalString(session.url) ?? '',
        provider: 'stripe',
        status,
        paymentStatus,
        ...(referenceId ? { referenceId } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      };
    },

    async handleWebhook(request: Request): Promise<CommerceWebhookResult> {
      const eventBody = await request.text();
      const eventSignature = request.headers.get('stripe-signature');
      if (!options.webhookSecret || !eventSignature) {
        return resultError('invalid_signature', 'Stripe webhook secret or signature is missing');
      }
      const signatureOptions = {
        ...(options.now ? { now: Math.floor(options.now() / 1000) } : {}),
        ...(options.webhookToleranceSeconds
          ? { toleranceSeconds: options.webhookToleranceSeconds } : {}),
      };
      const valid = await verifyStripeWebhookSignature(
        eventBody,
        eventSignature,
        options.webhookSecret,
        signatureOptions,
      );
      if (!valid) return resultError('invalid_signature', 'Stripe webhook signature is invalid');

      let event: StripeEvent;
      try {
        event = JSON.parse(eventBody) as StripeEvent;
      } catch {
        return resultError('invalid_payload', 'Stripe webhook payload is not valid JSON');
      }
      const eventId = optionalString(event.id);
      const eventType = optionalString(event.type);
      if (!eventId || !eventType || !event.data?.object) {
        return resultError('invalid_payload', 'Stripe webhook event is missing id, type, or data', {
          ...(eventId ? { id: eventId } : {}),
          ...(eventType ? { type: eventType } : {}),
        });
      }

      try {
        let purchase: PurchaseRecord;
        if (eventType === 'charge.refunded' || eventType === 'refund.created') {
          purchase = purchaseFromRefundObject(event.data.object);
        } else if (
          eventType === 'checkout.session.completed'
          || eventType === 'checkout.session.async_payment_succeeded'
          || eventType === 'checkout.session.async_payment_failed'
          || eventType === 'checkout.session.expired'
        ) {
          purchase = purchaseFromCheckoutSession(event.data.object, eventType);
          if (eventType === 'checkout.session.async_payment_failed') purchase.status = 'failed';
        } else {
          return {
            accepted: true,
            eventId,
            eventType,
          };
        }
        return {
          accepted: true,
          eventId,
          eventType,
          status: purchase.status,
          purchase,
        };
      } catch (error) {
        return resultError(
          'invalid_metadata',
          error instanceof Error ? error.message : 'Stripe webhook metadata is invalid',
          { id: eventId, type: eventType },
        );
      }
    },

    async refund(input: PaymentRefundRequest): Promise<PaymentRefundResult> {
      const form = new URLSearchParams();
      if (input.purchase.providerReference) {
        appendForm(form, 'payment_intent', input.purchase.providerReference);
      } else {
        throw new Error('Stripe refund requires the provider reference');
      }
      appendForm(form, 'reason', input.reason);
      appendMetadata(form, {
        reference_id: input.purchase.id,
        site_id: input.purchase.siteId,
        content_id: input.purchase.contentId,
        entitlement_key: input.purchase.entitlementKey,
        ...(input.purchase.subjectId ? { subject_id: input.purchase.subjectId } : {}),
      });
      const refund = await stripePost('/refunds', form);
      const status = optionalString(refund.status);
      return {
        provider: 'stripe',
        providerReference: requiredString(refund.id, 'refund id'),
        status: status === 'succeeded' ? 'refunded' : status === 'pending' ? 'pending' : 'failed',
      };
    },
  };

  return adapter;
}

/**
 * Alias of createStripePaymentAdapter for checkout-oriented integrations.
 *
 * @param options - Server credentials and optional transport and webhook policy.
 * @returns The Stripe payment adapter, including checkout, retrieval, webhook, and refund methods.
 * @throws If secretKey is empty.
 * @example
 * ```ts
 * import { createStripeCheckoutAdapter } from '@alneas/sitekit/commerce/stripe';
 * function configureCheckout(secretKey: string) {
 * return createStripeCheckoutAdapter({ secretKey });
 * }
 * ```
 */
export const createStripeCheckoutAdapter = createStripePaymentAdapter;
