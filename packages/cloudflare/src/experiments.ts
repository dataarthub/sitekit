import type {
  ExperimentAssignment,
  ExperimentAssignmentRequest,
  ExperimentProvider,
} from '@alneas/sitekit';
import { createD1DataAccessAdapter } from './data-access.js';
import type { CloudflareD1Database } from './types.js';

/**
 * Lifecycle state; assignment is permitted only for running definitions.
 */
export type ExperimentDefinitionStatus = 'draft' | 'running' | 'paused' | 'completed';

/**
 * Weighted assignment choice within a definition.
 */
export interface ExperimentVariant {
  /** Variant identifier returned in assignments. */
  id: string;
  /** Positive finite relative weight; defaults to 1 when omitted. */
  weight?: number;
}

/**
 * Host-authored experiment definition stored in D1.
 */
export interface ExperimentDefinition {
  /** Globally unique definition ID in the shared table. */
  id: string;
  /** Site used for scoped definition reads. */
  siteId: string;
  /** Nonempty display name. */
  name: string;
  /** Optional explanation of the expected change. */
  hypothesis?: string;
  /** Lifecycle state; only running definitions assign variants. */
  status: ExperimentDefinitionStatus;
  /** Nonempty weighted variant list, validated on provider create/update. */
  variants: ExperimentVariant[];
  /** Host-supplied creation timestamp. */
  createdAt: string;
  /** Host-supplied modification timestamp used for descending lists. */
  modifiedAt: string;
}

/**
 * Host-supplied outcome record associated with an experiment exposure.
 */
export interface ExperimentResult {
  /** Globally unique outcome record ID. */
  id: string;
  /** Site used for result-list filtering. */
  siteId: string;
  /** Associated definition ID. */
  experimentId: string;
  /** Associated exposure ID; not checked against exposure storage. */
  exposureId: string;
  /** Optional source event identifier; not deduplicated by this adapter. */
  eventId?: string;
  /** Host-defined metric name. */
  metric: string;
  /** Optional numeric metric value. */
  value?: number;
  /** Host-supplied occurrence timestamp for descending result lists. */
  occurredAt: string;
  /** Optional JSON-serializable result context. */
  metadata?: Record<string, unknown>;
}

/**
 * Provisioned D1 binding and optional experiment table names.
 */
export interface D1ExperimentProviderOptions {
  /** Server-owned D1 database with experiment schema applied. */
  database: CloudflareD1Database;
  /** Definition table; defaults to `experiment_definitions`. */
  definitionTable?: string;
  /** Exposure table; defaults to `experiment_exposures`. */
  exposureTable?: string;
  /** Outcome table; defaults to `experiment_results`. */
  resultTable?: string;
}

/**
 * Experiment assignment provider extended with definition and outcome storage operations.
 */
export interface D1ExperimentProvider extends ExperimentProvider {
  /**
   * Inserts a definition after required field/variant validation.
   * @param definition - New globally identified definition.
   * @returns The stored definition.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['createDefinition']>>) {
   *   return adapter.createDefinition(...args);
   * }
   * ```
   */
  createDefinition(definition: ExperimentDefinition): Promise<ExperimentDefinition>;
  /**
   * Updates a definition by global ID after variant validation.
   * @param definition - Definition with updated fields and timestamp.
   * @returns The stored definition; rejects if absent.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['updateDefinition']>>) {
   *   return adapter.updateDefinition(...args);
   * }
   * ```
   */
  updateDefinition(definition: ExperimentDefinition): Promise<ExperimentDefinition>;
  /**
   * Reads one definition within a site.
   * @param siteId - Site scope.
   * @param experimentId - Definition ID.
   * @returns The definition or null.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['getDefinition']>>) {
   *   return adapter.getDefinition(...args);
   * }
   * ```
   */
  getDefinition(siteId: string, experimentId: string): Promise<ExperimentDefinition | null>;
  /**
   * Lists at most 100 site definitions by modification time descending.
   * @param siteId - Site scope.
   * @returns Stored definitions.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['listDefinitions']>>) {
   *   return adapter.listDefinitions(...args);
   * }
   * ```
   */
  listDefinitions(siteId: string): Promise<ExperimentDefinition[]>;
  /**
   * Inserts a host-validated outcome without exposure verification.
   * @param result - Globally identified outcome record.
   * @returns The stored outcome.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['recordResult']>>) {
   *   return adapter.recordResult(...args);
   * }
   * ```
   */
  recordResult(result: ExperimentResult): Promise<ExperimentResult>;
  /**
   * Lists outcomes by occurrence time descending.
   * @param siteId - Site scope.
   * @param experimentId - Definition ID.
   * @param limit - Page size clamped to 1–500; defaults to 100.
   * @returns Matching outcome records.
   *
   * @example
   * ```typescript
   * import type { D1ExperimentProvider } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1ExperimentProvider, ...args: Parameters<NonNullable<D1ExperimentProvider['listResults']>>) {
   *   return adapter.listResults(...args);
   * }
   * ```
   */
  listResults(siteId: string, experimentId: string, limit?: number): Promise<ExperimentResult[]>;
}

