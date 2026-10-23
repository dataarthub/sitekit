import { z } from 'zod';
import { ManagementFault } from '@alneas/sitekit/management';
import type { ManagementScope, SettingsOperation, MarketingOperation } from '@alneas/sitekit/management';
import type { MarketingDatabase } from '../marketing/types.js';
/** Operations resolved from the durable ACL, never from JWT role claims. */
export type StandaloneOperation = SettingsOperation | MarketingOperation | 'publish' | 'run' | 'publication' | 'manageConnection';
/** One separately versioned human or background-service grant. */
export interface StandaloneGrant {
  /** Verified human or separately configured service principal. */
  subject: string;
  /** Human identities cannot acquire scheduled service privileges. */
  kind: 'human' | 'service';
  /** Whether this grant currently admits operations. */
  enabled: boolean;
  /** Opaque ACL generation, atomically mirrored into admission. */
  version: string;
  /** Explicit allowed operations; never inferred from JWT roles. */
  operations: StandaloneOperation[];
}
export const grantSchemaSql = `CREATE TABLE IF NOT EXISTS sitekit_standalone_grants (
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,subject TEXT NOT NULL,kind TEXT NOT NULL,
 enabled INTEGER NOT NULL,version TEXT NOT NULL,operations TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,subject)
);`;
const operation = z.enum(['readSettings', 'saveSettings', 'applySettings', 'readApplication', 'completeApplication', 'read', 'post', 'spend', 'connect', 'disconnect', 'reconcile', 'publish', 'run', 'publication', 'manageConnection']);
const grantSchema = z.strictObject({ subject: z.string().min(1).max(160), kind: z.enum(['human', 'service']), enabled: z.boolean(), version: z.string().min(1).max(160), operations: z.array(operation).max(20) });
/**
 * Reads an ACL only when its admission generation matches.
 * @param db - Trusted configuration or scoped server binding.
 * @param scope - Trusted configuration or scoped server binding.
 * @param subject - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { readStandaloneGrant } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof readStandaloneGrant>) => readStandaloneGrant(...args);
 */
export async function readStandaloneGrant(db: MarketingDatabase, scope: ManagementScope, subject: string): Promise<StandaloneGrant | null> {
  const row = await db.prepare(`SELECT g.subject,g.kind,g.enabled,g.version,g.operations FROM sitekit_standalone_grants g JOIN sitekit_management_admission a
 ON a.tenant_id=g.tenant_id AND a.site_id=g.site_id AND a.subject=g.subject AND a.version=g.version AND a.allowed=g.enabled
 WHERE g.tenant_id=? AND g.site_id=? AND g.subject=?`).bind(scope.tenantId, scope.siteId, subject).first<{
  /** Verified human or separately configured service principal. */
    subject: string;
  /** Human identities cannot acquire scheduled service privileges. */
    kind: string;
  /** Whether this grant currently admits operations. */
    enabled: number;
  /** Opaque ACL generation, atomically mirrored into admission. */
    version: string;
  /** Explicit allowed operations; never inferred from JWT roles. */
    operations: string
  }>();
  if (!row) return null;
  try { return grantSchema.parse({ ...row, enabled: row.enabled === 1, operations: JSON.parse(row.operations) }); } catch { throw new ManagementFault('unavailable'); }
}
/**
 * Atomically changes the grant and its CAS admission generation; stale edits conflict.
 * @param db - Trusted configuration or scoped server binding.
 * @param scope - Trusted configuration or scoped server binding.
 * @param input - Trusted configuration or scoped server binding.
 * @param expectedVersion - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { setStandaloneGrant } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof setStandaloneGrant>) => setStandaloneGrant(...args);
 */
export async function setStandaloneGrant(db: MarketingDatabase, scope: ManagementScope, input: Omit<StandaloneGrant, 'version'>, expectedVersion: string | null): Promise<StandaloneGrant> {
  const grant = grantSchema.parse({ ...input, version: crypto.randomUUID() });
  if (grant.kind === 'human' && (grant.subject.startsWith('sitekit:') || grant.operations.some(op => ['completeApplication', 'run', 'publish', 'publication'].includes(op)))) throw new ManagementFault('invalid');
  const results = await db.batch([
    db.prepare(`INSERT INTO sitekit_standalone_grants(tenant_id,site_id,subject,kind,enabled,version,operations) VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(tenant_id,site_id,subject) DO UPDATE SET kind=excluded.kind,enabled=excluded.enabled,version=excluded.version,operations=excluded.operations
 WHERE ? IS NOT NULL AND sitekit_standalone_grants.version=? RETURNING version`).bind(scope.tenantId, scope.siteId, grant.subject, grant.kind, Number(grant.enabled), grant.version, JSON.stringify(grant.operations), expectedVersion, expectedVersion),
    db.prepare(`INSERT INTO sitekit_management_admission(tenant_id,site_id,subject,version,allowed)
 SELECT tenant_id,site_id,subject,version,enabled FROM sitekit_standalone_grants WHERE tenant_id=? AND site_id=? AND subject=? AND version=?
 ON CONFLICT(tenant_id,site_id,subject) DO UPDATE SET version=excluded.version,allowed=excluded.allowed RETURNING version`).bind(scope.tenantId, scope.siteId, grant.subject, grant.version),
  ]);
  if (results[0]?.results[0]?.version !== grant.version || results[1]?.results[0]?.version !== grant.version) throw new ManagementFault('conflict');
  return grant;
}
