import { expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { defineSite } from '../config/index.js';
import { createSiteAstroConfig } from './index.js';

const snapshot = { siteId: 'example', revision: 3, posts: [], assets: [] };

test('HTTP and local hosts share one validated, immutable snapshot contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-input-'));
  try {
    const file = join(root, 'snapshot.json');
    await writeFile(file, JSON.stringify(snapshot));
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer build-only');
      return Response.json(snapshot);
    }) as unknown as typeof fetch;
    const configure = vi.fn(({ snapshot: pinned }) => {
      expect(Object.isFrozen(pinned)).toBe(true);
      expect(Object.isFrozen(pinned.assets)).toBe(true);
      return { site: 'https://example.com', vite: { define: { PUBLIC_REVISION: String(pinned.revision) } } };
    });
    const http = await createSiteAstroConfig(defineSite({ id: 'example', content: {
      endpoint: 'https://cms.example.com/published', method: 'GET',
    } }), configure, { fetch: fetcher, headers: { Authorization: 'Bearer build-only' } });
    await writeFile(file, JSON.stringify(snapshot));
    const local = await createSiteAstroConfig(defineSite({ id: 'example', content: { file } }), configure);
    expect(http).toEqual(local);
    expect(http.output).toBe('static');
    expect(JSON.stringify(http)).not.toContain('build-only');
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('foreign or unavailable sources fail before registering routes and never fall back', async () => {
  const configure = vi.fn(() => ({}));
  for (const response of [Response.json({ ...snapshot, siteId: 'foreign' }), new Response('', { status: 503 })]) {
    await expect(createSiteAstroConfig({ id: 'example', content: { endpoint: 'https://cms.example.com' } }, configure,
      { fetch: async () => response })).rejects.toThrow();
  }
  expect(configure).not.toHaveBeenCalled();
});

test('an inline snapshot is not frozen or mutated in the caller and hosting remains template-owned', async () => {
  const result = await createSiteAstroConfig({ id: 'example', content: { snapshot } }, ({ snapshot: pinned }) => {
    expect(pinned).not.toBe(snapshot);
    return { output: 'server' };
  });
  expect(Object.isFrozen(snapshot)).toBe(false);
  expect(result.output).toBe('server');
});

test('site configuration rejects ambiguous sources, missing identity and embedded credentials', () => {
  for (const input of [
    { id: '', content: { snapshot } },
    { id: 'example', revision: 0, content: { snapshot } },
    { id: 'example', revision: Number.MAX_SAFE_INTEGER + 1, content: { snapshot } },
    { id: 'example', content: {} },
    { id: 'example', content: { snapshot, file: '/tmp/content.json' } },
    { id: 'example', content: { endpoint: 'not a URL' } },
    { id: 'example', content: { endpoint: 'https://user:secret@cms.example.com' } },
    { id: 'example', content: { endpoint: 'file:///private/content.json' } },
    { id: 'example', content: { endpoint: 'https://cms.example.com', headers: { Authorization: 'secret' } } },
    { id: 'example', content: { endpoint: 'https://cms.example.com', draftPreview: true } },
  ]) expect(() => defineSite(input as never)).toThrow('Invalid site configuration');
});

test('an expected revision fails before image requests or template configuration', async () => {
  const configure = vi.fn(() => ({}));
  const fetcher = vi.fn(async () => Response.json(snapshot));
  await expect(createSiteAstroConfig({ id: 'example', revision: 2,
    content: { endpoint: 'https://cms.example.com' } }, configure, { fetch: fetcher }))
    .rejects.toThrow('expected 2, received 3');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(configure).not.toHaveBeenCalled();
  await expect(createSiteAstroConfig({ id: 'example', revision: 3, content: { snapshot } }, configure)).resolves.toBeDefined();
});

const bytes = new TextEncoder().encode('immutable-image');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const image = { id: 'garden', cdnUrl: 'https://assets.example.com/garden.png', sha256, mimeType: 'image/png' };

