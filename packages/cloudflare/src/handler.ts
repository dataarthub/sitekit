import type { SiteSnapshotReference } from '@alneas/sitekit';
import { parseCloudflareSnapshotManifest } from './manifest.js';
import { D1R2SiteSnapshotProjection } from './projection.js';
import type { CloudflareD1Database, CloudflareFetch, CloudflareR2Bucket } from './types.js';

/**
 * Server-only bindings required after snapshot request size and timestamp checks.
 */
export interface SnapshotProjectionBindings {
  /** D1 binding with projection tables already provisioned. */
  database: CloudflareD1Database;
  /** R2 binding receiving validated snapshot payload bytes. */
  bucket: CloudflareR2Bucket;
  /** Host secret shared with the publisher for request-level HMAC verification. */
  hmacSecret: string;
}

/**
 * Configuration for the signed snapshot publication protocol.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export interface SnapshotProjectionHandlerOptions<TEnv> {
  /** Resolves server database, bucket, and signing secret from the Worker environment.
   * @param env - Server environment supplied by the host.
   * @returns Database, bucket, and HMAC secret resolved from the supplied Worker environment.
   * @example
   * ```typescript
   * import type { SnapshotProjectionHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: SnapshotProjectionHandlerOptions<unknown>, ...args: Parameters<NonNullable<SnapshotProjectionHandlerOptions<unknown>['bindings']>>) {
   *   return adapter.bindings(...args);
   * }
   * ```
   */
  bindings: (env: TEnv) => SnapshotProjectionBindings;
  /** Exact endpoint path; defaults to `/internal/site-snapshots`. */
  path?: string;
  /** Maximum request body bytes; defaults to 256 KiB. */
  maxRequestBytes?: number;
  /** Permitted Unix timestamp skew from the system clock; defaults to 300 seconds. */
  maxClockSkewSeconds?: number;
  /** Allowed origins for fetched manifest/content/media URLs; empty allows any HTTPS origin. */
  allowedOrigins?: readonly string[];
  /** Optional server fetch implementation for remote snapshot JSON. */
  fetch?: CloudflareFetch;
  /** Optional ISO timestamp source for projection head writes; request freshness uses Date.now.
   * @returns Current ISO timestamp used by the owning adapter.
   * @example
   * ```typescript
   * import type { SnapshotProjectionHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: SnapshotProjectionHandlerOptions<unknown>, ...args: Parameters<NonNullable<SnapshotProjectionHandlerOptions<unknown>['now']>>) {
   *   if (typeof adapter.now !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.now(...args);
   * }
   * ```
   */
  now?: () => string;
}

/**
 * Worker-compatible signed snapshot publication endpoint.
 * @param request - Publication request with protocol, timestamp, signature, and JSON reference.
 * @param env - Environment resolved through the configured bindings callback.
 * @returns A JSON publication event or protocol error response.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 * @example
 * ```typescript
 * import type { SnapshotProjectionHandler } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: SnapshotProjectionHandler<unknown>, ...args: Parameters<SnapshotProjectionHandler<unknown>>) {
 *   return callback(...args);
 * }
 * ```
 */
export type SnapshotProjectionHandler<TEnv> = (
  request: Request,
  env: TEnv,
) => Promise<Response>;

const encoder = new TextEncoder();
const protocolVersion = '1';

function base64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return bytes.buffer as ArrayBuffer;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Signs the exact timestamp and serialized body used by the snapshot HTTP protocol.
 * @param secret - Shared server-side HMAC secret.
 * @param timestamp - Unix seconds string sent as `x-eaos-timestamp`.
 * @param body - Exact request body string, without reserialization after signing.
 * @returns An unpadded base64url HMAC-SHA256 signature of `${timestamp}.${body}`.
 * @throws If Web Crypto cannot import the secret or compute the signature.
 * @remarks This request signature is distinct from an embedded manifest signature.
 * @example
 * ```typescript
 * import { signSnapshotProjectionRequest } from '@alneas/sitekit-cloudflare';
 * export async function exampleHeaders(secret: string, body: string) {
 *   const timestamp = String(Math.floor(Date.now() / 1000));
 *   return {
 *     'x-eaos-protocol-version': '1', 'x-eaos-timestamp': timestamp,
 *     'x-eaos-signature': await signSnapshotProjectionRequest(secret, timestamp, body),
 *   };
 * }
 * ```
 */
export async function signSnapshotProjectionRequest(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await hmacKey(secret);
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
}

async function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  try {
    const key = await hmacKey(secret);
    return await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      encoder.encode(`${timestamp}.${body}`),
    );
  } catch {
    return false;
  }
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maxBytes) throw new Error('request-too-large');
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) throw new Error('request-too-large');
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function validateUrl(value: string | undefined, allowedOrigins: readonly string[]): void {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('snapshot-url-must-use-https');
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
    throw new Error('snapshot-url-origin-not-allowed');
  }
}

