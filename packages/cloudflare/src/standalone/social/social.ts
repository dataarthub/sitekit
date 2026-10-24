import { parseSocialPost } from '@alneas/sitekit/management';
import type { SocialJob, SocialPostInput } from '@alneas/sitekit/management';
import { ConsoleFault, type ConnectedAccount, type PublicationEvent, type SocialDeliveryResult, type SocialService, type SocialServiceOptions, type SocialState, type StoredSocialJob } from './types.js';

const sha = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), value => value.toString(16).padStart(2, '0')).join('');
const instant = (time: number) => new Date(time).toISOString();
const safeUrl = (value: string) => { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new ConsoleFault('invalid'); return url; };

/** Same state machine and operations over standalone D1 or EAOS record storage. */
export function createSocialService(options: SocialServiceOptions): SocialService {
  const actor = Object.freeze({ ...options.actor });
  if (actor.tenantId !== options.store.scope.tenantId || actor.siteId !== options.store.scope.siteId || !actor.userId) throw new ConsoleFault('forbidden');
  const now = () => { const time = (options.now?.() ?? new Date()).getTime(); if (!Number.isFinite(time)) throw new ConsoleFault('unavailable'); return time; };
  const allow = async (operation: Parameters<SocialServiceOptions['authorize']>[0], accountId?: string) => { if (await options.authorize(operation, accountId) !== true) throw new ConsoleFault('forbidden'); };
  const context = (accountId: string) => JSON.stringify([actor.tenantId, actor.siteId, accountId]);
  const transaction = async <T>(work: (state: SocialState) => T): Promise<T> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await options.store.read();
      const state = structuredClone(current.value);
      const result = work(state);
      if (await options.store.compareAndSwap(current.revision, state) === true) return structuredClone(result);
    }
    throw new ConsoleFault('conflict');
  };
  const checkAccount = (state: SocialState, id: string) => {
    const account = state.accounts.find(value => value.view.id === id);
    if (!account || account.view.status !== 'connected' || !account.secret || Date.parse(account.view.expiresAt) <= now()) throw new ConsoleFault('conflict');
    return account;
  };
  const credentials = async (record: SocialState['accounts'][number]): Promise<ConnectedAccount> => ({ id: record.view.id, platform: record.view.platform, externalId: record.externalId, name: record.view.name, token: await options.secrets.open(record.secret!, context(record.view.id)), expiresAt: record.view.expiresAt });
  const findJob = (state: SocialState, id: string, version?: number) => {
    const job = state.jobs.find(value => value.view.id === id);
    if (!job || (version !== undefined && job.view.version !== version)) throw new ConsoleFault('conflict');
    return job;
  };
  const settle = async (id: string, attemptId: string, result: SocialDeliveryResult): Promise<SocialJob> => transaction(state => {
    const job = findJob(state, id);
    if (job.attemptId !== attemptId || !['publishing', 'unknown'].includes(job.view.status)) throw new ConsoleFault('conflict');
    delete job.leaseUntil;
    delete job.view.nextAttemptAt;
    if (result.status === 'published') {
      job.view.status = 'published'; job.view.publishedAt = instant(now()); delete job.view.errorCode;
      if (result.externalId) job.view.externalId = result.externalId;
      if (result.externalUrl) { safeUrl(result.externalUrl); job.view.externalUrl = result.externalUrl; }
    } else {
      job.view.errorCode = result.errorCode && /^[a-z0-9_]{1,64}$/.test(result.errorCode) ? result.errorCode : result.status;
      job.view.status = result.status === 'unknown' ? 'unknown' : result.status === 'failed' || job.view.attempt >= 5 ? 'failed' : 'retry_wait';
      if (job.view.status === 'retry_wait') {
        job.view.nextAttemptAt = instant(now() + Math.min(3600000, 30000 * 2 ** Math.min(job.view.attempt, 6)));
        if (job.progress?.containerId) job.progress.phase = 'prepared'; else delete job.progress;
      }
      if (result.status === 'failed' && result.errorCode === 'container_expired') delete job.progress;
      if (result.reconnect) { const account = state.accounts.find(a => a.view.id === job.view.accountId); if (account) { account.view.status = 'reconnect_required'; account.view.version++; } }
    }
    job.view.version++;
    return job.view;
  });
  const dispatch = async (id: string) => {
    await allow('publish');
    const claim = await transaction(state => {
      const job = findJob(state, id), due = job.view.nextAttemptAt ?? job.view.scheduledAt ?? job.view.createdAt;
      if (!['queued', 'scheduled', 'retry_wait'].includes(job.view.status) || Date.parse(due) > now()) return null;
      let account;
      try { account = checkAccount(state, job.view.accountId); }
      catch { job.view.status = 'failed'; job.view.errorCode = 'reconnect_required'; job.view.version++; return null; }
      job.view.status = 'publishing'; job.view.attempt++; job.view.version++;
      job.attemptId = crypto.randomUUID(); job.leaseUntil = instant(now() + 120000); job.accountVersion = account.view.version;
      return { job, account };
    });
    if (!claim) return;
    let result: SocialDeliveryResult; let dispatched = false;
    try {
      await allow('publish', claim.job.view.accountId);
      result = await options.driver.publish({ attemptId:claim.job.attemptId!, account: await credentials(claim.account), job: claim.job.view, ...(claim.job.progress ? { progress: claim.job.progress } : {}) }, async progress => {
        await allow('publish', claim.job.view.accountId);
        await transaction(state => {
          const job = findJob(state, id), account = checkAccount(state, job.view.accountId);
          if (job.attemptId !== claim.job.attemptId || job.view.status !== 'publishing' || account.view.version !== job.accountVersion) throw new ConsoleFault('conflict');
          job.progress = structuredClone(progress);
        });
        if (progress.phase === 'dispatching') dispatched = true;
      });
    } catch { result = { status: dispatched ? 'unknown' : 'failed', errorCode: dispatched ? 'delivery_interrupted' : 'delivery_not_started' }; }
    await settle(id, claim.job.attemptId!, result);
  };
  const create = async (input: SocialPostInput, approval = false): Promise<SocialJob[]> => {
    await allow('post');
    const value = parseSocialPost(input);
    if (value.imageUrl && !options.allowedMediaOrigins.includes(safeUrl(value.imageUrl).origin)) throw new ConsoleFault('invalid');
    for (const id of value.accountIds) await allow('post', id);
    const { accountIds: _destinations, ...content } = value;
    const fingerprint = await sha(JSON.stringify(content));
    return transaction(state => value.accountIds.map(accountId => {
      const requestKey = JSON.stringify([value.idempotencyKey, accountId]);
      const existing = state.jobs.find(job => job.requestKey === requestKey);
      if (existing) { if (existing.fingerprint !== fingerprint) throw new ConsoleFault('conflict'); return existing.view; }
      const account = checkAccount(state, accountId);
      if (account.view.platform === 'instagram' && (!value.imageUrl || [...value.text].length > 2200)) throw new ConsoleFault('invalid');
      if (value.scheduledAt && Date.parse(value.scheduledAt) <= now()) throw new ConsoleFault('invalid');
      const view: SocialJob = { id: crypto.randomUUID(), version: 1, accountId, platform: account.view.platform, text: value.text, status: approval ? 'draft' : value.scheduledAt ? 'scheduled' : 'queued', createdAt: instant(now()), attempt: 0, ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}), ...(value.scheduledAt ? { scheduledAt: value.scheduledAt } : {}) };
      state.jobs.push({ view, requestKey, fingerprint }); return view;
    }));
  };
  const service: SocialService = {
    scope: Object.freeze({ tenantId: actor.tenantId, siteId: actor.siteId }),
    async accounts() {
      await allow('read');
      return (await options.store.read()).value.accounts.map(account => ({ ...account.view, status: account.view.status === 'connected' && Date.parse(account.view.expiresAt) <= now() ? 'reconnect_required' : account.view.status }));
    },
    async connect() {
      await allow('connect');
      const state = crypto.randomUUID(), hash = await sha(state);
      await transaction(value => { value.oauth = value.oauth.filter(entry => Date.parse(entry.expiresAt) > now()); value.oauth.push({ hash, userId: actor.userId, expiresAt: instant(now() + 600000) }); });
      return { url: options.oauth.authorizationUrl(state) };
    },
    async completeConnect(input) {
      await allow('connect');
      if (!input.state || input.state.length > 160 || !input.code || input.code.length > 4096) throw new ConsoleFault('invalid');
      const hash = await sha(input.state);
      await transaction(state => { const index = state.oauth.findIndex(entry => entry.hash === hash && entry.userId === actor.userId && Date.parse(entry.expiresAt) > now()); if (index < 0) throw new ConsoleFault('forbidden'); state.oauth.splice(index, 1); });
      const accounts = await options.oauth.exchange(input.code);
      if (!accounts.length || accounts.length > 20 || new Set(accounts.map(account => account.id)).size !== accounts.length) throw new ConsoleFault('invalid');
      const encrypted = await Promise.all(accounts.map(async account => {
        if (!['facebook', 'instagram'].includes(account.platform) || !/^\d+$/.test(account.externalId) || account.id !== account.platform + ':' + account.externalId || !account.token.trim() || account.token.length > 16384 || !Number.isFinite(Date.parse(account.expiresAt)) || Date.parse(account.expiresAt) <= now()) throw new ConsoleFault('invalid');
        return { account, secret: await options.secrets.seal(account.token, context(account.id)) };
      }));
      await allow('connect');
      await transaction(state => { for (const { account, secret } of encrypted) { const existing = state.accounts.find(entry => entry.view.id === account.id); const next = { view: { id: account.id, platform: account.platform, name: account.name, status: 'connected' as const, expiresAt: account.expiresAt, version: (existing?.view.version ?? 0) + 1 }, externalId: account.externalId, secret }; if (existing) Object.assign(existing, next); else state.accounts.push(next); } });
    },
    async disconnect(id, version) {
      await allow('disconnect', id);
      await transaction(state => {
        const account = state.accounts.find(entry => entry.view.id === id); if (!account || account.view.version !== version) throw new ConsoleFault('conflict');
        account.secret = null; account.view.status = 'disconnected'; account.view.version++;
        for (const job of state.jobs.filter(job => job.view.accountId === id && !['published', 'cancelled'].includes(job.view.status))) { job.view.status = job.view.status === 'publishing' || job.view.status === 'unknown' ? 'unknown' : job.view.status === 'draft' ? 'draft' : 'failed'; job.view.errorCode = 'reconnect_required'; job.view.version++; }
      });
    },
    async jobs() { await allow('read'); return (await options.store.read()).value.jobs.map(job => structuredClone(job.view)); },
    createPost: input => create(input),
    async jobAction(id, version, action) {
      const operation = action === 'reconcile' ? 'reconcile' : 'post';
      await allow(operation);
      const target = findJob((await options.store.read()).value, id, version);
      await allow(operation, target.view.accountId);
      if (action === 'reconcile') {
        const claim = await transaction(state => { const job = findJob(state, id, version); if (job.view.status !== 'unknown' || !job.attemptId) throw new ConsoleFault('conflict'); const account = checkAccount(state, job.view.accountId); job.view.status = 'publishing'; job.view.version++; job.leaseUntil = instant(now() + 120000); return { job, account }; });
        let result: SocialDeliveryResult;
        try { result = await options.driver.reconcile({ attemptId:claim.job.attemptId!, account: await credentials(claim.account), job: claim.job.view, ...(claim.job.progress ? { progress: claim.job.progress } : {}) }); } catch { result = { status: 'unknown' }; }
        return settle(id, claim.job.attemptId!, result);
      }
      return transaction(state => {
        const job = findJob(state, id, version);
        if (action === 'cancel') { if (!['draft', 'queued', 'scheduled', 'retry_wait', 'failed'].includes(job.view.status)) throw new ConsoleFault('conflict'); job.view.status = 'cancelled'; }
        else if (action === 'approve') { if (job.view.status !== 'draft') throw new ConsoleFault('conflict'); checkAccount(state, job.view.accountId); job.view.status = job.view.scheduledAt ? 'scheduled' : 'queued'; }
        else if (action === 'retry') { if (!['failed', 'retry_wait'].includes(job.view.status)) throw new ConsoleFault('conflict'); checkAccount(state, job.view.accountId); job.view.status = 'queued'; job.view.attempt = 0; delete job.view.nextAttemptAt; delete job.view.scheduledAt; }
        else throw new ConsoleFault('invalid');
        job.view.version++; return job.view;
      });
    },
    async onPublished(event: PublicationEvent) {
      await allow('post');
      if (!event.contentId || !event.revision || !options.publicationOrigin || safeUrl(event.canonicalUrl).origin !== new URL(options.publicationOrigin).origin) throw new ConsoleFault('invalid');
      const key = await sha(JSON.stringify([event.contentId, event.revision]));
      const fingerprint = await sha(JSON.stringify([event.title,event.excerpt,event.canonicalUrl,event.imageUrl??null]));
      const rule = await options.publicationRule();
      const captured = await transaction(state => {
        const existing = state.publications.find(p=>p.key===key);
        if(existing){if(existing.fingerprint!==fingerprint)throw new ConsoleFault('conflict');return existing;}
        const input: SocialPostInput | null = rule.enabled ? {idempotencyKey:'publication-'+key,accountIds:[...rule.accountIds],text:[event.title,event.excerpt,event.canonicalUrl].filter(Boolean).join('\n\n'),...(event.imageUrl?{imageUrl:event.imageUrl}:{})} : null;
        const value={key,fingerprint,input,requiresApproval:rule.requiresApproval};state.publications.push(value);return value;
      });
      return captured.input ? create(captured.input,captured.requiresApproval) : [];

    },
    async runDue(limit = 10) {
      await allow('run'); if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ConsoleFault('invalid');
      await transaction(state => { for (const job of state.jobs) if (job.view.status === 'publishing' && job.leaseUntil && Date.parse(job.leaseUntil) <= now()) { job.view.status = job.progress?.phase === 'dispatching' ? 'unknown' : 'queued'; job.view.errorCode = 'delivery_interrupted'; job.view.version++; delete job.leaseUntil; delete job.view.nextAttemptAt; delete job.view.scheduledAt; } });
      const jobs = (await options.store.read()).value.jobs.filter(job => ['queued', 'scheduled', 'retry_wait'].includes(job.view.status) && Date.parse(job.view.nextAttemptAt ?? job.view.scheduledAt ?? job.view.createdAt) <= now()).slice(0, limit);
      for (const job of jobs) await dispatch(job.view.id);
    },
  };
  return service;
}