interface DefinitionRow {
  id: string;
  site_id: string;
  name: string;
  hypothesis?: string;
  status: ExperimentDefinitionStatus;
  variants_json: string;
  created_at: string;
  modified_at: string;
}

interface ResultRow {
  id: string;
  site_id: string;
  experiment_id: string;
  exposure_id: string;
  event_id?: string;
  metric: string;
  value?: number;
  occurred_at: string;
  metadata_json?: string;
}

function parseVariants(value: string): ExperimentVariant[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some(item => {
    if (typeof item !== 'object' || item === null) return true;
    const variant = item as Record<string, unknown>;
    return typeof variant.id !== 'string' || !variant.id.trim()
      || (variant.weight !== undefined && (typeof variant.weight !== 'number' || !Number.isFinite(variant.weight) || variant.weight <= 0));
  })) throw new Error('Invalid experiment variants');
  const variants = parsed as ExperimentVariant[];
  if (variants.reduce((sum, variant) => sum + (variant.weight ?? 1), 0) <= 0) throw new Error('Invalid experiment weights');
  return variants.map(variant => ({ ...variant }));
}

function toDefinition(row: DefinitionRow): ExperimentDefinition {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    ...(row.hypothesis ? { hypothesis: row.hypothesis } : {}),
    status: row.status,
    variants: parseVariants(row.variants_json),
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
  };
}