function parseReference(value: unknown, allowedOrigins: readonly string[]): SiteSnapshotReference {
  if (typeof value !== 'object' || value === null) throw new Error('invalid-reference');
  const record = value as Record<string, unknown>;
  const manifest = parseCloudflareSnapshotManifest(record.manifest);
  const reference: SiteSnapshotReference = {
    manifest,
    ...(typeof record.manifestUrl === 'string' ? { manifestUrl: record.manifestUrl } : {}),
    ...(typeof record.contentUrl === 'string' ? { contentUrl: record.contentUrl } : {}),
    ...(typeof record.mediaUrl === 'string' ? { mediaUrl: record.mediaUrl } : {}),
  };
  validateUrl(reference.manifestUrl, allowedOrigins);
  validateUrl(reference.contentUrl, allowedOrigins);
  validateUrl(reference.mediaUrl, allowedOrigins);
  if (!reference.manifestUrl) throw new Error('manifest-url-required');
  if (!reference.contentUrl && !reference.mediaUrl) throw new Error('snapshot-payload-url-required');
  return reference;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function publishProjection(
  projection: D1R2SiteSnapshotProjection,
  reference: SiteSnapshotReference,
): Promise<{
  eventId: string;
  idempotencyKey: string;
  siteId: string;
  revision: string;
  manifestUrl: string;
  publishedAt: string;
}> {
  const { manifest } = reference;
  await projection.stage(reference);
  await projection.promote(manifest.siteId, manifest.revision);
  const current = await projection.getCurrentManifest(manifest.siteId);
  if (!current || current.revision !== manifest.revision || current.checksum !== manifest.checksum) {
    throw new Error(`Snapshot promotion could not be verified: ${manifest.siteId}/${manifest.revision}`);
  }
  if (!reference.manifestUrl) throw new Error('A manifest URL is required for snapshot publish events');
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: `${manifest.siteId}:${manifest.revision}`,
    siteId: manifest.siteId,
    revision: manifest.revision,
    manifestUrl: reference.manifestUrl,
    publishedAt: new Date().toISOString(),
  };
}

/**
 * Creates an HMAC-authenticated Worker endpoint for immutable snapshot publication.
 * @param options - Server bindings, fetch policy, request limits, and projection clock.
 * @returns A POST handler that stages, promotes, and verifies the current manifest before returning an event.
 * @remarks Requires `x-eaos-protocol-version: 1`, a Unix-seconds `x-eaos-timestamp`, and
 * `x-eaos-signature` over the exact body. The JSON body contains `manifest`, required
 * `manifestUrl`, and at least one of `contentUrl` or `mediaUrl`. All provided URLs must use
 * HTTPS; configure `allowedOrigins` to restrict server-side fetch targets. A valid request
 * HMAC authenticates the sender; embedded manifest signatures are parsed but not verified.
 * Timestamp checks bound replay age, but there is no nonce store. Staging/promotion failures
 * return 422; a failure may occur after some R2/D1 writes. Binding resolver exceptions escape.
 * @example
 * ```typescript
 * import { createSnapshotProjectionHandler, type SnapshotProjectionBindings }
 *   from '@alneas/sitekit-cloudflare';
 * export const examplePublish = createSnapshotProjectionHandler<SnapshotProjectionBindings>({
 *   bindings: env => env,
 *   allowedOrigins: ['https://snapshots.example.invalid'],
 * });
 * ```
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export function createSnapshotProjectionHandler<TEnv>(
  options: SnapshotProjectionHandlerOptions<TEnv>,
): SnapshotProjectionHandler<TEnv> {
  const path = options.path ?? '/internal/site-snapshots';
  const maxRequestBytes = options.maxRequestBytes ?? 256 * 1024;
  const maxClockSkewSeconds = options.maxClockSkewSeconds ?? 300;
  const allowedOrigins = options.allowedOrigins ?? [];

  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== path) return jsonResponse({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
    if (request.headers.get('x-eaos-protocol-version') !== protocolVersion) {
      return jsonResponse({ error: 'unsupported_protocol_version' }, 400);
    }

    const timestamp = request.headers.get('x-eaos-timestamp');
    const signature = request.headers.get('x-eaos-signature');
    if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > maxClockSkewSeconds) {
      return jsonResponse({ error: 'stale_request' }, 401);
    }

    let body: string;
    try {
      body = await readBoundedText(request, maxRequestBytes);
    } catch (error) {
      if (error instanceof Error && error.message === 'request-too-large') {
        return jsonResponse({ error: 'request_too_large' }, 413);
      }
      return jsonResponse({ error: 'invalid_request' }, 400);
    }

    const bindings = options.bindings(env);
    if (!await verifySignature(bindings.hmacSecret, timestamp, body, signature)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    try {
      const reference = parseReference(JSON.parse(body), allowedOrigins);
      const projection = new D1R2SiteSnapshotProjection(
        bindings.database,
        bindings.bucket,
        {
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.now ? { now: options.now } : {}),
        },
      );
      const event = await publishProjection(projection, reference);
      return jsonResponse(event);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'snapshot projection failed',
        error: error instanceof Error ? error.message : String(error),
      }));
      return jsonResponse({ error: 'snapshot_projection_failed' }, 422);
    }
  };
}
