import { afterEach, expect, it, vi } from 'vitest';
import { initBrowserAnalytics } from './browser.js';
import type { AnalyticsEvent } from './events.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('hands consented events and trusted-form integrations the same opaque reference, then clears it on refusal', async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) };
  const windowFixture = Object.assign(new EventTarget(), { localStorage: storage, sessionStorage: storage, setInterval: () => 1 });
  const documentFixture = Object.assign(new EventTarget(), { referrer: '', title: 'Test', documentElement: { lang: 'ja' }, querySelectorAll: () => [] });
  vi.stubGlobal('window', windowFixture); vi.stubGlobal('document', documentFixture);
  vi.stubGlobal('location', new URL('https://site.example/?utm_source=meta&utm_campaign=autumn'));
  vi.stubGlobal('navigator', { doNotTrack: '0' });
  const events: AnalyticsEvent[] = [];
  const analytics = initBrowserAnalytics({ siteId: 'example', consentMode: 'opt-out', onEvent: event => events.push(event) })!;
  try {
    const reference = analytics.attributionReference();
    expect(reference).toMatch(/^[a-f0-9-]{36}$/);
    expect(events[0]?.attributionId).toBe(reference);
    await analytics.track({ event: 'booking_start' });
    expect(events[1]?.attributionId).toBe(reference);
    analytics.setConsent('denied');
    expect(analytics.attributionReference()).toBeUndefined();
    expect([...saved.keys()].some(key => key.endsWith(':attribution'))).toBe(false);
    analytics.setConsent('analytics');
    expect(analytics.attributionReference()).not.toBe(reference);
  } finally { analytics.dispose(); }
});

it('rotates an expired reference before a long-lived tab emits or hands it to a booking integration', async () => {
  let time = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  const initial = 'b51e17ab-67f6-42ae-a63c-55e97ed7af92';
  const saved = new Map([['eaos:analytics:example:attribution', JSON.stringify({ id: initial, expires: time + 1000 })]]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) };
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage, sessionStorage: storage, setInterval: () => 1 }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { referrer: '', title: 'Test', documentElement: { lang: 'ja' }, querySelectorAll: () => [] }));
  vi.stubGlobal('location', new URL('https://site.example/')); vi.stubGlobal('navigator', { doNotTrack: '0' });
  const events: AnalyticsEvent[] = [];
  const analytics = initBrowserAnalytics({ siteId: 'example', consentMode: 'opt-out', onEvent: event => events.push(event) })!;
  try {
    expect(analytics.attributionReference()).toBe(initial);
    time += 1001;
    await analytics.track({ event: 'booking_start' });
    expect(events[1]?.attributionId).not.toBe(initial);
    expect(analytics.attributionReference()).toBe(events[1]?.attributionId);
    time += 30 * 86400000 + 1;
    expect(analytics.attributionReference()).not.toBe(events[1]?.attributionId);
  } finally { analytics.dispose(); }
});
