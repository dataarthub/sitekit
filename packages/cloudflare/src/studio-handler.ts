import type {
  ContentStudioDocument,
  ContentStudioListQuery,
  ContentStudioProvider,
  ContentStudioPublishOptions,
  ContentStudioSaveOptions,
} from '@alneas/appkit-core/data/content';

/**
 * Authorization category: GET requests are `read`; POST requests are `write`.
 */
export type ContentStudioOperation = 'read' | 'write';

/**
 * Verified host identity supplied to authorization and provider binding resolution.
 * @remarks Values are trusted only after the host authenticates the request; the handler does not verify tokens.
 */
export interface ContentStudioPrincipal {
  /** Verified subject identifier. */
  subject: string;
  /** Verified tenant scope used by the host to configure its provider. */
  tenantId: string;
  /** Verified role claims; the host decides which roles permit each operation. */
  roles: readonly string[];
}

/**
 * Request and Worker environment passed to the host-owned identity verifier.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export interface ContentStudioAuthenticationContext<TEnv> {
  /** Incoming server request, including credentials for host verification. */
  request: Request;
  /** Server environment; never serialize it into browser responses. */
  env: TEnv;
}

/**
 * Context for the mandatory host authorization decision.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export interface ContentStudioAuthorizationContext<TEnv> {
  /** Incoming request to authorize. */
  request: Request;
  /** Server environment available to host policy code. */
  env: TEnv;
  /** Read or write category inferred from the HTTP method. */
  operation: ContentStudioOperation;
  /** Verified identity when `authenticate` was configured and succeeded. */
  principal?: ContentStudioPrincipal;
}

/**
 * Host-injected authentication, authorization, and server provider bindings.
 * @remarks `authorize` must return exactly `true` to permit a request. Without `authenticate`,
 * the host must verify identity inside `authorize` or an outer trusted boundary.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export interface ContentStudioHandlerOptions<TEnv> {
  /** Resolves the server provider after authorization; scope it to the verified principal.
   * @param env - Server environment supplied by the host.
   * @param principal - Authenticated principal when configured; use it to scope the provider.
   * @returns The server binding or provider resolved for this environment and verified identity.
   * @example
   * ```typescript
   * import type { ContentStudioHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: ContentStudioHandlerOptions<unknown>, ...args: Parameters<NonNullable<ContentStudioHandlerOptions<unknown>['bindings']>>) {
   *   return adapter.bindings(...args);
   * }
   * ```
   */
  bindings: (env: TEnv, principal?: ContentStudioPrincipal) => ContentStudioProvider;
  /** Required access decision; false denies with 403. Do not trust browser-supplied tenant claims.
   * @param context - Host request context used to verify identity or authorize access.
   * @returns True only when the host permits the requested operation; false denies access.
   * @example
   * ```typescript
   * import type { ContentStudioHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: ContentStudioHandlerOptions<unknown>, ...args: Parameters<NonNullable<ContentStudioHandlerOptions<unknown>['authorize']>>) {
   *   return adapter.authorize(...args);
   * }
   * ```
   */
  authorize: (context: ContentStudioAuthorizationContext<TEnv>) => boolean | Promise<boolean>;
  /** Host-owned cookie, Access, Kratos or JWT verification. Never implemented in this package.
   * @param context - Host request context used to verify identity or authorize access.
   * @returns A verified principal, or null to deny authentication; asynchronous verification may reject.
   * @example
   * ```typescript
   * import type { ContentStudioHandlerOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: ContentStudioHandlerOptions<unknown>, ...args: Parameters<NonNullable<ContentStudioHandlerOptions<unknown>['authenticate']>>) {
   *   if (typeof adapter.authenticate !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.authenticate(...args);
   * }
   * ```
   */
  authenticate?: (context: ContentStudioAuthenticationContext<TEnv>) => ContentStudioPrincipal | null | Promise<ContentStudioPrincipal | null>;
  /** Exact route pathname; defaults to `/api/studio/content`. */
  path?: string;
  /** Maximum POST body bytes; defaults to 256 KiB. */
  maxRequestBytes?: number;
  /** Exact browser origin allowlist; empty permits all origins, and absent Origin is always permitted. */
  allowedOrigins?: readonly string[];
}

