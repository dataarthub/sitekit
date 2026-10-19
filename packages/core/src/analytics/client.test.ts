import { describe, expect, it } from 'vitest';
import { createAnalyticsClient } from './client.js';

describe('analytics client', () => {
  it('adds site and visitor defaults before sending an event', async () => {
    const events: unknown[] = [];
    const client = createAnalyticsClient({
      track: (event) => { events.push(event); },
    }, {
      siteId: 'site-a',
      sessionId: 'session-a',
      anonymousId: 'anonymous-a',
      pagePath: '/en/',
    });

    await client.track({ event: 'page_view', metadata: {} });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: 'site-a',
      sessionId: 'session-a',
      anonymousId: 'anonymous-a',
      pagePath: '/en/',
      event: 'page_view',
    });
  });
});
