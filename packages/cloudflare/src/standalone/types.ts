import type { ManagementScope, SettingsValues } from '@alneas/sitekit/management';
import type { AccessAuthenticationOptions } from './auth.js';
import type { MarketingDatabase } from '../marketing/types.js';
import type { SecretBox } from './social/types.js';
/** A localized reference-site page. Text is escaped by the supplied renderer. */
export interface StandalonePage {
  /** Canonical content locale. */


  locale: string;
  /** Canonical site-relative page path. */


  path: string;
  /** Plain-text page title. */


  title: string;
  /** Plain-text page body; the renderer escapes it. */


  body: string;
}
/** Immutable deployment configuration; mutable business values live in the settings record. */
export interface StandaloneConfiguration {
  /** Exact deployment origin used for same-origin admission. */


  origin: string;
  /** Immutable server-bound tenant/site identity. */


  scope: ManagementScope;
  /** Imported initial values; setup saves them without pretending they are applied. */


  initialValues: SettingsValues;
  /** UTC collection start instant. */


  startedAt: string;
  /** Trusted Access issuer, audience and optional offline verification keys. */


  access: AccessAuthenticationOptions;
  /** Installed localized content artifact, consumed by the reference renderer. */


  pages: StandalonePage[];
  /** Optional operator-owned Meta application configuration. */


  meta?: {
    /** Registered Meta application identifier. */


    appId: string;
    /** Explicit supported Graph API version selected by the operator. */


    apiVersion: string;
    /** Permissions required by the registered application. */


    permissions: string[];
    /** Explicit HTTPS origins allowed for publication images. */


    allowedMediaOrigins: string[]
  };
}
/** Server bindings. Public browser entries cannot import these secrets. */
export interface StandaloneBindings {
  /** Optional stable authority channel and authenticated EAOS delegation. Required on every instance before connecting. */


  authority?: {

    /**
       * Runs the scoped server operation under its durable authority fence.
       * @returns Authoritative result; invalid, stale or unavailable state fails closed.
       * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
       * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['status'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['status']>) => operation(...args);
       */

    status(): Promise<import('@alneas/sitekit/management').ConnectionStatus>;

    /**
       * Runs the scoped server operation under its durable authority fence.
       * @param subject - Verified server principal whose live permission generation fences writes.
       * @returns Authoritative result; invalid, stale or unavailable state fails closed.
       * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
       * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['connection'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['connection']>) => operation(...args);
       */

    connection(subject: string): Promise<import('@alneas/sitekit/management').ConnectionProvider>;

    /** Scoped durable authority admission and reconciliation wrapper. */

    executor: import('@alneas/sitekit/management').AuthorityExecutor;
    /**
       * Trusted server delegation maps this verified local subject to an EAOS principal; no browser identity headers.
       * @param request - Verified operation input.
       * @param subject - Verified server principal whose live permission generation fences writes.
       * @returns Authoritative result; invalid, stale or unavailable state fails closed.
       * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
       * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['management'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['management']>) => operation(...args);
       */


    management(request: Request, subject: string): Promise<Response>;

    /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
     * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['runtime'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['runtime']>) => operation(...args);
     */

    runtime(): Promise<Partial<SettingsValues>>;

    /**
     * Runs the scoped server operation under its durable authority fence.
     * @param request - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
     * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['analytics'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['analytics']>) => operation(...args);
     */

    analytics(request: Request): Promise<Response>;

    /**
     * Runs the scoped server operation under its durable authority fence.
     * @param event - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {StandaloneBindings} from '@alneas/sitekit-cloudflare/standalone';
     * export const invoke = (operation:NonNullable<NonNullable<StandaloneBindings>['authority']>['published'],...args:Parameters<NonNullable<NonNullable<StandaloneBindings>['authority']>['published']>) => operation(...args);
     */

    published(event: import('./social/types.js').PublicationEvent): Promise<import('@alneas/sitekit/management').SocialJob[]>;
  };
  /** Optional server-only HMAC key for successful content-publication notifications. */


  publicationKey?: Uint8Array;
  /** Provisioned D1 binding with transactional batch support. */


  database: MarketingDatabase;
  /** Static Assets binding; protected admin paths are authenticated before forwarding. */


  assets: {
    /**
        * Fetches a host-owned static asset after route admission.
        * @param request - Trusted operation input.
        * @returns Operation result, or a safe failure.
        * @example import type { StandaloneBindings } from '@alneas/sitekit-cloudflare/standalone';
        * export const invoke = (p: StandaloneBindings, ...args: Parameters<StandaloneBindings['assets']['fetch']>) => p.assets.fetch(...args);
        */


    fetch(request: Request): Promise<Response>
  };
  /** Server-only AES-GCM key ring; never passed to browser components. */


  secrets?: SecretBox;
  /** Server-only Meta application secret. */


  metaAppSecret?: string;
  /** Optional server-side provider HTTP transport. */


  fetch?: typeof fetch;
}
/** Actual, immutable application effect proof and its exact captured value. */
export interface StandaloneEffect {
  /** Immutable source application identity. */


  applicationId: string;
  /** Durable runtime activation or definitive rejection receipt. */


  receiptId: string;
  /** Applied settings section. */


  section: keyof SettingsValues;
  /** Exact captured saved revision. */


  savedRevision: string;
  /** Execution-owner generation that admitted the effect. */


  authorityEpoch: string;
  /** Recorded activation or definitive rejection outcome. */


  status: 'applied' | 'rejected';
  /** Exact captured configuration, not a later draft. */


  value: SettingsValues[keyof SettingsValues];
  /** UTC instant when the target recorded the effect. */


  appliedAt: string;
}
