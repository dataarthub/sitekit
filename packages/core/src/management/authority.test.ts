import {expect,it} from 'vitest';
import {createAuthorityRecord,createAuthorityService} from './authority.js';
it('drains durable permits, pauses unknown delivery, and resumes one monotonic handoff without fallback',async()=>{
 let record=createAuthorityRecord({scope:{tenantId:'tenant',siteId:'site'},owner:'standalone',epoch:'first'});const permits=new Map<string,any>();let imports=0,activated=0,online=true;
 const manifest={hash:'a'.repeat(64),sourceRevision:'source-one',cutoff:'2026-10-23T00:00:00Z',counts:{settings:1,posts:1,measurement:3}};
 const peer={inspect:async()=>({revision:'source-one',identity:'site',blocked:false}),preflight:async()=>{},freeze:async()=>manifest,page:async()=>({items:[],next:null}),import:async()=>{imports++;return {id:'ready-one',hash:manifest.hash}},activate:async()=>{if(!online)throw Error('offline');activated++}};
 const service=createAuthorityService({scope:record.scope,store:{read:async()=>structuredClone(record),permit:async id=>permits.get(id)??null,compareAndSwap:async input=>{if(record.version!==input.expectedVersion)return false;record=structuredClone(input.next);if(input.permit)permits.set(input.permit.id,structuredClone(input.permit));return true;}},authorize:async()=>({allowed:true,version:'grant'}),peers:{standalone:peer,eaos:peer},verifyPermit:async(_permit,proof)=>proof==='verified'});
 const p=await service.issue({id:'attempt',owner:'standalone',epoch:'first',operation:'publish:job',fingerprint:'body'});expect(p.created).toBe(true);
 const planned=await service.plan({commandId:'connect',expectedVersion:record.version,authorityEpoch:'first',target:'eaos'});
 let status=await service.advance({commandId:'close',transferId:planned.transferId!,expectedVersion:planned.version});expect(status.phase).toBe('draining');
 await expect(service.issue({id:'new',owner:'standalone',epoch:'first',operation:'post',fingerprint:'body'})).rejects.toMatchObject({code:'unavailable'});
 await service.finish({id:'attempt',outcome:'unknown'});status=await service.status();expect(status.unknownPermits).toBe(1);
 status=await service.advance({commandId:'wait',transferId:planned.transferId!,expectedVersion:status.version});expect(status.phase).toBe('draining');expect(imports).toBe(0);
 await expect(service.finish({id:'attempt',outcome:'completed',proof:'unverified'})).rejects.toMatchObject({code:'forbidden'});
 await service.finish({id:'attempt',outcome:'completed',proof:'verified'});
 for(const commandId of ['freeze','import','commit']){status=await service.status();status=await service.advance({commandId,transferId:planned.transferId!,expectedVersion:status.version});}
 expect(status.owner).toBe('eaos');expect(status.phase).toBe('activating');expect(status.epoch).not.toBe('first');const activationCommand={commandId:'activate',transferId:planned.transferId!,expectedVersion:status.version};online=false;
 await expect(service.advance(activationCommand)).rejects.toThrow();expect((await service.status()).owner).toBe('eaos');expect(activated).toBe(0);
 online=true;status=await service.advance(activationCommand);expect(status.phase).toBe('complete');expect(activated).toBe(1);
 const replay=await service.advance(activationCommand);expect(replay.owner).toBe('eaos');expect(activated).toBe(1);
 await expect(service.issue({id:'old',owner:'standalone',epoch:'first',operation:'publish',fingerprint:'body'})).rejects.toMatchObject({code:'conflict'});
});
it('rejects divergent destination and changed replay input before closing source admissions',async()=>{
 let r=createAuthorityRecord({scope:{tenantId:'t',siteId:'s'},owner:'standalone',epoch:'one'});const peer={inspect:async()=>({revision:'one',identity:'site',blocked:false}),preflight:async()=>{throw Error('divergent')},freeze:async()=>{throw Error('must not freeze')},page:async()=>({items:[],next:null}),import:async()=>{throw Error('must not import')},activate:async()=>{}};
 const s=createAuthorityService({scope:r.scope,store:{read:async()=>r,permit:async()=>null,compareAndSwap:async i=>{r=i.next;return true}},authorize:async()=>({allowed:true,version:'grant'}),peers:{standalone:peer,eaos:peer},verifyPermit:async()=>false});
 await expect(s.plan({commandId:'plan',expectedVersion:r.version,authorityEpoch:'one',target:'eaos'})).rejects.toThrow();expect(r.status).toBe('active');
});
