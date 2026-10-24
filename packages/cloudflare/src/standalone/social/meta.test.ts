import { expect, it } from 'vitest';
import { createMetaDeliveryDriver, createMetaOAuth } from './index.js';
import type { SocialDeliveryContext, DeliveryProgress } from './types.js';
const context: SocialDeliveryContext = { account: { id: 'instagram:456', externalId: '456', platform: 'instagram', name: 'IG', token: 'test-only-token', expiresAt: '2027-01-01T00:00:00Z' }, job: { id: 'job', version: 1, accountId: 'instagram:456', platform: 'instagram', text: 'Hello', imageUrl: 'https://media.example/image.jpg', status: 'publishing', createdAt: '2026-10-23T00:00:00Z', attempt: 1 } };
it('persists the Instagram container before dispatch and resumes processing without creating a second container', async () => {
  const calls: string[] = []; let ready = false; let progress: DeliveryProgress | undefined;
  const driver = createMetaDeliveryDriver({ apiVersion: 'v22.0', allowedMediaOrigins: ['https://media.example'], fetch: async (input, init) => {
    const url = new URL(String(input)); calls.push((init?.method ?? 'GET') + ' ' + url.pathname);
    if (url.pathname.endsWith('/media')) return Response.json({ id: '789' });
    if (url.pathname.endsWith('/media_publish')) { expect(progress?.phase).toBe('dispatching'); return Response.json({ id: '999' }); }
    return Response.json({ status_code: ready ? 'FINISHED' : 'IN_PROGRESS' });
  } });
  expect((await driver.publish(context, async value => { progress = value; })).status).toBe('pending');
  expect(progress).toEqual({ phase: 'prepared', containerId: '789' });
  ready = true;
  expect(await driver.publish({ ...context, progress: progress! }, async value => { progress = value; })).toMatchObject({ status: 'published', externalId: '999' });
  expect(calls.filter(value => value.endsWith('/media'))).toHaveLength(1);
});
it('treats a Facebook POST timeout as unknown and never retries it during reconciliation', async () => {
  let posts = 0; const driver = createMetaDeliveryDriver({ apiVersion: 'v22.0', allowedMediaOrigins: ['https://media.example'], fetch: async () => { posts++; throw new Error('timeout'); } });
  const facebook = { ...context, account: { ...context.account, platform: 'facebook' as const, externalId: '123' }, job: { ...context.job, platform: 'facebook' as const } };
  expect((await driver.publish(facebook, async () => {})).status).toBe('unknown');
  expect((await driver.reconcile(facebook)).status).toBe('unknown'); expect(posts).toBe(1);
});
it('refuses media outside the approved origin and does not expose provider errors or credentials', async () => {
  let calls = 0; const driver = createMetaDeliveryDriver({ apiVersion: 'v22.0', allowedMediaOrigins: ['https://media.example'], fetch: async () => { calls++; return Response.json({ error: { code: 190, message: 'private-token-value' } }, { status: 400 }); } });
  await expect(driver.publish({ ...context, job: { ...context.job, imageUrl: 'https://internal.invalid/private' } }, async () => {})).rejects.toThrow(); expect(calls).toBe(0);
  const result = await driver.publish(context, async () => {});
  expect(result).toMatchObject({ status: 'failed', reconnect: true }); expect(JSON.stringify(result)).not.toContain('private-token-value');
});
it('exchanges the code, verifies permissions and discovers only page-linked eligible Instagram destinations', async () => {
  const driver = createMetaOAuth({ appId: '111', appSecret: 'test-only-secret', apiVersion: 'v22.0', redirectUri: 'https://site.example/api/studio/marketing/oauth/callback', permissions: ['pages_manage_posts', 'instagram_content_publish'], now: () => new Date('2026-10-23T00:00:00Z'), fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/oauth/access_token')) return Response.json({ access_token: 'user-test-token', expires_in: 3600000 });
    if (url.pathname.endsWith('/me/permissions')) return Response.json({ data: [{ permission: 'pages_manage_posts', status: 'granted' }, { permission: 'instagram_content_publish', status: 'granted' }] });
    return Response.json({ data: [{ id: '123', name: 'Page', access_token: 'page-test-token', tasks: ['CREATE_CONTENT'], instagram_business_account: { id: '456', username: 'example' } }] });
  } });
  expect(new URL(driver.authorizationUrl('opaque-state')).searchParams.get('state')).toBe('opaque-state');
  const accounts = await driver.exchange('auth-code'); expect(accounts.map(value => value.id)).toEqual(['facebook:123', 'instagram:456']);
  expect(accounts[1]?.token).toBe('page-test-token');
});
it('uses Workers-supported manual redirects and never follows a credential-bearing redirect',async()=>{
 let calls=0;let redirect:RequestRedirect|undefined;
 const fetcher:typeof fetch=async(_url,init)=>{calls++;redirect=init?.redirect;return Response.redirect('https://untrusted.test',302);};
 const oauth=createMetaOAuth({appId:'123',appSecret:'fixture-secret',apiVersion:'v25.0',redirectUri:'https://site.test/callback',permissions:['pages_show_list'],fetch:fetcher});
 await expect(oauth.exchange('fixture-code')).rejects.toThrow();expect(calls).toBe(1);expect(redirect).toBe('manual');
});
