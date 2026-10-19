import type {
  ExperimentAssignment,
  ExperimentAssignmentRequest,
  ExperimentProvider,
  SocialDeliveryResult,
  SocialPostDraft,
  SocialPublisher,
} from '@alneas/sitekit';

/**
 * Minimal response used by server HTTP experiment and social integrations.
 */
export interface CloudflareIntegrationResponse {
  /** Whether the HTTP status represents success. */
  ok: boolean;
  /** HTTP response status code. */
  status: number;
  /** Decodes response JSON.
   * @returns Untrusted integration response data.
   *
   * @example
   * ```typescript
   * import type { CloudflareIntegrationResponse } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareIntegrationResponse, ...args: Parameters<NonNullable<CloudflareIntegrationResponse['json']>>) {
   *   return adapter.json(...args);
   * }
   * ```
   */
  json(): Promise<unknown>;
}

/**
 * Injectable HTTPS JSON POST transport.
 * @param url - Validated integration endpoint.
 * @param init - Method, serialized body, and host-owned headers.
 * @returns A response whose body is validated by the corresponding integration.
 *
 * @example
 * ```typescript
 * import type { CloudflareIntegrationFetch } from '@alneas/sitekit-cloudflare';
 * export function invoke(callback: CloudflareIntegrationFetch, ...args: Parameters<CloudflareIntegrationFetch>) {
 *   return callback(...args);
 * }
 * ```
 */
export type CloudflareIntegrationFetch = (
  url: string,
  init: {
    /** JSON forwarding uses the POST method. */
    method: 'POST';
    /** Server-owned headers including content type and optional credentials. */
    headers: Record<string, string>;
    /** Exact serialized JSON request body sent to the endpoint. */
    body: string;
  },
) => Promise<CloudflareIntegrationResponse>;

/**
 * Static server headers or a request-aware credential/signing callback.
 * @remarks Keep secrets server-side. Callback input is the typed request before JSON serialization;
 * this contract does not provide the serialized string as a separate argument.
 *
 * @typeParam TRequest - Typed request supplied to server header resolution; no default or constraint.
 * @param request - Typed integration request before serialization; credentials remain server-side.
 * @returns Server-owned request headers, either directly or after asynchronous credential resolution.
 * @example
 * ```typescript
 * import type { IntegrationHeaders } from '@alneas/sitekit-cloudflare';
 * type Callback = Extract<IntegrationHeaders<unknown>, (...args: never[]) => unknown>;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type IntegrationHeaders<TRequest> =
  | Record<string, string>
  | ((request: TRequest) => Record<string, string> | Promise<Record<string, string>>);

/**
 * Endpoints and server credentials for a remote experiment provider.
 */
export interface HttpExperimentProviderOptions {
  /** Absolute HTTPS assignment endpoint returning experimentId, variantId, and exposureId. */
  assignEndpoint: string;
  /** Absolute HTTPS exposure endpoint; success status is sufficient. */
  exposureEndpoint: string;
  /** Optional server POST transport; defaults to global fetch. */
  fetch?: CloudflareIntegrationFetch;
  /** Static or request-aware server credential headers for both endpoints. */
  headers?: IntegrationHeaders<ExperimentAssignmentRequest | ExperimentAssignment>;
}

/**
 * Endpoint and server credentials for a remote social publisher.
 */
export interface HttpSocialPublisherOptions {
  /** Absolute HTTPS endpoint accepting normalized social drafts. */
  publishEndpoint: string;
  /** Optional server POST transport; defaults to global fetch. */
  fetch?: CloudflareIntegrationFetch;
  /** Static or draft-aware server credential headers. */
  headers?: IntegrationHeaders<SocialPostDraft>;
}

function defaultFetch(): CloudflareIntegrationFetch {
  const fetcher = (globalThis as unknown as { fetch?: CloudflareIntegrationFetch }).fetch;
  if (!fetcher) throw new Error('A fetch implementation is required outside Workers');
  return fetcher;
}

function httpsEndpoint(value: string, label: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (endpoint.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  return endpoint.toString();
}

function resolveHeaders<TRequest>(
  headers: IntegrationHeaders<TRequest> | undefined,
  request: TRequest,
): Promise<Record<string, string>> {
  if (!headers) return Promise.resolve({});
  return Promise.resolve(typeof headers === 'function' ? headers(request) : headers);
}

async function post<TRequest>(
  fetcher: CloudflareIntegrationFetch,
  endpoint: string,
  request: TRequest,
  headers: IntegrationHeaders<TRequest> | undefined,
): Promise<CloudflareIntegrationResponse> {
  const customHeaders = await resolveHeaders(headers, request);
  return fetcher(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...customHeaders },
    body: JSON.stringify(request),
  });
}

