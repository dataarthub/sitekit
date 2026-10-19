import { describe, expect, it } from 'vitest';
import { normalizeMediaOptimizationOptions } from './optimization.js';

describe('media optimization contract', () => {
  it('normalizes safe browser/server optimization defaults', () => {
    expect(normalizeMediaOptimizationOptions({ maxWidth: 1200.8, quality: 2 })).toEqual({
      maxWidth: 1200,
      format: 'webp',
      quality: 1,
    });
  });
});
