import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../contracts/content.js';
import { buildSiteSnapshot } from './snapshot.js';

const item = (id: string): ContentItem => ({
  id,
  collection: 'posts',
  slug: id,
  locale: 'ja',
  title: id,
  tags: [],
  data: {},
});

describe('site snapshot builder', () => {
  it('normalizes record order and produces a verifiable checksum', async () => {
    const base = {
      siteId: 'webmedia',
      revision: '2026-09-18.001',
      contentVersion: 'content-1',
      mediaVersion: 'media-1',
      locales: ['en', 'ja'],
      media: [],
      generatedAt: '2026-09-18T00:00:00.000Z',
    };

    const first = await buildSiteSnapshot({ ...base, content: [item('b'), item('a')] });
    const second = await buildSiteSnapshot({ ...base, content: [item('a'), item('b')] });

    expect(first.contentJson).toBe('[{"id":"a","collection":"posts","slug":"a","locale":"ja","title":"a","tags":[],"data":{}},{"id":"b","collection":"posts","slug":"b","locale":"ja","title":"b","tags":[],"data":{}}]');
    expect(first.manifest.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.manifest.checksum).toBe(second.manifest.checksum);
    expect(first.manifest.locales).toEqual(['en', 'ja']);
  });
});
