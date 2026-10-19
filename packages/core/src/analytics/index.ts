export {
  analyticsEventSchema,
  analyticsBatchSchema,
  campaignContextSchema,
  createAnalyticsEvent,
  experimentContextSchema,
  parseAnalyticsBatch,
  parseAnalyticsEvent,
  siteEventSchema,
} from './events.js';
export { createAnalyticsClient } from './client.js';
export type {
  AnalyticsEvent,
  AnalyticsBatch,
  AnalyticsEventInput,
  AnalyticsProvider,
  CampaignContext,
  ExperimentContext,
  MetricDefinition,
  SiteEvent,
} from './events.js';
export type { AnalyticsClientDefaults, TrackInput } from './client.js';

export { initBrowserAnalytics, campaignFromUrl, publicLink, socialShareLinks } from './browser.js';
export type { BrowserAnalytics, BrowserAnalyticsOptions } from './browser.js';

export { createGa4ConsentBridge } from './ga4.js';
