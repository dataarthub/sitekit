import {expect,it} from 'vitest';
import {createStandalonePublicationRequest,verifyStandalonePublication} from './publication.js';
it('authenticates bounded publication events and rejects changed bodies or expired signatures',async()=>{
 const event={contentId:'post',revision:'one',title:'Title',excerpt:'Body',canonicalUrl:'https://site.test/post'};const key=new Uint8Array(32).fill(7);
 const request=await createStandalonePublicationRequest('https://site.test/api/sitekit/publication',event,key);
 expect(await verifyStandalonePublication(request.clone(),key)).toEqual(event);
 expect(await verifyStandalonePublication(new Request(request,{body:JSON.stringify({...event,title:'Other'})}),key)).toBeNull();
 const expired=new Request(request.clone());expired.headers.set('X-Sitekit-Timestamp','1');expect(await verifyStandalonePublication(expired,key)).toBeNull();
 expect(await verifyStandalonePublication(request.clone(),new Uint8Array(32).fill(8))).toBeNull();
});
