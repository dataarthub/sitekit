import { describe, it, expect } from 'vitest';
import { parseConsentChoice } from './consent.js';
describe('persisted analytics consent', () => {
  it('rejects damaged and unexpected stored choices', () => {
    for (const value of [null, [], 'analytics', { value: 'yes', expires: 100 }, { value: 'analytics', expires: '100' }, { value: 'denied', expires: Infinity }]) expect(parseConsentChoice(value)).toBeNull();
  });
  it('preserves explicit acceptance and refusal with numeric expiry', () => {
    for (const value of ['analytics', 'denied']) expect(parseConsentChoice({ value, expires: 123, extra: 'ignored' })).toEqual({ value, expires: 123 });
  });
});
