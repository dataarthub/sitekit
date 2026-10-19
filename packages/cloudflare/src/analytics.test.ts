import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsBatch, AnalyticsIngestAdapter } from '@alneas/sitekit';
import { createAnalyticsIngestHandler, createHttpAnalyticsIngestAdapter } from './analytics.js';

const batch: AnalyticsBatch = {
  events: [{
    eventId: 'event-1',
    siteId: 'site-1',
    event: 'conversion',
    occurredAt: '2026-09-18T00:00:00.000Z',
    pagePath: '/booking',
    anonymousId: 'anon-1',
    consent: 'analytics',
    metadata: { bookingProvider: 'example' },
  }],
};

describe('Cloudflare analytics intake', () => {
  it('validates, bounds and forwards browser events without storing them in D1', async () => {
    let received: AnalyticsBatch | undefined;
    const adapter: AnalyticsIngestAdapter = {
      async ingest(value) {
        received = value;
        return { accepted: value.events.length, rejected: 0, duplicateEventIds: [] };
      },
    };
    const handler = createAnalyticsIngestHandler({
      bindings: () => adapter,
      allowedOrigins: ['https://site.example'],
    });
    const response = await handler(new Request('https://site.example/api/analytics', {
      method: 'POST',
      headers: { origin: 'https://site.example', 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    }), {});

    expect(response.status).toBe(202);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://site.example');
    await expect(response.json()).resolves.toEqual({ accepted: 1, rejected: 0 });
    expect(received).toEqual(batch);
  });

  it('rejects invalid payloads, disallowed origins and oversized bodies', async () => {
    const ingest = vi.fn(async () => ({ accepted: 1, rejected: 0, duplicateEventIds: [] }));
    const handler = createAnalyticsIngestHandler({
      bindings: () => ({ ingest }),
      allowedOrigins: ['https://site.example'],
      maxRequestBytes: 32,
    });

    const invalid = await handler(new Request('https://site.example/api/analytics', {
      method: 'POST',
      headers: { origin: 'https://site.example' },
      body: '{}',
    }), {});
    expect(invalid.status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();

    const forbidden = await handler(new Request('https://site.example/api/analytics', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify(batch),
    }), {});
    expect(forbidden.status).toBe(403);

    const oversized = await handler(new Request('https://site.example/api/analytics', {
      method: 'POST',
      headers: { origin: 'https://site.example' },
      body: JSON.stringify(batch),
    }), {});
    expect(oversized.status).toBe(413);
  });

  it('forwards a batch to an EAOS analytics endpoint with injected credentials', async () => {
    let requestUrl = '';
    let requestHeaders: Record<string, string> | undefined;
    let requestBody: unknown;
    const adapter = createHttpAnalyticsIngestAdapter({
      endpoint: 'https://eaos.example/api/analytics/ingest',
      headers: () => ({ authorization: 'Bearer test-token' }),
      fetch: async (url, init) => {
        requestUrl = url;
        requestHeaders = init.headers;
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return { accepted: 1, rejected: 0, duplicateEventIds: [] };
          },
        };
      },
    });

    await expect(adapter.ingest(batch)).resolves.toEqual({
      accepted: 1,
      rejected: 0,
      duplicateEventIds: [],
    });
    expect(requestUrl).toBe('https://eaos.example/api/analytics/ingest');
    expect(requestHeaders).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    });
    expect(requestBody).toEqual(batch);
  });

  it('requires HTTPS for the EAOS analytics endpoint', () => {
    expect(() => createHttpAnalyticsIngestAdapter({
      endpoint: 'http://eaos.example/analytics',
      fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }),
    })).toThrow('must use HTTPS');
  });
});
