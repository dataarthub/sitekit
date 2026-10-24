/** Site identity derived from authenticated host configuration. */
export interface ConsoleScope {
  /** Authenticated tenant identifier. */
  tenantId: string;
  /** Authenticated site identifier. */
  siteId: string
}
/** Server-derived actor; never accept this identity from request JSON. */
export interface ConsoleActor extends ConsoleScope {
  /** Verified actor identifier. */
  userId: string
}
/** Supported first-release social destinations. */
export type SocialPlatform = 'facebook' | 'instagram';
/** Publication lifecycle; unknown forbids blind resending. */
export type SocialJobStatus = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'retry_wait' | 'published' | 'failed' | 'unknown' | 'cancelled';
/** Credential-free account shown in the common console. */
export interface SocialAccount {
  /** Opaque account or job identifier. */
  id: string;
  /** Supported publication destination. */
  platform: SocialPlatform;
  /** Credential-free display name. */
  name: string;
  /** Current connection or publication state. */
  status: 'connected' | 'reconnect_required' | 'disconnected';
  /** Credential expiry instant in UTC; no credential is exposed. */
  expiresAt: string;
  /** Expected optimistic revision for immediate commands. */
  version: number;
}
/** One destination's independently recorded publication result. */
export interface SocialJob {
  /** Opaque account or job identifier. */
  id: string;
  /** Expected optimistic revision for immediate commands. */
  version: number;
  /** Destination account identity. */
  accountId: string;
  /** Supported publication destination. */
  platform: SocialPlatform;
  /** Publication text. */
  text: string;
  /** Optional HTTPS image URL. */
  imageUrl?: string;
  /** Current connection or publication state. */
  status: SocialJobStatus;
  /** Optional scheduled UTC instant. */
  scheduledAt?: string;
  /** Creation instant in UTC. */
  createdAt: string;
  /** Number of admitted delivery attempts. */
  attempt: number;
  /** Next allowed retry instant, if known. */
  nextAttemptAt?: string;
  /** Confirmed publication instant. */
  publishedAt?: string;
  /** Provider publication identity, if proven. */
  externalId?: string;
  /** HTTPS publication link, if proven. */
  externalUrl?: string;
  /** Safe failure code without provider diagnostics. */
  errorCode?: string;
}
/** Credential-free immediate post request. */
export interface SocialPostInput {
  /** Stable identity reused only for identical post input. */
  idempotencyKey: string;
  /** Unique authorized destination identities. */
  accountIds: string[];
  /** Publication text. */
  text: string;
  /** Optional HTTPS image URL. */
  imageUrl?: string;
  /** Optional scheduled UTC instant. */
  scheduledAt?: string
}

/** Explicit versioned post control action. */
export type SocialJobAction = 'cancel' | 'retry' | 'reconcile' | 'approve';
/** Report presentation projection: no attribution or money calculation is performed in the UI. */
export interface ConsoleReport {
  /** Report calculation instant in UTC. */
  asOf: string;
  /** ISO currency; historical amounts are never converted. */
  currency: string;
  /** Reported spending coverage. */
  coverage: string;
  /** Server-calculated totals; null money means unavailable. */
  totals: {
  /** Observed page views. */
    pageViews: number;
  /** Confirmed lead outcomes. */
    leads: number;
  /** Confirmed booking outcomes. */
    bookings: number;
  /** Confirmed attributed outcomes. */
    confirmedConversions: number;
  /** Confirmed outcomes without an attribution match. */
    unattributedConversions: number;
  /** Registered spending in integer currency minor units, or null. */
    spendMinor: number | null;
  /** Confirmed revenue in integer currency minor units, or null. */
    revenueMinor: number | null;
  /** Server-calculated cost per acquisition in currency minor units, or null. */
    cpaMinor: number | null;
  /** Server-calculated revenue divided by spending, or null. */
    roas: number | null
  };
  /** Server-calculated campaign rows. */
  campaigns: {
  /** Attributed source, or null when unknown. */
    source: string | null;
  /** Attributed campaign, or null when unknown. */
    campaign: string | null;
  /** Confirmed attributed outcomes. */
    confirmedConversions: number;
  /** Registered spending in integer currency minor units, or null. */
    spendMinor: number | null;
  /** Confirmed revenue in integer currency minor units, or null. */
    revenueMinor: number | null;
  /** Server-calculated cost per acquisition in currency minor units, or null. */
    cpaMinor: number | null;
  /** Server-calculated revenue divided by spending, or null. */
    roas: number | null
  }[];
}
/** Bounded canonical report window and display defaults. */
export interface ConsoleReportQuery {
  /** Inclusive UTC window start. */
  from: string;
  /** Exclusive UTC window end. */
  to: string;
  /** IANA timezone for input and display. */
  timezone: string;
  /** ISO currency; historical amounts are never converted. */
  currency: string
}

