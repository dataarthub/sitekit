import type { SiteConfig } from './contracts/site.js';
import type { MachineReadableContentAdapter } from './ai/representation.js';
import { buildMachineReadableContent } from './ai/representation.js';
import type { SectionRegistry } from './sections/registry.js';

/**
 * Host configuration, section plugins, and machine-readable conversion grouped for rendering.
 */
export interface SiteRuntime {
  /** Host site configuration retained by reference. */
  config: SiteConfig;
  /** Registry retained by reference for section rendering. */
  sections: SectionRegistry;
  /** Adapter converting content through the built-in machine-readable representation builder. */
  machineReadable: MachineReadableContentAdapter;
}

/**
 * Combines host configuration and a section registry with the built-in machine-readable content adapter.
 *
 * @param config - Host site configuration, retained by reference.
 * @param sections - Section registry used by the host, retained by reference.
 * @returns A runtime object exposing the supplied config and sections plus a machine-readable conversion adapter.
 * @example
 * ```ts
 * import { createSiteRuntime } from '@alneas/sitekit/runtime';
 * import { createSectionRegistry } from '@alneas/sitekit/sections';
 * import type { SiteConfig } from '@alneas/sitekit/contracts';
 * const config: SiteConfig = {
 *   site: { id: 'example', name: 'Example', url: 'https://example.org' },
 *   locales: { defaultLocale: 'en', locales: ['en'], prefixStrategy: 'default-unprefixed' },
 *   theme: { name: 'base' }, routes: [],
 *   content: { getPage: async () => null, listCollection: async () => [] },
 *   media: { getMedia: async () => null },
 * };
 * const runtime = createSiteRuntime(config, createSectionRegistry());
 * ```
 */
export function createSiteRuntime(
  config: SiteConfig,
  sections: SectionRegistry,
): SiteRuntime {
  return {
    config,
    sections,
    machineReadable: {
      toMachineReadable: (content, context) => buildMachineReadableContent(content, context),
    },
  };
}
