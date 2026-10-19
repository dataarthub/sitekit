import { describe, expect, it } from 'vitest';
import { optimizeBrowserImageFile } from './browser.js';

describe('browser image optimization helper', () => {
  it('keeps SVG and animated GIF files unchanged', async () => {
    const svg = new File(['<svg />'], 'logo.svg', { type: 'image/svg+xml' });
    const gif = new File(['GIF89a'], 'animation.gif', { type: 'image/gif' });

    await expect(optimizeBrowserImageFile(svg)).resolves.toBe(svg);
    await expect(optimizeBrowserImageFile(gif)).resolves.toBe(gif);
  });
});
