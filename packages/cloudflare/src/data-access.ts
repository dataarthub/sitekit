import type {
  CloudflareD1Database,
  CloudflareD1Statement,
} from './types.js';

/**
 * AND-combined column filters with equality or `$eq`, `$neq`, `$lt`, `$lte`, `$gt`, `$gte`, `$in`, `$nin`.
 * @remarks Undefined values are ignored. Null equality uses IS NULL; membership arrays cannot
 * contain null/undefined. Column names must be SQL identifiers; values are bound parameters.
 */
export type CloudflareDataFilter = Record<string, unknown>;

/**
 * Query modifiers accepted by the structural D1 data adapter.
 */
export interface CloudflareDataQueryOptions {
  /** Compatibility field; D1 statement execution does not observe this abort signal. */
  signal?: AbortSignal;
  /** Column sort directions: 1 ascending, -1 descending. */
  sort?: Record<string, number>;
  /** Nonnegative integer row limit for reads. */
  limit?: number;
  /** Nonnegative integer offset for reads. */
  skip?: number;
  /** Included columns as an array or truthy-valued map; empty selection means all columns. */
  projection?: string[] | Record<string, unknown>;
  /** Additional compatibility options are accepted but not interpreted by the D1 adapter. */
  [key: string]: unknown;
}

/**
 * Write policy, identity column, and cache identity for a D1 data adapter.
 */
export interface D1DataAccessAdapterOptions {
  /**
   * D1 adapters are read-only by default because D1 is normally a rebuildable
   * projection of upstream content data. Set this explicitly for a standalone D1
   * authoring store.
   */
  readOnly?: boolean;
  /** Primary identity column; defaults to `id`. */
  idField?: string;
  /** Optional cache partition identifier exposed unchanged on the adapter. */
  cacheScope?: string;
  /** Generates IDs for creates lacking a nonempty identity; defaults to crypto.randomUUID.
   * @returns Host-generated identifier; the owning adapter applies its documented identity rules.
   * @example
   * ```typescript
   * import type { D1DataAccessAdapterOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1DataAccessAdapterOptions, ...args: Parameters<NonNullable<D1DataAccessAdapterOptions['idFactory']>>) {
   *   if (typeof adapter.idFactory !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.idFactory(...args);
   * }
   * ```
   */
  idFactory?: () => string;
}

/**
 * Structural equivalent of app-core's DataAccessAdapter.
 *
 * Keeping this package structural means the Cloudflare adapter does not pull
 * a Node-oriented app-core runtime into Pages/Workers bundles. The returned
 * adapter can be passed directly to app-core's DatabaseContentAdapter.
 */
