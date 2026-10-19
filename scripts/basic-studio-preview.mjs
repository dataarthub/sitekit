// Local acceptance fixture only. Bindings and cookies below must not be used as production authentication.
import { Database } from 'bun:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';
import { createContentStudioHandler } from '@alneas/sitekit-cloudflare/studio-handler';
import { contentStudioSchemaSql } from '@alneas/sitekit-cloudflare';

const directory = await mkdtemp(join(tmpdir(), 'basic-studio-preview-'));
const db = new Database(join(directory, 'content.sqlite'));
db.exec(contentStudioSchemaSql);
const database = { prepare(sql) {
  let bindings = [];
  return {
    bind(...values) { bindings = values; return this; },
    async all() { return { results: db.query(sql).all(...bindings) }; },
    async first() { return db.query(sql).get(...bindings); },
    async run() { return db.query(sql).run(...bindings); },
  };
} };
const provider = createD1ContentStudioProvider({ database });
const seed = await provider.saveDraft({ id: '', collection: 'posts', locale: 'ja', slug: 'welcome', title: 'ようこそ', body: '# はじめの記事', tags: [], status: 'draft', data: {} });
let failNextSave = false;
const handler = createContentStudioHandler({
  bindings: () => ({ ...provider, async saveDraft(...args) {
    if (failNextSave) { failNextSave = false; throw Error('Simulated storage failure'); }
    return provider.saveDraft(...args);
  } }),
  authenticate: ({ request }) => request.headers.get('cookie')?.includes('studio-preview=local') ? { subject: 'preview', tenantId: 'preview', roles: ['editor'] } : null,
  authorize: () => true,
});
const entry = join(directory, 'browser.tsx');
await Bun.write(entry, `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
import '@alneas/appkit-react/styles';
import '@alneas/sitekit/studio/basic.css';
const provider = createHttpStudioProvider();
createRoot(document.getElementById('root')!).render(createElement(BasicStudioApp, {provider, title: '基本コンテンツ管理', collections: [{id:'posts', label:'記事'}]}));
`);
// Resolve packages from the consumer running this fixture, never sibling source aliases.
const { symlink } = await import('node:fs/promises');
await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'), 'dir');
const build = await Bun.build({ entrypoints: [entry], target: 'browser', outdir: join(directory, 'assets') });
if (!build.success) throw new Error(build.logs.join('\n'));
const files = new Map();
for (const file of build.outputs) files.set('/' + file.path.split('/').pop(), file);
const server = Bun.serve({ hostname: '127.0.0.1', port: Number(process.env.STUDIO_PREVIEW_PORT ?? 4317), async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/') return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Public basic Studio preview</title><link rel="stylesheet" href="/browser.css"><div id="root"></div><script type="module" src="/browser.js"></script></html>', { headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'studio-preview=local; HttpOnly; SameSite=Strict; Path=/' } });
  if (files.has(url.pathname)) return new Response(files.get(url.pathname));
  if (url.pathname === '/test/fail-next-save' && request.method === 'POST') { failNextSave = true; return Response.json({ enabled: true }); }
  if (url.pathname === '/api/studio/content') {
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
    return handler(request, {});
  }
  return new Response('Not found', { status: 404 });
} });
console.log(`Basic Studio preview: ${server.url} (SQLite fixture ${seed.id}; not production)`);
