import type { ConsoleActor, ConsoleScope, SocialAccount, SocialJob, SocialPostInput } from '@alneas/sitekit/management';

/** Authenticated encrypted credential envelope; no plaintext secret. */
export interface SealedSecret {
  /** Key-ring identifier used for rotation. */
  keyId: string;
  /** Base64 random AES-GCM initialization vector. */
  iv: string;
  /** Base64 authenticated ciphertext. */
  ciphertext: string
}
/** Server-only credential encryption and decryption port. */
export interface SecretBox {
  /**
 * Encrypts one credential under account-specific associated data.
 * @param value - Trusted operation input.
 * @param context - Trusted operation input.
 * @returns Operation result, or a safe failure.
 * @example import type { SecretBox } from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (p: SecretBox, ...args: Parameters<SecretBox['seal']>) => p.seal(...args);
 */
  seal(value: string, context: string): Promise<SealedSecret>;
  /**
 * Decrypts one credential only with matching associated data.
 * @param secret - Trusted operation input.
 * @param context - Trusted operation input.
 * @returns Operation result, or a safe failure.
 * @example import type { SecretBox } from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (p: SecretBox, ...args: Parameters<SecretBox['open']>) => p.open(...args);
 */
  open(secret: SealedSecret, context: string): Promise<string>
}
/** Provider credentials returned only by the trusted server OAuth exchange. */
export interface ConnectedAccount {
  /** Trusted id value. */
  id: string;
  /** Trusted platform value. */
  platform: 'facebook' | 'instagram';
  /** Trusted externalId value. */
  externalId: string;
  /** Trusted name value. */
  name: string;
  /** Trusted token value. */
  token: string;
  /** Trusted expiresAt value. */
  expiresAt: string
}
/** Durable credential-free account projection and its encrypted provider secret. */
export interface StoredAccount {
  /** Trusted view value. */
  view: SocialAccount;
  /** Trusted externalId value. */
  externalId: string;
  /** Trusted secret value. */
  secret: SealedSecret | null
}
/** Provider checkpoint recorded before any externally visible dispatch. */
export interface DeliveryProgress {
  /** Trusted phase value. */
  phase: 'prepared' | 'dispatching';
  /** Trusted containerId value. */
  containerId?: string
}
/** Durable per-destination dispatch identity, immutable request and recovery checkpoint. */
export interface StoredSocialJob {
  /** Trusted view value. */
  view: SocialJob;
  /** Trusted requestKey value. */
  requestKey: string;
  /** Trusted fingerprint value. */
  fingerprint: string;
  /** Trusted attemptId value. */
  attemptId?: string;
  /** Trusted leaseUntil value. */
  leaseUntil?: string;
  /** Trusted accountVersion value. */
  accountVersion?: number;
  /** Trusted progress value. */
  progress?: DeliveryProgress
}
/** Bounded encrypted social aggregate; never expose this record through a browser API. */
export interface SocialState {
  /** Trusted schemaVersion value. */
  publications: { /** Immutable content publication identity. */
    /** Immutable content publication identity. */
    key: string; /** Canonical input hash; changed replays conflict. */
    /** Canonical input hash; changed replays conflict. */
    fingerprint: string; /** Captured publication input, or null when disabled on first admission. */
    /** Captured publication input, or null when disabled on first admission. */
    input: SocialPostInput | null; /** Captured approval requirement; later policy changes cannot bypass it. */
    /** Captured approval requirement; later policy changes cannot bypass it. */
    requiresApproval: boolean
  }[];
  /** Persisted social schema version. */
  schemaVersion: 1;
  /** Trusted tenantId value. */
  tenantId: string;
  /** Trusted siteId value. */
  siteId: string;
  /** Trusted accounts value. */
  accounts: StoredAccount[];
  /** Trusted jobs value. */
  jobs: StoredSocialJob[];
  /** Trusted oauth value. */
  oauth: {
    /** Trusted hash value. */
    hash: string;
    /** Trusted userId value. */
    userId: string;
    /** Trusted expiresAt value. */
    expiresAt: string
  }[];
}
/** Native tenant/site CAS store with an atomic live admission and authority fence. */
export interface SocialStateStore {
  /** Immutable server-bound tenant/site identity. */
  scope: ConsoleScope;
  /**
     * Executes the scoped operation.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialStateStore } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialStateStore, ...args: Parameters<SocialStateStore['read']>) => p.read(...args);
     */
  read(): Promise<{
    /** Stable successful publication revision. */
    revision: number;
    /** Exact captured configuration, not a later draft. */
    value: SocialState
  }>;
  /**
     * Executes the scoped operation.
     * @param revision - Trusted operation input.
     * @param value - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialStateStore } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialStateStore, ...args: Parameters<SocialStateStore['compareAndSwap']>) => p.compareAndSwap(...args);
     */
  compareAndSwap(revision: number, value: SocialState): Promise<boolean>;
}
/** Provider result; uncertainty forbids an automatic new visible dispatch. */
export type SocialDeliveryResult =
  | {
    /** Recorded activation or definitive rejection outcome. */
    status: 'published';
    /** Trusted externalId value. */
    externalId?: string;
    /** Trusted externalUrl value. */
    externalUrl?: string
  }
  | {
    /** Recorded activation or definitive rejection outcome. */
    status: 'pending' | 'retry' | 'failed' | 'unknown';
    /** Trusted errorCode value. */
    errorCode?: string;
    /** Trusted reconnect value. */
    reconnect?: boolean
  };
