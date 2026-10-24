import {useEffect,useRef,useState} from 'react';
import type {ConnectionProvider,ConnectionStatus} from './authority.js';
import {parseConnectionStatus} from './authority.js';
import type {ManagementScope} from './contracts.js';
import {ManagementFault} from './errors.js';
import {managementErrorMessage} from './settings-screen.js';
export function ConnectionScreen({provider,scope,onDirtyChange}:{provider:ConnectionProvider;scope:ManagementScope;onDirtyChange(dirty:boolean):void}){
 const [status,setStatus]=useState<ConnectionStatus>(),[busy,setBusy]=useState(false),[error,setError]=useState('');const lifetime=useRef(true);
 const accept=(input:unknown)=>{const next=parseConnectionStatus(input);if(next.scope.tenantId!==scope.tenantId||next.scope.siteId!==scope.siteId)throw new ManagementFault('forbidden');if(lifetime.current)setStatus(next)};
 const refresh=async()=>{try{accept(await provider.status());if(lifetime.current)setError('')}catch(e){if(lifetime.current){setStatus(undefined);setError(managementErrorMessage(e))}}};
 useEffect(()=>{lifetime.current=true;void refresh();return()=>{lifetime.current=false}},[provider,scope.tenantId,scope.siteId]);
 useEffect(()=>{onDirtyChange(busy);return()=>onDirtyChange(false)},[busy,onDirtyChange]);
 const submit=async()=>{if(!status||busy)return;setBusy(true);setError('');try{const commandId=crypto.randomUUID();accept(status.phase==='active'||status.phase==='complete'?await provider.plan({commandId,expectedVersion:status.version,authorityEpoch:status.epoch,target:status.owner==='standalone'?'eaos':'standalone'}):await provider.advance({commandId,expectedVersion:status.version,transferId:status.transferId!}))}catch(e){if(lifetime.current){setError(managementErrorMessage(e));setStatus(undefined)}}finally{if(lifetime.current)setBusy(false)}};
 return <div className="mk-card"><h2>EAOS接続・解除</h2><p>設定、計測履歴、投稿予約を引き継ぎます。切替が完了するまで実行を止め、障害時も実行主体を自動では変更しません。</p>
 {error&&<p role="alert">{error} 最新の状態を確認してから操作してください。</p>}
 {status&&<><p role="status">実行主体：{status.owner==='eaos'?'EAOS':'SiteKit単独'} ／ 段階：{status.phase} ／ 実行中：{status.openPermits} ／ 結果不明：{status.unknownPermits}</p>
 {!status.canManage&&<p>接続を変更する権限がありません。</p>}{!status.configured&&<p>サーバー側の接続設定が必要です。</p>}
 <button type="button" disabled={busy||!status.canManage||!status.configured||status.openPermits>0} onClick={()=>void submit()}>{busy?'処理中…':status.phase==='active'||status.phase==='complete'?(status.owner==='eaos'?'単独運用への引継ぎを準備':'EAOSへの引継ぎを準備'):'引継ぎを進める'}</button></>}
 <button type="button" disabled={busy} onClick={()=>void refresh()}>接続の最新状態を確認</button></div>;
}
