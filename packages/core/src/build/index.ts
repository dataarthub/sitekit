import { SiteKitError } from '../errors/index.js';
import type { AstroInlineConfig, AstroUserConfig } from 'astro';
import { fileURLToPath } from 'node:url';
import { defineSite, type SiteDefinition } from '../config/index.js';
import { createCmsSnapshotReader } from '../content/cms-loader.js';
import type { EaosCmsPublishedSnapshot } from '../content/eaos-cms.js';
import { pinSnapshotImages } from './images.js';

/**
 * One validated publication exposed to the template factory in original and image-pinned rendering forms.
 */
export interface SiteBuildContext {
  /** Validated site definition used for this build. */
  site: SiteDefinition;
  /** Frozen rendering DTO with hashed images rewritten to verified local URLs; allowed unhashed assets retain their URLs. */
  snapshot: EaosCmsPublishedSnapshot;
  /** Frozen original public DTO before image URL rewriting, available for publication receipt verification. */
  publication: EaosCmsPublishedSnapshot;
}

/**
 * Server/build dependencies and compatibility controls for reading content and pinning images.
 */
export interface SiteBuildOptions {
  /** Optional HTTP implementation for snapshot and image downloads. */
  fetch?: typeof fetch;
  /** Headers sent only to the CMS endpoint; never forwarded to image downloads. */
  headers?: Record<string, string>;
  /** Allows unhashed legacy assets unless the snapshot declares sha256 integrity; those assets remain unverified. */
  allowUnhashedImages?: boolean;
}

/**
 * Template callback receiving one build context and returning Astro configuration synchronously or asynchronously.
 * @param context - Validated site, frozen rendering snapshot, and original publication for this build.
 * @returns Astro configuration consumed by the build; it may override the default output mode.
 * @example
 * ```ts
 * import type { SiteAstroConfigFactory } from '@alneas/sitekit/build';
 * type Callback = SiteAstroConfigFactory;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type SiteAstroConfigFactory = (
  context: SiteBuildContext,
) => AstroUserConfig | Promise<AstroUserConfig>;

/**
 * Loads one publication, pins hashed image bytes, and supplies the rendering snapshot to an Astro configuration factory.
 *
 * @param input - Site identity and a single content source.
 * @param configure - Factory receiving the validated site, rendering snapshot, and original publication DTO.
 * @param options - Optional fetch implementation, CMS request headers, and legacy image compatibility setting.
 * @returns The factory configuration with a default static output and any verified-image integration appended.
 * @throws SiteKitError for SiteKit-owned configuration, publication and image failures; host factory errors propagate unchanged. See the public error reference for covered codes.
 * @remarks Build/server use only; reads files and downloads images using Node APIs. CMS headers are not forwarded to image origins. The factory can override the default output mode.
 * @example
 * ```ts
 * import { createSiteAstroConfig } from '@alneas/sitekit/build';
 * export default await createSiteAstroConfig(
 *   { id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [] } } },
 *   () => ({ site: 'https://example.org' }),
 * );
 * ```
 */
export async function createSiteAstroConfig(
  input: SiteDefinition,
  configure: SiteAstroConfigFactory,
  options: SiteBuildOptions = {},
): Promise<AstroUserConfig> {
  const site = defineSite(input);
  const read = createCmsSnapshotReader(() => ({
    ...('file' in site.content
      ? { file: site.content.file, draftPreview: site.content.draftPreview === true }
      : site.content),
    siteId: site.id,
    revision: site.revision,
    ...(options.headers ? { headers: options.headers } : {}),
  }), options.fetch);
  const publication = await read();
  if (!publication) throw new SiteKitError('SK_CONTENT_MISSING', 'Site content is missing: configure a snapshot, file, or endpoint.');
  const snapshot = structuredClone(publication);
  // Every consumer in this build sees the same validated DTO, not a moving source.
  freeze(snapshot);
  const images = await pinSnapshotImages(snapshot, options.fetch ?? fetch, options.allowUnhashedImages === true && snapshot.imageIntegrity !== 'sha256');
  if (images.unverifiedImages) console.warn(`[site-build] ${images.unverifiedImages} legacy image(s) lack sha256; integrity is not verified for those images.`);
  freeze(images.renderSnapshot);
  const config = await configure({ site, snapshot: images.renderSnapshot, publication: snapshot });
  return { output: 'static', ...config, ...(images.integration
    ? { integrations: [...(config.integrations ?? []), images.integration] } : {}) };
}

/**
 * Runs an Astro build using the same publication-loading path as createSiteAstroConfig.
 *
 * @param site - Site identity and content source.
 * @param configure - Factory supplying Astro template and hosting configuration.
 * @param options - Build options with the Astro project root as a path or file URL.
 * @returns A promise resolving after Astro finishes the build.
 * @throws Content/configuration failures and Astro build errors propagate.
 * @remarks Requires Node and the Astro peer dependency. Disables Astro config-file discovery and uses the supplied factory configuration.
 * @example
 * ```ts
 * import { buildSite } from '@alneas/sitekit/build';
 * await buildSite(
 *   { id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [] } } },
 *   () => ({ site: 'https://example.org' }),
 *   { root: new URL('./', import.meta.url) },
 * );
 * ```
 */
export async function buildSite(
  site: SiteDefinition,
  configure: SiteAstroConfigFactory,
  options: SiteBuildOptions & {
  /**
   * Astro project root as a filesystem path or file URL.
   */
  root: string | URL },
): Promise<void> {
  const config = await createSiteAstroConfig(site, configure, options);
  const { build } = await import('astro');
  const inline: AstroInlineConfig = {
    ...config,
    root: options.root instanceof URL ? fileURLToPath(options.root) : options.root,
    configFile: false,
  };
  await build(inline);
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
