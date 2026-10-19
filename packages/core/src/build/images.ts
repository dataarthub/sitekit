import { SiteKitError } from '../errors/index.js';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { EaosCmsAssetRecord, EaosCmsPublishedSnapshot } from '../content/eaos-cms.js';

const extensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/gif': 'gif', 'image/svg+xml': 'svg',
};
const namespace = '_site-media';
const maxBytes = 25 * 1024 * 1024;

/** Download once, verify before rendering, and serve the verified bytes locally. */
export async function pinSnapshotImages(
  snapshot: EaosCmsPublishedSnapshot,
  fetcher: typeof fetch,
  allowUnhashedImages: boolean,
): Promise<{ renderSnapshot: EaosCmsPublishedSnapshot; integration?: AstroIntegration; unverifiedImages: number }> {
  const records = [...(snapshot.assets ?? []), ...snapshot.posts.flatMap(post => [
    ...(post.eyecatch ? [post.eyecatch] : []), ...(post.mediaAssets ?? []),
  ])];
  const byUrl = new Map<string, EaosCmsAssetRecord>();
  for (const asset of records) {
    const previous = byUrl.get(asset.cdnUrl);
    if (previous?.sha256 && asset.sha256 && previous.sha256 !== asset.sha256) {
      throw new SiteKitError('SK_IMAGE_INVALID', `Conflicting image hashes: ${asset.id}`);
    }
    if (!previous || asset.sha256) byUrl.set(asset.cdnUrl, asset);
  }
  const unverifiedImages = [...byUrl.values()].filter(asset => !asset.sha256).length;
  if (unverifiedImages && !allowUnhashedImages) {
    throw new SiteKitError('SK_IMAGE_HASH_MISSING', 'Image sha256 is missing: publish image hashes in the snapshot before building.');
  }
  const urls = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  for (const asset of byUrl.values()) {
    if (!asset.sha256) continue; // Explicit legacy publication compatibility only.
    let url: URL;
    try { url = new URL(asset.cdnUrl); } catch(cause) { throw new SiteKitError('SK_IMAGE_INVALID', `Invalid image URL: ${asset.id}`, {cause}); }
    if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new SiteKitError('SK_IMAGE_INVALID', `Image URL must use HTTPS or local loopback: ${asset.id}`);
    }
    const extension = extensions[asset.mimeType ?? ''];
    if (!extension) throw new SiteKitError('SK_IMAGE_INVALID', `Image MIME type is missing or unsupported: ${asset.id}`);
    const filename = `${asset.sha256}.${extension}`;
    if (!files.has(filename)) {
      // CMS credentials are deliberately not sent to asset origins. Signed URLs can be used.
      let response: Response;
      try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }); }
      catch(cause) { throw new SiteKitError('SK_IMAGE_FETCH_FAILED', `Image download failed: ${asset.id}`, {cause}); }
      if (!response.ok) throw new SiteKitError('SK_IMAGE_FETCH_FAILED', `Image download failed (${response.status}): ${asset.id}`);
      const declared = Number(response.headers.get('content-length'));
      if (declared > maxBytes) throw new SiteKitError('SK_IMAGE_TOO_LARGE', `Image exceeds 25 MiB: ${asset.id}`);
      const reader = response.body?.getReader();
      if (!reader) throw new SiteKitError('SK_IMAGE_FETCH_FAILED', `Image body is missing: ${asset.id}`);
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) throw new SiteKitError('SK_IMAGE_TOO_LARGE', `Image exceeds 25 MiB: ${asset.id}`);
          chunks.push(value);
        }
      } catch(cause) {
        if(cause instanceof SiteKitError)throw cause;
        throw new SiteKitError('SK_IMAGE_FETCH_FAILED', `Image download failed: ${asset.id}`, {cause});
      } finally { await reader.cancel().catch(() => {}); }
      const bytes = Buffer.concat(chunks);
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
        throw new SiteKitError('SK_IMAGE_HASH_MISMATCH', `Image sha256 mismatch: ${asset.id}`);
      }
      files.set(filename, bytes);
    }
    urls.set(asset.cdnUrl, `/${namespace}/${filename}`);
  }
  if (!files.size) return { renderSnapshot: snapshot, unverifiedImages };

  // Match complete references, including Markdown and HTML, without matching URL prefixes.
  const references = [...urls].sort(([left], [right]) => right.length - left.length).map(([url, local]) => ({
    pattern: new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s"\'<>),\\]])', 'g'), local,
  }));
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (urls.has(value)) return urls.get(value);
      let text = value;
      for (const { pattern, local } of references) text = text.replace(pattern, local);
      return text;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  const renderSnapshot = rewrite(snapshot) as EaosCmsPublishedSnapshot;
  let staged: string | undefined;
  const cleanup = async () => { if (staged) await rm(staged, { recursive: true, force: true }); };
  const integration: AstroIntegration = {
    name: 'site-verified-images',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig }) => {
        // Use an isolated public directory, preserving existing public assets without editing the host.
        staged = await mkdtemp(join(tmpdir(), 'site-public-'));
        try {
          const source = fileURLToPath(config.publicDir);
          let exists = true;
          try { await stat(source); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; exists = false; }
          if (exists) await cp(source, staged, { recursive: true });
          const destination = join(staged, namespace);
          await mkdir(destination); // Reserved namespace; never overwrite host files.
          for (const [name, bytes] of files) await writeFile(join(destination, name), bytes, { flag: 'wx' });
          updateConfig({ publicDir: pathToFileURL(staged + '/') });
        } catch (error) { await cleanup(); throw error; }
      },
      'astro:build:done': cleanup,
      'astro:server:done': cleanup,
    },
  };
  return { renderSnapshot, integration, unverifiedImages };
}