function parseAssignment(value: unknown): ExperimentAssignment {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid experiment assignment response');
  const record = value as Record<string, unknown>;
  if (typeof record.experimentId !== 'string' || !record.experimentId
    || typeof record.variantId !== 'string' || !record.variantId
    || typeof record.exposureId !== 'string' || !record.exposureId) {
    throw new Error('Invalid experiment assignment response');
  }
  return {
    experimentId: record.experimentId,
    variantId: record.variantId,
    exposureId: record.exposureId,
  };
}

function isSocialStatus(value: unknown): value is SocialDeliveryResult['status'] {
  return value === 'queued' || value === 'published' || value === 'failed' || value === 'skipped';
}

function parseSocialResult(value: unknown, draft: SocialPostDraft): SocialDeliveryResult {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid social delivery response');
  const record = value as Record<string, unknown>;
  if (!isSocialStatus(record.status)
    || typeof record.platform !== 'string'
    || record.platform !== draft.platform
    || typeof record.idempotencyKey !== 'string'
    || record.idempotencyKey !== draft.idempotencyKey) {
    throw new Error('Invalid social delivery response');
  }
  if (record.externalId !== undefined && typeof record.externalId !== 'string') {
    throw new Error('Invalid social delivery response');
  }
  if (record.externalUrl !== undefined && typeof record.externalUrl !== 'string') {
    throw new Error('Invalid social delivery response');
  }
  if (record.publishedAt !== undefined && typeof record.publishedAt !== 'string') {
    throw new Error('Invalid social delivery response');
  }
  if (record.error !== undefined) {
    if (typeof record.error !== 'object' || record.error === null
      || typeof (record.error as Record<string, unknown>).code !== 'string'
      || typeof (record.error as Record<string, unknown>).message !== 'string') {
      throw new Error('Invalid social delivery response');
    }
  }
  return record as unknown as SocialDeliveryResult;
}

/**
 * Connects experiment assignment and exposure recording to a remote HTTPS service.
 * @param options - Assignment/exposure endpoints and optional server transport/headers.
 * @returns A provider POSTing typed requests as JSON.
 * @throws If endpoints are invalid/non-HTTPS or fetch is unavailable; provider calls reject
 * transport errors, unsuccessful responses, and malformed assignment responses.
 * @remarks The service owns experiment persistence, assignment policy, authentication, and retries.
 * This adapter validates assignment field shape but does not bind returned IDs to the request.
 * @example
 * ```typescript
 * import { createHttpExperimentProvider }
 *   from '@alneas/sitekit-cloudflare/integrations';
 * const exampleExperiments = createHttpExperimentProvider({
 *   assignEndpoint: 'https://experiments.example.invalid/assign',
 *   exposureEndpoint: 'https://experiments.example.invalid/exposure',
 * });
 * ```
 */
export function createHttpExperimentProvider(
  options: HttpExperimentProviderOptions,
): ExperimentProvider {
  const assignEndpoint = httpsEndpoint(options.assignEndpoint, 'Experiment assign endpoint');
  const exposureEndpoint = httpsEndpoint(options.exposureEndpoint, 'Experiment exposure endpoint');
  const fetcher = options.fetch ?? defaultFetch();

  return {
    async assign(request) {
      const response = await post(fetcher, assignEndpoint, request, options.headers);
      if (!response.ok) throw new Error(`Experiment assignment request failed (${response.status})`);
      return parseAssignment(await response.json());
    },
    async recordExposure(assignment) {
      const response = await post(fetcher, exposureEndpoint, assignment, options.headers);
      if (!response.ok) throw new Error(`Experiment exposure request failed (${response.status})`);
    },
  };
}

/**
 * Connects normalized social drafts to a server-side HTTPS publishing service.
 * @param options - Publish endpoint and optional server transport/credential headers.
 * @returns A publisher validating status, platform, idempotency key, and optional result fields.
 * @throws If the endpoint is invalid/non-HTTPS or fetch is unavailable; publish calls reject
 * transport failures, unsuccessful responses, and malformed or mismatched delivery results.
 * @remarks Platform OAuth, actual delivery, idempotency enforcement, and retries belong to the
 * remote service. No provider credentials or direct platform calls reach the browser.
 * @example
 * ```typescript
 * import { createHttpSocialPublisher }
 *   from '@alneas/sitekit-cloudflare/integrations';
 * const examplePublisher = createHttpSocialPublisher({
 *   publishEndpoint: 'https://social.example.invalid/publish',
 * });
 * ```
 */
export function createHttpSocialPublisher(
  options: HttpSocialPublisherOptions,
): SocialPublisher {
  const publishEndpoint = httpsEndpoint(options.publishEndpoint, 'Social publish endpoint');
  const fetcher = options.fetch ?? defaultFetch();

  return {
    async publish(draft) {
      const response = await post(fetcher, publishEndpoint, draft, options.headers);
      if (!response.ok) throw new Error(`Social publish request failed (${response.status})`);
      return parseSocialResult(await response.json(), draft);
    },
  };
}
