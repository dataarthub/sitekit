import type {
  ContentAccessContext,
  ContentEntitlementResolver,
} from '../access/index.js';
import type { ContentItem } from '../contracts/content.js';

/** Currency amount expressed in the currency minor unit. */
export interface Money {
  /** Amount in the currency's minor unit (for example, JPY or USD cents). */
  amount: number;
  /**
   * Currency code associated with the minor-unit amount.
   */
  currency: string;
}

/** Normalized lifecycle state of a purchase. */
export type PurchaseStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled'
  | 'expired';

/** Provider-neutral purchase record linking a payment to a content entitlement. */
export interface PurchaseRecord {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Canonical content identifier.
   */
  contentId: string;
  /**
   * Entitlement identifier used to associate access with this content or purchase.
   */
  entitlementKey: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: PurchaseStatus;
  /**
   * Payment amount and currency in minor units.
   */
  amount: Money;
  /**
   * Provider identifier associated with this operation.
   */
  provider: string;
  /**
   * Provider-specific payment or refund reference.
   */
  providerReference?: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Optional purchase timestamp reported by the provider.
   */
  purchasedAt?: string;
  /**
   * Expiry timestamp when supplied by the provider.
   */
  expiresAt?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Record<string, string>;
}

/** Site-scoped entitlement lookup with optional subject and authentication context. */
export interface EntitlementCheck {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Entitlement identifier used to associate access with this content or purchase.
   */
  entitlementKey: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Optional authentication token interpreted by the repository.
   */
  token?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Readonly<Record<string, unknown>>;
}

/** Persistence boundary for entitlement evaluation. */
export interface EntitlementRepository {
  /**
   * Checks an entitlement using repository-defined identity and expiry policy.
   *
   * @param check - Site-scoped entitlement and optional caller context.
   * @returns Whether an active entitlement is available.
   *
   * @example
   * ```ts
   * import type { EntitlementRepository } from '@alneas/sitekit/commerce';
   * export function useHasEntitlement(host: EntitlementRepository, ...args: Parameters<NonNullable<EntitlementRepository['hasEntitlement']>>) {
   * return host.hasEntitlement(...args);
   * }
   * ```
   */
  hasEntitlement(check: EntitlementCheck): Promise<boolean>;
}

/** Read boundary for purchase lookup and subject history. */
export interface PurchaseRepository {
  /**
   * Reads a purchase by its repository identifier.
   *
   * @param id - Purchase identifier.
   * @returns The purchase, or null when absent.
   *
   * @example
   * ```ts
   * import type { PurchaseRepository } from '@alneas/sitekit/commerce';
   * export function useGetPurchase(host: PurchaseRepository, ...args: Parameters<NonNullable<PurchaseRepository['getPurchase']>>) {
   * return host.getPurchase(...args);
   * }
   * ```
   */
  getPurchase(id: string): Promise<PurchaseRecord | null>;
  /**
   * Lists purchases belonging to a subject within a site.
   *
   * @param siteId - Site scope.
   * @param subjectId - Subject identifier.
   * @returns Matching purchase records.
   *
   * @example
   * ```ts
   * import type { PurchaseRepository } from '@alneas/sitekit/commerce';
   * export function useListForSubject(host: PurchaseRepository, ...args: Parameters<NonNullable<PurchaseRepository['listForSubject']>>) {
   * return host.listForSubject(...args);
   * }
   * ```
   */
  listForSubject(siteId: string, subjectId: string): Promise<PurchaseRecord[]>;
}

/** Normalized lifecycle state of a content entitlement. */
export type EntitlementStatus = 'active' | 'revoked' | 'expired';

/** Subject entitlement and optional expiry within a site. */
export interface EntitlementRecord {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Entitlement identifier used to associate access with this content or purchase.
   */
  entitlementKey: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: EntitlementStatus;
  /**
   * Expiry timestamp when supplied by the provider.
   */
  expiresAt?: string;
}

/** Atomic event-claim boundary for provider webhook deduplication. */
export interface CommerceEventRepository {
  /**
   * Atomically claims a provider event for deduplication.
   *
   * @param event - Provider, unique event identifier, and optional event type.
   * @returns True when newly claimed; false when already claimed.
   *
   * @example
   * ```ts
   * import type { CommerceEventRepository } from '@alneas/sitekit/commerce';
   * export function useClaimEvent(host: CommerceEventRepository, ...args: Parameters<NonNullable<CommerceEventRepository['claimEvent']>>) {
   * return host.claimEvent(...args);
   * }
   * ```
   */
  claimEvent(event: {
    /**
     * Provider identifier associated with this operation.
     */
    provider: string;
    /**
     * Provider event identifier used for correlation or deduplication.
     */
    eventId: string;
    /**
     * Provider event type before normalization.
     */
    eventType?: string;
  }): Promise<boolean>;
}

