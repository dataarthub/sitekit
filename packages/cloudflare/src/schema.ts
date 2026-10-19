/**
 * Public generic SQL integration contract for snapshot revisions and current projection heads.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { projectionSchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = projectionSchemaSql;
 * ```
 */
export const projectionSchemaSql = `
CREATE TABLE IF NOT EXISTS site_snapshot_revisions (
  site_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  content_key TEXT NOT NULL,
  media_key TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (site_id, revision)
);

CREATE TABLE IF NOT EXISTS site_projection_heads (
  site_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  promoted_at TEXT NOT NULL
);
`;

/**
 * Public generic SQL integration contract for standalone Content Studio authoring documents.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { contentStudioSchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = contentStudioSchemaSql;
 * ```
 */
export const contentStudioSchemaSql = `
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  locale TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  scheduled_at TEXT,
  tenant_id TEXT,
  UNIQUE (tenant_id, collection, locale, slug)
);
CREATE INDEX IF NOT EXISTS content_items_lookup
  ON content_items (tenant_id, collection, locale, status, modified_at);
`;

/**
 * Public generic SQL integration contract for R2 media metadata indexed in D1.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { mediaLibrarySchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = mediaLibrarySchemaSql;
 * ```
 */
export const mediaLibrarySchemaSql = `
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  external_id TEXT,
  asset_json TEXT NOT NULL,
  tenant_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_assets_lookup
  ON media_assets (tenant_id, modified_at);
`;

/**
 * Public generic SQL integration contract for experiment definitions, exposures, and results.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { experimentSchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = experimentSchemaSql;
 * ```
 */
export const experimentSchemaSql = `
CREATE TABLE IF NOT EXISTS experiment_definitions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT NOT NULL,
  variants_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS experiment_definitions_site_lookup
  ON experiment_definitions (site_id, status, modified_at);
CREATE TABLE IF NOT EXISTS experiment_exposures (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  exposed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS experiment_exposures_lookup
  ON experiment_exposures (experiment_id, variant_id, exposed_at);
CREATE TABLE IF NOT EXISTS experiment_results (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  exposure_id TEXT NOT NULL,
  event_id TEXT,
  metric TEXT NOT NULL,
  value REAL,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS experiment_results_lookup
  ON experiment_results (site_id, experiment_id, occurred_at);
`;

/**
 * Public generic SQL integration contract for queued social drafts and delivery history.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { socialOutboxSchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = socialOutboxSchemaSql;
 * ```
 */
export const socialOutboxSchemaSql = `
CREATE TABLE IF NOT EXISTS social_outbox (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  draft_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS social_outbox_status_lookup
  ON social_outbox (status, created_at);
CREATE TABLE IF NOT EXISTS social_delivery_history (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS social_delivery_history_lookup
  ON social_delivery_history (idempotency_key, created_at);
`;

/**
 * Public generic SQL integration contract for consumer-side entitlement, purchase, and webhook event records.
 * @remarks Apply this SQL explicitly with host-owned migration tooling before using the
 * corresponding adapter. This is a reusable package schema, not a production/customer schema;
 * adapters do not run it, migrate existing columns, or enforce application authorization.
 * @example
 * ```typescript
 * import { commerceSchemaSql } from '@alneas/sitekit-cloudflare';
 * // Supply this SQL to your host's D1 migration process.
 * const exampleMigrationSql: string = commerceSchemaSql;
 * ```
 */
export const commerceSchemaSql = `
CREATE TABLE IF NOT EXISTS content_entitlements (
  site_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (site_id, entitlement_key, subject_id)
);

CREATE TABLE IF NOT EXISTS content_purchases (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  subject_id TEXT,
  purchased_at TEXT,
  expires_at TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS commerce_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);
`;
