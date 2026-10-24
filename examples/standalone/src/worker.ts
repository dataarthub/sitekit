import {createStandaloneHost,createSecretBox} from '@alneas/sitekit-cloudflare/standalone';
import {parseSettingsValues} from '@alneas/sitekit/management';
import type {StandaloneConfiguration} from '@alneas/sitekit-cloudflare/standalone';
import site from '../sitekit.config.json';
type Secrets={SITEKIT_DEV_ORIGIN?:string;SITEKIT_DEV_JWKS?:string;SITEKIT_SECRET_KEYS?:string;SITEKIT_CURRENT_KEY_ID?:string;META_APP_SECRET?:string;SITEKIT_PUBLICATION_KEY?:string};
function host(env:Env&Secrets){
 const origin=env.SITEKIT_DEV_ORIGIN??site.origin;
 const local=['localhost','127.0.0.1'].includes(new URL(origin).hostname)&&new URL(origin).protocol==='http:';
 if(env.SITEKIT_DEV_JWKS&&!local)throw Error('Local issuer keys are forbidden on a public deployment');
 const configuration:StandaloneConfiguration={...site,origin,initialValues:parseSettingsValues(site.initialValues),access:{...site.access,...(local&&env.SITEKIT_DEV_JWKS?{keySet:JSON.parse(env.SITEKIT_DEV_JWKS)}:{})}};
 const keys:Record<string,Uint8Array>=Object.fromEntries(Object.entries(JSON.parse(env.SITEKIT_SECRET_KEYS??'{}') as Record<string,string>).map(([id,value])=>[id,Uint8Array.from(atob(value),c=>c.charCodeAt(0))]));
 return createStandaloneHost(configuration,{database:env.SITEKIT_DB,assets:env.ASSETS,...(env.SITEKIT_CURRENT_KEY_ID?{secrets:createSecretBox({currentKeyId:env.SITEKIT_CURRENT_KEY_ID,keys})}:{}),...(env.SITEKIT_PUBLICATION_KEY?{publicationKey:Uint8Array.from(atob(env.SITEKIT_PUBLICATION_KEY),c=>c.charCodeAt(0))}:{}),...(env.META_APP_SECRET?{metaAppSecret:env.META_APP_SECRET}:{})});
}
export default {
 fetch(request,env){return host(env).fetch(request);},
 scheduled(_controller,env,ctx){ctx.waitUntil(host(env).scheduled().then(result=>{console.log(JSON.stringify({component:'sitekit',operation:'scheduled',...result}));}));},
} satisfies ExportedHandler<Env&Secrets>;
