import { ConsoleFault } from './types.js';
export type MetaReply = { ok: true; data: Record<string, unknown> } | { ok: false; kind: 'retry' | 'reconnect' | 'rejected' | 'unknown' };
export async function boundedMetaJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader(); if (!reader) throw new ConsoleFault('unavailable');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 128 * 1024) { await reader.cancel(); throw new ConsoleFault('capacity'); } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConsoleFault('unavailable');
  return value as Record<string, unknown>;
}
export function metaVersion(version: string): string { if (!/^v\d{1,3}\.\d{1,2}$/.test(version)) throw new ConsoleFault('invalid'); return version; }
export function metaNode(id: string): string { if (!/^\d+(?:_\d+)?$/.test(id)) throw new ConsoleFault('invalid'); return id; }
export async function metaRequest(url: URL, token: string, method: 'GET' | 'POST', fetcher: typeof fetch, body?: Record<string, unknown>): Promise<MetaReply> {
  try {
    const response = await fetcher(url.href, { method, redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if(response.status>=300&&response.status<400)return {ok:false,kind:'unknown'};
    const data = await boundedMetaJson(response);
    const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : null;
    if (error?.code === 190) return { ok: false, kind: 'reconnect' };
    if (response.status === 429 || error?.code === 4 || error?.code === 17 || error?.code === 32) return { ok: false, kind: 'retry' };
    if (response.status >= 500) return { ok: false, kind: 'unknown' };
    if (!response.ok || error) return { ok: false, kind: 'rejected' };
    return { ok: true, data };
  } catch { return { ok: false, kind: 'unknown' }; }
}
