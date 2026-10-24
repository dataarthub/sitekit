import type { CloudflareD1Database, CloudflareD1Statement } from '../types.js';
import type { MarketingScope } from '@alneas/sitekit/marketing';

/** Existing prepared statement contract used by standalone measurement. */
export type MarketingStatement = CloudflareD1Statement;
/** Minimal transactional D1 binding required for replay-safe bounded imports. */
export interface MarketingDatabase extends CloudflareD1Database {
  /**
   * Executes statements atomically and returns their rows in order.
   * @param statements - Prepared statements with bound values and RETURNING columns.
   * @returns Ordered statement results; any statement failure rolls back the batch.
   * @example
   * import type { MarketingDatabase, MarketingStatement } from '@alneas/sitekit-cloudflare/marketing';
   * export function batch(db: MarketingDatabase, statements: MarketingStatement[]) { return db.batch(statements); }
   */
  batch(statements: MarketingStatement[]): Promise<MarketingBatchResult[]>;
}
/** Returned rows from a transactional measurement write or snapshot read. */
export interface MarketingBatchResult {
  /** Statement result rows; each write returns its original insertion receipt. */
  results: Record<string, unknown>[];
}
/** Explicit standalone storage, scope, collection coverage and retention settings. */
export interface D1MarketingOptions {
  /** Provisioned D1 binding with marketingSchemaSql applied. */
  database: MarketingDatabase;
  /** Host-authenticated scope; every database operation includes it. */
  scope: MarketingScope;
  /** UTC/offset instant when collection began; does not imply complete ad-spend coverage. */
  startedAt: string;
  /** Retention in whole days, from 30 to 365; defaults to 90. */
  retentionDays?: number;
  /**
   * Supplies the clock for timestamp bounds, retention and report freshness.
   * @returns A valid current date.
   * @example
   * import type { D1MarketingOptions } from '@alneas/sitekit-cloudflare/marketing';
   * export function now(options: D1MarketingOptions) { return options.now?.() ?? new Date(); }
   */
  now?: () => Date;
}
