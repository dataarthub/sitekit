import { useEffect, useRef, useState } from 'react';
import type { ManagementContext, ManagementSettingsProvider, SaveSettingsCommand, SettingsSectionName, SettingsSectionValue, SettingsSnapshot, SettingsValues } from './contracts.js';
import type { SocialAccount } from './console-contracts.js';
import { parseSaveSettingsCommand } from './schemas.js';
import { ManagementFault } from './errors.js';
import { settingsSectionStatus } from './settings.js';
const titles:Record<SettingsSectionName,string>={site:'サイト基本設定',localization:'言語・タイムゾーン',measurement:'広告効果の計測',reporting:'広告費・集計',social:'SNS自動投稿・承認'};
const statuses={not_applied:'未適用',applying:'適用中',applied:'適用済み',failed:'適用失敗'};
export const managementErrorMessage=(e:unknown)=>e instanceof ManagementFault?{invalid:'入力内容を確認してください。',forbidden:'この操作を行う権限がありません。',conflict:'他の操作で更新されました。入力は保持しています。最新の設定を確認してください。',unavailable:'処理結果を確認できません。再読み込みして状態を確認してください。',capacity:'保存容量の上限です。管理者に連絡してください。'}[e.code]:'処理を完了できませんでした。状態を確認してください。';
interface Props { provider:ManagementSettingsProvider; context:ManagementContext; snapshot:SettingsSnapshot; accounts:SocialAccount[]; fresh:boolean; onRefresh():Promise<void>; onDirtyChange(dirty:boolean):void; }
interface FormProps extends Omit<Props,'onDirtyChange'> { section:SettingsSectionName; onDirtyChange(section:SettingsSectionName,dirty:boolean):void; }
function SectionForm({provider,context,snapshot,section,accounts,fresh,onRefresh,onDirtyChange}:FormProps) {
 const current=snapshot.sections[section];
 const [value,setValue]=useState<SettingsSectionValue>(()=>structuredClone(current.saved.value));
 const [fence,setFence]=useState(snapshot.version),[baseRevision,setBaseRevision]=useState(current.saved.revision);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<SaveSettingsCommand|null>(null);
 const alive=useRef(true); useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onDirtyChange(section,dirty||busy);},[dirty,busy,section,onDirtyChange]);
 useEffect(()=>{
  if(!dirty && !busy && !pending.current){setValue(structuredClone(current.saved.value));setBaseRevision(current.saved.revision);setFence(snapshot.version);}
  else if(dirty && snapshot.version!==fence) setConflict(true);
 },[snapshot.version,current.saved.revision,dirty,busy]);
 const change=(key:string,next:unknown)=>{setValue(v=>({...v,[key]:next}));setDirty(true);pending.current=null;setNotice('');};
 const allowed=context.capabilities.settings.available && context.authority.status==='active' && fresh;
 const canSave=allowed && context.permissions.saveSettings.allowed;
 const canApply=allowed && context.permissions.applySettings.allowed;
 const save=async()=>{
  if(!canSave || conflict || busy)return;
  setBusy(true);setError('');setNotice('');
  try {
   const command=pending.current??parseSaveSettingsCommand({protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:fence,authorityEpoch:context.authority.epoch,section,value});
   pending.current=command;
   await provider.saveSettings(command);
   if(!alive.current)return;
   pending.current=null;setDirty(false);setNotice('保存しました。適用するまで現在の動作は変わりません。');
   await onRefresh();
  } catch(e){if(alive.current){setError(managementErrorMessage(e));if(e instanceof ManagementFault && e.code==='conflict'){setConflict(true);pending.current=null;} await onRefresh().catch(()=>{});}}
  finally {if(alive.current)setBusy(false);}
 };
 const apply=async()=>{
  if(!canApply || dirty || busy || conflict)return;
  setBusy(true);setError('');setNotice('');
  try {
   await provider.applySettings({protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:snapshot.version,authorityEpoch:context.authority.epoch,section,savedRevision:current.saved.revision,expectedEffectiveRevision:current.effective?.revision??null});
   if(alive.current){setNotice('適用を受け付けました。実際の反映を確認するまで「適用中」と表示します。');await onRefresh();}
  }catch(e){if(alive.current){setError(managementErrorMessage(e));if(e instanceof ManagementFault&&e.code==='conflict')setConflict(true);await onRefresh().catch(()=>{});}}
  finally{if(alive.current)setBusy(false);}
 };
 const fields=value as unknown as Record<string,unknown>;
 const text=(key:string,label:string,type='text')=><label key={key}>{label}<input type={type} required value={String(fields[key]??'')} onChange={e=>change(key,type==='number'?Number(e.target.value):e.target.value)} /></label>;
 const check=(key:string,label:string)=><label className="mk-check"><input type="checkbox" checked={fields[key]===true} onChange={e=>change(key,e.target.checked)} />{label}</label>;
 return <form className="mk-panel mk-form" aria-label={titles[section]} onSubmit={e=>{e.preventDefault();void save();}}>
  <h2>{titles[section]}</h2>
  <div className="mk-revisions"><strong>{statuses[settingsSectionStatus(current)]}</strong><span>保存済み：{current.saved.revision}</span><span>適用済み：{current.effective?.revision??'まだありません'}</span>{current.application?.status==='applying' && current.application.savedRevision!==current.saved.revision && <span>以前の保存版を適用中：{current.application.savedRevision}</span>}{dirty&&<strong>未保存の変更があります</strong>}</div>
  <details><summary>保存済み・適用済みの値を確認</summary><p>保存済み</p><pre>{JSON.stringify(current.saved.value,null,2)}</pre><p>適用済み</p><pre>{current.effective?JSON.stringify(current.effective.value,null,2):'未適用'}</pre></details>
  {!canSave&&<p className="mk-help">{!fresh?'接続状態を確認中のため編集できません。':!context.capabilities.settings.available?'この設定機能は利用できません。':'設定の保存権限がありません。'}</p>}
  <fieldset disabled={!canSave||busy}><legend>設定値</legend>
   {section==='site'&&<>{text('name','サイト名')}{text('url','サイトURL','url')}</>}
   {section==='localization'&&<>{text('defaultLocale','既定の言語')}<label>対応言語（カンマ区切り）<input value={(fields.locales as string[]).join(',')} onChange={e=>change('locales',e.target.value.split(',').map(v=>v.trim()))}/></label><label>言語プレフィックス<select value={String(fields.prefixStrategy)} onChange={e=>change('prefixStrategy',e.target.value)}><option value="always">すべての言語に付ける</option><option value="default-unprefixed">既定の言語には付けない</option><option value="never">付けない</option></select></label>{text('timezone','タイムゾーン')}<p>変更しても既存の投稿予約時刻は移動しません。</p></>}
   {section==='measurement'&&<>{check('enabled','計測を有効にする')}{text('retentionDays','保存日数（30〜365）','number')}<label>同意方式<select value={String(fields.consentMode)} onChange={e=>change('consentMode',e.target.value)}><option value="opt-in">同意後に計測</option><option value="opt-out">拒否するまで計測</option></select></label>{text('consentDays','同意の有効日数（1〜365）','number')}<p>保存期間の適用だけで履歴を即時削除することはありません。</p></>}
   {section==='reporting'&&<>{text('currency','集計の既定通貨')}<p>既存の広告費・売上の通貨は換算されません。</p></>}
   {section==='social'&&<>{check('enabled','記事公開時に投稿を作成する')}<fieldset><legend>自動投稿の投稿先</legend>{[...new Set([...accounts.map(a=>a.id),...(fields.accountIds as string[])])].map(id=><label className="mk-check" key={id}><input type="checkbox" checked={(fields.accountIds as string[]).includes(id)} onChange={e=>change('accountIds',e.target.checked?[...(fields.accountIds as string[]),id]:(fields.accountIds as string[]).filter(v=>v!==id))}/>{accounts.find(a=>a.id===id)?.name??id} · {accounts.find(a=>a.id===id)?.status??'接続を確認してください'}</label>)}</fieldset>{check('requiresApproval','公開前に承認する')}<p>適用後の新しい記事公開から使います。登録済みの投稿予約は変更されません。</p></>}
  </fieldset>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {conflict&&<div className="mk-conflict" role="alert"><strong>更新の競合：入力は保持されています。</strong><p>上の保存済み・適用済みの値を確認してください。自動で上書きしません。</p><button type="button" disabled={!fresh||busy} onClick={()=>{setFence(snapshot.version);setBaseRevision(current.saved.revision);setConflict(false);pending.current=null;setError('');}}>最新の値を確認した・入力を保持して編集を続ける</button><button type="button" disabled={busy} onClick={()=>{setValue(structuredClone(current.saved.value));setFence(snapshot.version);setBaseRevision(current.saved.revision);setDirty(false);setConflict(false);pending.current=null;setError('');}}>入力を破棄して保存済みに戻す</button></div>}
  <div className="mk-job-actions"><button className="mk-primary" disabled={!canSave||busy||!dirty||conflict}>保存</button><button type="button" disabled={!canApply||busy||dirty||conflict||current.application?.status==='applying'||current.effective?.revision===current.saved.revision} onClick={()=>void apply()}>保存済みを適用</button>{!context.permissions.applySettings.allowed&&<small>適用権限がありません（{context.permissions.applySettings.reason}）</small>}</div>
  <small>編集中の保存版：{baseRevision}</small>
 </form>;
}
/** Internal screen; provider and snapshot are bound by the workspace. */
export function SettingsScreen(props:Props) {
 const dirties=useRef(new Set<SettingsSectionName>());
 const callback=useRef(props.onDirtyChange);callback.current=props.onDirtyChange;
 const [track]=useState(()=> (section:SettingsSectionName,dirty:boolean)=>{if(dirty)dirties.current.add(section);else dirties.current.delete(section);callback.current(dirties.current.size>0);});
 return <div className="mk-settings-grid">{(Object.keys(titles) as SettingsSectionName[]).map(section=><SectionForm key={section} {...props} section={section} onDirtyChange={track}/>)}</div>;
}
