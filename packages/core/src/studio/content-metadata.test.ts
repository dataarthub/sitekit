import { describe, expect, it } from 'vitest';
import {
  HOST_STUDIO_METADATA_KEY,
  projectStudioDocument,
  readHostStudioMetadata,
  writeHostStudioMetadata,
} from './content-metadata.js';

describe('Studio host metadata', () => {
  it('round-trips paid access and rich body metadata through app-core data', () => {
    const data = writeHostStudioMetadata({ category: 'news' }, {
      access: {
        visibility: 'paid',
        aiIndexable: false,
        entitlementKey: 'article:1',
        offer: { id: 'offer-1', amount: 1200, currency: 'JPY', kind: 'one-time' },
      },
      bodyDocument: {
        format: 'json',
        value: { type: 'doc', content: [] },
        source: 'blocknote',
        version: '1',
      },
    });

    expect(data[HOST_STUDIO_METADATA_KEY]).toBeDefined();
    expect(readHostStudioMetadata(data)).toEqual({
      access: {
        visibility: 'paid',
        aiIndexable: false,
        entitlementKey: 'article:1',
        offer: { id: 'offer-1', amount: 1200, currency: 'JPY', kind: 'one-time' },
      },
      bodyDocument: {
        format: 'json',
        value: { type: 'doc', content: [] },
        source: 'blocknote',
        version: '1',
      },
    });
  });

  it('projects the app-core document into the host content contract', () => {
    const document = {
      id: 'article-1',
      collection: 'articles',
      locale: 'ja',
      slug: 'hello',
      title: 'Hello',
      summary: 'Summary',
      body: 'Preview',
      tags: ['news'],
      status: 'published' as const,
      data: writeHostStudioMetadata({}, { access: { visibility: 'members' } }),
      modifiedAt: '2026-09-20T00:00:00.000Z',
    };

    expect(projectStudioDocument(document)).toMatchObject({
      id: 'article-1',
      access: { visibility: 'members' },
      modifiedAt: '2026-09-20T00:00:00.000Z',
    });
  });
});
