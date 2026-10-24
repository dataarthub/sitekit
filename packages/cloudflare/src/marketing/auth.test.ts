import { expect, it } from 'vitest';
import { createHmacMarketingAuthorizer } from './index.js';

const secret = 'a'.repeat(64); // Test fixture, not a deployed credential.
const now = new Date('2026-10-23T00:00:00Z');
async function signed(body = '{}', timestamp = String(now.getTime() / 1000)) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), value => value.toString(16).padStart(2, '0')).join('');
  const canonical = ['sitekit-marketing-v1', 'booking-key', timestamp, 'POST', 'https://site.example/api/marketing/outcomes', hash].join('\n');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical))), value => value.toString(16).padStart(2, '0')).join('');
  return new Request('https://site.example/api/marketing/outcomes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SiteKit-Key-Id': 'booking-key', 'X-SiteKit-Timestamp': timestamp, 'X-SiteKit-Signature': signature }, body });
}
it('binds trusted outcome authorization to the exact payload, URL, timestamp, source policy and operation', async () => {
  const authorize = createHmacMarketingAuthorizer({ now: () => now, keys: () => [{ id: 'booking-key', secret, scope: { siteId: 'a' }, operations: ['outcome'], outcomeSource: 'booking' }] });
  const request = await signed();
  expect(await authorize({ request, env: {}, operation: 'outcome' })).toEqual({ scope: { siteId: 'a' }, outcomeSource: 'booking' });
  expect(await request.text()).toBe('{}'); // Authorization cannot consume the handler body.
  const tampered = await signed();
  expect(await authorize({ request: new Request(tampered.url, { method: 'POST', headers: tampered.headers, body: '{"amountMinor":999}' }), env: {}, operation: 'outcome' })).toBeNull();
  expect(await authorize({ request: await signed(), env: {}, operation: 'spend' })).toBeNull();
  expect(await authorize({ request: await signed('{}', String(now.getTime() / 1000 - 301)), env: {}, operation: 'outcome' })).toBeNull();
  expect(await authorize({ request: new Request('https://other.example/api/marketing/outcomes', { method: 'POST', headers: (await signed()).headers, body: '{}' }), env: {}, operation: 'outcome' })).toBeNull();
});
