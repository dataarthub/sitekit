import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { captureProcess } from './process-capture.mjs';
import { verifyFilePath, verifyPackages, verifyPackedManifest, verifyPackedExports } from './boundary.mjs';
import { selectedArchives } from './release-bundle-core.mjs';
const root = resolve(import.meta.dirname, '..');
const directory = await mkdtemp(join(tmpdir(), 'public-site-consumer-'));
function run(command, args, cwd = root) {
  return captureProcess(command, args, { cwd, env: { ...process.env, NPM_CONFIG_USERCONFIG: '/dev/null', NODE_PATH: '' } });
}
try {
  const selected = await selectedArchives(root,undefined,join(directory,'selected'));
  const core = selected?.core ?? join(directory, 'core.tgz');
  const adapter = selected?.cloudflare ?? join(directory, 'cloudflare.tgz');
  if (!selected) {
    run('bun', ['run', 'build:all']);
    run('bun', ['pm', 'pack', '--ignore-scripts', '--filename', core], join(root, 'packages/core'));
    run('bun', ['pm', 'pack', '--ignore-scripts', '--filename', adapter], join(root, 'packages/cloudflare'));
  }
  for (const artifact of [core, adapter]) {
    const listing = run('tar', ['-tzf', artifact]);
    assert(listing.includes('package/LICENSE'), 'License missing from tarball');
    const meta = JSON.parse(run('tar', ['-xOzf', artifact, 'package/package.json']));
    verifyPackedManifest(meta);
    verifyPackedExports(meta, listing.trim().split('\n'));
    if (artifact === core) for (const file of ['llms.txt', 'llms-full.txt', 'skills/sitekit/SKILL.md']) assert(listing.trim().split('\n').includes('package/' + file), `Missing consumer guidance: ${file}`);
    assert.equal(run('tar', ['-xOzf', artifact, 'package/LICENSE']), await readFile(join(root, 'LICENSE'), 'utf8'));
    console.log(`${meta.name}: packed manifest, exports, license and file boundary verified`);
    for (const path of listing.trim().split('\n')) verifyFilePath(path, artifact === adapter ? 'cloudflare' : 'core');
    verifyPackages(run('tar', ['-xOzf', artifact]), 'packed artifact contents');
  }
  const consumer = join(directory, 'consumer'); await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({
    private: true, type: 'module',
    dependencies: { '@alneas/sitekit': `file:${core}`, '@alneas/sitekit-cloudflare': `file:${adapter}`, astro: '7.3.3', '@alneas/appkit-core': '0.2.1', '@alneas/appkit-react': '0.3.0', react: '19.3.1', 'react-dom': '19.3.1' },
    overrides: { '@alneas/sitekit': `file:${core}` },
  }));
  run('bun', ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org'], consumer);
  await writeFile(join(consumer, 'persistence.mjs'), await readFile(join(root, 'scripts/basic-studio-persistence.mjs'), 'utf8'));
  console.log(run('bun', ['persistence.mjs'], consumer).trim());
  await writeFile(join(consumer, 'marketing-persistence.mjs'), await readFile(join(root, 'scripts/marketing-persistence.mjs'), 'utf8'));
  console.log(run('node', ['marketing-persistence.mjs'], consumer).trim());
  await writeFile(join(consumer, 'management-settings-persistence.mjs'), await readFile(join(root, 'scripts/management-settings-persistence.mjs'), 'utf8'));
  console.log(run('node', ['management-settings-persistence.mjs'], consumer).trim());
  await writeFile(join(consumer, 'management-console-persistence.mjs'), await readFile(join(root, 'scripts/management-console-persistence.mjs'), 'utf8'));
  console.log(run('node', ['management-console-persistence.mjs'], consumer).trim());
  await writeFile(join(consumer, 'smoke.ts'), `
import { ManagementWorkspace, ManagementApp } from '@alneas/sitekit/management/react';
import { createManagementHttpProvider } from '@alneas/sitekit/management/http';
import { createManagementHandler, createD1ManagementSettingsStore } from '@alneas/sitekit-cloudflare/management';
import { SiteKitError } from '@alneas/sitekit/errors';
import siteSchema from '@alneas/sitekit/schema.json' with { type: 'json' };
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';
import { createContentStudioHandler } from '@alneas/sitekit-cloudflare/studio-handler';
import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
import { ReactToolsCollectionList } from '@alneas/sitekit/studio/collection-list';
import { HOST_STUDIO_METADATA_KEY } from '@alneas/sitekit/studio/content-metadata';
import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { defineSite } from '@alneas/sitekit/config';
import { createSiteAstroConfig } from '@alneas/sitekit/build';
import { parseCloudflareSnapshotManifest } from '@alneas/sitekit-cloudflare';
import { createSectionRegistry } from '@alneas/sitekit/sections';
const config = await createSiteAstroConfig(defineSite({id:'example',content:{snapshot:{siteId:'example',revision:1,posts:[],assets:[]}}}),()=>({site:'https://example.com'}));
if (siteSchema.title !== 'SiteKit site configuration' || !(new SiteKitError('SK_CONFIG_INVALID', 'probe') instanceof Error)) throw Error('Missing error/schema exports');
if(config.output!=='static'||createSectionRegistry().types().length!==0)throw Error('Invalid consumer exports');
if(typeof parseCloudflareSnapshotManifest!=='function')throw Error('Missing adapter export');
if (typeof BasicStudioApp !== 'function' || typeof createHttpStudioProvider !== 'function') throw Error('Missing basic management UI');
if (typeof createD1ContentStudioProvider !== 'function' || typeof createContentStudioHandler !== 'function' || !HOST_STUDIO_METADATA_KEY) throw Error('Missing public editing APIs');
const html = renderToStaticMarkup(createElement(ReactToolsCollectionList, {items: [], loading: false, onSelect() {}, onCreate() {}, fallback: 'Loading public table'}));
if (!html.includes('Loading public table')) throw Error('Public collection fallback failed');
await import('@alneas/appkit-react/tools/data-table');
const handler = createContentStudioHandler({bindings: () => { throw Error('Unauthorized storage access'); }, authorize: () => false});
const denied = await handler(new Request('https://site.example/api/studio/content?collection=posts'), {});
if (denied.status !== 403) throw Error('Editing handler did not reject unauthorized request');
if ([ManagementWorkspace, ManagementApp, createManagementHttpProvider, createManagementHandler, createD1ManagementSettingsStore].some(value => typeof value !== 'function')) throw Error('Missing public management surfaces');
console.log('Isolated core + adapter + public Appkit editing imports passed');
`);
  console.log(run('bun', ['smoke.ts'], consumer).trim());
  await writeFile(join(consumer, 'browser.ts'), `
import '@alneas/appkit-react/styles';
import '@alneas/sitekit/studio/basic.css';
import '@alneas/sitekit/management/styles.css';
export { ManagementWorkspace, ManagementApp } from '@alneas/sitekit/management/react';
export { createManagementHttpProvider } from '@alneas/sitekit/management/http';
export { BasicStudioApp } from '@alneas/sitekit/studio/basic';
`);
  const browserOutput = join(directory, 'browser');
  run('bun', ['build', 'browser.ts', '--target=browser', '--outdir', browserOutput], consumer);
  const browserCode = await readFile(join(browserOutput, 'browser.js'), 'utf8');
  assert(!/["']@alneas\/appkit-react\/tools\/data-table["']/.test(browserCode), 'The optional table must be bundled for the browser, not left as an unresolved bare dynamic import');
  console.log('Public collection table browser bundle and stylesheet passed');
  const lock = await readFile(join(consumer, 'bun.lock'), 'utf8');
  verifyPackages(lock, 'isolated consumer lockfile');
  if (process.argv.includes('--preview')) {
    await writeFile(join(consumer, 'preview.mjs'), await readFile(join(root, 'scripts/basic-studio-preview.mjs'), 'utf8'));
    const preview = Bun.spawn(['bun', 'preview.mjs'], { cwd: consumer, stdout: 'inherit', stderr: 'inherit' });
    await preview.exited;
  }
} finally { await rm(directory, { recursive: true, force: true }); }
