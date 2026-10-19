import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { defineSite } from '../packages/core/dist/config/index.js';
import { buildSite } from '../packages/core/dist/build/index.js';

const originalDirectory = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'site-build-smoke-'));
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const imageHash = createHash('sha256').update(imageBytes).digest('hex');
const imageUrl = 'https://assets.example.com/image.png';
let imageRequests = 0;
const snapshot = {
  siteId: 'independent-example', revision: 2, assets: [{
    id: 'image', cdnUrl: imageUrl, sha256: imageHash, mimeType: 'image/png', width: 1, height: 1,
  }],
  posts: [{ id: 'welcome', title: 'Independent site', slug: 'welcome', contentType: 'PAGE',
    bodyMarkdown: 'Hello', publishedAt: '2026-01-01T00:00:00Z' }],
};
let requests = 0;
const fetchSnapshot = async (url) => {
  if (String(url) === imageUrl) { imageRequests++; return new Response(imageBytes); }
  requests++;
  return Response.json({ ...snapshot, revision: snapshot.revision + requests - 1 });
};

try {
  // Resolve the installed Astro toolchain without installing EAOS or contacting a registry.
  await mkdir(join(directory, 'node_modules'));
  const installed = await readdir(resolve('node_modules'));
  for (const name of installed) {
    await symlink(resolve('node_modules', name), join(directory, 'node_modules', name), 'dir');
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await mkdir(join(directory, 'src/pages'), { recursive: true });
  await writeFile(join(directory, 'src/pages/index.astro'), `---
import { Image } from 'astro:assets';
const image = {src: __SITE_IMAGE__, width: 1, height: 1, format: 'png'};
const title = __SITE_TITLE__;
const revision = __SITE_REVISION__;
---
<!doctype html><html><head><title>{title}</title></head><body><h1>{title}</h1><p>Revision {revision}</p><Image src={image} alt="Verified" /><img src={__SITE_IMAGE__} alt="Original" /></body></html>`);
  await mkdir(join(directory, 'public'));
  await writeFile(join(directory, 'public/robots.txt'), 'User-agent: *');
  // buildSite must not read an existing host configuration or require an EAOS environment.
  await writeFile(join(directory, 'astro.config.mjs'), 'throw Error("Host config must not be loaded twice");');
  const file = join(directory, 'published.json');
  await writeFile(file, JSON.stringify(snapshot));
  const endpoint = 'https://cms.example.com/published';
  const outputs = [];
  process.chdir(directory);
  for (const [name, content] of [['inline', { snapshot }], ['file', { file }], ['http', { endpoint, method: 'GET' }]]) {
    await buildSite(defineSite({ id: snapshot.siteId, revision: 2, content }), ({ snapshot: pinned }) => ({
      site: 'https://example.com',
      cacheDir: join(directory, '.astro'),
      outDir: join(directory, name),
      logLevel: 'error',
      vite: { define: {
        __SITE_TITLE__: JSON.stringify(pinned.posts[0].title),
        __SITE_IMAGE__: JSON.stringify(pinned.assets[0].cdnUrl),
        __SITE_REVISION__: JSON.stringify(pinned.revision),
      } },
    }), { root: directory, fetch: fetchSnapshot });
    assert.deepEqual(await readFile(join(directory, name, '_site-media', imageHash + '.png')), imageBytes);
    assert.equal(await readFile(join(directory, name, 'robots.txt'), 'utf8'), 'User-agent: *');
    outputs.push(await readFile(join(directory, name, 'index.html'), 'utf8'));
  }
  assert.equal(requests, 1);
  assert.equal(imageRequests, 3);
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[1], outputs[2]);
  assert.match(outputs[0], /Independent site/);
  assert.match(outputs[0], /Revision 2/);
  assert.ok(!outputs[0].includes('assets.example.com'));
  assert.match(outputs[0], /\.webp/);
  console.log('Site build smoke passed: revision-pinned local/HTTP snapshots and verified images produce the same static HTML.');
} finally {
  process.chdir(originalDirectory);
  await rm(directory, { recursive: true, force: true });
}
