import { describe, expect, it } from 'vitest';
import { createAnalyticsEvent, parseAnalyticsBatch, parseAnalyticsEvent } from './events.js';

describe('analytics event contract', () => {
  it('creates a valid conversion event with campaign and experiment context', () => {
    const event = createAnalyticsEvent({
      siteId: 'hotel-a',
      event: 'booking_complete',
      pagePath: '/en/booking/complete',
      campaign: { source: 'google', medium: 'cpc', campaign: 'summer' },
      experiment: { experimentId: 'booking-cta', variantId: 'b' },
      metadata: { bookingId: 'booking-1' },
    });
    expect(event.eventId).toBeTruthy();
    expect(parseAnalyticsEvent(event).event).toBe('booking_complete');
  });

  it('accepts a batch suitable for edge ingestion without requiring metadata', () => {
    const batch = parseAnalyticsBatch({
      events: [{
        eventId: 'event-1',
        siteId: 'site-1',
        event: 'page_view',
        occurredAt: '2026-09-18T00:00:00.000Z',
        pagePath: '/',
      }],
    });
    expect(batch.events[0]?.metadata).toEqual({});
  });

  it('rejects malformed events', () => {
    expect(() => parseAnalyticsEvent({ event: 'booking_complete' })).toThrow();
  });
});
