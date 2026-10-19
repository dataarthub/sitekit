import { parseConsentChoice, showConsentPanel, type AnalyticsConsent } from './consent.js';
import { createAnalyticsEvent, type AnalyticsEvent, type AnalyticsEventInput, type CampaignContext } from './events.js';

/** Browser collection, same-origin delivery, and effective-consent configuration. */
export interface BrowserAnalyticsOptions {
  /**
   * Host site identifier used to scope the operation.
   */
  siteId: string;
  /** Same-origin intake URL, resolved against the current page; defaults to /api/analytics. */
  endpoint?: string;
  /**
   * Booking destination used to classify outbound booking starts.
   */
  bookingUrl?: string;
  /** Provider client base URL, when plan/detail/search routes share the same booking flow. */
  bookingBaseUrl?: string;
  /**
   * Set false to skip browser collector installation.
   */
  enabled?: boolean;
  /** Choice lifetime in days, clamped to 1–365; defaults to 180. */
  consentDays?: number;
  /** Host policy; opt-out runs without a banner and honors prior refusal/DNT/GPC. */
  consentMode?: 'opt-in' | 'opt-out';
  /**
   * Optional measurement identifier retained in configuration; install the GA4 bridge through callbacks to enable delivery.
   */
  ga4MeasurementId?: string;
  /**
   * Consent-panel locale; en-prefixed values select English and other values select Japanese.
   */
  locale?: string;
  /**
   * Optional HTTP(S) privacy-policy link displayed in the consent panel.
   */
  privacyPolicyUrl?: string;
  /**
   * Emitted before initial events and whenever effective consent changes.
   * @param value - Effective analytics permission, denial, or unknown state after applying the stored choice, expiry and browser privacy signals.
   * @returns Completes the host consent callback; no result is consumed by the collector.
   * @example
   * ```ts
   * import type { BrowserAnalyticsOptions } from '@alneas/sitekit/analytics';
   * export function useOnConsentChange(host: BrowserAnalyticsOptions, ...args: Parameters<NonNullable<BrowserAnalyticsOptions['onConsentChange']>>) {
   * return host.onConsentChange?.(...args);
   * }
   * ```
   */
  onConsentChange?: (value: Consent | 'unknown') => void;
  /**
   * Host owns vendor loading/stop. Called only while consent is granted.
   * @param event - Validated event emitted by the collector while effective analytics consent is granted.
   * @returns Completes the host event callback; no result is consumed by the collector.
   * @example
   * ```ts
   * import type { BrowserAnalyticsOptions } from '@alneas/sitekit/analytics';
   * export function useOnEvent(host: BrowserAnalyticsOptions, ...args: Parameters<NonNullable<BrowserAnalyticsOptions['onEvent']>>) {
   * return host.onEvent?.(...args);
   * }
   * ```
   */
  onEvent?: (event: AnalyticsEvent) => void;
}
/**
 * Effective persisted analytics choice shared with the consent-panel implementation.
 */
type Consent = AnalyticsConsent;
/**
 * Browser event input with site identity and default pathname supplied by the collector.
 */
type Input = Omit<AnalyticsEventInput, 'siteId' | 'pagePath'> & {
  /**
 * Optional pathname override; defaults to the current location pathname.
 */
pagePath?: string };
/** Lifecycle and consent controls for an installed browser analytics collector. */
export interface BrowserAnalytics {
  /**
   * Queues an event while analytics consent is effective.
   *
   * @param input - Event fields with optional path override.
   * @returns Completion of validation and queueing, not a delivery receipt.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useTrack(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['track']>>) {
   * return host.track(...args);
   * }
   * ```
   */
  track(input: Input): Promise<void>;
  /**
   * Attempts to send one bounded batch when consent and retry policy allow.
   *
   * @returns Completion of the attempt; delivery failures are queued for retry.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useFlush(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['flush']>>) {
   * return host.flush(...args);
   * }
   * ```
   */
  flush(): Promise<void>;
  /**
   * Reads effective consent including browser privacy signals.
   *
   * @returns Analytics permission, denial, or unknown consent.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useConsent(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['consent']>>) {
   * return host.consent(...args);
   * }
   * ```
   */
  consent(): Consent | 'unknown';
  /**
   * Persists a consent choice and updates effective collection state.
   *
   * @param value - Analytics permission or denial.
   * @returns No value.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useSetConsent(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['setConsent']>>) {
   * return host.setConsent(...args);
   * }
   * ```
   */
  setConsent(value: Consent): void;
  /**
   * Opens the consent preferences panel in opt-in mode.
   *
   * @returns No value.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useShowPreferences(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['showPreferences']>>) {
   * return host.showPreferences(...args);
   * }
   * ```
   */
  showPreferences(): void;
  /**
   * Stops the collector and discards queued events.
   *
   * @returns No value.
   *
   * @example
   * ```ts
   * import type { BrowserAnalytics } from '@alneas/sitekit/analytics';
   * export function useDispose(host: BrowserAnalytics, ...args: Parameters<NonNullable<BrowserAnalytics['dispose']>>) {
   * return host.dispose(...args);
   * }
   * ```
   */
  dispose(): void;
}

