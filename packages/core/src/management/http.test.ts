import { expect, it } from 'vitest';
import { createManagementHttpProvider } from './http.js';
import { ManagementFault } from './errors.js';
it('preserves conflict as a typed fault and never retries a write', async () => {
  let calls = 0;
  const p = createManagementHttpProvider({ origin: 'https://site.test', fetch: async () => { calls++; return Response.json({error:'conflict'}, {status:409}); } });
  await expect(p.settings.saveSettings({ protocolVersion:1,commandId:'one',expectedVersion:'v1',authorityEpoch:'epoch',section:'site',value:{name:'Site',url:'https://site.test'} })).rejects.toMatchObject({code:'conflict'});
  expect(calls).toBe(1);
});
it('rejects malformed settings without exposing unvalidated data', async () => {
  const p = createManagementHttpProvider({ origin: 'https://site.test', fetch: async () => Response.json({}) });
  await expect(p.settings.settings()).rejects.toBeInstanceOf(ManagementFault);
});
it('rejects credential-bearing or foreign transport paths', () => {
  expect(() => createManagementHttpProvider({origin:'https://user:pass@site.test'})).toThrow();
  expect(() => createManagementHttpProvider({origin:'https://site.test',basePath:'//evil.test/'})).toThrow();
});
it('strips credential fields from account projections and rejects unsafe OAuth redirects', async()=>{
 let path='accounts';
 const p=createManagementHttpProvider({origin:'https://site.test',fetch:async()=>Response.json(path==='accounts'?[{id:'page',platform:'facebook',name:'Page',status:'connected',expiresAt:'2027-01-01T00:00:00Z',version:1,accessToken:'must-not-leak'}]:{url:'https://evil.test/login'})});
 expect(await p.marketing.accounts()).toEqual([{id:'page',platform:'facebook',name:'Page',status:'connected',expiresAt:'2027-01-01T00:00:00.000Z',version:1}]);path='connect';
 await expect(p.marketing.connect()).rejects.toMatchObject({code:'unavailable'});
});
it('bounds response bytes and rejects missing response fields',async()=>{
 const p=createManagementHttpProvider({origin:'https://site.test',fetch:async()=>new Response(' '.repeat(1024*1024+1))});
 await expect(p.settings.settings()).rejects.toMatchObject({code:'capacity'});
});
it('uses the same safe connection transport and never retries a conflicting phase',async()=>{
 const calls:string[]=[];const provider=createManagementHttpProvider({origin:'https://site.test',fetch:async(input)=>{calls.push(String(input));return Response.json({error:'conflict'},{status:409})}});
 await expect(provider.connection!.advance({commandId:'one',expectedVersion:'v1',transferId:'move'})).rejects.toMatchObject({code:'conflict'});expect(calls).toEqual(['https://site.test/api/sitekit/management/connection/advance']);
});
