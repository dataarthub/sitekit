import { describe, expect, it } from 'vitest';
import { parseContentBodyDocument } from './rich.js';

describe('rich content contract', () => {
  it('accepts BlockNote-like block JSON without depending on BlockNote', () => {
    expect(parseContentBodyDocument({
      format: 'blocks',
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
      source: 'blocknote',
    })).toMatchObject({ format: 'blocks', source: 'blocknote' });
  });

  it('rejects malformed editor payloads', () => {
    expect(parseContentBodyDocument({ format: 'blocks', value: ['not-a-block'] })).toBeNull();
    expect(parseContentBodyDocument({ format: 'markdown', value: 42 })).toBeNull();
  });
});
