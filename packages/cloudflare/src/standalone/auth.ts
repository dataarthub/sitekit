import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';
import type { JSONWebKeySet } from 'jose';
/** Trusted deployment configuration for Access assertion verification. */
export interface AccessAuthenticationOptions {
 /** Exact HTTPS Access team issuer, without a trailing slash. */
 issuer:string;
 /** Access application audience, configured by the operator. */
 audience:string;
 /** Optional trusted verification keys for offline/local signed-issuer acceptance; never request data. */
 keySet?:JSONWebKeySet;
}
/** Verified identity; grants are resolved separately from the site's durable ACL. */
export interface StandaloneIdentity {
 /** Verified Access subject; no unverified email/header may replace it. */
 subject:string;
}
/**
 * Verifies RS256 Access assertions, expiry, issuer, audience and subject. Absence or failure denies access.
 * @param options - Operator-owned issuer/audience and optional trusted local fixture keys.
 * @returns A verifier that returns only a proven human subject or null.
 * @example
 * import { createAccessAuthenticator } from '@alneas/sitekit-cloudflare/standalone';
 * export const authenticate = createAccessAuthenticator({issuer:'https://team.cloudflareaccess.com',audience:'application-audience'});
 */
export function createAccessAuthenticator(options:AccessAuthenticationOptions):(request:Request)=>Promise<StandaloneIdentity|null> {
 const issuer=new URL(options.issuer);
 if(issuer.protocol!=='https:'||issuer.href!==issuer.origin+'/'||options.issuer!==issuer.origin||issuer.username||issuer.password||!issuer.hostname.endsWith('.cloudflareaccess.com')||!options.audience||options.audience.length>256)throw new Error('Invalid Access configuration');
 const keys=options.keySet?createLocalJWKSet(options.keySet):createRemoteJWKSet(new URL('/cdn-cgi/access/certs',issuer),{timeoutDuration:5000});
 return async request=>{
  const header=request.headers.get('Cf-Access-Jwt-Assertion');
  const cookies=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('CF_Authorization='));
  if(cookies.length>1)return null;
  const cookie=cookies[0]?.slice('CF_Authorization='.length);
  const token=header??cookie;
  if(!token||token.length>16384||(header&&cookie&&header!==cookie))return null;
  try{
   const {payload}=await jwtVerify(token,keys,{issuer:options.issuer,audience:options.audience,algorithms:['RS256'],requiredClaims:['sub','iat','exp','iss','aud']});
   if(typeof payload.iat!=='number'||typeof payload.exp!=='number'||!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp)||payload.iat>Date.now()/1000+30||payload.exp<=payload.iat)return null;
   if(payload.type!=='app'||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>160||payload.sub.startsWith('sitekit:'))return null;
   return{subject:payload.sub};
  }catch{return null;}
 };
}
