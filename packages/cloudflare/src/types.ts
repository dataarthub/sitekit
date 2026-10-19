/**
 * Minimal parameterized D1 statement interface consumed by this package.
 */
export interface CloudflareD1Statement {
  /**
   * Binds ordered SQL values.
   * @param values - Parameter values in placeholder order.
   * @returns The bound statement.
   *
   * @example
   * ```typescript
   * import type { CloudflareD1Statement } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareD1Statement, ...args: Parameters<NonNullable<CloudflareD1Statement['bind']>>) {
   *   return adapter.bind(...args);
   * }
   * ```
   */
  bind(...values: unknown[]): CloudflareD1Statement;
  /**
   * Executes the query for one row.
   * @returns The first row or null.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `Record<string, unknown>`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareD1Statement } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareD1Statement, ...args: Parameters<NonNullable<CloudflareD1Statement['first']>>) {
   *   return adapter.first(...args);
   * }
   * ```
   */
  first<T = Record<string, unknown>>(): Promise<T | null>;
  /**
   * Executes the query for all matching rows.
   * @returns A results array in the binding response.
   *
   * @typeParam T - Caller-selected decoded row shape; defaults to `Record<string, unknown>`; the binding does not validate its fields.
   * @example
   * ```typescript
   * import type { CloudflareD1Statement } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareD1Statement, ...args: Parameters<NonNullable<CloudflareD1Statement['all']>>) {
   *   return adapter.all(...args);
   * }
   * ```
   */
  all<T = Record<string, unknown>>(): Promise<{
    /** Matching rows decoded by the binding; empty when no rows match. */
    results: T[]
  }>;
  /**
   * Executes a statement.
   * @returns Binding-defined execution metadata; outbox/event claims need meta.changes.
   *
   * @example
   * ```typescript
   * import type { CloudflareD1Statement } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareD1Statement, ...args: Parameters<NonNullable<CloudflareD1Statement['run']>>) {
   *   return adapter.run(...args);
   * }
   * ```
   */
  run(): Promise<unknown>;
}

/**
 * Structural D1 binding; the host provisions schemas and owns access control.
 */
export interface CloudflareD1Database {
  /**
   * Prepares SQL; callers must parameterize untrusted values.
   * @param query - SQL statement text.
   * @returns A statement ready for binding and execution.
   *
   * @example
   * ```typescript
   * import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareD1Database, ...args: Parameters<NonNullable<CloudflareD1Database['prepare']>>) {
   *   return adapter.prepare(...args);
   * }
   * ```
   */
  prepare(query: string): CloudflareD1Statement;
}

/**
 * Minimal R2 object body returned by snapshot reads.
 */
export interface CloudflareR2Object {
  /** Reads the complete response body as text.
   * @returns The decoded body string.
   *
   * @example
   * ```typescript
   * import type { CloudflareR2Object } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareR2Object, ...args: Parameters<NonNullable<CloudflareR2Object['text']>>) {
   *   return adapter.text(...args);
   * }
   * ```
   */
  text(): Promise<string>;
}

/**
 * Structural R2 binding; the host controls object visibility and authorization.
 */
export interface CloudflareR2Bucket {
  /**
   * Reads an object by exact key.
   * @param key - Bucket object key.
   * @returns The object or null when absent.
   *
   * @example
   * ```typescript
   * import type { CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareR2Bucket, ...args: Parameters<NonNullable<CloudflareR2Bucket['get']>>) {
   *   return adapter.get(...args);
   * }
   * ```
   */
  get(key: string): Promise<CloudflareR2Object | null>;
  /**
   * Writes object bytes.
   * @param key - Bucket object key.
   * @param value - Bytes or text to store.
   * @param options - Optional content-type metadata.
   * @returns Resolves when the binding finishes writing.
   *
   * @example
   * ```typescript
   * import type { CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareR2Bucket, ...args: Parameters<NonNullable<CloudflareR2Bucket['put']>>) {
   *   return adapter.put(...args);
   * }
   * ```
   */
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array | Blob,
    options?: {
      /** HTTP metadata stored with the uploaded object. */
      httpMetadata?: {
        /** MIME content type persisted on the object for delivery. */
        contentType?: string
      }
    },
  ): Promise<void>;
  /**
   * Deletes an object when the binding supports it.
   * @param key - Bucket object key.
   * @returns Resolves after deletion.
   *
   * @example
   * ```typescript
   * import type { CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareR2Bucket, ...args: Parameters<NonNullable<CloudflareR2Bucket['delete']>>) {
   *   if (typeof adapter.delete !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.delete(...args);
   * }
   * ```
   */
  delete?(key: string): Promise<void>;
}

/**
 * Minimal response contract for server-side snapshot JSON fetching.
 */
export interface CloudflareFetchResponse {
  /** Whether the response status represents success. */
  ok: boolean;
  /** HTTP response status code. */
  status: number;
  /** Reads the complete response body as text.
   * @returns The decoded body string.
   *
   * @example
   * ```typescript
   * import type { CloudflareFetchResponse } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareFetchResponse, ...args: Parameters<NonNullable<CloudflareFetchResponse['text']>>) {
   *   return adapter.text(...args);
   * }
   * ```
   */
  text(): Promise<string>;
}

/**
 * Injectable server-side GET fetch for snapshot manifests and payloads.
 * @param url - Host-approved remote URL to retrieve.
 * @returns A response exposing status and a text body.
 * @remarks Origin restrictions belong to the host or snapshot HTTP handler.
 *
 * @example
 * ```typescript
 * import type { CloudflareFetch } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: CloudflareFetch, ...args: Parameters<CloudflareFetch>) {
 *   return callback(...args);
 * }
 * ```
 */
export type CloudflareFetch = (url: string) => Promise<CloudflareFetchResponse>;
