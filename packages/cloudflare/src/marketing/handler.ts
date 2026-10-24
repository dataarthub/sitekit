import { parseAnalyticsBatch } from '@alneas/sitekit/analytics';
import { parseMarketingOutcome, parseMarketingReportQuery, parseMarketingScope, parseMarketingSpendImport, parseMarketingSpendCsv } from '@alneas/sitekit/marketing';
import type { MarketingScope, MarketingServices } from '@alneas/sitekit/marketing';

/** Protected measurement operations; public browser ingestion is a distinct route. */
export type MarketingOperation = 'report' | 'outcome' | 'spend' | 'forget' | 'purge';
/** Trusted server identity returned only after authentication and operation authorization. */
export interface MarketingPrincipal {
  /** Site/tenant scope verified by the host. */
  scope: MarketingScope;
  /** Trusted integration source; required for confirmed outcome intake. */
  outcomeSource?: string;
}
/**
 * Request context supplied to host authorization code.
 * @typeParam TEnv - Server binding environment.
 */
export interface MarketingAuthorizationContext<TEnv> {
  /** Incoming request; verify credentials and cookie/CSRF policy before granting access. */
  request: Request;
  /** Server-only bindings; never included in responses. */
  env: TEnv;
  /** Specific operation requested by the route. */
  operation: MarketingOperation;
}
/**
 * Host-owned authorization and provider bindings.
 * @typeParam TEnv - Server binding environment.
 */
export interface MarketingHandlerOptions<TEnv> {
  /**
   * Resolves the public event site's scope from server configuration.
   * @param env - Server bindings.
   * @returns The public site's configured identity, never a browser-selected tenant.
   * @example
   * import type { MarketingHandlerOptions } from '@alneas/sitekit-cloudflare/marketing';
   * export function scope(o: MarketingHandlerOptions<unknown>) { return o.publicScope({}); }
   */
  publicScope(env: TEnv): MarketingScope;
  /**
   * Resolves services for the already verified scope.
   * @param env - Server bindings.
   * @param scope - Host-derived site/tenant identity.
   * @returns One provider with exactly that scope.
   * @example
   * import type { MarketingHandlerOptions } from '@alneas/sitekit-cloudflare/marketing';
   * export function services(o: MarketingHandlerOptions<unknown>) { return o.services({}, { siteId: 'example' }); }
   */
  services(env: TEnv, scope: MarketingScope): MarketingServices;
  /**
   * Authenticates and authorizes the exact protected operation; absence denies access.
   * @param context - Request, environment and operation to verify.
   * @returns A scoped principal, or null to deny. Verify webhook signatures or host identity here.
   * @example
   * import type { MarketingHandlerOptions, MarketingAuthorizationContext } from '@alneas/sitekit-cloudflare/marketing';
   * export function authorize(o: MarketingHandlerOptions<unknown>, c: MarketingAuthorizationContext<unknown>) { return o.authorize(c); }
   */
  authorize(context: MarketingAuthorizationContext<TEnv>): MarketingPrincipal | null | Promise<MarketingPrincipal | null>;
}
/**
 * Bounded standalone/managed measurement request handler.
 * @typeParam TEnv - Server binding environment.
 * @param request - Incoming HTTP request.
 * @param env - Server bindings.
 * @returns A no-store JSON protocol response without internal errors or credentials.
 * @example
 * import type { MarketingHandler } from '@alneas/sitekit-cloudflare/marketing';
 * export function handle(h: MarketingHandler<unknown>, r: Request) { return h(r, {}); }
 */
export type MarketingHandler<TEnv> = (request: Request, env: TEnv) => Promise<Response>;