/** Verified destination credentials and the admitted publication checkpoint. */
export interface SocialDeliveryContext {
  /** Durable exact dispatch attempt, retained when reconciling an uncertain effect. */
  attemptId?:string;
  /** Trusted account value. */
  account: ConnectedAccount;
  /** Trusted job value. */
  job: SocialJob;
  /** Trusted progress value. */
  progress?: DeliveryProgress
}
/** Publishing must checkpoint before any externally visible dispatch. Reconcile must never blindly dispatch. */
export interface SocialDeliveryDriver {
  /**
     * Executes the scoped operation.
     * @param context - Trusted operation input.
     * @param checkpoint - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialDeliveryDriver } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialDeliveryDriver, ...args: Parameters<SocialDeliveryDriver['publish']>) => p.publish(...args);
     */
  publish(context: SocialDeliveryContext, checkpoint: (progress: DeliveryProgress) => Promise<void>): Promise<SocialDeliveryResult>;
  /**
     * Executes the scoped operation.
     * @param context - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialDeliveryDriver } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialDeliveryDriver, ...args: Parameters<SocialDeliveryDriver['reconcile']>) => p.reconcile(...args);
     */
  reconcile(context: SocialDeliveryContext): Promise<SocialDeliveryResult>;
}
/** Server-only provider authorization and token exchange protocol. */
export interface SocialOAuthDriver {
  /**
     * Executes the scoped operation.
     * @param state - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialOAuthDriver } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialOAuthDriver, ...args: Parameters<SocialOAuthDriver['authorizationUrl']>) => p.authorizationUrl(...args);
     */
  authorizationUrl(state: string): string;
  /**
     * Executes the scoped operation.
     * @param code - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialOAuthDriver } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialOAuthDriver, ...args: Parameters<SocialOAuthDriver['exchange']>) => p.exchange(...args);
     */
  exchange(code: string): Promise<ConnectedAccount[]>;
}
/** Distinct read, connection, publication and executor privileges. */
export type SocialOperation = 'read' | 'connect' | 'disconnect' | 'post' | 'publish' | 'reconcile' | 'run';
/** Server-only social orchestration dependencies, bound to one verified actor and native authority. */
export interface SocialServiceOptions {
  /** Trusted actor value. */
  actor: ConsoleActor;
  /** Trusted store value. */
  store: SocialStateStore;
  /** Server-only AES-GCM key ring; never passed to browser components. */
  secrets: SecretBox;
  /** Trusted oauth value. */
  oauth: SocialOAuthDriver;
  /** Trusted driver value. */
  driver: SocialDeliveryDriver;
  /** Trusted publicationOrigin value. */
  publicationOrigin?: string;
  /** Explicit HTTPS origins allowed for publication images. */
  allowedMediaOrigins: readonly string[];
  /**
     * Executes the scoped operation.
     * @param operation - Trusted operation input.
     * @param accountId - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialServiceOptions } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialServiceOptions, ...args: Parameters<SocialServiceOptions['authorize']>) => p.authorize(...args);
     */
  authorize(operation: SocialOperation, accountId?: string): Promise<boolean>;
  /**
     * Executes the scoped operation.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialServiceOptions } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialServiceOptions, ...args: Parameters<SocialServiceOptions['publicationRule']>) => p.publicationRule(...args);
     */
  publicationRule(): Promise<import('@alneas/sitekit/management').SettingsValues['social']>;
  /**
     * Trusted now value.
     * @returns Current valid server date.
     * @example import type {SocialServiceOptions} from '@alneas/sitekit-cloudflare/management';
     * export const clock = (o:SocialServiceOptions) => o.now?.();
     */
  now?: () => Date;
}
/** Trusted successful content-publication event; repeated revisions deduplicate. */
export interface PublicationEvent {
  /** Stable published content identity. */
  contentId: string;
  /** Stable successful publication revision. */
  revision: string;
  /** Plain-text page title. */
  title: string;
  /** Plain-text publication summary. */
  excerpt: string;
  /** Canonical URL in the applied site origin. */
  canonicalUrl: string;
  /** Optional approved HTTPS image URL. */
  imageUrl?: string
}
/** Scoped social queue and execution policy; no transport or UI identity grants. */
export interface SocialService {
  /** Immutable server-bound tenant/site identity. */
  scope: ConsoleScope;
  /**
     * Executes the scoped operation.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['accounts']>) => p.accounts(...args);
     */
  accounts(): Promise<SocialAccount[]>;
  /**
     * Executes the scoped operation.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['connect']>) => p.connect(...args);
     */
  connect(): Promise<{
    /** Trusted url value. */
    url: string
  }>;
  /**
     * Executes the scoped operation.
     * @param input - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['completeConnect']>) => p.completeConnect(...args);
     */
  completeConnect(input: {
    /** Trusted state value. */
    state: string;
    /** Trusted code value. */
    code: string
  }): Promise<void>;
  /**
     * Executes the scoped operation.
     * @param id - Trusted operation input.
     * @param version - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['disconnect']>) => p.disconnect(...args);
     */
  disconnect(id: string, version: number): Promise<void>;
  /**
     * Executes the scoped operation.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['jobs']>) => p.jobs(...args);
     */
  jobs(): Promise<SocialJob[]>;
  /**
     * Executes the scoped operation.
     * @param input - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['createPost']>) => p.createPost(...args);
     */
  createPost(input: SocialPostInput): Promise<SocialJob[]>;
  /**
     * Executes the scoped operation.
     * @param id - Trusted operation input.
     * @param version - Trusted operation input.
     * @param action - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['jobAction']>) => p.jobAction(...args);
     */
  jobAction(id: string, version: number, action: 'cancel' | 'retry' | 'reconcile' | 'approve'): Promise<SocialJob>;
  /**
     * Executes the scoped operation.
     * @param event - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['onPublished']>) => p.onPublished(...args);
     */
  onPublished(event: PublicationEvent): Promise<SocialJob[]>;
  /**
     * Executes the scoped operation.
     * @param limit - Trusted operation input.
     * @returns Operation result, or a safe failure.
     * @example import type { SocialService } from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (p: SocialService, ...args: Parameters<SocialService['runDue']>) => p.runDue(...args);
     */
  runDue(limit?: number): Promise<void>;
}
export { ManagementFault as ConsoleFault } from '@alneas/sitekit/management';
