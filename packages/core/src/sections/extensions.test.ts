import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSectionExtensionRegistry, defineSectionExtension } from './extensions.js';

const badge = defineSectionExtension({
  type: 'badge',
  schema: z.object({ type: z.literal('badge'), label: z.string() }),
  normalize: value => ({ ...value, label: value.label.trim() }),
});

describe('SectionExtensionRegistry', () => {
  it('parses and normalizes registered extensions', () => {
    const registry = createSectionExtensionRegistry([badge]);
    expect(registry.parse({ type: 'badge', label: '  New  ' })).toEqual({
      type: 'badge',
      label: 'New',
    });
  });

  it('keeps unknown extensions compatible during migration', () => {
    const registry = createSectionExtensionRegistry([badge]);
    const value = { type: 'future-extension', enabled: true };
    expect(registry.parse(value)).toBe(value);
  });

  it('reports invalid registered extensions without changing them', () => {
    const registry = createSectionExtensionRegistry([badge]);
    const result = registry.safeParse({ type: 'badge', label: 42 });
    expect(result.success).toBe(false);
  });
});
