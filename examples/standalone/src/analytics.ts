import {initBrowserAnalytics} from '@alneas/sitekit/analytics';
import '@alneas/sitekit/analytics/consent.css';
let collector:ReturnType<typeof initBrowserAnalytics>|undefined;
let version='';
async function refresh(){
 try{
  const response=await fetch('/sitekit/runtime',{cache:'no-store'});if(!response.ok)return;
  const runtime=await response.json() as {siteId:string;measurement:{enabled:boolean;consentMode:'opt-in'|'opt-out';consentDays:number}};
  const next=JSON.stringify(runtime);if(next===version)return;version=next;collector?.dispose();collector=undefined;
  if(runtime.measurement.enabled)collector=initBrowserAnalytics({siteId:runtime.siteId,endpoint:'/api/analytics',consentMode:runtime.measurement.consentMode,consentDays:runtime.measurement.consentDays});
 }catch{/* Retain consent behavior; the server independently gates collection. */}
}
await refresh();const timer=setInterval(()=>void refresh(),15000);addEventListener('pagehide',()=>{clearInterval(timer);collector?.dispose();},{once:true});