/** Persistence boundary for purchase and entitlement mutations. */
export interface CommerceWriter {
  /**
   * Persists a normalized purchase.
   *
   * @param purchase - Purchase record to write.
   * @returns Completion of the write.
   *
   * @example
   * ```ts
   * import type { CommerceWriter } from '@alneas/sitekit/commerce';
   * export function useRecordPurchase(host: CommerceWriter, ...args: Parameters<NonNullable<CommerceWriter['recordPurchase']>>) {
   * return host.recordPurchase(...args);
   * }
   * ```
   */
  recordPurchase(purchase: PurchaseRecord): Promise<void>;
  /**
   * Persists the subject entitlement state.
   *
   * @param entitlement - Site-scoped entitlement record.
   * @returns Completion of the write.
   *
   * @example
   * ```ts
   * import type { CommerceWriter } from '@alneas/sitekit/commerce';
   * export function useSetEntitlement(host: CommerceWriter, ...args: Parameters<NonNullable<CommerceWriter['setEntitlement']>>) {
   * return host.setEntitlement(...args);
   * }
   * ```
   */
  setEntitlement(entitlement: EntitlementRecord): Promise<void>;
  /**
   * Updates a stored purchase lifecycle state.
   *
   * @param id - Purchase identifier.
   * @param status - New normalized status.
   * @returns Completion of the update.
   *
   * @example
   * ```ts
   * import type { CommerceWriter } from '@alneas/sitekit/commerce';
   * export function useUpdatePurchaseStatus(host: CommerceWriter, ...args: Parameters<NonNullable<CommerceWriter['updatePurchaseStatus']>>) {
   * return host.updatePurchaseStatus(...args);
   * }
   * ```
   */
  updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<void>;
}

/** Content-oriented checkout request accepted by legacy checkout adapters. */
export interface CheckoutRequest {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Canonical content supplied to the checkout adapter.
   */
  content: ContentItem;
  /**
   * Host URL used after successful checkout.
   */
  returnUrl: string;
  /**
   * Host URL used when the customer cancels checkout.
   */
  cancelUrl: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Record<string, string>;
}

/** Provider checkout identifier, redirect URL, and optional expiry. */
export interface CheckoutSession {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * URL associated with this record.
   */
  url: string;
  /**
   * Provider identifier associated with this operation.
   */
  provider: string;
  /**
   * Expiry timestamp when supplied by the provider.
   */
  expiresAt?: string;
}

/** Boundary for starting checkout directly from content. */
export interface CheckoutAdapter {
  /**
   * Starts a content-oriented provider checkout.
   *
   * @param request - Content and host redirect context.
   * @returns A checkout session for customer redirection.
   *
   * @example
   * ```ts
   * import type { CheckoutAdapter } from '@alneas/sitekit/commerce';
   * export function useCreateCheckout(host: CheckoutAdapter, ...args: Parameters<NonNullable<CheckoutAdapter['createCheckout']>>) {
   * return host.createCheckout(...args);
   * }
   * ```
   */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
}

/** Normalized webhook outcome; acceptance alone does not imply a purchase update. */
export interface CommerceWebhookResult {
  /**
   * Whether the webhook was accepted for normalization; does not imply persistence.
   */
  accepted: boolean;
  /**
   * Optional host indication that the provider event was already processed.
   */
  duplicate?: boolean;
  /**
   * Provider event identifier used for correlation or deduplication.
   */
  eventId?: string;
  /**
   * Provider event type before normalization.
   */
  eventType?: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status?: PurchaseStatus;
  /**
   * Normalized purchase record associated with the operation.
   */
  purchase?: PurchaseRecord;
  /**
   * Error details describing an unsuccessful outcome.
   */
  error?: {
  /**
             * Machine-readable failure code.
             */
            code: string;
  /**
                           * Optional descriptive message supplied by the provider.
                           */
                          message: string };
}

/** Boundary for receiving and normalizing a provider webhook request. */
export interface CommerceWebhookAdapter {
  /**
   * Normalizes an incoming provider webhook.
   *
   * @param request - Original webhook request with headers and body.
   * @returns The normalized acceptance result.
   *
   * @example
   * ```ts
   * import type { CommerceWebhookAdapter } from '@alneas/sitekit/commerce';
   * export function useHandle(host: CommerceWebhookAdapter, ...args: Parameters<NonNullable<CommerceWebhookAdapter['handle']>>) {
   * return host.handle(...args);
   * }
   * ```
   */
  handle(request: Request): Promise<CommerceWebhookResult>;
}

