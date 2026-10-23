import {z} from 'zod';
import type {PublicationEvent} from './social/types.js';
const eventSchema=z.strictObject({contentId:z.string().trim().min(1).max(160),revision:z.string().trim().min(1).max(160),title:z.string().max(500),excerpt:z.string().max(16000),canonicalUrl:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}),imageUrl:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}).optional()});
const bytes=(url:URL,time:string,body:string)=>new TextEncoder().encode('POST\n'+url.origin+url.pathname+'\n'+time+'\n'+body);
const cryptoKey=(key:Uint8Array)=>{if(key.length!==32)throw Error('32-byte publication key required');return crypto.subtle.importKey('raw',new Uint8Array(key),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);};
/**
 * Signs one trusted successful-publication notification. Send only after the content is actually public.
 * @param endpoint - Exact HTTPS endpoint, or loopback HTTP during local acceptance.
 * @param event - Stable content/revision and canonical content data.
 * @param key - Server-only 32-byte publication signing key.
 * @returns POST request with a five-minute authenticated envelope; repeated revisions deduplicate.
 * @example
 * import { createStandalonePublicationRequest } from '@alneas/sitekit-cloudflare/standalone';
 * export const sign = (...args: Parameters<typeof createStandalonePublicationRequest>) => createStandalonePublicationRequest(...args);
 */
export async function createStandalonePublicationRequest(endpoint:string,event:PublicationEvent,key:Uint8Array):Promise<Request>{
 const url=new URL(endpoint);if(url.pathname!=='/api/sitekit/publication'||url.search||url.hash||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw Error('Invalid publication endpoint');
 const body=JSON.stringify(eventSchema.parse(event)),time=String(Math.floor(Date.now()/1000));const signature=await crypto.subtle.sign('HMAC',await cryptoKey(key),bytes(url,time,body));
 return new Request(url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','X-Sitekit-Timestamp':time,'X-Sitekit-Signature':Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('')},body});
}
/**
 * Checks the publication HMAC before parsing its bounded payload; never logs credential or body data.
 * @param request - Incoming notification.
 * @param key - Server-only 32-byte key configured for the trusted publisher.
 * @returns Proven event or null; this does not grant the publisher's live site permission.
 * @example
 * import { verifyStandalonePublication } from '@alneas/sitekit-cloudflare/standalone';
 * export const verify = (...args: Parameters<typeof verifyStandalonePublication>) => verifyStandalonePublication(...args);
 */
export async function verifyStandalonePublication(request:Request,key:Uint8Array):Promise<PublicationEvent|null>{
 try{
  const url=new URL(request.url),time=request.headers.get('X-Sitekit-Timestamp')??'',signature=request.headers.get('X-Sitekit-Signature')??'';
  if(request.method!=='POST'||url.pathname!=='/api/sitekit/publication'||url.search||!/^\d{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>300||!/^([a-f0-9]{2}){32}$/.test(signature)||!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return null;
  const reader=request.body?.getReader();if(!reader)return null;let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>128*1024){await reader.cancel();return null;}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
  if(!await crypto.subtle.verify('HMAC',await cryptoKey(key),Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16)),bytes(url,time,body)))return null;
  return parsePublicationEvent(JSON.parse(body));
 }catch{return null;}
}
export const parsePublicationEvent=(input:unknown):PublicationEvent=>{const {imageUrl,...event}=eventSchema.parse(input);return {...event,...(imageUrl===undefined?{}:{imageUrl})};};
