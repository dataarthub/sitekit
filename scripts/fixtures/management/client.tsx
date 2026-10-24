import {createRoot} from 'react-dom/client';
import {StrictMode,useState} from 'react';
import {ManagementApp,ManagementWorkspace} from '@alneas/sitekit/management/react';
import {createManagementHttpProvider} from '@alneas/sitekit/management/http';
import '@alneas/sitekit/management/styles.css';
const query={from:'2026-10-01T00:00:00Z',to:'2026-10-23T00:00:00Z',timezone:'Asia/Tokyo',currency:'JPY'};
const initial=await (await fetch('/bootstrap')).json();
function Fixture(){
 const [binding,setBinding]=useState({...initial,provider:createManagementHttpProvider()});
 const App=location.pathname==='/embedded'?ManagementWorkspace:ManagementApp;
 return <><header style={{padding:16,background:'#fff'}}><strong>{location.pathname==='/embedded'?'EAOS host fixture':'Standalone fixture'}</strong> <button onClick={async()=>{const next=await(await fetch('/bootstrap?site=other')).json();setBinding({...next,provider:createManagementHttpProvider({basePath:'/api/other/management/'})});}}>サイトを切り替え</button></header><App binding={binding} initialQuery={query}/></>;
}
createRoot(document.getElementById('app')!).render(new URLSearchParams(location.search).has('strict')?<StrictMode><Fixture/></StrictMode>:<Fixture/>);
