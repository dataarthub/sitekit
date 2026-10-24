import {ConnectionScreen} from './connection-screen.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ManagementContext, SettingsSnapshot } from './contracts.js';
import type { ConsoleReportQuery, ManagementConsoleProvider, MarketingAccess, SocialAccount } from './console-contracts.js';
import { parseManagementContext, parseSettingsSnapshot } from './schemas.js';
import { ManagementFault } from './errors.js';
import { MarketingScreen } from './marketing-screen.js';
import { SettingsScreen, managementErrorMessage } from './settings-screen.js';
/** Shared page keys for SiteKit navigation or an enclosing host's navigation. */
export type ManagementPage = 'settings'|'overview'|'campaigns'|'posts'|'connections'|'authority';
/** Authenticated workspace identity. Replace it on site, principal or execution-authority changes. */
export interface ManagementBinding {
 /** Opaque principal/session generation; change on login, logout or impersonation. */
 identityKey:string;
 /** Fresh authenticated context, never browser-selected authorization evidence. */
 context:ManagementContext;
 /** Ports for this exact principal, scope and execution owner. */
 provider:ManagementConsoleProvider;
}
/** Shared body and optional shell properties. */
export interface ManagementWorkspaceProps {
 /** Current authenticated binding; transitions are guarded for unsaved inputs. */
 binding:ManagementBinding;
 /** Initial report window. Currency/timezone come from effective settings after a read. */
 initialQuery:ConsoleReportQuery;
 /** Initial page. */
 initialPage?:ManagementPage;
 /**
  * Informs the host selector about unsaved or in-flight input; this is not an authorization signal.
  * @param dirty - Whether switching away requires confirmation.
  * @returns No result.
  * @example
  * import type {ManagementWorkspaceProps} from '@alneas/sitekit/management/react';
  * export const report = (props:ManagementWorkspaceProps) => props.onDirtyChange?.(true);
  */
 onDirtyChange?(dirty:boolean):void;
}
const labels:Record<ManagementPage,string>={settings:'設定',overview:'概要',campaigns:'広告効果',posts:'SNS投稿',connections:'SNS接続',authority:'EAOS接続'};
const keyOf=(b:ManagementBinding)=>JSON.stringify([b.identityKey,b.context.scope.tenantId,b.context.scope.siteId,b.context.authority.kind,b.context.authority.epoch]);
const denied:MarketingAccess={read:{allowed:false,reason:'unavailable'},post:{allowed:false,reason:'unavailable'},spend:{allowed:false,reason:'unavailable'},connect:{allowed:false,reason:'unavailable'},disconnect:{allowed:false,reason:'unavailable'},reconcile:{allowed:false,reason:'unavailable'}};
function ActiveWorkspace({binding,initialQuery,page,onNavigate,onDirtyChange}:{binding:ManagementBinding;initialQuery:ConsoleReportQuery;page:ManagementPage;onNavigate(page:ManagementPage):void;onDirtyChange(dirty:boolean):void}) {
 const [context,setContext]=useState(binding.context),[snapshot,setSnapshot]=useState<SettingsSnapshot>(),[access,setAccess]=useState<MarketingAccess>(denied),[accounts,setAccounts]=useState<SocialAccount[]>([]),[fresh,setFresh]=useState(false),[expired,setExpired]=useState(false),[error,setError]=useState('');
 const lifetime=useRef(true),sequence=useRef(0);
 const refresh=useCallback(async()=>{
  const seq=++sequence.current;
  try {
   const c=parseManagementContext(await binding.provider.settings.context());
   if(!lifetime.current || seq!==sequence.current)return;
   if(keyOf({...binding,context:c})!==keyOf(binding)){setExpired(true);setFresh(false);return;}
   setContext(c);
   const results=await Promise.allSettled([c.permissions.readSettings.allowed&&c.capabilities.settings.available?binding.provider.settings.settings():Promise.resolve(undefined),binding.provider.access(),c.capabilities.socialPublishing.available?binding.provider.marketing.accounts():Promise.resolve([])] as const);
   if(!lifetime.current || seq!==sequence.current)return;
   if(results[0].status==='rejected')throw results[0].reason;
   const s=results[0].value===undefined?undefined:parseSettingsSnapshot(results[0].value);
   if(s && (s.scope.tenantId!==c.scope.tenantId || s.scope.siteId!==c.scope.siteId || s.authority.epoch!==c.authority.epoch || s.authority.kind!==c.authority.kind || s.authority.status!==c.authority.status))throw new ManagementFault('unavailable');
   if(s)setSnapshot(s);setAccess(results[1].status==='fulfilled'?results[1].value:denied);setAccounts(results[2].status==='fulfilled'?results[2].value:[]);setFresh(true);setError('');
  }catch(e){if(lifetime.current && seq===sequence.current){setFresh(false);setAccess(denied);setError(managementErrorMessage(e));}}
 },[binding.provider,binding.identityKey,keyOf(binding)]);
 useEffect(()=>{lifetime.current=true;void refresh();const timer=setInterval(()=>void refresh(),15000);const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{lifetime.current=false;sequence.current++;clearInterval(timer);window.removeEventListener('focus',focus);};},[refresh]);

 const query={...initialQuery,timezone:snapshot?.sections.localization.effective?.value.timezone??initialQuery.timezone,currency:snapshot?.sections.reporting.effective?.value.currency??initialQuery.currency};
 const feature=page==='overview'||page==='campaigns'?context.capabilities.measurement:page==='posts'||page==='connections'?context.capabilities.socialPublishing:context.capabilities.settings;
 return <section className="mk-workspace" aria-label="サイト管理">
  {expired&&<div className="mk-alert" role="alert">実行主体または接続が変更されました。未保存の入力を保持して操作を停止しています。入力内容を確認し、破棄する場合はサイトを選び直してください。</div>}
  <header className="mk-topbar"><span>{context.scope.siteId} / {labels[page]} <small> · {context.authority.kind==='eaos'?'EAOS接続':'単独運用'}{context.authority.status!=='active'?'・停止中':''}</small></span><button type="button" onClick={()=>void refresh()}>最新の状態を確認</button></header>
  <nav aria-label="共通管理画面">{(Object.keys(labels) as ManagementPage[]).map(id=><button key={id} type="button" aria-current={page===id?'page':undefined} onClick={()=>onNavigate(id)}>{labels[id]}</button>)}</nav>
  <div className="mk-permissions">保存：{context.permissions.saveSettings.allowed?'可能':'権限なし'} ／ 適用：{context.permissions.applySettings.allowed?'可能':'権限なし'} ／ 投稿：{access.post.allowed?'可能':'利用不可'}{!fresh?' ／ 接続状態を確認中':''}</div>
  {error&&<p className="mk-alert" role="alert">{error}</p>}
  <fieldset disabled={expired&&page!=='authority'} style={{border:0,padding:0,margin:0,minWidth:0}}>
  {page==='authority'?(binding.provider.connection?<ConnectionScreen provider={binding.provider.connection} scope={context.scope} onDirtyChange={onDirtyChange}/>:<p role="status">サーバー側の接続設定が必要です。</p>):page==='settings'?<>
   {(!context.capabilities.settings.available||!context.permissions.readSettings.allowed)&&<p role="status">設定を表示できません。利用可能な機能と権限を確認してください。</p>}
   <div hidden={!context.capabilities.settings.available||!context.permissions.readSettings.allowed}>{snapshot?<SettingsScreen provider={binding.provider.settings} context={context} snapshot={snapshot} accounts={accounts} fresh={fresh&&context.capabilities.settings.available&&context.permissions.readSettings.allowed} onRefresh={refresh} onDirtyChange={onDirtyChange}/>:<p role="status">設定を読み込んでいます…</p>}</div>
  </>:<>
   {!feature.available&&<p role="status">この機能は利用できません（{feature.reason}）。入力は保持しています。</p>}
   <div hidden={!feature.available}><MarketingScreen key={page} provider={binding.provider.marketing} initialQuery={query} page={page} onNavigate={onNavigate} access={fresh&&context.authority.status==='active'&&feature.available?access:{...denied,read:feature.available?access.read:denied.read}} onDirtyChange={onDirtyChange}/></div>
  </>}
  </fieldset>
 </section>;
}
function Workspace({shell,...props}:ManagementWorkspaceProps&{shell:boolean}) {
 const [accepted,setAccepted]=useState(props.binding),[dirty,setDirty]=useState(false),[page,setPage]=useState<ManagementPage>(props.initialPage??'settings'),[pendingPage,setPendingPage]=useState<ManagementPage>(),[ignored,setIgnored]=useState<ManagementBinding>();
 useEffect(()=>{props.onDirtyChange?.(dirty);},[dirty,props.onDirtyChange]);
 useEffect(()=>()=>props.onDirtyChange?.(false),[props.onDirtyChange]);
 const requestedKey=keyOf(props.binding),acceptedKey=keyOf(accepted);
 const identityChanged=accepted.identityKey!==props.binding.identityKey;
 const pending=requestedKey!==acceptedKey && props.binding!==ignored;
 const active=identityChanged||(pending&&!dirty)?props.binding:accepted;
 useEffect(()=>{if(identityChanged || (pending&&!dirty)){setAccepted(props.binding);setDirty(false);setPendingPage(undefined);}},[requestedKey,identityChanged,pending,dirty]);
 useEffect(()=>{if(!dirty)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 const navigate=(next:ManagementPage)=>{if(next===page)return;if(dirty)setPendingPage(next);else setPage(next);};
 const dialog=!identityChanged&&((pending&&dirty)||pendingPage!==undefined);
 return <div className={'sitekit-management'+(shell?' mk-shell':'')}>
  {shell&&<aside className="mk-sidebar"><div className="mk-brand"><span>S</span><strong>SiteKit<small>SITE MANAGEMENT</small></strong></div><div className="mk-site-label">サイトの運用</div><nav aria-label="SiteKit">{(Object.keys(labels) as ManagementPage[]).map(id=><button key={id} type="button" aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}>{labels[id]}</button>)}</nav><div className="mk-sidebar-bottom">共通管理画面</div></aside>}
  <div className="mk-main">
   {dialog&&<div role="alertdialog" aria-modal="true" aria-label="未保存の変更" className="mk-transition"><h2>未保存の変更があります</h2><p>入力を破棄して移動するか、この画面にとどまって保存してください。実行中の処理はサーバー側で状態を確認できます。</p><button type="button" onClick={()=>{if(pending)setIgnored(props.binding);setPendingPage(undefined);}}>この画面にとどまる</button><button type="button" onClick={()=>{setDirty(false);if(pending){setAccepted(props.binding);setIgnored(undefined);}if(pendingPage)setPage(pendingPage);setPendingPage(undefined);}}>入力を破棄して移動</button></div>}
   <div hidden={dialog}><ActiveWorkspace key={keyOf(active)} binding={active} initialQuery={props.initialQuery} page={page} onNavigate={navigate} onDirtyChange={setDirty}/></div>
  </div>
 </div>;
}
/**
 * Renders the same management bodies inside a host shell, including dirty-transition guards.
 * @param props - Authenticated scope/provider and report defaults.
 * @returns Embeddable React workspace without SiteKit sidebar or application-level markup.
 * @example
 * import { ManagementWorkspace } from '@alneas/sitekit/management/react';
 * import type { ManagementWorkspaceProps } from '@alneas/sitekit/management/react';
 * export const Embedded = (props: ManagementWorkspaceProps) => <ManagementWorkspace {...props} />;
 */
export function ManagementWorkspace(props:ManagementWorkspaceProps){return <Workspace {...props} shell={false}/>;}
/**
 * Renders the shared workspace in the optional SiteKit navigation shell.
 * @param props - The same binding and defaults accepted by the embedded workspace.
 * @returns Standalone SiteKit management application.
 * @example
 * import { ManagementApp } from '@alneas/sitekit/management/react';
 * import type { ManagementWorkspaceProps } from '@alneas/sitekit/management/react';
 * export const Standalone = (props: ManagementWorkspaceProps) => <ManagementApp {...props} />;
 */
export function ManagementApp(props:ManagementWorkspaceProps){return <Workspace {...props} shell/>;}
