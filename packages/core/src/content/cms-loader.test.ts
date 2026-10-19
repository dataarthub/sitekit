import {test,expect} from 'vitest';
import {createCmsSnapshotReader} from './cms-loader.js';
import {parsePublishedSnapshot} from './eaos-cms.js';
const snapshot={siteId:'hotel-preview',revision:1,posts:[],assets:[{id:'image',cdnUrl:'https://assets.example.com/a.webp',mimeType:'image/webp',width:10,height:20,altJa:'庭',altEn:'Garden',category:'facility'}]};
test('snapshot asset transport preserves localized alt and category but rejects private object keys',()=>{
 expect(parsePublishedSnapshot(snapshot).assets?.[0]).toMatchObject({altJa:'庭',altEn:'Garden',category:'facility'});
 expect(()=>parsePublishedSnapshot({...snapshot,assets:[{...snapshot.assets[0],objectKey:'private/key'}]})).toThrow('Private EAOS');
});
test('publication reader freezes a successful source, preserves assets and sends independent tenant identity',async()=>{
 let count=0;const read=createCmsSnapshotReader(()=>({endpoint:'https://cms.example.com',siteId:'hotel-preview',headers:{'X-Tenant-Id':'tenant-preview'}}),async(_url,init)=>{count++;expect((init?.headers as Record<string,string>)['X-Tenant-Id']).toBe('tenant-preview');return Response.json(snapshot);});
 const first=await read();expect(await read()).toBe(first);expect(count).toBe(1);
});
test('configured foreign publications, unavailable sources and unapproved draft markers fail',async()=>{
 for(const body of [{...snapshot,siteId:'other'}, {...snapshot,preview:{kind:'draft',expiresAt:'2099-01-01T00:00:00Z'}}]){
  const read=createCmsSnapshotReader(()=>({endpoint:'https://cms.example.com',siteId:'hotel-preview'}),async()=>Response.json(body));await expect(read()).rejects.toThrow();
 }
 const unavailable=createCmsSnapshotReader(()=>({endpoint:'https://cms.example.com',siteId:'hotel-preview'}),async()=>new Response('',{status:503}));await expect(unavailable()).rejects.toThrow('503');
 expect(await createCmsSnapshotReader(()=>({}))()).toBeNull();
});
test('build-pinned DTO never rereads a moving endpoint and still validates the publication',async()=>{
 const read=createCmsSnapshotReader(()=>({snapshot,siteId:snapshot.siteId,endpoint:'https://cms.example.com'}),async()=>{throw Error('Must not refetch during the build');});
 const first=await read();expect(first?.revision).toBe(1);expect(await read()).toBe(first);
 await expect(createCmsSnapshotReader(()=>({snapshot,siteId:'foreign'}))()).rejects.toThrow('siteId mismatch');
 await expect(createCmsSnapshotReader(()=>({snapshot:{...snapshot,preview:{kind:'draft',expiresAt:'2099-01-01'}},siteId:snapshot.siteId}))()).rejects.toThrow('draft preview');
});

test('revision expectations are checked once and failed reads never drift to a newer publication',async()=>{
 let requests=0;
 const read=createCmsSnapshotReader(()=>({endpoint:'https://cms.example.com',siteId:snapshot.siteId,revision:2}),async()=>{
  requests++;return Response.json({...snapshot,revision:requests});
 });
 await expect(read()).rejects.toThrow('revision mismatch');
 await expect(read()).rejects.toThrow('revision mismatch');
 expect(requests).toBe(1);
 const parsed=parsePublishedSnapshot({...snapshot,assets:[{...snapshot.assets[0],sha256:'a'.repeat(64)}]});
 expect(parsed.assets?.[0]?.sha256).toBe('a'.repeat(64));
});