/**
 * Worker-compatible Content Studio request handler.
 * @param request - Incoming GET, POST, or preflight request.
 * @param env - Host environment supplied to injected callbacks.
 * @returns JSON protocol responses or an empty 204 preflight response.
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 * @example
 * ```typescript
 * import type { ContentStudioHandler } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: ContentStudioHandler<unknown>, ...args: Parameters<ContentStudioHandler<unknown>>) {
 *   return callback(...args);
 * }
 * ```
 */
export type ContentStudioHandler<TEnv> = (request: Request, env: TEnv) => Promise<Response>;

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function corsHeaders(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

function originAllowed(origin: string | null, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.length === 0 || origin === null || allowedOrigins.includes(origin);
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

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid Studio request');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid Studio request: ${field}`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function parseDocument(value: unknown): ContentStudioDocument {
  const input = record(value);
  const tags = input.tags;
  const data = input.data;
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid Studio document: tags');
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid Studio document: data');
  if (typeof input.id !== 'string') throw new Error('Invalid Studio document: document.id');
  const document: ContentStudioDocument = {
    id: input.id,
    collection: requiredString(input.collection, 'document.collection'),
    locale: requiredString(input.locale, 'document.locale'),
    slug: requiredString(input.slug, 'document.slug'),
    title: typeof input.title === 'string' ? input.title : '',
    body: typeof input.body === 'string' ? input.body : '',
    tags,
    status: input.status === 'draft' || input.status === 'scheduled' || input.status === 'published' || input.status === 'archived'
      ? input.status : 'draft',
    data: data as Record<string, unknown>,
  };
  const summary = input.summary;
  if (summary !== undefined && typeof summary !== 'string') throw new Error('Invalid Studio request: document.summary');
  const createdAt = optionalString(input.createdAt, 'document.createdAt');
  const modifiedAt = optionalString(input.modifiedAt, 'document.modifiedAt');
  if (summary !== undefined) document.summary = summary;
  if (createdAt !== undefined) document.createdAt = createdAt;
  if (modifiedAt !== undefined) document.modifiedAt = modifiedAt;
  return document;
}

function parseListQuery(url: URL): ContentStudioListQuery {
  const collection = url.searchParams.get('collection');
  if (!collection) throw new Error('Studio collection is required');
  const status = url.searchParams.get('status') ?? undefined;
  if (status !== undefined && !['all', 'draft', 'scheduled', 'published', 'archived'].includes(status)) {
    throw new Error('Invalid Studio status');
  }
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) throw new Error('Invalid Studio limit');
  const query: ContentStudioListQuery = { collection };
  const locale = url.searchParams.get('locale');
  const search = url.searchParams.get('search');
  const cursor = url.searchParams.get('cursor');
  if (locale) query.locale = locale;
  if (search) query.search = search;
  if (status) query.status = status as Exclude<ContentStudioListQuery['status'], undefined>;
  if (limit !== undefined) query.limit = limit;
  if (cursor) query.cursor = cursor;
  return query;
}

