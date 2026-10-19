import { describe, expect, it } from 'vitest';
import { createHttpStudioProvider } from './http-provider.js';

const document = { id: 'one', collection: 'posts', locale: 'ja', slug: 'hello', title: 'Hello', tags: [], data: {}, modifiedAt: '2026-10-19T00:00:00Z' };

describe('public Studio HTTP provider', () => {
  it('uses the editing handler protocol with same-origin credentials and concurrency options', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = createHttpStudioProvider({ fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json(String(url).includes('collection=') ? { items: [document] } : { document });
    } });
    expect((await provider.list({ collection: 'posts', search: 'hello world' })).items).toEqual([document]);
    expect(await provider.get('one')).toEqual(document);
    await provider.saveDraft(document, { expectedModifiedAt: document.modifiedAt });
    await provider.publish('one');
    expect(calls[0]!.url).toContain('search=hello+world');
    expect(calls.every(call => call.init.credentials === 'same-origin')).toBe(true);
    expect(JSON.parse(String(calls[2]!.init.body))).toMatchObject({ operation: 'saveDraft', document: { body: '' }, options: { expectedModifiedAt: document.modifiedAt } });
    expect(JSON.parse(String(calls[3]!.init.body))).toMatchObject({ operation: 'publish', documentId: 'one' });
  });

  it('reports denied requests and rejects endpoints that could send credentials to another host', async () => {
    const provider = createHttpStudioProvider({ fetch: async () => Response.json({ error: 'studio_access_denied' }, { status: 403 }) });
    await expect(provider.get('one')).rejects.toThrow('403');
    expect(() => createHttpStudioProvider({ endpoint: 'https://foreign.example/api' })).toThrow();
    expect(() => createHttpStudioProvider({ endpoint: '//foreign.example/api' })).toThrow();
  });
});
