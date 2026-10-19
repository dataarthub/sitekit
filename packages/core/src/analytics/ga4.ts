import type { AnalyticsEvent } from './events.js';
type Gtag=(...args:unknown[])=>void;
/**
 * Creates browser callbacks that load Google Analytics only after analytics permission.
 *
 * @param id - GA4 measurement identifier matching G- followed by uppercase letters or digits.
 * @returns onConsentChange and onEvent callbacks suitable for initBrowserAnalytics.
 * @remarks Requires window and document. Invalid identifiers prevent script loading. Consent withdrawal disables delivery and attempts to remove analytics cookies; an already loaded vendor script remains in the document. Advertising storage and personalization remain denied.
 * @example
 * ```ts
 * import { createGa4ConsentBridge, initBrowserAnalytics } from '@alneas/sitekit/analytics';
 * function enableAnalytics(measurementId: string) {
 * return initBrowserAnalytics({ siteId: 'example', ...createGa4ConsentBridge(measurementId) });
 * }
 * ```
 */
export function createGa4ConsentBridge(id:string) {
 const target=window as Window & {gtag?:Gtag;dataLayer?:unknown[]};let vendorReady=false,permitted=false;
 const load=()=>{
  if(!/^G-[A-Z0-9]+$/.test(id)||vendorReady||!permitted)return;
  target.dataLayer??=[];target.gtag??=function(){target.dataLayer!.push(arguments);};
  target.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  target.gtag('consent','update',{analytics_storage:'granted'});target.gtag('js',new Date());
  target.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
  if(![...document.scripts].some(script=>script.src==='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id))){const script=document.createElement('script');script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);script.async=true;document.head.append(script);}vendorReady=true;
 };
 return {
 /**
  * Updates GA4 permission, loading the vendor script when allowed and attempting cookie removal when denied.
  * @param value - Effective consent state; only analytics grants permission, and every other string disables delivery.
  * @returns Completes the consent update and any immediate vendor initialization or cookie-removal attempts.
  * @remarks Requires the browser environment established when creating the bridge. Revocation leaves an already loaded vendor script in the document.
  * @example
  * ```ts
  * import { createGa4ConsentBridge } from '@alneas/sitekit/analytics';
  * export function denyAnalytics(bridge: ReturnType<typeof createGa4ConsentBridge>) {
  *   bridge.onConsentChange('denied');
  * }
  * ```
  */onConsentChange(value:string){
  permitted=value==='analytics';(window as any)['ga-disable-'+id]=!permitted;
  if(permitted){target.gtag?.('consent','update',{analytics_storage:'granted'});load();}
  else {target.gtag?.('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
   for(const cookie of document.cookie.split(';')){const name=cookie.split('=')[0]?.trim();if(name&&/^_ga(?:_|$)|^_gid$|^_gat/.test(name)){document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax`;const labels=location.hostname.split('.');for(let i=0;i<labels.length-1;i++)document.cookie=`${name}=; Max-Age=0; Path=/; Domain=${labels.slice(i).join('.')}; SameSite=Lax`;}}
  }
 },
 /**
  * Sends a normalized event to GA4 only when both bridge permission and the event consent allow analytics.
  * @param event - Validated analytics event; booking_start maps to booking_outbound and contact_submit maps to generate_lead.
  * @returns Completes the forwarding attempt or skips the event when analytics is not allowed; no delivery receipt is returned.
  * @remarks Uses the event pathname, current origin and event identifier; page views also include document.title. Vendor loading requires a valid measurement identifier.
  * @throws If the event path cannot resolve against the current origin, or a vendor callback throws.
  * @example
  * ```ts
  * import { createGa4ConsentBridge } from '@alneas/sitekit/analytics';
  * import type { AnalyticsEvent } from '@alneas/sitekit/analytics';
  * export function forwardAnalytics(bridge: ReturnType<typeof createGa4ConsentBridge>, event: AnalyticsEvent) {
  *   bridge.onEvent(event);
  * }
  * ```
  */onEvent(event:AnalyticsEvent){if(!permitted||event.consent!=='analytics')return;load();if(vendorReady)target.gtag?.('event',event.event==='booking_start'?'booking_outbound':event.event==='contact_submit'?'generate_lead':event.event,{page_path:event.pagePath,page_location:new URL(event.pagePath,location.origin).href,...(event.event==='page_view'?{page_title:document.title}:{}),event_id:event.eventId});}};
}