export interface CloudflareDataAccessAdapter {
  /** Optional host-provided cache partition identifier. */
  readonly cacheScope?: string;
  /**
   * Reads rows matching a filter.
   * @param collection - Validated table identifier.
   * @param filter - AND-combined predicates; omitted means every row.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns Matching rows, with read modifiers applied.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['find']>>) {
   *   return adapter.find(...args);
   * }
   * ```
   */
  find<T = unknown>(
    collection: string,
    filter?: CloudflareDataFilter,
    options?: CloudflareDataQueryOptions,
  ): Promise<T[]>;
  /**
   * Reads the first row matching an identity.
   * @param collection - Validated table identifier.
   * @param id - Value matched against the configured ID column.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The selected row or null.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['findOne']>>) {
   *   return adapter.findOne(...args);
   * }
   * ```
   */
  findOne<T = unknown>(
    collection: string,
    id: string,
    options?: CloudflareDataQueryOptions,
  ): Promise<T | null>;
  /**
   * Inserts one row; requires explicit writable mode.
   * @param collection - Validated table identifier.
   * @param data - Column values to persist; values are parameter-bound.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The re-read row, or the submitted row if readback is absent.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['create']>>) {
   *   return adapter.create(...args);
   * }
   * ```
   */
  create<T = unknown>(
    collection: string,
    data: Record<string, unknown>,
    options?: CloudflareDataQueryOptions,
  ): Promise<T>;
  /**
   * Updates supplied columns of one row; requires writable mode.
   * @param collection - Validated table identifier.
   * @param id - Value matched against the configured ID column.
   * @param data - Column values to persist; values are parameter-bound.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The re-read updated row; rejects when absent.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['update']>>) {
   *   return adapter.update(...args);
   * }
   * ```
   */
  update<T = unknown>(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: CloudflareDataQueryOptions,
  ): Promise<T>;
  /**
   * Updates supplied columns and forces the identity; omitted columns remain.
   * @param collection - Validated table identifier.
   * @param id - Value matched against the configured ID column.
   * @param data - Column values to persist; values are parameter-bound.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The re-read updated row.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['replace']>>) {
   *   return adapter.replace(...args);
   * }
   * ```
   */
  replace<T = unknown>(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: CloudflareDataQueryOptions,
  ): Promise<T>;
  /**
   * Deletes one row after reading it; requires writable mode.
   * @param collection - Validated table identifier.
   * @param id - Value matched against the configured ID column.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The prior row, or null at runtime if absent.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['delete']>>) {
   *   return adapter.delete(...args);
   * }
   * ```
   */
  delete<T = unknown>(
    collection: string,
    id: string,
    options?: CloudflareDataQueryOptions,
  ): Promise<T>;
  /**
   * Counts all matching rows, ignoring query modifiers.
   * @param collection - Validated table identifier.
   * @param filter - AND-combined predicates; omitted means every row.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns The numeric row count.
   *
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['count']>>) {
   *   return adapter.count(...args);
   * }
   * ```
   */
  count(
    collection: string,
    filter?: CloudflareDataFilter,
    options?: CloudflareDataQueryOptions,
  ): Promise<number>;
  /**
   * Inserts rows sequentially without a transaction.
   * @param collection - Validated table identifier.
   * @param data - Column values to persist; values are parameter-bound.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns Created rows; earlier writes survive a later failure.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['createMany']>>) {
   *   if (typeof adapter.createMany !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.createMany(...args);
   * }
   * ```
   */
  createMany?<T = unknown>(
    collection: string,
    data: Record<string, unknown>[],
    options?: CloudflareDataQueryOptions,
  ): Promise<T[]>;
  /**
   * Selects matching IDs then updates each sequentially.
   * @param collection - Validated table identifier.
   * @param filter - AND-combined predicates; omitted means every row.
   * @param data - Column values to persist; values are parameter-bound.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns Updated rows; projection must retain the ID column.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['updateMany']>>) {
   *   if (typeof adapter.updateMany !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.updateMany(...args);
   * }
   * ```
   */
  updateMany?<T = unknown>(
    collection: string,
    filter: CloudflareDataFilter,
    data: Record<string, unknown>,
    options?: CloudflareDataQueryOptions,
  ): Promise<T[]>;
  /**
   * Selects matching IDs then deletes each sequentially.
   * @param collection - Validated table identifier.
   * @param filter - AND-combined predicates; omitted means every row.
   * @param options - Read projection, ordering, or pagination as supported by this operation.
   * @returns Deleted rows; projection must retain the ID column.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `unknown`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareDataAccessAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareDataAccessAdapter, ...args: Parameters<NonNullable<CloudflareDataAccessAdapter['deleteMany']>>) {
   *   if (typeof adapter.deleteMany !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.deleteMany(...args);
   * }
   * ```
   */
  deleteMany?<T = unknown>(
    collection: string,
    filter: CloudflareDataFilter,
    options?: CloudflareDataQueryOptions,
  ): Promise<T[]>;
}

type FilterOperator = '$eq' | '$neq' | '$lt' | '$lte' | '$gt' | '$gte' | '$in' | '$nin';

const FILTER_OPERATORS = new Set<FilterOperator>([
  '$eq', '$neq', '$lt', '$lte', '$gt', '$gte', '$in', '$nin',
]);

function identifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid D1 ${label}: ${value}`);
  }
  return value;
}

function assertNonNegativeInteger(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`D1 ${label} must be a non-negative integer`);
  }
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface SqlFragment {
  sql: string;
  values: unknown[];
}

function comparison(field: string, operator: string, value: unknown): SqlFragment {
  switch (operator) {
    case '$eq':
      return value === null
        ? { sql: `${field} IS NULL`, values: [] }
        : { sql: `${field} = ?`, values: [value] };
    case '$neq':
      return value === null
        ? { sql: `${field} IS NOT NULL`, values: [] }
        : { sql: `${field} <> ?`, values: [value] };
    case '$lt':
      return { sql: `${field} < ?`, values: [value] };
    case '$lte':
      return { sql: `${field} <= ?`, values: [value] };
    case '$gt':
      return { sql: `${field} > ?`, values: [value] };
    case '$gte':
      return { sql: `${field} >= ?`, values: [value] };
    case '$in':
    case '$nin': {
      if (!Array.isArray(value)) {
        throw new Error(`${operator} requires an array`);
      }
      if (value.some(item => item === null || item === undefined)) {
        throw new Error(`${operator} does not support null or undefined values`);
      }
      if (value.length === 0) {
        return { sql: operator === '$in' ? '0 = 1' : '1 = 1', values: [] };
      }
      const placeholders = value.map(() => '?').join(', ');
      return {
        sql: `${field} ${operator === '$in' ? 'IN' : 'NOT IN'} (${placeholders})`,
        values: value,
      };
    }
    default:
      throw new Error(`Unsupported D1 filter operator: ${operator}`);
  }
}

function buildFilter(filter: CloudflareDataFilter | undefined): SqlFragment {
  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const [rawField, rawValue] of Object.entries(filter ?? {})) {
    if (rawValue === undefined) continue;
    const field = identifier(rawField, 'column identifier');

    if (isOperatorObject(rawValue)) {
      for (const [operator, value] of Object.entries(rawValue)) {
        if (!FILTER_OPERATORS.has(operator as FilterOperator)) {
          throw new Error(`Unsupported D1 filter operator: ${operator}`);
        }
        const fragment = comparison(field, operator, value);
        clauses.push(fragment.sql);
        values.push(...fragment.values);
      }
      continue;
    }

    const fragment = comparison(field, '$eq', rawValue);
    clauses.push(fragment.sql);
    values.push(...fragment.values);
  }

  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function selectedColumns(projection: CloudflareDataQueryOptions['projection']): string {
  const columns = Array.isArray(projection)
    ? projection
    : projection && typeof projection === 'object'
      ? Object.entries(projection)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
      : [];

  if (columns.length === 0) return '*';
  return columns.map(column => identifier(column, 'projection column')).join(', ');
}

function buildQuerySuffix(options: CloudflareDataQueryOptions | undefined): string {
  assertNonNegativeInteger(options?.skip, 'skip');
  assertNonNegativeInteger(options?.limit, 'limit');

  const clauses: string[] = [];
  const sortClauses: string[] = [];
  for (const [rawField, direction] of Object.entries(options?.sort ?? {})) {
    const field = identifier(rawField, 'sort column');
    if (direction !== 1 && direction !== -1) {
      throw new Error(`D1 sort direction must be 1 or -1: ${rawField}`);
    }
    sortClauses.push(`${field} ${direction === -1 ? 'DESC' : 'ASC'}`);
  }
  if (sortClauses.length > 0) clauses.push(`ORDER BY ${sortClauses.join(', ')}`);
  if (options?.limit !== undefined) clauses.push(`LIMIT ${options.limit}`);
  if (options?.skip !== undefined) {
    if (options.limit === undefined) clauses.push('LIMIT -1');
    clauses.push(`OFFSET ${options.skip}`);
  }
  return clauses.length > 0 ? ` ${clauses.join(' ')}` : '';
}

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

function asRows<T>(result: { results?: T[] }): T[] {
  return Array.isArray(result.results) ? result.results : [];
}

/**
 * Bridges a D1 binding to the structural data-access contract used by app-core.
 * @param database - Server-owned D1 binding; schema must already exist.
 * @param options - Read-only policy, ID field/factory, and optional cache scope.
 * @returns A parameterized SQL adapter, read-only unless `readOnly: false` is explicit.
 * @throws If the configured ID column is invalid; calls reject invalid identifiers, filters,
 * sort/pagination values, writes in read-only mode, missing updated rows, and D1 failures.
 * @remarks This adapter provides no authentication or tenant isolation. Host code must constrain
 * which tables and filters callers can use. Bulk operations run sequentially without a transaction.
 * `replace` updates supplied columns rather than clearing omitted columns. `delete` returns the
 * prior row, or null at runtime when absent. `count` ignores query modifiers. Abort signals
 * and unknown query options are accepted for compatibility but not executed.
 * @example
 * ```typescript
 * import { createD1DataAccessAdapter, type CloudflareD1Database }
 *   from '@alneas/sitekit-cloudflare';
 * export async function exampleRead(database: CloudflareD1Database) {
 *   const adapter = createD1DataAccessAdapter(database);
 *   return adapter.find('content_items', { status: 'published' }, { limit: 10 });
 * }
 * ```
 */
export function createD1DataAccessAdapter(
  database: CloudflareD1Database,
  options: D1DataAccessAdapterOptions = {},
): CloudflareDataAccessAdapter {
  const idField = identifier(options.idField ?? 'id', 'id column');
  const readOnly = options.readOnly ?? true;
  const idFactory = options.idFactory ?? defaultIdFactory;

  const prepare = (statement: string, values: unknown[] = []): CloudflareD1Statement =>
    database.prepare(statement).bind(...values);

  const ensureWritable = (): void => {
    if (readOnly) {
      throw new Error('D1 adapter is read-only; set readOnly: false for an authoring store');
    }
  };

  const find = async <T = unknown>(
    collection: string,
    filter?: CloudflareDataFilter,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T[]> => {
    const table = identifier(collection, 'table identifier');
    const where = buildFilter(filter);
    const sql = `SELECT ${selectedColumns(queryOptions?.projection)} FROM ${table}${where.sql}${buildQuerySuffix(queryOptions)}`;
    const result = await prepare(sql, where.values).all<T>();
    return asRows(result);
  };

  const findOne = async <T = unknown>(
    collection: string,
    id: string,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T | null> => {
    const rows = await find<T>(collection, { [idField]: id }, { ...queryOptions, limit: 1 });
    return rows[0] ?? null;
  };

  const create = async <T = unknown>(
    collection: string,
    data: Record<string, unknown>,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T> => {
    ensureWritable();
    const table = identifier(collection, 'table identifier');
    const record = { ...data };
    if (record[idField] === undefined || record[idField] === null || record[idField] === '') {
      record[idField] = idFactory();
    }
    const entries = Object.entries(record);
    if (entries.length === 0) throw new Error('D1 create requires at least one field');
    const columns = entries.map(([key]) => identifier(key, 'column identifier'));
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    await prepare(sql, entries.map(([, value]) => value)).run();
    const created = await findOne<T>(collection, String(record[idField]), queryOptions);
    return created ?? record as T;
  };

  const update = async <T = unknown>(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T> => {
    ensureWritable();
    const table = identifier(collection, 'table identifier');
    const entries = Object.entries(data);
    if (entries.length === 0) throw new Error('D1 update requires at least one field');
    const assignments = entries.map(([key]) => `${identifier(key, 'column identifier')} = ?`);
    const sql = `UPDATE ${table} SET ${assignments.join(', ')} WHERE ${idField} = ?`;
    await prepare(sql, [...entries.map(([, value]) => value), id]).run();
    const updated = await findOne<T>(collection, id, queryOptions);
    if (!updated) throw new Error(`D1 record not found: ${collection}/${id}`);
    return updated;
  };

  const replace = async <T = unknown>(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T> => update(collection, id, { ...data, [idField]: id }, queryOptions);

  const remove = async <T = unknown>(
    collection: string,
    id: string,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<T> => {
    ensureWritable();
    const existing = await findOne<T>(collection, id, queryOptions);
    if (!existing) return null as T;
    const table = identifier(collection, 'table identifier');
    await prepare(`DELETE FROM ${table} WHERE ${idField} = ?`, [id]).run();
    return existing;
  };

  const count = async (
    collection: string,
    filter?: CloudflareDataFilter,
    queryOptions?: CloudflareDataQueryOptions,
  ): Promise<number> => {
    const table = identifier(collection, 'table identifier');
    const where = buildFilter(filter);
    const row = await prepare(`SELECT COUNT(*) AS count FROM ${table}${where.sql}`, where.values)
      .first<{ count: number | string }>();
    const value = row?.count;
    return typeof value === 'number' ? value : Number(value ?? 0);
  };

  return {
    ...(options.cacheScope ? { cacheScope: options.cacheScope } : {}),
    find,
    findOne,
    create,
    update,
    replace,
    delete: remove,
    count,
    async createMany<T = unknown>(collection: string, data: Record<string, unknown>[], queryOptions?: CloudflareDataQueryOptions): Promise<T[]> {
      const records: T[] = [];
      for (const item of data) records.push(await create<T>(collection, item, queryOptions));
      return records;
    },
    async updateMany<T = unknown>(collection: string, filter: CloudflareDataFilter, data: Record<string, unknown>, queryOptions?: CloudflareDataQueryOptions): Promise<T[]> {
      const records = await find<{ [key: string]: unknown }>(collection, filter, queryOptions);
      const ids = records.map(record => record[idField]).filter((id): id is string | number => typeof id === 'string' || typeof id === 'number');
      const updated: T[] = [];
      for (const id of ids) updated.push(await update<T>(collection, String(id), data, queryOptions));
      return updated;
    },
    async deleteMany<T = unknown>(collection: string, filter: CloudflareDataFilter, queryOptions?: CloudflareDataQueryOptions): Promise<T[]> {
      const records = await find<{ [key: string]: unknown }>(collection, filter, queryOptions);
      const deleted: T[] = [];
      for (const record of records) {
        const id = record[idField];
        if (typeof id !== 'string' && typeof id !== 'number') continue;
        const result = await remove<T>(collection, String(id), queryOptions);
        if (result !== null) deleted.push(result);
      }
      return deleted;
    },
  };
}
