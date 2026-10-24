import {expect,it} from 'vitest';
import {createSettingsRecord} from '@alneas/sitekit/management';
import {createSecretBox} from '../standalone/social/secrets.js';
import {createSiteTransferPeer} from './transfer-peer.js';
it('stages encrypted credentials idempotently, rejects divergent targets and activates only under the committed owner/epoch',async()=>{
 const scope={tenantId:'t',siteId:'s'},root=createSettingsRecord({scope,authority:{kind:'standalone',epoch:'one',status:'active'},values:{site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'UTC'},reporting:{currency:'JPY'}}});
 const sourceBox=createSecretBox({currentKeyId:'source',keys:{source:new Uint8Array(32).fill(1)}}),targetBox=createSecretBox({currentKeyId:'target',keys:{target:new Uint8Array(32).fill(2)}}),aad=JSON.stringify(['t','s','facebook:1']);
 let source:any=[{kind:'settings',key:'root',value:root},{kind:'account',key:'facebook:1',value:{view:{id:'facebook:1',platform:'facebook',name:'Page',status:'connected',expiresAt:'2099-01-01T00:00:00Z',version:1},externalId:'1',secret:await sourceBox.seal('token',aad)}}],target:any=null,owner='standalone',epoch='one',activations=0;
 const archive=()=>{const m=new Map<string,any>();return {read:async(id:string,key:string)=>m.get(id+':'+key)??null,write:async(id:string,key:string,value:any,replace=false)=>{const k=id+':'+key;if(!replace&&m.has(k))return m.get(k);m.set(k,structuredClone(value));return value}}};
 const make=(kind:'standalone'|'eaos',box:any,data:any,store:any)=>createSiteTransferPeer({scope,owner:kind,secrets:box,archive:store,data,control:async()=>({owner,epoch,phase:'activating',transferId:'transfer'}),sealTarget:(token,context)=>targetBox.seal(token,context)});
 const a=make('standalone',sourceBox,{read:async()=>source,pause:async()=>{source[0].value.snapshot.authority.status='paused'},activate:async()=>{}},archive());
 const b=make('eaos',targetBox,{read:async()=>target,pause:async()=>{},activate:async(_id,items)=>{target=items;activations++}},archive());
 const inventory=await a.inspect();await b.preflight('transfer',inventory);const manifest=await a.freeze('transfer',inventory.revision);expect(await a.freeze('transfer',inventory.revision)).toEqual(manifest);
 const receipts=await Promise.all([b.import('transfer',manifest,cursor=>a.page('transfer',cursor)),b.import('transfer',manifest,cursor=>a.page('transfer',cursor))]);expect(receipts[0]!.id).toBe(receipts[1]!.id);const ready=receipts[1]!;expect(target).toBeNull();await expect(b.activate('transfer','two',ready.id)).rejects.toMatchObject({code:'conflict'});
 owner='eaos';epoch='two';await b.activate('transfer','two',ready.id);await b.activate('transfer','two',ready.id);expect(activations).toBe(1);expect(target.find((i:any)=>i.kind==='settings').value.snapshot.authority).toEqual({kind:'eaos',epoch:'two',status:'active'});
 const account=target.find((item:any)=>item.kind==='account').value;expect(await targetBox.open(account.secret,aad)).toBe('token');expect(account.secret.keyId).toBe('target');
 await expect(b.preflight('other',{...inventory,revision:'other'})).rejects.toMatchObject({code:'conflict'});
});
