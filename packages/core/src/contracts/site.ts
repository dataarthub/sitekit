import type { ContentAdapter, MediaAdapter } from './content.js';
import type { RouteModule } from './routes.js';

/** Public site identity and optional organization association. */
export interface SiteIdentity {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Human-readable or registry lookup name interpreted by the consuming host.
   */
  name: string;
  /**
   * Public canonical site URL used by downstream rendering and routing.
   */
  url: string;
  /**
   * Optional owning organization identifier; this is descriptive context, not authorization.
   */
  organizationId?: string;
}

/** Site locale set and URL-prefix strategy. */
export interface LocaleConfig {
  /**
   * Locale used when no explicit locale is selected.
   */
  defaultLocale: string;
  /**
   * Locale identifiers advertised for the site or revision.
   */
  locales: string[];
  /**
   * Whether URL paths include every locale, only nondefault locales, or no locale prefix.
   */
  prefixStrategy: 'always' | 'default-unprefixed' | 'never';
}

/** Named theme and optional token overrides interpreted by the host. */
export interface ThemeConfig {
  /**
   * Human-readable or registry lookup name interpreted by the consuming host.
   */
  name: string;
  /**
   * Host-defined theme token overrides keyed by token name.
   */
  tokens?: Record<string, string | number>;
}

/** Site identity, locale, theme, content, media, and route dependencies. */
export interface SiteConfig {
  /**
   * Site identity and public canonical origin.
   */
  site: SiteIdentity;
  /**
   * Locale identifiers advertised for the site or revision.
   */
  locales: LocaleConfig;
  /**
   * Theme selection and token overrides consumed by the renderer.
   */
  theme: ThemeConfig;
  /**
   * Content adapter used to retrieve canonical records.
   */
  content: ContentAdapter;
  /**
   * Media adapter or inventory used by the consuming pipeline.
   */
  media: MediaAdapter;
  /**
   * Host route modules used to enumerate and render site paths.
   */
  routes: RouteModule[];
}
