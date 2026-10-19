import {test,expect,vi} from 'vitest';
import {SiteKitError} from './index.js';
import {defineSite} from '../config/index.js';
import {createSiteAstroConfig} from '../build/index.js';
import {createCmsSnapshotReader} from '../content/cms-loader.js';
const snapshot={siteId:'example',revision:1,posts:[],assets:[]};
test('coded errors preserve Error compatibility, original cause and actionable diagnostics',()=>{
 const cause=new TypeError('original');const error=new SiteKitError('SK_CONFIG_INVALID','Invalid site configuration',{cause});
 expect(error).toBeInstanceOf(Error);expect(error.name).toBe('SiteKitError');expect(error.cause).toBe(cause);
 expect(error.code).toBe('SK_CONFIG_INVALID');expect(error.hint.length).toBeGreaterThan(10);
 expect(error.docs).toBe('https://tech-docs.alneas.com/sitekit/docs/errors/#sk_config_invalid');
 expect(error.message).toContain('[SK_CONFIG_INVALID]');expect(error.message).toContain(error.docs);
});
test('invalid configuration has a stable code without echoing credential values',()=>{
 try{defineSite({id:'example',content:{endpoint:'https://user:secret@example.com'}});expect.unreachable();}
 catch(error){expect(error).toBeInstanceOf(SiteKitError);expect(error).toMatchObject({code:'SK_CONFIG_INVALID'});expect((error as Error).message).not.toContain('secret');}
});
test('snapshot identity and revision errors remain pinned and never run the renderer',async()=>{
 const configure=vi.fn(()=>({}));
 await expect(createSiteAstroConfig({id:'different',content:{snapshot}},configure)).rejects.toMatchObject({code:'SK_SITE_ID_MISMATCH'});
 await expect(createSiteAstroConfig({id:'example',revision:2,content:{snapshot}},configure)).rejects.toMatchObject({code:'SK_REVISION_MISMATCH'});
 expect(configure).not.toHaveBeenCalled();
});
test('read errors retain their cause and a failed reader never silently refetches',async()=>{
 const failure=new TypeError('offline');const fetcher=vi.fn(async()=>{throw failure;});
 const read=createCmsSnapshotReader(()=>({siteId:'example',endpoint:'https://example.com/snapshot'}),fetcher);
 await expect(read()).rejects.toMatchObject({code:'SK_CONTENT_READ_FAILED',cause:failure});
 await expect(read()).rejects.toMatchObject({code:'SK_CONTENT_READ_FAILED'});expect(fetcher).toHaveBeenCalledTimes(1);
 await expect(createCmsSnapshotReader(()=>({siteId:'example',file:'/nonexistent-sitekit-fixture.json'}))()).rejects.toMatchObject({code:'SK_CONTENT_READ_FAILED',cause:{code:'ENOENT'}});
});
test('malformed JSON and malformed publications have a snapshot error code',async()=>{
 for(const response of [new Response('{invalid'),Response.json({siteId:'example',revision:0})]){
  await expect(createCmsSnapshotReader(()=>({siteId:'example',endpoint:'https://example.com/snapshot'}),async()=>response)()).rejects.toMatchObject({code:'SK_SNAPSHOT_INVALID'});
 }
});
test('image failures distinguish missing hash, changed bytes and unavailable assets',async()=>{
 const image={id:'image',cdnUrl:'https://example.com/image.png',mimeType:'image/png',sha256:'a'.repeat(64)};
 const build=(asset:object,fetcher:typeof fetch)=>createSiteAstroConfig({id:'example',content:{snapshot:{...snapshot,assets:[asset]}}},()=>({}),{fetch:fetcher});
 await expect(build({...image,sha256:undefined},async()=>new Response('x'))).rejects.toMatchObject({code:'SK_IMAGE_HASH_MISSING'});
 await expect(build(image,async()=>new Response('changed'))).rejects.toMatchObject({code:'SK_IMAGE_HASH_MISMATCH'});
 await expect(build(image,async()=>new Response('',{status:404}))).rejects.toMatchObject({code:'SK_IMAGE_FETCH_FAILED'});
 await expect(build(image,async()=>new Response('',{headers:{'content-length':String(26*1024*1024)}}))).rejects.toMatchObject({code:'SK_IMAGE_TOO_LARGE'});
});
test('host callbacks retain their original error identity',async()=>{
 const failure=new Error('host renderer');
 await expect(createSiteAstroConfig({id:'example',content:{snapshot}},()=>{throw failure;})).rejects.toBe(failure);
 await expect(createCmsSnapshotReader(()=>{throw failure;})()).rejects.toBe(failure);
});
