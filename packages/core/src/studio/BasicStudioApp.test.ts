import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BasicStudioApp } from './BasicStudioApp.js';
import type { StudioProvider } from './contracts.js';

describe('public basic Studio', () => {
  it('provides accessible basic controls without a restricted editor', () => {
    const provider: StudioProvider = { async list() { return { items: [] }; }, async get() { return null; }, async saveDraft(value) { return value; }, async publish() { throw Error('not used'); } };
    const html = renderToStaticMarkup(createElement(BasicStudioApp, { provider, collections: [{ id: 'posts', label: '記事' }] }));
    expect(html).toContain('新規作成');
    expect(html).toContain('aria-label="検索"');
    expect(html).toContain('記事');
    expect(html).not.toContain('BlockNote');
  });
});
