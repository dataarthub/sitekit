import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { ManagementWorkspace, ManagementApp } from './react.js';
import type { ManagementBinding } from './react.js';
const binding={identityKey:'subject-1',context:{protocolVersion:1,scope:{tenantId:'t',siteId:'s'},authority:{kind:'standalone',epoch:'one',status:'active'},capabilities:{settings:{available:true},measurement:{available:true},socialPublishing:{available:true}},permissions:{readSettings:{allowed:true},readApplication:{allowed:true},saveSettings:{allowed:false,reason:'forbidden'},applySettings:{allowed:false,reason:'forbidden'}},asOf:'2026-10-23T00:00:00Z'},provider:{}} as ManagementBinding;
it('exports a shell-free workspace and separate optional SiteKit shell',()=>{
 const props={binding,initialQuery:{from:'2026-10-01T00:00:00Z',to:'2026-10-23T00:00:00Z',timezone:'Asia/Tokyo',currency:'JPY'}};
 const body=renderToStaticMarkup(createElement(ManagementWorkspace,props));
 expect(body).not.toContain('mk-sidebar'); expect(body).toContain('設定');
 expect(renderToStaticMarkup(createElement(ManagementApp,props))).toContain('mk-sidebar');
});