/**
 * Extracts supported UTM fields and click identifiers from a URL.
 *
 * @param url - URL whose search parameters are inspected.
 * @returns Campaign context with values capped at 512 characters, or undefined when no supported values exist.
 * @example
 * ```ts
 * import { campaignFromUrl } from '@alneas/sitekit/analytics';
 * const campaign = campaignFromUrl(new URL('https://example.com/?utm_source=newsletter'));
 * ```
 */
export function campaignFromUrl(url: URL): CampaignContext | undefined {
  const campaign: CampaignContext = {};
  for (const key of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
    const value = url.searchParams.get(`utm_${key}`)?.slice(0, 512);
    if (value) campaign[key] = value;
  }
  const clickIds: Record<string, string> = {};
  for (const key of ['gclid', 'fbclid', 'yclid', 'msclkid', 'ttclid']) {
    const value = url.searchParams.get(key)?.slice(0, 512);
    if (value) clickIds[key] = value;
  }
  if (Object.keys(clickIds).length) campaign.clickIds = clickIds;
  return Object.keys(campaign).length ? campaign : undefined;
}

/**
 * Reduces a URL to public link facts without retaining query strings or fragments.
 *
 * @param value - Absolute or relative URL to inspect.
 * @param base - Base URL used to resolve relative links.
 * @returns Origin and pathname for HTTP(S), the protocol for other schemes, or an empty string for invalid input.
 * @example
 * ```ts
 * import { publicLink } from '@alneas/sitekit/analytics';
 * const href = publicLink('/guide?campaign=example#intro', 'https://example.com');
 * ```
 */
export function publicLink(value: string, base: string): string {
  try { const url = new URL(value, base); return ['https:', 'http:'].includes(url.protocol) ? url.origin + url.pathname : url.protocol; }
  catch { return ''; }
}

/**
 * Starts consent-aware browser event collection and a bounded same-origin delivery queue.
 *
 * @param options - Site, endpoint, consent policy, and optional host callbacks.
 * @returns Browser controls, or null during server rendering or when disabled.
 * @throws If siteId is blank, the intake endpoint is invalid or cross-origin, or browser setup fails.
 * @remarks Requires browser DOM APIs. Consent defaults to opt-in; DNT and GPC deny collection. Browser tracking ignores booking_complete and conversion events. Include @alneas/sitekit/analytics/consent.css for the consent panel. Call dispose to remove listeners, observers, timers, and queued events.
 * @example
 * ```ts
 * import { initBrowserAnalytics } from '@alneas/sitekit/analytics';
 * const analytics = initBrowserAnalytics({ siteId: 'example' });
 * // Call when the page integration is removed.
 * analytics?.dispose();
 * ```
 */
