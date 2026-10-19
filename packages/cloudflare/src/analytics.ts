import {
  parseAnalyticsBatch,
  type AnalyticsBatch,
  type AnalyticsIngestAdapter,
  type AnalyticsIngestResult,
} from '@alneas/sitekit';

/**
 * Bindings and browser-origin policy for the bounded public analytics intake route.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export interface AnalyticsIngestHandlerOptions<TEnv> {
  /** Resolves the server-side analytics sink from the Worker environment.
   * @param env - Server environment supplied by the host.
   * @returns The analytics sink resolved from the supplied Worker environment.
   * @example
   * ```typescript
   * import type { AnalyticsIngestHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: AnalyticsIngestHandlerOptions<unknown>, ...args: Parameters<NonNullable<AnalyticsIngestHandlerOptions<unknown>['bindings']>>) {
   *   return adapter.bindings(...args);
   * }
   * ```
   */
  bindings: (env: TEnv) => AnalyticsIngestAdapter;
  /** Exact route pathname; defaults to `/api/analytics`. */
  path?: string;
  /** Maximum analytics body bytes; defaults to 128 KiB. */
  maxRequestBytes?: number;
  /** Exact browser origin allowlist; empty permits all, and absent Origin is always permitted. */
  allowedOrigins?: readonly string[];
}

/**
 * Worker-compatible bounded analytics intake endpoint.
 * @param request - POST analytics JSON or OPTIONS preflight request.
 * @param env - Environment used to resolve the sink.
 * @returns Intake response, including 202 with accepted/rejected counters on successful forwarding.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 * @example
 * ```typescript
 * import type { AnalyticsIngestHandler } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: AnalyticsIngestHandler<unknown>, ...args: Parameters<AnalyticsIngestHandler<unknown>>) {
 *   return callback(...args);
 * }
 * ```
 */
export type AnalyticsIngestHandler<TEnv> = (
  request: Request,
  env: TEnv,
) => Promise<Response>;

/**
 * Serialized analytics batch provided to the optional server header/signing callback.
 */
export interface AnalyticsHttpRequest {
  /** Batch supplied to ingest. */
  batch: AnalyticsBatch;
  /** Exact JSON string that will be sent; suitable for host request signing. */
  body: string;
}

/**
 * Minimal response shape for the injectable analytics HTTP client.
 */
export interface AnalyticsHttpResponse {
  /** Whether the transport status indicates success. */
  ok: boolean;
  /** HTTP response status. */
  status: number;
  /** Decodes the acknowledgement body.
   * @returns Untrusted decoded JSON to validate.
   *
   * @example
   * ```typescript
   * import type { AnalyticsHttpResponse } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: AnalyticsHttpResponse, ...args: Parameters<NonNullable<AnalyticsHttpResponse['json']>>) {
   *   return adapter.json(...args);
   * }
   * ```
   */
  json(): Promise<unknown>;
}

/**
 * Injectable HTTP POST transport for server-side analytics forwarding.
 * @param url - Validated HTTPS endpoint.
 * @param init - POST method, JSON body, and host-provided headers.
 * @returns Response from the analytics ingestion service.
 *
 * @example
 * ```typescript
 * import type { AnalyticsHttpClient } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: AnalyticsHttpClient, ...args: Parameters<AnalyticsHttpClient>) {
 *   return callback(...args);
 * }
 * ```
 */
export type AnalyticsHttpClient = (
  url: string,
  init: {
    /** JSON forwarding uses the POST method. */
    method: 'POST';
    /** Server-owned headers including content type and optional credentials. */
    headers: Record<string, string>;
    /** Exact serialized JSON request body sent to the endpoint. */
    body: string;
  },
) => Promise<AnalyticsHttpResponse>;

/**
 * Remote analytics protocol and host-owned transport/credentials.
 */
export interface HttpAnalyticsIngestAdapterOptions {
  /** Absolute HTTPS ingestion endpoint. */
  endpoint: string;
  /** Optional transport; defaults to global fetch. */
  fetch?: AnalyticsHttpClient;
  /** Static server headers or a callback signing the exact serialized body; keep secrets server-side.
   * @param request - Batch and exact serialized body supplied for server header generation or signing.
   * @returns Server-only request headers, synchronously or asynchronously.
   * @example
   * ```typescript
   * import type { HttpAnalyticsIngestAdapterOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: HttpAnalyticsIngestAdapterOptions, ...args: Parameters<Extract<NonNullable<HttpAnalyticsIngestAdapterOptions['headers']>, (...args: never[]) => unknown>>) {
   *   if (typeof adapter.headers !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.headers(...args);
   * }
   * ```
   */
  headers?: Record<string, string>
    | ((request: AnalyticsHttpRequest) => Record<string, string> | Promise<Record<string, string>>);
}

