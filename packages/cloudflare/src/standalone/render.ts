import type {SettingsValues} from '@alneas/sitekit/management';
import type {StandalonePage} from './types.js';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Reference renderer: identity and locale routing consume the actually activated projection. */
export function renderStandalonePage(request:Request,runtime:Partial<SettingsValues>,pages:StandalonePage[]):Response{
 const {site,localization}=runtime;
 if(!site||!localization)return new Response('Site settings require application.',{status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);let locale=localization.defaultLocale,path=url.pathname;
 if(localization.prefixStrategy==='always'||(localization.prefixStrategy==='default-unprefixed'&&localization.locales.includes(parts[0]??''))){locale=parts[0]??'';path=url.pathname.slice(('/'+locale).length)||'/';}
 const page=pages.find(p=>p.locale===locale&&p.path===path);
 if(!localization.locales.includes(locale)||!page)return new Response('Not found',{status:404});
 const href=(p:StandalonePage)=>(localization.prefixStrategy==='always'||(localization.prefixStrategy==='default-unprefixed'&&p.locale!==localization.defaultLocale)?'/'+p.locale:'')+(p.path==='/'?'/':p.path);
 const canonical=new URL(href(page),site.url).href;
 const html=`<!doctype html><html lang="${escape(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(page.title)} | ${escape(site.name)}</title><link rel="canonical" href="${escape(canonical)}"><link rel="stylesheet" href="/assets/sitekit-consent.css"><script type="module" src="/assets/sitekit-analytics.js"></script></head><body><header><strong>${escape(site.name)}</strong><nav>${pages.filter(p=>p.path===page.path&&localization.locales.includes(p.locale)).map(p=>`<a hreflang="${escape(p.locale)}" href="${escape(href(p))}">${escape(p.locale)}</a>`).join(' ')}</nav></header><main><h1>${escape(page.title)}</h1><p>${escape(page.body)}</p></main></body></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
