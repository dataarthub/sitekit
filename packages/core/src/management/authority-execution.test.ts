import {expect,it} from 'vitest';
import {createAuthorityExecutor} from './authority-execution.js';
it('holds uncertain effects open and refuses replay or effects after owner changes',async()=>{
 let active=true,calls=0;const permits=new Map<string,any>(),finished:any[]=[];
 const control={status:async()=>({scope:{tenantId:'t',siteId:'s'},active,owner:'standalone',epoch:'one'}),issue:async(p:any)=>{if(!active)throw Error('closed');const old=permits.get(p.id);if(old)return {created:false,permit:old};permits.set(p.id,p);return{created:true,permit:p}},finish:async(p:any)=>{finished.push(p)}};
 const executor=createAuthorityExecutor({scope:{tenantId:'t',siteId:'s'},owner:'standalone',control:control as any,proof:async()=> 'verified-proof'});
 await executor.perform({id:'effect',epoch:'one',operation:'publish',fingerprint:'hash'},async()=>{calls++;return{status:'unknown'}},v=>v.status==='unknown');expect(finished[0]).toEqual({id:'effect',outcome:'unknown'});
 await expect(executor.perform({id:'effect',epoch:'one',operation:'publish',fingerprint:'hash'},async()=>{calls++;return{}})).rejects.toMatchObject({code:'conflict'});expect(calls).toBe(1);
 active=false;await expect(executor.perform({id:'other',epoch:'one',operation:'save',fingerprint:'hash'},async()=>{calls++})).rejects.toThrow();expect(calls).toBe(1);
});
