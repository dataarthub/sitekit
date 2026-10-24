import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../../marketing/testing.test.js';
import {createSettingsRecord} from '@alneas/sitekit/management';
import {managementSchemaSql,initializeD1ManagementSettings} from '../../management/store.js';
import {createD1SocialStore,socialStateSchemaSql} from './store.js';
import {createSocialService} from './social.js';
import {createSecretBox} from './secrets.js';
it('persists encrypted accounts and admits one delivery per destination under concurrent runners',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const binding=sqliteBinding(db),scope={tenantId:'tenant',siteId:'site'};
 db.exec(managementSchemaSql+socialStateSchemaSql);
 await initializeD1ManagementSettings(binding,createSettingsRecord({scope,authority:{kind:'standalone',epoch:'epoch',status:'active'},values:{site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}}}));
 db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','runner','grant',1);
 const store=createD1SocialStore({database:binding,scope,admission:{subject:'runner',version:'grant',epoch:'epoch'}});let delivered=0;let time=Date.parse('2026-10-23T01:00:00Z');
 const service=createSocialService({store,actor:{...scope,userId:'runner'},allowedMediaOrigins:['https://media.test'],publicationOrigin:'https://site.test',authorize:async()=>true,publicationRule:async()=>({enabled:true,accountIds:['facebook:123'],requiresApproval:true}),now:()=>new Date(time),secrets:createSecretBox({currentKeyId:'one',keys:{one:new Uint8Array(32).fill(7)}}),oauth:{authorizationUrl:state=>'https://www.facebook.com/oauth?state='+state,exchange:async()=>[{id:'facebook:123',platform:'facebook',externalId:'123',name:'Page',token:'fixture-sensitive-token',expiresAt:'2027-01-01T00:00:00Z'}]},driver:{publish:async(_c,checkpoint)=>{await checkpoint({phase:'dispatching'});delivered++;return{status:'published',externalId:'123_456'};},reconcile:async()=>({status:'unknown'})}});
 const start=await service.connect();await service.completeConnect({state:new URL(start.url).searchParams.get('state')!,code:'fixture'});
 await service.createPost({idempotencyKey:'first',accountIds:['facebook:123'],text:'Hello',scheduledAt:'2026-10-23T02:00:00Z'});
 await service.runDue();expect(delivered).toBe(0);time+=3600000;await Promise.all([service.runDue(),service.runDue()]);expect(delivered).toBe(1);
 expect(JSON.stringify(await store.read())).not.toContain('fixture-sensitive-token');expect((await service.jobs())[0]?.status).toBe('published');
 await service.onPublished({contentId:'one',revision:'one',title:'Title',excerpt:'Body',canonicalUrl:'https://site.test/post'});expect((await service.jobs()).some(j=>j.status==='draft')).toBe(true);
 }finally{db.close();}
});
it('captures publication destinations once even when an event is retried after policy changes',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const binding=sqliteBinding(db),scope={tenantId:'tenant',siteId:'site'};db.exec(managementSchemaSql+socialStateSchemaSql);
 await initializeD1ManagementSettings(binding,createSettingsRecord({scope,authority:{kind:'standalone',epoch:'epoch',status:'active'},values:{site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}}}));db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','publisher','grant',1);
 const store=createD1SocialStore({database:binding,scope,admission:{subject:'publisher',version:'grant',epoch:'epoch'}});let policy={enabled:true,accountIds:['facebook:123'],requiresApproval:true};
 const service=createSocialService({store,actor:{...scope,userId:'publisher'},allowedMediaOrigins:['https://media.test'],publicationOrigin:'https://site.test',authorize:async()=>true,publicationRule:async()=>policy,secrets:createSecretBox({currentKeyId:'one',keys:{one:new Uint8Array(32).fill(1)}}),oauth:{authorizationUrl:state=>'https://www.facebook.com/oauth?state='+state,exchange:async()=>[{id:'facebook:123',externalId:'123',platform:'facebook',name:'Page',token:'fixture',expiresAt:'2027-01-01T00:00:00Z'},{id:'instagram:456',externalId:'456',platform:'instagram',name:'IG',token:'fixture',expiresAt:'2027-01-01T00:00:00Z'}]},driver:{publish:async()=>({status:'unknown'}),reconcile:async()=>({status:'unknown'})}});
 const c=await service.connect();await service.completeConnect({state:new URL(c.url).searchParams.get('state')!,code:'fixture'});
 const event={contentId:'post',revision:'one',title:'Title',excerpt:'Body',canonicalUrl:'https://site.test/post',imageUrl:'https://media.test/photo.jpg'};
 await service.onPublished(event);policy={...policy,accountIds:['facebook:123','instagram:456']};await service.onPublished(event);expect(await service.jobs()).toHaveLength(1);
 await expect(service.onPublished({...event,title:'Changed same revision'})).rejects.toMatchObject({code:'conflict'});
 }finally{db.close();}
});
