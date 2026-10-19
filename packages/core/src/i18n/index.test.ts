import { describe, expect, it } from 'vitest';
import {
  buildAlternateLocaleLinks,
  createLocalizedPath,
  getLocaleFromPathname,
  stripLocalePath,
} from './index.js';

const options = {
  defaultLocale: 'ja',
  locales: ['ja', 'en', 'zh-TW'],
  prefixDefaultLocale: true,
} as const;

describe('locale URL contract', () => {
  it('creates and parses locale-prefixed paths', () => {
    expect(createLocalizedPath('ja', '/posts/one/', options)).toBe('/ja/posts/one');
    expect(stripLocalePath('/en/posts/one/', options)).toEqual({ locale: 'en', path: '/posts/one' });
    expect(getLocaleFromPathname('/unknown/path', options)).toBe('ja');
  });

  it('supports unprefixed default locale deployments', () => {
    expect(createLocalizedPath('ja', '/', { ...options, prefixDefaultLocale: false })).toBe('/');
    expect(createLocalizedPath('en', '/', { ...options, prefixDefaultLocale: false })).toBe('/en/');
  });

  it('builds canonical alternate links from one route path', () => {
    expect(buildAlternateLocaleLinks('/en/posts/one', 'https://example.com/', options)).toEqual([
      { locale: 'ja', href: 'https://example.com/ja/posts/one' },
      { locale: 'en', href: 'https://example.com/en/posts/one' },
      { locale: 'zh-TW', href: 'https://example.com/zh-TW/posts/one' },
    ]);
  });
});