/** Provider-neutral payment request with explicit amount and entitlement identity. */
export interface PaymentCheckoutRequest {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Host purchase reference carried through checkout metadata.
   */
  referenceId: string;
  /**
   * Canonical content identifier.
   */
  contentId: string;
  /**
   * Entitlement identifier used to associate access with this content or purchase.
   */
  entitlementKey: string;
  /**
   * Human-readable description for this record or operation.
   */
  description: string;
  /**
   * Payment amount and currency in minor units.
   */
  amount: Money;
  /**
   * Host URL used after successful checkout.
   */
  returnUrl: string;
  /**
   * Host URL used when the customer cancels checkout.
   */
  cancelUrl: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Optional customer email passed to the payment provider.
   */
  customerEmail?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Readonly<Record<string, string>>;
}

/** Host-supplied purchase identity, redirects, and optional customer metadata. */
export interface ContentPaymentCheckoutOptions {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /**
   * Host purchase reference carried through checkout metadata.
   */
  referenceId: string;
  /**
   * Host URL used after successful checkout.
   */
  returnUrl: string;
  /**
   * Host URL used when the customer cancels checkout.
   */
  cancelUrl: string;
  /**
   * Host identity of the caller or purchasing subject.
   */
  subjectId?: string;
  /**
   * Optional customer email passed to the payment provider.
   */
  customerEmail?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Readonly<Record<string, string>>;
  /**
   * Human-readable description for this record or operation.
   */
  description?: string;
}

/**
 * Builds a provider-neutral payment request from a paid content offer.
 *
 * @param content - Paid content with an offer; status is not checked.
 * @param options - Site, reference, redirect URLs, and optional customer metadata.
 * @returns A checkout request using the offer amount and the content entitlement key or identifier.
 * @throws If visibility is not paid or the content has no offer.
 * @remarks Amount, currency, URL, and offer-kind validation belongs to the payment adapter.
 * @example
 * ```ts
 * import { createContentPaymentCheckoutRequest } from '@alneas/sitekit/commerce';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const paid = { ...content, access: { visibility: 'paid' as const, offer: { id: 'offer', kind: 'one-time' as const, amount: 100, currency: 'USD' } } };
 * const request = createContentPaymentCheckoutRequest(paid, { siteId: 'example', referenceId: 'purchase', returnUrl: 'https://example.com/thanks', cancelUrl: 'https://example.com/guide' });
 * ```
 */
