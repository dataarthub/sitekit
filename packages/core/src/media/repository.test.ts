import { describe, expect, it } from 'vitest';
import type { MediaAdapter } from '../contracts/content.js';
import { createFallbackMediaRepository } from './repository.js';

const asset = {
  id: 'image-1',
  url: 'https://cdn.example.test/image.webp',
  alt: 'A view',
  tags: ['hero'],
  metadata: {},
};

describe('fallback media repository', () => {
  it('supports a remote-first and local-fallback media setup', async () => {
    const remote: MediaAdapter = {
      getMedia: async () => null,
      listMedia: async () => [],
    };
    const local: MediaAdapter = {
      getMedia: async () => asset,
      listMedia: async () => [asset],
    };

    const repository = createFallbackMediaRepository([remote, local]);

    await expect(repository.getMedia({ id: 'image-1' })).resolves.toEqual(asset);
    await expect(repository.listMedia({ tags: ['hero'] })).resolves.toEqual([asset]);
  });
});
