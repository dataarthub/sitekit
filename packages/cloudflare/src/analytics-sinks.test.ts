import { describe, expect, it } from 'vitest';
import type { AnalyticsBatch, AnalyticsIngestAdapter } from '@alneas/sitekit';
import {
  createAnalyticsEngineIngestAdapter,
  createFanoutAnalyticsIngestAdapter,
  createQueueAnalyticsIngestAdapter,
} from './analytics-sinks.js';

const batch: AnalyticsBatch = {
  events: [{
    eventId: 'event-1',
    siteId: 'site-1',
    event: 'booking_complete',
    occurredAt: '2026-09-19T00:00:00.000Z',
    pagePath: '/booking',
    sessionId: 'session-1',
    anonymousId: 'anon-1',
    contentId: 'article-1',
    sectionId: 'hero',
    campaign: { source: 'newsletter', medium: 'email', campaign: 'autumn' },
    experiment: { experimentId: 'hero-copy', variantId: 'b', exposureId: 'exposure-1' },
    consent: 'analytics',
    referrer: 'https://search.example/results',
    value: 12000,
    metadata: {},
  }],
};

describe('Cloudflare analytics sinks', () => {
  it('forwards a normalized batch to Queue', async () => {
    const batches: AnalyticsBatch[] = [];
    const adapter = createQueueAnalyticsIngestAdapter({ send: async value => { batches.push(value); } });

    await expect(adapter.ingest(batch)).resolves.toEqual({ accepted: 1, rejected: 0, duplicateEventIds: [] });
    expect(batches).toEqual([batch]);
  });

  it('maps event dimensions and values to Analytics Engine datapoints', async () => {
    const points: unknown[] = [];
    const adapter = createAnalyticsEngineIngestAdapter({ writeDataPoint: point => { points.push(point); } });

    await adapter.ingest(batch);
    expect(points).toEqual([{
      indexes: ['site-1', 'booking_complete', 'article-1', 'hero', 'newsletter', 'email', 'autumn', 'hero-copy', 'b'],
      blobs: ['event-1', '/booking', 'session-1', 'anon-1', 'https://search.example/results', 'exposure-1', 'analytics'],
      doubles: [12000],
    }]);
  });

  it('fans out while combining sink results', async () => {
    const calls: string[] = [];
    const first: AnalyticsIngestAdapter = {
      async ingest() { calls.push('queue'); return { accepted: 1, rejected: 0, duplicateEventIds: ['duplicate-1'] }; },
    };
    const second: AnalyticsIngestAdapter = {
      async ingest() { calls.push('engine'); return { accepted: 0, rejected: 1, duplicateEventIds: ['duplicate-1', 'duplicate-2'] }; },
    };

    await expect(createFanoutAnalyticsIngestAdapter([first, second]).ingest(batch)).resolves.toEqual({
      accepted: 0,
      rejected: 1,
      duplicateEventIds: ['duplicate-1', 'duplicate-2'],
    });
    expect(calls).toEqual(['queue', 'engine']);
  });
});