export function createContentPaymentCheckoutRequest(
  content: ContentItem,
  options: ContentPaymentCheckoutOptions,
): PaymentCheckoutRequest {
  const offer = content.access?.offer;
  if (content.access?.visibility !== 'paid' || !offer) {
    throw new Error(`Content is not purchasable: ${content.id}`);
  }
  const request: PaymentCheckoutRequest = {
    siteId: options.siteId,
    referenceId: options.referenceId,
    contentId: content.id,
    entitlementKey: content.access.entitlementKey ?? content.id,
    description: options.description ?? content.title,
    amount: { amount: offer.amount, currency: offer.currency },
    returnUrl: options.returnUrl,
    cancelUrl: options.cancelUrl,
    ...(options.subjectId ? { subjectId: options.subjectId } : {}),
    ...(options.customerEmail ? { customerEmail: options.customerEmail } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
  return request;
}

/** Provider-neutral checkout session used for customer redirection. */
export interface PaymentCheckoutSession {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * URL associated with this record.
   */
  url: string;
  /**
   * Provider identifier associated with this operation.
   */
  provider: string;
  /**
   * Expiry timestamp when supplied by the provider.
   */
  expiresAt?: string;
}

/** Normalized checkout session lifecycle state. */
export type PaymentCheckoutStatus = 'open' | 'complete' | 'expired';
/** Payment settlement state reported for a checkout session. */
export type PaymentCheckoutPaymentStatus = 'paid' | 'unpaid' | 'no_payment_required';

/** Retrieved checkout session including payment state and optional reference metadata. */
export interface PaymentCheckoutDetails extends PaymentCheckoutSession {
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: PaymentCheckoutStatus;
  /**
   * Normalized payment settlement state of the checkout session.
   */
  paymentStatus: PaymentCheckoutPaymentStatus;
  /**
   * Host purchase reference carried through checkout metadata.
   */
  referenceId?: string;
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata?: Readonly<Record<string, string>>;
}

/** Purchase to refund, with an optional provider-supported reason. */
export interface PaymentRefundRequest {
  /**
   * Normalized purchase record associated with the operation.
   */
  purchase: PurchaseRecord;
  /**
   * Host or provider reason for the operation.
   */
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

/** Normalized refund reference and processing status. */
export interface PaymentRefundResult {
  /**
   * Provider identifier associated with this operation.
   */
  provider: string;
  /**
   * Provider-specific payment or refund reference.
   */
  providerReference: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: 'refunded' | 'pending' | 'failed';
}

/**
 * Provider-neutral payment boundary. Implementations must keep credentials and
 * provider-specific API objects outside the host and UI packages.
 */
export interface PaymentAdapter {
  /**
   * Provider identifier associated with this operation.
   */
  readonly provider: string;
  /**
   * Starts a provider checkout for an explicit amount and entitlement.
   *
   * @param request - Provider-neutral payment details.
   * @returns The checkout session.
   *
   * @example
   * ```ts
   * import type { PaymentAdapter } from '@alneas/sitekit/commerce';
   * export function useCreateCheckout(host: PaymentAdapter, ...args: Parameters<NonNullable<PaymentAdapter['createCheckout']>>) {
   * return host.createCheckout(...args);
   * }
   * ```
   */
  createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckoutSession>;
  /**
   * Retrieves the current normalized checkout state when supported.
   *
   * @param sessionId - Provider checkout identifier.
   * @returns Checkout and payment status.
   *
   * @example
   * ```ts
   * import type { PaymentAdapter } from '@alneas/sitekit/commerce';
   * export function useRetrieveCheckout(host: PaymentAdapter, ...args: Parameters<NonNullable<PaymentAdapter['retrieveCheckout']>>) {
   * return host.retrieveCheckout?.(...args);
   * }
   * ```
   */
  retrieveCheckout?(sessionId: string): Promise<PaymentCheckoutDetails>;
  /**
   * Processes a provider webhook when supported.
   *
   * @param request - Original request with signature headers and raw body.
   * @returns Normalized event and optional purchase details.
   *
   * @example
   * ```ts
   * import type { PaymentAdapter } from '@alneas/sitekit/commerce';
   * export function useHandleWebhook(host: PaymentAdapter, ...args: Parameters<NonNullable<PaymentAdapter['handleWebhook']>>) {
   * return host.handleWebhook?.(...args);
   * }
   * ```
   */
  handleWebhook?(request: Request): Promise<CommerceWebhookResult>;
  /**
   * Requests a refund when supported by the provider.
   *
   * @param request - Purchase and optional refund reason.
   * @returns The provider refund reference and status.
   *
   * @example
   * ```ts
   * import type { PaymentAdapter } from '@alneas/sitekit/commerce';
   * export function useRefund(host: PaymentAdapter, ...args: Parameters<NonNullable<PaymentAdapter['refund']>>) {
   * return host.refund?.(...args);
   * }
   * ```
   */
  refund?(request: PaymentRefundRequest): Promise<PaymentRefundResult>;
}

/**
 * Adapts a site-scoped entitlement repository to the content access resolver.
 *
 * @param repository - Repository responsible for entitlement lookup and expiry policy.
 * @param options - Site identifier included in every repository check.
 * @returns A resolver forwarding the content key, subject identifier, and context metadata.
 * @remarks Repository failures propagate when hasEntitlement is called; context entitlement arrays are not consulted.
 * @example
 * ```ts
 * import { createRepositoryEntitlementResolver } from '@alneas/sitekit/commerce';
 * const resolver = createRepositoryEntitlementResolver({ hasEntitlement: async () => false }, { siteId: 'example' });
 * ```
 */
export function createRepositoryEntitlementResolver(
  repository: EntitlementRepository,
  options: {
  /**
              * Host site identifier used to scope the operation.
              */
             siteId: string },
): ContentEntitlementResolver {
  return {
    async hasEntitlement(content: ContentItem, context: ContentAccessContext): Promise<boolean> {
      const entitlementKey = content.access?.entitlementKey ?? content.id;
      return repository.hasEntitlement({
        siteId: options.siteId,
        entitlementKey,
        ...(context.subjectId !== undefined ? { subjectId: context.subjectId } : {}),
        ...(context.metadata !== undefined ? { metadata: context.metadata } : {}),
      });
    },
  };
}
