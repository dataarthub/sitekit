import { expect,it } from 'vitest';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createAccessAuthenticator} from './auth.js';
it('verifies signed human identity and rejects expired, foreign and spoofed assertions',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const key={...await exportJWK(publicKey),kid:'test'};
 const auth=createAccessAuthenticator({issuer:'https://example.cloudflareaccess.com',audience:'sitekit-audience',keySet:{keys:[key]}});
 const sign=(aud='sitekit-audience',exp='5m',issuer='https://example.cloudflareaccess.com')=>new SignJWT({type:'app',email:'editor@example.test'}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('editor').setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
 expect(await auth(new Request('https://site.test',{headers:{'Cf-Access-Jwt-Assertion':await sign()}}))).toEqual({subject:'editor'});
 for(const token of [await sign('other'),await sign('sitekit-audience','-1m'),await sign('sitekit-audience','5m','https://other.cloudflareaccess.com'),'invalid'])expect(await auth(new Request('https://site.test',{headers:{'Cf-Access-Jwt-Assertion':token}}))).toBeNull();
 expect(await auth(new Request('https://site.test',{headers:{'Cf-Access-Authenticated-User-Email':'editor@example.test'}}))).toBeNull();
 const noExpiry=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('editor').setIssuer('https://example.cloudflareaccess.com').setAudience('sitekit-audience').sign(privateKey);
 expect(await auth(new Request('https://site.test',{headers:{'Cf-Access-Jwt-Assertion':noExpiry}}))).toBeNull();
});
it('rejects future-issued assertions and reserved service subjects even with a valid issuer signature',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const key={...await exportJWK(publicKey),kid:'test'};
 const auth=createAccessAuthenticator({issuer:'https://example.cloudflareaccess.com',audience:'app',keySet:{keys:[key]}});
 const now=Math.floor(Date.now()/1000);
 for(const [subject,issued,expires] of [['human',now+3600,now+7200],['sitekit:runner',now,now+3600],['human',now,now-1]] as const){
  const token=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(subject).setIssuer('https://example.cloudflareaccess.com').setAudience('app').setIssuedAt(issued).setExpirationTime(expires).sign(privateKey);
  expect(await auth(new Request('https://site.test',{headers:{'Cf-Access-Jwt-Assertion':token}}))).toBeNull();
 }
});
