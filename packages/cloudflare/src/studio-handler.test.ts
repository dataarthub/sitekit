import { describe, expect, it } from 'vitest';
import type { ContentStudioProvider } from '@alneas/appkit-core/data/content';
import { createContentStudioHandler } from './studio-handler.js';

const document = {
  id: '', collection: 'posts', locale: 'ja', slug: 'hello', title: 'Hello', body: '# Hello',
  tags: [], status: 'draft' as const, data: {},
};

function provider(): ContentStudioProvider {
  return {
    async list() { return { items: [document] }; },
    async get() { return document; },
    async saveDraft(value) { return { ...value, id: 'post-1', modifiedAt: '2026-09-19T00:00:00.000Z' }; },
    async publish(id) { return { ...document, id, status: 'published' }; },
  };
}

describe('Content Studio API handler', () => {
  it('protects and serves list, save and publish operations through injected auth', async () => {
    const calls: string[] = [];
    const handler = createContentStudioHandler({
      bindings: () => provider(),
      allowedOrigins: ['https://site.example'],
      authorize: async ({ operation }) => { calls.push(operation); return true; },
    });
    const list = await handler(new Request('https://site.example/api/studio/content?collection=posts'), {});
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ items: [{ id: '' }] });

    const save = await handler(new Request('https://site.example/api/studio/content', {
      method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'saveDraft', document }),
    }), {});
    expect(save.status).toBe(200);
    await expect(save.json()).resolves.toMatchObject({ document: { id: 'post-1' } });

    const publish = await handler(new Request('https://site.example/api/studio/content', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'publish', documentId: 'post-1' }),
    }), {});
    expect(publish.status).toBe(200);
    expect(calls).toEqual(['read', 'write', 'write']);
  });

  it('fails closed when authorization is missing or denied and bounds requests', async () => {
    const denied = createContentStudioHandler({ bindings: () => provider(), authorize: async () => false });
    const response = await denied(new Request('https://site.example/api/studio/content?collection=posts'), {});
    expect(response.status).toBe(403);

    const oversized = createContentStudioHandler({
      bindings: () => provider(), authorize: async () => true, maxRequestBytes: 8,
    });
    const result = await oversized(new Request('https://site.example/api/studio/content', {
      method: 'POST', body: JSON.stringify({ operation: 'publish', documentId: 'post-1' }),
    }), {});
    expect(result.status).toBe(413);
  });

  it('requires the injected authentication method and scopes the provider by principal', async () => {
    let receivedTenant = '';
    const handler = createContentStudioHandler({
      bindings: (_env, principal) => {
        receivedTenant = principal?.tenantId ?? '';
        return provider();
      },
      authenticate: async ({ request }) => request.headers.get('x-test-user')
        ? { subject: 'user-1', tenantId: 'site-1', roles: ['editor'] } : null,
      authorize: async ({ principal }) => principal?.roles.includes('editor') === true,
    });
    const unauthenticated = await handler(new Request('https://site.example/api/studio/content?collection=posts'), {});
    expect(unauthenticated.status).toBe(401);
    const authenticated = await handler(new Request('https://site.example/api/studio/content?collection=posts', {
      headers: { 'x-test-user': '1' },
    }), {});
    expect(authenticated.status).toBe(200);
    expect(receivedTenant).toBe('site-1');
  });
});

describe('Basic Studio optional summary', () => {
  it('saves title and slug without requiring a summary, including clearing an existing summary', async () => {
    const handler = createContentStudioHandler({ bindings: () => provider(), authorize: () => true });
    for (const summary of ['', undefined]) {
      const response = await handler(new Request('https://site.example/api/studio/content', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'saveDraft', document: { ...document, summary } }),
      }), {});
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ document: { id: 'post-1' } });
    }
  });
});