class BodyError extends Error { constructor(readonly status: number, code: string) { super(code); } }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function readText(request: Request, type: RegExp): Promise<string> {
  if (!type.test(request.headers.get('Content-Type') ?? '')) throw new BodyError(415, 'content_type_not_supported');
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400, 'body_required');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); throw new BodyError(413, 'request_too_large'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function readJson(request: Request): Promise<unknown> {
  const text = await readText(request, /^application\/json(?:;|$)/i);
  try { return JSON.parse(text); } catch { throw new BodyError(400, 'invalid_json'); }
}

/**
 * Creates measurement routes with separate public-event and trusted-outcome boundaries.
 * @typeParam TEnv - Server binding environment.
 * @param options - Host-owned authorization and site/provider resolution.
 * @returns A same-origin event intake plus authenticated report/outcome/spend/privacy API.
 * @remarks Public ingestion is at /api/analytics. Protected operations are under
 * /api/marketing/{report,outcomes,spend,forget,purge}. Authorize must verify the exact
 * operation, integration source and cookie CSRF policy. The host owns rate limits and
 * webhook signature verification. Never expose this endpoint with a permissive authorizer.
 * @example
 * import { createMarketingHandler, type MarketingHandlerOptions } from '@alneas/sitekit-cloudflare/marketing';
 * export function handler(options: MarketingHandlerOptions<unknown>) { return createMarketingHandler(options); }
 */
export function createMarketingHandler<TEnv>(options: MarketingHandlerOptions<TEnv>): MarketingHandler<TEnv> {
  return async (request, env) => {
    const url = new URL(request.url);
    const operations: Record<string, MarketingOperation> = { '/api/marketing/report': 'report', '/api/marketing/outcomes': 'outcome', '/api/marketing/spend': 'spend', '/api/marketing/forget': 'forget', '/api/marketing/purge': 'purge' };
    const publicIntake = url.pathname === '/api/analytics';
    const operation = operations[url.pathname];
    if (!publicIntake && !operation) return json({ error: 'not_found' }, 404);
    if (request.method !== (operation === 'report' ? 'GET' : 'POST')) return json({ error: 'method_not_allowed' }, 405);
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || (publicIntake && origin !== url.origin)) return json({ error: 'origin_not_allowed' }, 403);
    try {
      const principal = publicIntake ? null : await options.authorize({ request, env, operation: operation! });
      if (!publicIntake && !principal) return json({ error: 'unauthorized' }, 401);
      const scope = parseMarketingScope(publicIntake ? options.publicScope(env) : principal!.scope);
      const service = options.services(env, scope);
      const actual = parseMarketingScope(service.scope);
      if (scope.siteId !== actual.siteId || scope.tenantId !== actual.tenantId) throw new Error('Provider scope mismatch');
      if (operation === 'report') {
        const entries = [...url.searchParams.entries()];
        if (entries.length !== new Set(entries.map(([key]) => key)).size) return json({ error: 'duplicate_query_field' }, 400);
        return json(await service.analytics.report(parseMarketingReportQuery(Object.fromEntries(entries))));
      }
      if (operation === 'spend' && /^text\/csv(?:;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
        let input;
        const csv = await readText(request, /^text\/csv(?:;|$)/i);
        try { input = parseMarketingSpendCsv(csv); } catch { throw new BodyError(400, 'invalid_spending_csv'); }
        return json(await service.campaigns.importSpend(input), 202);
      }
      const input = await readJson(request);
      if (publicIntake) return json(await service.analytics.ingest(parseAnalyticsBatch(input)), 202);
      if (operation === 'outcome') {
        const value = parseMarketingOutcome(input);
        if (!principal!.outcomeSource || value.source !== principal!.outcomeSource) return json({ error: 'source_not_allowed' }, 403);
        return json(await service.outcomes.record(value), 202);
      }
      if (operation === 'spend') return json(await service.campaigns.importSpend(parseMarketingSpendImport(input)), 202);
      if (operation === 'forget') {
        if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 || !('attributionId' in input) || typeof input.attributionId !== 'string') return json({ error: 'invalid_privacy_request' }, 400);
        await service.analytics.forget(input.attributionId); return json({ forgotten: true });
      }
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) return json({ error: 'invalid_purge_request' }, 400);
      return json({ deleted: await service.analytics.purge() });
    } catch (error) {
      if (error instanceof BodyError) return json({ error: error.message }, error.status);
      if (error instanceof Error && error.name === 'ZodError') return json({ error: 'invalid_marketing_payload' }, 400);
      if (error instanceof RangeError) return json({ error: 'marketing_range_not_supported' }, 422);
      if (error instanceof Error && /NOT NULL constraint failed: sitekit_marketing_records\.fingerprint/.test(error.message)) return json({ error: 'identity_conflict' }, 409);
      return json({ error: 'marketing_unavailable' }, 503);
    }
  };
}
