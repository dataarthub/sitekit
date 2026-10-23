/**
 * Version-one standalone measurement schema; apply through host-owned migrations.
 * Records are scoped by tenant/site and immutable source identity. Payload fingerprints
 * make changed replays fail atomically instead of replacing financial records.
 */
export const marketingSchemaSql = `
CREATE TABLE IF NOT EXISTS sitekit_marketing_revocations (
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  reference_hash TEXT NOT NULL,
  forgotten_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, site_id, reference_hash)
);
CREATE TABLE IF NOT EXISTS sitekit_marketing_records (
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'outcome', 'spend')),
  record_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  write_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  attribution_id TEXT,
  event_name TEXT,
  outcome_kind TEXT CHECK (outcome_kind IS NULL OR outcome_kind IN ('lead', 'booking')),
  source TEXT,
  medium TEXT,
  campaign TEXT,
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT,
  PRIMARY KEY (tenant_id, site_id, kind, record_id)
);
CREATE INDEX IF NOT EXISTS sitekit_marketing_period
  ON sitekit_marketing_records (tenant_id, site_id, occurred_at);
CREATE INDEX IF NOT EXISTS sitekit_marketing_attribution
  ON sitekit_marketing_records (tenant_id, site_id, attribution_id, kind, occurred_at);
`;