export function initBrowserAnalytics(options: BrowserAnalyticsOptions): BrowserAnalytics | null {
  if (typeof window === 'undefined' || options.enabled === false) return null;
  if (!options.siteId.trim()) throw Error('siteId required');
  const endpoint = new URL(options.endpoint ?? '/api/analytics', location.href);
  if (endpoint.origin !== location.origin) throw Error('Analytics intake must use the same origin');
  const prefix = `eaos:analytics:${options.siteId}:`;
  const abort = new AbortController();
  const queue: AnalyticsEvent[] = [];
  const read = (storage: Storage | undefined, key: string): any => { try { return JSON.parse(storage?.getItem(prefix + key) ?? 'null'); } catch { return null; } };
  const write = (storage: Storage | undefined, key: string, value: unknown) => { try { storage?.setItem(prefix + key, JSON.stringify(value)); } catch {} };
  const remove = (storage: Storage | undefined, key: string) => { try { storage?.removeItem(prefix + key); } catch {} };
  const storage = (kind: 'localStorage' | 'sessionStorage'): Storage | undefined => { try { return window[kind]; } catch { return undefined; } };
  const local = storage('localStorage'), session = storage('sessionStorage');
  let choice: { value: Consent; expires: number } | null = parseConsentChoice(read(local, 'consent'));
  let sessionId: string | undefined;
  let anonymousId: string | undefined;
  let campaign: CampaignContext | undefined;
  let sending: Promise<void> | undefined;
  let disposed = false;
  let backoffUntil = 0;
  let failures = 0;
  const observers: IntersectionObserver[] = [];
  let banner: HTMLElement | null = null;
  const blocked = () => navigator.doNotTrack === '1' || !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  const consent = (): Consent | 'unknown' => blocked() ? 'denied' : choice && choice.expires > Date.now() ? choice.value : options.consentMode === 'opt-out' ? 'analytics' : 'unknown';
  const granted = () => !disposed && consent() === 'analytics';
  const reset = () => { queue.length = 0; sessionId = anonymousId = undefined; campaign = undefined; for (const key of ['anonymous', 'session', 'campaign']) { remove(local, key); remove(session, key); } };
  const initialize = () => {
    if (!granted()) return;
    anonymousId = read(local, 'anonymous') || crypto.randomUUID();
    write(local, 'anonymous', anonymousId);
    const previous = read(session, 'session');
    sessionId = previous && previous.updated > Date.now() - 30 * 60_000 ? previous.id : crypto.randomUUID();
    write(session, 'session', { id: sessionId, updated: Date.now() });
    const saved = read(session, 'campaign');
    let referral: CampaignContext | undefined;
    try { const referrer = new URL(document.referrer); if (referrer.hostname !== location.hostname) { const host = referrer.hostname.replace(/^www\./, ''); referral = { source: host, medium: /(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/.test(host) ? 'ai' : /(^|\.)(google\.[a-z.]+|bing\.com|yahoo\.[a-z.]+)$/.test(host) ? 'organic' : 'referral' }; } } catch {}
    campaign = campaignFromUrl(new URL(location.href)) ?? (saved?.sessionId === sessionId ? saved.campaign : undefined) ?? referral;
    if (campaign) write(session, 'campaign', { sessionId, campaign });
  };
  const takeBatch = () => { const events: AnalyticsEvent[] = []; let bytes = 64; while (queue.length && events.length < 30) { const next = queue[0]!; const size = new TextEncoder().encode(JSON.stringify(next)).byteLength; if (bytes + size > 48 * 1024) break; events.push(queue.shift()!); bytes += size + 1; } return events; };
  const flush = async () => {
    if (!granted()) { reset(); return; }
    if (sending) return sending;
    if (!queue.length || Date.now() < backoffUntil) return;
    const events = takeBatch();
    sending = (async () => {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true, signal: abort.signal });
      if (!response.ok) throw Error(`analytics:${response.status}`);
      const receipt = await response.json() as { accepted: number; rejected: number; duplicateEventIds: string[] };
      if (!Number.isInteger(receipt.accepted) || receipt.accepted !== events.length || receipt.rejected !== 0) throw Error('Incomplete analytics receipt');
      failures = 0;
    })().catch(() => {
      if (granted()) { queue.unshift(...events); queue.splice(100); backoffUntil = Date.now() + Math.min(60_000, 1000 * 2 ** ++failures); }
    }).finally(() => { sending = undefined; });
    return sending;
  };
  const track = async (input: Input) => {
    if (!granted()) return;
    // Browser behavior cannot attest a confirmed purchase or reservation.
    if (input.event === 'booking_complete' || input.event === 'conversion') return;
    const event = createAnalyticsEvent({ ...input, siteId: options.siteId, pagePath: input.pagePath ?? location.pathname, sessionId, anonymousId, campaign: input.campaign ?? campaign, consent: 'analytics' });
    if (new TextEncoder().encode(JSON.stringify(event)).byteLength > 47 * 1024) return;
    queue.push(event); queue.splice(100);
    write(session, 'session', { id: sessionId, updated: Date.now() });
    try { options.onEvent?.(event); } catch {}
    if (queue.length >= 10) void flush();
  };
  const pageview = () => void track({ event: 'page_view', referrer: document.referrer ? publicLink(document.referrer, location.href) : undefined, metadata: { title: document.title, locale: document.documentElement.lang } });
  let lastConsent: Consent | 'unknown' | undefined;
  const notify = () => { const value = consent(); if (lastConsent === value) return; lastConsent = value; try { options.onConsentChange?.(value); } catch {} window.dispatchEvent(new CustomEvent('eaos:consent', { detail: { value } })); };
  const setConsent = (value: Consent) => {
    if (value !== 'analytics' && value !== 'denied') throw Error('Invalid analytics consent');
    const wasGranted = granted();
    choice = { value, expires: Date.now() + Math.min(365, Math.max(1, options.consentDays ?? 180)) * 86400_000 };
    write(local, 'consent', choice);
    notify();
    if (!granted()) reset(); else if (!wasGranted) { initialize(); pageview(); }
    banner?.remove(); banner = null;
  };
  const showConsent = (preferences = false) => {
    if (disposed || options.consentMode === 'opt-out') return;
    if (banner) { if (preferences) banner.focus(); return; }
    banner = showConsentPanel({ ...(options.locale ? { locale: options.locale } : {}), ...(options.privacyPolicyUrl ? { privacyPolicyUrl: options.privacyPolicyUrl } : {}), blocked: blocked(), preferences, choose: setConsent, closed: () => { banner = null; } });
  };
  notify(); initialize(); if (granted()) pageview(); else { reset(); if (consent() === 'unknown') showConsent(); }
  window.addEventListener('eaos:privacy-settings', () => showConsent(true), { signal: abort.signal });
  window.addEventListener('storage', e => { if (e.key === prefix + 'consent' || e.key === null) { const wasGranted = granted(); choice = parseConsentChoice(read(local, 'consent')); notify(); if (!granted()) reset(); else if (!wasGranted) { initialize(); pageview(); } if (consent() === 'unknown') showConsent(); else { banner?.remove(); banner = null; } } }, { signal: abort.signal });
  window.addEventListener('pagehide', () => {
    if (!granted()) { reset(); return; }
    const events = takeBatch();
    if (events.length && !navigator.sendBeacon(endpoint, new Blob([JSON.stringify({ events })], { type: 'application/json' }))) { queue.unshift(...events); void flush(); }
  }, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); }, { signal: abort.signal });
  document.addEventListener('eaos:contact-success', () => void track({ event: 'contact_submit', metadata: { outcome: 'accepted' } }), { signal: abort.signal });
  const timer = window.setInterval(() => { notify(); if (!granted()) { reset(); if (consent() === 'unknown') showConsent(); } else void flush(); }, 5000);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!granted() || !entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        void track({ event: element.matches('a,button') ? 'cta_impression' : 'section_view', sectionId: element.id || element.dataset.eventName || undefined, metadata: { label: element.getAttribute('aria-label') || undefined } });
        observer.unobserve(element);
      }
    }, { threshold: 0.5 });
    observers.push(observer); document.querySelectorAll<HTMLElement>('[data-trackable], [data-analytics-event="cta_click"]').forEach(el => observer.observe(el));
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('a[href], [data-gallery-trigger], [data-share], [data-analytics-event]') : null;
    if (!target) return;
    if (target.dataset.share) { void track({ event: 'share_click', metadata: { platform: target.dataset.share } }); return; }
    if (target.matches('[data-gallery-trigger]')) { void track({ event: 'gallery_open', metadata: { index: target.dataset.galleryIndex } }); return; }
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    const booking = options.bookingUrl ? new URL(options.bookingBaseUrl ?? options.bookingUrl, location.href) : null;
    const isBooking = !!booking && url.origin !== location.origin && url.origin === booking.origin && url.pathname.startsWith(booking.pathname);
    void track({ event: isBooking ? 'booking_start' : url.origin === location.origin ? 'navigation_click' : 'external_link_click', metadata: { href: publicLink(url.href, location.href), label: (anchor.textContent ?? '').trim().slice(0, 160) } });
  }, { signal: abort.signal });
  document.addEventListener('submit', event => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !form.matches('[data-booking-form]') || event.defaultPrevented || !options.bookingUrl) return;
    const destination = new URL(form.action, location.href), booking = new URL(options.bookingBaseUrl ?? options.bookingUrl, location.href);
    if (destination.origin !== location.origin && destination.origin === booking.origin && destination.pathname.startsWith(booking.pathname)) void track({ event: 'booking_start', metadata: { href: publicLink(destination.href, location.href), label: 'search_form' } });
  }, { signal: abort.signal });
  document.addEventListener('eaos:share-complete', event => void track({ event: 'share_complete', metadata: { platform: (event as CustomEvent).detail?.platform } }), { signal: abort.signal });
  return { track, flush, consent, setConsent, showPreferences: () => showConsent(true), dispose() { disposed = true; abort.abort(); clearInterval(timer); observers.forEach(o => o.disconnect()); banner?.remove(); queue.length = 0; } };
}

/**
 * Builds social share destinations for a public canonical URL.
 *
 * @param canonicalUrl - Absolute HTTP(S) URL; its query and fragment are removed.
 * @param title - Title encoded into supported share destinations.
 * @returns X, Facebook, and LINE share URLs plus the normalized public URL.
 * @throws If canonicalUrl is invalid or uses a non-HTTP(S) protocol.
 * @example
 * ```ts
 * import { socialShareLinks } from '@alneas/sitekit/analytics';
 * const links = socialShareLinks('https://example.com/guide?source=mail', 'Guide');
 * ```
 */
export function socialShareLinks(canonicalUrl: string, title: string) {
  const url = new URL(canonicalUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Public URL required');
  url.search = ''; url.hash = '';
  const encoded = encodeURIComponent(url.href), text = encodeURIComponent(title);
  return {
  /** X share destination with the normalized URL and encoded title. */ x: `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`,
  /** Facebook share destination with the normalized URL. */ facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
  /** LINE share destination with the normalized URL. */ line: `https://social-plugins.line.me/lineit/share?url=${encoded}`,
  /** Normalized public HTTP(S) URL with its query and fragment removed. */ url: url.href };
}
