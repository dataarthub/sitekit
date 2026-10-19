import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSectionRegistry } from './registry.js';
import { defineSectionPlugin } from './types.js';

const hero = defineSectionPlugin({
  type: 'hero',
  schema: z.object({ type: z.literal('hero'), title: z.string() }),
  component: ({ section }) => section.data.title,
});

describe('SectionRegistry', () => {
  it('validates and resolves registered sections', async () => {
    const registry = createSectionRegistry([hero]);
    await expect(registry.resolve(
      { id: 'home-hero', type: 'hero', data: { type: 'hero', title: 'Welcome' } },
      { siteId: 'site', locale: 'en', pathname: '/', collectionItems: {} },
    )).resolves.toBe('Welcome');
  });

  it('resolves an explicit legacy alias without changing stored content', async () => {
    const registry = createSectionRegistry([hero]);
    registry.registerAlias('legacy-hero', 'hero');
    await expect(registry.resolve(
      { id: 'legacy-home-hero', type: 'legacy-hero', data: { type: 'hero', title: 'Legacy' } },
      { siteId: 'site', locale: 'en', pathname: '/', collectionItems: {} },
    )).resolves.toBe('Legacy');
    expect(registry.aliases()).toEqual({ 'legacy-hero': 'hero' });
  });

  it('rejects unknown sections and duplicate registrations', async () => {
    const registry = createSectionRegistry([hero]);
    expect(() => registry.register(hero)).toThrow('already registered');
    await expect(registry.resolve(
      { id: 'unknown', type: 'unknown', data: { type: 'unknown' } },
      { siteId: 'site', locale: 'en', pathname: '/', collectionItems: {} },
    )).rejects.toThrow('Unknown section type');
  });
});