test('verified images are fetched once without CMS credentials and original publication is preserved', async () => {
  const post = { id: 'post', title: 'Garden', slug: 'garden', contentType: 'PAGE', publishedAt: '2026-01-01',
    bodyMarkdown: `![Garden](${image.cdnUrl})`, bodyJson: { image: image.cdnUrl, html: `<img src="${image.cdnUrl}">` }, eyecatch: image };
  const input = { ...snapshot, assets: [image], posts: [post] };
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.headers).toBeUndefined();
    expect(init?.redirect).toBe('error');
    return new Response(bytes);
  });
  await createSiteAstroConfig({ id: 'example', content: { snapshot: input } }, ({ publication: original, snapshot: renderSnapshot }) => {
    const local = `/_site-media/${sha256}.png`;
    expect(original.assets?.[0]?.cdnUrl).toBe(image.cdnUrl);
    expect(renderSnapshot.assets?.[0]?.cdnUrl).toBe(local);
    expect(renderSnapshot.posts[0]?.eyecatch?.cdnUrl).toBe(local);
    expect(renderSnapshot.posts[0]?.bodyJson).toEqual({ image: local, html: `<img src="${local}">` });
    expect(renderSnapshot.posts[0]?.bodyMarkdown).toBe(`![Garden](${local})`);
    expect(Object.isFrozen(renderSnapshot)).toBe(true);
    return {};
  }, { fetch: fetcher, headers: { Authorization: 'CMS-only' } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(input.assets[0]?.cdnUrl).toBe(image.cdnUrl);
});

test('missing, malformed or conflicting hashes fail without rendering', async () => {
  const configure = vi.fn(() => ({}));
  const fetcher = vi.fn(async () => new Response(bytes));
  for (const assets of [
    [{ ...image, sha256: undefined }],
    [{ ...image, sha256: 'bad' }],
    [image, { ...image, sha256: '0'.repeat(64) }],
  ]) await expect(createSiteAstroConfig({ id: 'example', content: { snapshot: { ...snapshot, assets } } }, configure,
    { fetch: fetcher })).rejects.toThrow();
  expect(configure).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

test('changed bytes, unavailable images and unsafe URLs stop the build', async () => {
  const configure = vi.fn(() => ({}));
  for (const response of [new Response('changed'), new Response('', { status: 404 }),
    new Response('', { headers: { 'content-length': String(26 * 1024 * 1024) } })]) {
    await expect(createSiteAstroConfig({ id: 'example', content: { snapshot: { ...snapshot, assets: [image] } } },
      configure, { fetch: async () => response })).rejects.toThrow();
  }
  await expect(createSiteAstroConfig({ id: 'example', content: { snapshot: { ...snapshot,
    assets: [{ ...image, cdnUrl: 'http://private.example.com/image' }] } } }, configure))
    .rejects.toThrow('Image URL');
  expect(configure).not.toHaveBeenCalled();
});

test('only explicit legacy compatibility permits missing hashes and it still verifies supplied hashes', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await createSiteAstroConfig({ id: 'example', content: { snapshot: {
      ...snapshot, assets: [{ ...image, sha256: undefined }],
    } } }, () => ({}), { allowUnhashedImages: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('integrity is not verified'));
    await expect(createSiteAstroConfig({ id: 'example', content: { snapshot: {
      ...snapshot, imageIntegrity: 'sha256', assets: [{ ...image, sha256: undefined }],
    } } }, () => ({}), { allowUnhashedImages: true })).rejects.toThrow('sha256 is missing');
    await expect(createSiteAstroConfig({ id: 'example', content: { snapshot: { ...snapshot, assets: [image] } } },
      () => ({}), { allowUnhashedImages: true, fetch: async () => new Response('changed') }))
      .rejects.toThrow('sha256 mismatch');
  } finally { warn.mockRestore(); }
});