function toResult(row: ResultRow): ExperimentResult {
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined;
  return {
    id: row.id,
    siteId: row.site_id,
    experimentId: row.experiment_id,
    exposureId: row.exposure_id,
    ...(row.event_id ? { eventId: row.event_id } : {}),
    metric: row.metric,
    ...(row.value !== undefined ? { value: row.value } : {}),
    occurredAt: row.occurred_at,
    ...(metadata ? { metadata } : {}),
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Selects a weighted variant deterministically from a string seed.
 * @param definition - Definition containing at least one variant; callers must validate weights.
 * @param seed - Stable visitor/session input to the noncryptographic hash.
 * @returns The selected variant object from the definition.
 * @throws If the definition has no variants.
 * @remarks Does not check running status or validate positive weights; provider create/update
 * performs weight validation. Reusing a seed is stable only while variant order/weights stay fixed.
 * @example
 * ```typescript
 * import { selectExperimentVariant, type ExperimentDefinition }
 *   from '@alneas/sitekit-cloudflare/experiments';
 * const definition: ExperimentDefinition = {
 *   id: 'example-experiment', siteId: 'example-site', name: 'Example headline',
 *   status: 'running', variants: [{ id: 'example-control' }, { id: 'example-alternative' }],
 *   createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
 * };
 * const variant = selectExperimentVariant(definition, 'example-visitor');
 * ```
 */
export function selectExperimentVariant(definition: ExperimentDefinition, seed: string): ExperimentVariant {
  if (definition.variants.length === 0) throw new Error('Experiment has no variants');
  const total = definition.variants.reduce((sum, variant) => sum + (variant.weight ?? 1), 0);
  let cursor = hashSeed(seed) * total;
  for (const variant of definition.variants) {
    cursor -= variant.weight ?? 1;
    if (cursor < 0) return variant;
  }
  return definition.variants[definition.variants.length - 1]!;
}

/**
 * Creates standalone D1 experiment definition, exposure, and outcome storage.
 * @param options - Provisioned database and optional table identifiers.
 * @returns A provider that assigns running definitions and exposes authoring/result methods.
 * @remarks The host authenticates callers and authorizes site access. Definition IDs are global;
 * updates match ID alone. Assignments seed by anonymousId, then sessionId, then a fresh UUID;
 * every assignment gets a fresh exposureId. Exposure check/insert is not atomic, and outcome
 * records do not validate a matching exposure. Schema is never applied automatically.
 * @example
 * ```typescript
 * import { createD1ExperimentProvider }
 *   from '@alneas/sitekit-cloudflare/experiments';
 * import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
 * export function exampleProvider(database: CloudflareD1Database) {
 *   return createD1ExperimentProvider({ database });
 * }
 * ```
 */
export function createD1ExperimentProvider(options: D1ExperimentProviderOptions): D1ExperimentProvider {
  const definitions = options.definitionTable ?? 'experiment_definitions';
  const exposures = options.exposureTable ?? 'experiment_exposures';
  const results = options.resultTable ?? 'experiment_results';
  const db = createD1DataAccessAdapter(options.database, { readOnly: false });

  const getDefinition = async (siteId: string, experimentId: string): Promise<ExperimentDefinition | null> => {
    const rows = await db.find<DefinitionRow>(definitions, { site_id: siteId, id: experimentId }, { limit: 1 });
    return rows[0] ? toDefinition(rows[0]) : null;
  };

  return {
    async createDefinition(definition) {
      if (!definition.id || !definition.siteId || !definition.name || definition.variants.length === 0) throw new Error('Invalid experiment definition');
      parseVariants(JSON.stringify(definition.variants));
      const row = await db.create<DefinitionRow>(definitions, {
        id: definition.id,
        site_id: definition.siteId,
        name: definition.name,
        ...(definition.hypothesis ? { hypothesis: definition.hypothesis } : {}),
        status: definition.status,
        variants_json: JSON.stringify(definition.variants),
        created_at: definition.createdAt,
        modified_at: definition.modifiedAt,
      });
      return toDefinition(row);
    },
    async updateDefinition(definition) {
      if (!definition.id || !definition.siteId || !definition.name || definition.variants.length === 0) throw new Error('Invalid experiment definition');
      parseVariants(JSON.stringify(definition.variants));
      const row = await db.update<DefinitionRow>(definitions, definition.id, {
        site_id: definition.siteId,
        name: definition.name,
        ...(definition.hypothesis ? { hypothesis: definition.hypothesis } : {}),
        status: definition.status,
        variants_json: JSON.stringify(definition.variants),
        modified_at: definition.modifiedAt,
      });
      return toDefinition(row);
    },
    async getDefinition(siteId, experimentId) {
      return getDefinition(siteId, experimentId);
    },
    async listDefinitions(siteId) {
      const rows = await db.find<DefinitionRow>(definitions, { site_id: siteId }, { sort: { modified_at: -1 }, limit: 100 });
      return rows.map(toDefinition);
    },
    async assign(request: ExperimentAssignmentRequest): Promise<ExperimentAssignment> {
      const definition = await getDefinition(request.siteId, request.experimentId);
      if (!definition || definition.status !== 'running') throw new Error('Experiment is not running');
      const seed = request.anonymousId ?? request.sessionId ?? crypto.randomUUID();
      const variant = selectExperimentVariant(definition, seed);
      return {
        experimentId: definition.id,
        variantId: variant.id,
        exposureId: crypto.randomUUID(),
      };
    },
    async recordExposure(assignment) {
      const existing = await db.find(exposures, { id: assignment.exposureId }, { limit: 1 });
      if (existing.length > 0) return;
      await db.create(exposures, {
        id: assignment.exposureId,
        experiment_id: assignment.experimentId,
        variant_id: assignment.variantId,
        exposed_at: new Date().toISOString(),
      });
    },
    async recordResult(result) {
      const row = await db.create<ResultRow>(results, {
        id: result.id,
        site_id: result.siteId,
        experiment_id: result.experimentId,
        exposure_id: result.exposureId,
        ...(result.eventId ? { event_id: result.eventId } : {}),
        metric: result.metric,
        ...(result.value !== undefined ? { value: result.value } : {}),
        occurred_at: result.occurredAt,
        ...(result.metadata ? { metadata_json: JSON.stringify(result.metadata) } : {}),
      });
      return toResult(row);
    },
    async listResults(siteId, experimentId, limit = 100) {
      const rows = await db.find<ResultRow>(results, { site_id: siteId, experiment_id: experimentId }, {
        sort: { occurred_at: -1 }, limit: Math.min(Math.max(limit, 1), 500),
      });
      return rows.map(toResult);
    },
  };
}