/** Immediate marketing actions; configuration rules use ManagementSettingsProvider instead. */
export interface MarketingConsoleProvider {
  /**
     * Reads the canonical measured report without calculating attribution in the UI.
     * @param query - Validated operation input.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['report']>) => p.report(...args);
     */
  report(query: ConsoleReportQuery): Promise<ConsoleReport>;
  /**
     * Imports CSV rows expressed in integer currency minor units.
     * @param csv - Validated operation input.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['importSpend']>) => p.importSpend(...args);
     */
  importSpend(csv: string): Promise<{
  /** Number of newly accepted rows. */
    accepted: number;
  /** Number of previously registered rows. */
    duplicates: number
  }>;
  /**
     * Reads credential-free destination account projections.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['accounts']>) => p.accounts(...args);
     */
  accounts(): Promise<SocialAccount[]>;
  /**
     * Starts host-owned Meta OAuth without exposing credentials.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['connect']>) => p.connect(...args);
     */
  connect(): Promise<{
  /** Host-validated Meta OAuth redirect URL. */
    url: string
  }>;
  /**
     * Disconnects a destination using its reviewed optimistic version.
     * @param id - Opaque account or job identifier.
     * @param version - Expected optimistic revision for immediate commands.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['disconnect']>) => p.disconnect(...args);
     */
  disconnect(id: string, version: number): Promise<void>;
  /**
     * Reads scoped post history and pending jobs.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['jobs']>) => p.jobs(...args);
     */
  jobs(): Promise<SocialJob[]>;
  /**
     * Creates destination jobs under a stable idempotency identity.
     * @param input - Validated operation input.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['createPost']>) => p.createPost(...args);
     */
  createPost(input: SocialPostInput): Promise<SocialJob[]>;
  /**
     * Performs an explicitly selected versioned post action; unknown results require reconciliation.
     * @param id - Opaque account or job identifier.
     * @param version - Expected optimistic revision for immediate commands.
     * @param action - Validated operation input.
     * @returns Authoritative operation result; failures reject.
     * @example import type { MarketingConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: MarketingConsoleProvider, ...args: Parameters<MarketingConsoleProvider['jobAction']>) => p.jobAction(...args);
     */
  jobAction(id: string, version: number, action: SocialJobAction): Promise<SocialJob>;
}
/** Immediate operation names; servers reauthorize each call. */
export type MarketingOperation = 'read' | 'spend' | 'connect' | 'disconnect' | 'post' | 'reconcile';
/** Presentation grants; they do not authorize requests. */
export type MarketingAccess = Record<MarketingOperation, import('./contracts.js').ManagementPermission>;
/** Provider composition reused by standalone and embedded hosts. */
export interface ManagementConsoleProvider {
 /** Optional server-bound transfer controls; never contains credentials or peer endpoints. */
 connection?:import('./authority.js').ConnectionProvider;
  /** Authoritative settings port for this authenticated workspace. */
  settings: import('./contracts.js').ManagementSettingsProvider;
  /** Immediate report, account and publication operations. */
  marketing: MarketingConsoleProvider;
  /**
     * Reads presentation-only grants for immediate operations.
     * @returns Authoritative operation result; failures reject.
     * @example import type { ManagementConsoleProvider } from '@alneas/sitekit/management';
     * export const invoke = (p: ManagementConsoleProvider, ...args: Parameters<ManagementConsoleProvider['access']>) => p.access(...args);
     */
  access(): Promise<MarketingAccess>;
}
