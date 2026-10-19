import type {
  SiteSnapshotPublisher,
  SiteSnapshotReference,
  SnapshotPublishEvent,
} from '../contracts/projection.js';

/**
 * Minimal HTTP response surface needed to validate a publication event.
 */
export interface SnapshotPublishHttpResponse {
  /**
   * Whether the HTTP status indicates success according to the transport.
   */
  ok: boolean;
  /**
   * Numeric HTTP response status used in transport failure diagnostics.
   */
  status: number;
  /**
   * Parses the transport response as JSON.
   *
   * @returns The parsed response payload; parsing failures reject.
   * @example
   * ```ts
   * import type { SnapshotPublishHttpResponse } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<SnapshotPublishHttpResponse['json']>;
   * export function invoke(host: SnapshotPublishHttpResponse, ...args: Parameters<Callback>) {
   *   return host.json(...args);
   * }
   * ```
   */
  json(): Promise<unknown>;
}

/**
 * Injectable HTTP POST transport for signed snapshot reference publication.
 * @param url - Destination URL for this HTTP request.
 * @param init - HTTP method, headers and serialized request body.
 * @returns HTTP response whose JSON must describe the matching publication event.
 * @example
 * ```ts
 * import type { SnapshotPublishHttpClient } from '@alneas/sitekit/projection';
 * type Callback = SnapshotPublishHttpClient;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type SnapshotPublishHttpClient = (
  url: string,
  init: {
    /**
     * HTTP request method; the receiving API documents the supported values and default.
     */
    method: 'POST';
    /**
     * HTTP headers supplied by the host; keep authentication values in server-side code.
     */
    headers: Record<string, string>;
    /**
     * Exact serialized JSON body sent to or signed for the publication endpoint.
     */
    body: string;
  },
) => Promise<SnapshotPublishHttpResponse>;

/**
 * Server-only signing secret and HTTPS endpoint with optional transport and ISO timestamp clock.
 */
export interface HttpSnapshotPublisherOptions {
  /** HTTPS publication endpoint receiving signed snapshot references. */
  endpoint: string;
  /** Shared HMAC secret; keep outside browser bundles and public configuration. */
  secret: string;
  /** Optional HTTP implementation; defaults to global fetch. */
  fetch?: SnapshotPublishHttpClient;
  /**
   * Clock returning parseable date text, converted to integer Unix seconds for signing.
   * @returns Parseable timestamp text converted to integer Unix seconds for signing.
   * @example
   * ```ts
   * import type { HttpSnapshotPublisherOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<HttpSnapshotPublisherOptions['now']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  now?: () => string;
}

/** Protocol version sent in the header of signed snapshot publication requests. */
export const SNAPSHOT_PROJECTION_PROTOCOL_VERSION = '1';

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Signs timestamp plus a dot plus the exact request body using HMAC-SHA256.
 *
 * @param secret - Shared signing secret encoded as UTF-8.
 * @param timestamp - Timestamp text included verbatim in the signed message.
 * @param body - Exact serialized body that will be sent.
 * @returns An unpadded base64url signature.
 * @throws Web Crypto key-import or signing failures reject the promise.
 * @remarks Server-side use: do not ship shared secrets to browsers. Requires Web Crypto and btoa. This helper does not validate timestamp freshness or verify signatures.
 * @example
 * ```ts
 * import { signSnapshotPublicationRequest } from '@alneas/sitekit/projection';
 * const secret = crypto.randomUUID();
 * const signature = await signSnapshotPublicationRequest(secret, '1792368000', '{}');
 * ```
 */
export async function signSnapshotPublicationRequest(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await hmacKey(secret);
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
}

function defaultFetch(): SnapshotPublishHttpClient {
  const fetcher = (globalThis as unknown as { fetch?: SnapshotPublishHttpClient }).fetch;
  if (!fetcher) throw new Error('A fetch implementation is required outside Workers');
  return fetcher;
}

function parsePublishEvent(value: unknown): SnapshotPublishEvent {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid snapshot publication response');
  const record = value as Record<string, unknown>;
  const fields = ['eventId', 'idempotencyKey', 'siteId', 'revision', 'manifestUrl', 'publishedAt'];
  if (fields.some(field => typeof record[field] !== 'string' || record[field] === '')) {
    throw new Error('Invalid snapshot publication response');
  }
  return {
    eventId: record.eventId as string,
    idempotencyKey: record.idempotencyKey as string,
    siteId: record.siteId as string,
    revision: record.revision as string,
    manifestUrl: record.manifestUrl as string,
    publishedAt: record.publishedAt as string,
  };
}

/**
 * Creates an HTTPS publisher that signs serialized snapshot references and validates publication responses.
 *
 * @param options - Endpoint, shared secret, optional fetch implementation, and optional ISO publication clock.
 * @returns A publisher sending immutable payload URLs and manifest metadata by authenticated POST.
 * @throws An Error for absent endpoint/secret, invalid/non-HTTPS URL, or unavailable fetch. Publish calls reject missing manifest URLs, invalid clock values, signing/transport failures, non-OK responses, or invalid/mismatched events.
 * @remarks Server-side only when using a shared secret. Requires fetch, Web Crypto, and btoa. The receiver must independently authenticate requests and verify payloads; this client checks response fields and matching site/revision.
 * @example
 * ```ts
 * import { createHttpSnapshotPublisher } from '@alneas/sitekit/projection';
 * const secret = crypto.randomUUID();
 * const publisher = createHttpSnapshotPublisher({ endpoint: 'https://example.org/api/projection', secret });
 * ```
 */
export function createHttpSnapshotPublisher(
  options: HttpSnapshotPublisherOptions,
): SiteSnapshotPublisher {
  if (!options.endpoint || !options.secret) throw new Error('Snapshot endpoint and secret are required');
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('Snapshot endpoint must use HTTPS');
  const fetcher = options.fetch ?? defaultFetch();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async publish(reference: SiteSnapshotReference): Promise<SnapshotPublishEvent> {
      if (!reference.manifestUrl) throw new Error('A manifest URL is required for snapshot publication');
      const body = JSON.stringify(reference);
      const timestamp = String(Math.floor(Date.parse(now()) / 1000));
      if (!/^\d+$/.test(timestamp)) throw new Error('Publisher clock must return an ISO timestamp');
      const signature = await signSnapshotPublicationRequest(options.secret, timestamp, body);
      const response = await fetcher(endpoint.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-eaos-protocol-version': SNAPSHOT_PROJECTION_PROTOCOL_VERSION,
          'x-eaos-timestamp': timestamp,
          'x-eaos-signature': signature,
          'x-idempotency-key': `${reference.manifest.siteId}:${reference.manifest.revision}`,
        },
        body,
      });
      if (!response.ok) throw new Error(`Snapshot publication failed (${response.status})`);
      const event = parsePublishEvent(await response.json());
      if (event.siteId !== reference.manifest.siteId || event.revision !== reference.manifest.revision) {
        throw new Error('Snapshot publication response does not match the requested revision');
      }
      return event;
    },
  };
}
