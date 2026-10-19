/** Supported locale identifiers and the default-locale prefix policy. */
export interface LocalePathOptions {
  /**
   * Fallback locale when the pathname has no supported locale prefix.
   */
  defaultLocale: string;
  /**
   * Locale identifiers supported by this configuration.
   */
  locales: readonly string[];
  /** Prefixes the default locale unless explicitly false. */
  prefixDefaultLocale?: boolean;
}

/** Locale identifier paired with its alternate page URL. */
export interface AlternateLocaleLink {
  /**
   * Content locale identifier.
   */
  locale: string;
  /**
   * Alternate URL for the associated locale.
   */
  href: string;
}

function normalizePath(path: string): string {
  const clean = path.trim();
  if (!clean || clean === '/') return '/';
  return `/${clean.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function localePattern(locales: readonly string[]): RegExp {
  return new RegExp(`^/(${locales.map(locale => locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=/|$)`);
}

/**
 * Normalizes a path and optionally prefixes its target locale.
 *
 * @param locale - Locale included in options.locales.
 * @param path - Path to trim and normalize with a leading slash.
 * @param options - Supported locales and default-locale prefix policy.
 * @returns The localized path; a prefixed root ends with a slash.
 * @throws If locale is absent from the supported locales.
 * @remarks Existing locale prefixes are not removed; strip them first when changing locales.
 * @example
 * ```ts
 * import { createLocalizedPath } from '@alneas/sitekit/i18n';
 * const path = createLocalizedPath('en', '/guide/', { defaultLocale: 'en', locales: ['en', 'ja'], prefixDefaultLocale: false });
 * ```
 */
export function createLocalizedPath(
  locale: string,
  path: string,
  options: LocalePathOptions,
): string {
  if (!options.locales.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
  const normalized = normalizePath(path);
  const shouldPrefix = options.prefixDefaultLocale !== false || locale !== options.defaultLocale;
  if (!shouldPrefix) return normalized;
  return normalized === '/' ? `/${locale}/` : `/${locale}${normalized}`;
}

/**
 * Removes one supported locale prefix from a normalized pathname.
 *
 * @param pathname - Path to inspect.
 * @param options - Supported locale prefixes and fallback locale.
 * @returns The detected or default locale and the remaining normalized path.
 * @example
 * ```ts
 * import { stripLocalePath } from '@alneas/sitekit/i18n';
 * const result = stripLocalePath('/ja/guide', { defaultLocale: 'en', locales: ['en', 'ja'] });
 * ```
 */
export function stripLocalePath(
  pathname: string,
  options: Pick<LocalePathOptions, 'locales' | 'defaultLocale'>,
): {
  /**
      * Content locale identifier.
      */
     locale: string;
  /**
                      * Normalized pathname remaining after removal of one locale prefix.
                      */
                     path: string } {
  const normalized = normalizePath(pathname);
  const match = normalized.match(localePattern(options.locales));
  if (!match?.[1]) return { locale: options.defaultLocale, path: normalized };
  const path = normalized.slice(match[0].length) || '/';
  return { locale: match[1], path };
}

/**
 * Detects a supported locale prefix or falls back to the default locale.
 *
 * @param pathname - Path to inspect.
 * @param options - Supported locale prefixes and fallback locale.
 * @returns The matching locale or defaultLocale.
 * @example
 * ```ts
 * import { getLocaleFromPathname } from '@alneas/sitekit/i18n';
 * const locale = getLocaleFromPathname('/ja/guide', { defaultLocale: 'en', locales: ['en', 'ja'] });
 * ```
 */
export function getLocaleFromPathname(
  pathname: string,
  options: Pick<LocalePathOptions, 'locales' | 'defaultLocale'>,
): string {
  return stripLocalePath(pathname, options).locale;
}

/**
 * Builds one alternate URL per configured locale for the same path.
 *
 * @param pathname - Path whose existing supported locale prefix is removed.
 * @param siteUrl - Site URL with an optional trailing slash.
 * @param options - Locale list and default prefix policy.
 * @returns Locale and URL pairs in configured locale order.
 * @example
 * ```ts
 * import { buildAlternateLocaleLinks } from '@alneas/sitekit/i18n';
 * const links = buildAlternateLocaleLinks('/guide', 'https://example.com', { defaultLocale: 'en', locales: ['en', 'ja'] });
 * ```
 */
export function buildAlternateLocaleLinks(
  pathname: string,
  siteUrl: string,
  options: LocalePathOptions,
): AlternateLocaleLink[] {
  const { path } = stripLocalePath(pathname, options);
  const origin = siteUrl.replace(/\/$/, '');
  return options.locales.map(locale => ({
    locale,
    href: `${origin}${createLocalizedPath(locale, path, options)}`,
  }));
}