function parseSaveOptions(value: unknown): ContentStudioSaveOptions | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  const expectedModifiedAt = optionalString(input.expectedModifiedAt, 'options.expectedModifiedAt');
  const reason = optionalString(input.reason, 'options.reason');
  return {
    ...(expectedModifiedAt !== undefined ? { expectedModifiedAt } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

function parsePublishOptions(value: unknown): ContentStudioPublishOptions | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  const scheduledAt = optionalString(input.scheduledAt, 'options.scheduledAt');
  const reason = optionalString(input.reason, 'options.reason');
  return {
    ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Creates the server HTTP boundary for a provider-driven Content Studio.
 * @param options - Required authorization and provider callbacks plus optional identity and CORS policy.
 * @returns A handler for GET lists/reads and POST `saveDraft`/`publish` operations.
 * @remarks The browser receives documents, never D1/R2 bindings. Authentication failure returns
 * 401, authorization denial returns 403, invalid inputs return 400, oversized bodies return 413,
 * and unexpected callback/provider failures return 500. Origin checks and CORS are not identity
 * verification; requests without an Origin header remain eligible. OPTIONS does not authenticate.
 * GET accepts `id`, or list parameters `collection`, `locale`, `status`, `search`, `cursor`, `limit`.
 * POST accepts `{ operation: 'saveDraft', document, options? }` or
 * `{ operation: 'publish', documentId, options? }`, returning `{ document }`.
 * @example
 * ```typescript
 * import { createContentStudioHandler, createD1ContentStudioProvider,
 *   type CloudflareD1Database, type ContentStudioAuthenticationContext,
 *   type ContentStudioPrincipal } from '@alneas/sitekit-cloudflare';
 *
 * type ExampleEnv = { database: CloudflareD1Database };
 * export function exampleHandler(
 *   verify: (context: ContentStudioAuthenticationContext<ExampleEnv>) =>
 *     Promise<ContentStudioPrincipal | null>,
 * ) {
 *   return createContentStudioHandler<ExampleEnv>({
 *     authenticate: verify,
 *     authorize: ({ principal, operation }) => Boolean(principal?.tenantId &&
 *       principal.roles.includes(operation === 'read' ? 'example-reader' : 'example-editor')),
 *     bindings: (env, principal) => createD1ContentStudioProvider({
 *       database: env.database, tenantField: 'tenant_id', tenantId: principal!.tenantId,
 *     }),
 *     allowedOrigins: ['https://studio.example.invalid'],
 *   });
 * }
 * ```
 *
 * @typeParam TEnv - Host Worker environment supplied to binding and authorization callbacks; no default or constraint.
 */
export function createContentStudioHandler<TEnv>(
  options: ContentStudioHandlerOptions<TEnv>,
): ContentStudioHandler<TEnv> {
  const path = options.path ?? '/api/studio/content';
  const maxRequestBytes = options.maxRequestBytes ?? 256 * 1024;
  const allowedOrigins = options.allowedOrigins ?? [];

  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== path) return jsonResponse({ error: 'not_found' }, 404);
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin, allowedOrigins);
    if (!originAllowed(origin, allowedOrigins)) return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return jsonResponse({ error: 'method_not_allowed' }, 405, headers);

    try {
      const operation: ContentStudioOperation = request.method === 'GET' ? 'read' : 'write';
      const principal = options.authenticate ? await options.authenticate({ request, env }) : undefined;
      if (options.authenticate && !principal) return jsonResponse({ error: 'studio_authentication_required' }, 401, headers);
      if (await options.authorize({ request, env, operation, ...(principal ? { principal } : {}) }) !== true) {
        return jsonResponse({ error: 'studio_access_denied' }, 403, headers);
      }
      const provider = options.bindings(env, principal ?? undefined);
      if (request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (id) return jsonResponse({ document: await provider.get(id) }, 200, headers);
        return jsonResponse(await provider.list(parseListQuery(url)), 200, headers);
      }

      const body = await readBoundedText(request, maxRequestBytes);
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        return jsonResponse({ error: 'invalid_studio_request' }, 400, headers);
      }
      const input = record(parsedBody);
      const operationName = input.operation;
      if (operationName === 'saveDraft') {
        const document = await provider.saveDraft(parseDocument(input.document), parseSaveOptions(input.options));
        return jsonResponse({ document }, 200, headers);
      }
      if (operationName === 'publish') {
        const documentId = requiredString(input.documentId, 'documentId');
        const document = await provider.publish(documentId, parsePublishOptions(input.options));
        return jsonResponse({ document }, 200, headers);
      }
      return jsonResponse({ error: 'unsupported_studio_operation' }, 400, headers);
    } catch (error) {
      if (error instanceof Error && error.message === 'request-too-large') {
        return jsonResponse({ error: 'request_too_large' }, 413, headers);
      }
      if (error instanceof Error && (error.message.startsWith('Invalid Studio') || error.message.startsWith('Studio '))) {
        return jsonResponse({ error: 'invalid_studio_request' }, 400, headers);
      }
      console.error(JSON.stringify({ message: 'studio request failed', error: error instanceof Error ? error.message : String(error) }));
      return jsonResponse({ error: 'studio_request_failed' }, 500, headers);
    }
  };
}