function defaultFetch(): AnalyticsHttpClient {
  const fetcher = (globalThis as unknown as { fetch?: AnalyticsHttpClient }).fetch;
  if (!fetcher) throw new Error('A fetch implementation is required outside Workers');
  return fetcher;
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
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

function corsHeaders(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function originAllowed(origin: string | null, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.length === 0 || origin === null || allowedOrigins.includes(origin);
}

/**
 * Creates a bounded edge intake endpoint over an injected analytics sink.
 * @param options - Sink resolver, exact route, request size, and origin policy.
 * @returns A POST/OPTIONS handler that validates batches before forwarding.
 * @remarks No authentication or rate limiting is built in. Origin checks are a browser policy,
 * not sender verification, and absent Origin is allowed. Invalid batches return 400, oversized
 * bodies 413, and sink failure 503. A successful 202 contains accepted/rejected counts only,
 * not duplicateEventIds. Persistence, deduplication, consent policy, and aggregation remain
 * with the host/sink; this route does not make D1 the analytics source of truth.
 * @example
 * ```typescript
 * import { createAnalyticsIngestHandler, createQueueAnalyticsIngestAdapter,
 *   type CloudflareAnalyticsQueue } from '@alneas/sitekit-cloudflare';
 * export const exampleIntake = createAnalyticsIngestHandler<{ queue: CloudflareAnalyticsQueue }>({
 *   bindings: env => createQueueAnalyticsIngestAdapter(env.queue),
 *   allowedOrigins: ['https://site.example.invalid'],
 * });
 * ```
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export function createAnalyticsIngestHandler<TEnv>(
  options: AnalyticsIngestHandlerOptions<TEnv>,
): AnalyticsIngestHandler<TEnv> {
  const path = options.path ?? '/api/analytics';
  const maxRequestBytes = options.maxRequestBytes ?? 128 * 1024;
  const allowedOrigins = options.allowedOrigins ?? [];

  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== path) return jsonResponse({ error: 'not_found' }, 404);
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin, allowedOrigins);
    if (!originAllowed(origin, allowedOrigins)) return jsonResponse({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, headers);

    let body: string;
    try {
      body = await readBoundedText(request, maxRequestBytes);
    } catch (error) {
      if (error instanceof Error && error.message === 'request-too-large') {
        return jsonResponse({ error: 'request_too_large' }, 413, headers);
      }
      return jsonResponse({ error: 'invalid_request' }, 400, headers);
    }

    let batch: AnalyticsBatch;
    try {
      batch = parseAnalyticsBatch(JSON.parse(body));
    } catch {
      return jsonResponse({ error: 'invalid_analytics_payload' }, 400, headers);
    }

    try {
      const result = await options.bindings(env).ingest(batch);
      return jsonResponse({ accepted: result.accepted, rejected: result.rejected }, 202, headers);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'analytics ingest failed',
        error: error instanceof Error ? error.message : String(error),
      }));
      return jsonResponse({ error: 'analytics_ingest_failed' }, 503, headers);
    }
  };
}

function parseIngestResult(value: unknown): AnalyticsIngestResult {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid analytics ingest response');
  const record = value as Record<string, unknown>;
  if (typeof record.accepted !== 'number' || !Number.isSafeInteger(record.accepted) || record.accepted < 0) {
    throw new Error('Invalid analytics ingest response');
  }
  if (typeof record.rejected !== 'number' || !Number.isSafeInteger(record.rejected) || record.rejected < 0) {
    throw new Error('Invalid analytics ingest response');
  }
  if (!Array.isArray(record.duplicateEventIds)
    || record.duplicateEventIds.some(value => typeof value !== 'string')) {
    throw new Error('Invalid analytics ingest response');
  }
  return {
    accepted: record.accepted,
    rejected: record.rejected,
    duplicateEventIds: record.duplicateEventIds,
  };
}

/**
 * Creates server-side analytics forwarding to a validated HTTPS service.
 * @param options - Endpoint, optional fetch implementation, and server header/signing callback.
 * @returns An analytics adapter that POSTs JSON and validates the service acknowledgement.
 * @throws If the endpoint is invalid/non-HTTPS or no fetch implementation exists. Ingest calls
 * reject transport failures, non-success statuses, or malformed acknowledgement JSON.
 * @remarks Responses must include nonnegative integer accepted/rejected counters and a string
 * array duplicateEventIds. The bounded intake handler's counter-only response is not this
 * acknowledgement contract. Credentials and request signing belong to the host callback.
 * @example
 * ```typescript
 * import { createHttpAnalyticsIngestAdapter }
 *   from '@alneas/sitekit-cloudflare';
 * const exampleAnalytics = createHttpAnalyticsIngestAdapter({
 *   endpoint: 'https://analytics.example.invalid/ingest',
 * });
 * ```
 */
export function createHttpAnalyticsIngestAdapter(
  options: HttpAnalyticsIngestAdapterOptions,
): AnalyticsIngestAdapter {
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new Error('Analytics endpoint must be a valid HTTPS URL');
  }
  if (endpoint.protocol !== 'https:') throw new Error('Analytics endpoint must use HTTPS');
  const fetcher = options.fetch ?? defaultFetch();

  return {
    async ingest(batch): Promise<AnalyticsIngestResult> {
      const body = JSON.stringify(batch);
      const request = { batch, body };
      const customHeaders = typeof options.headers === 'function'
        ? await options.headers(request)
        : options.headers ?? {};
      const response = await fetcher(endpoint.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...customHeaders },
        body,
      });
      if (!response.ok) throw new Error(`Analytics ingest request failed (${response.status})`);
      return parseIngestResult(await response.json());
    },
  };
}
