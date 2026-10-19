import { describe, expect, it } from 'vitest';
import { toSectionNode } from './legacy.js';

describe('legacy compatibility bridge', () => {
  it('converts the existing PageSectionEntry shape without mutating data', () => {
    const data = { type: 'hero', title: 'Existing production content', order: 1 };
    const entry = { id: 'home-hero', data };
    const node = toSectionNode(entry);

    expect(node).toEqual({ id: 'home-hero', type: 'hero', data });
    expect(entry.data).toBe(data);
  });
});
