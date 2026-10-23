const {chromium}=await import(process.env.SITEKIT_PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:'+(process.env.SITEKIT_MANAGEMENT_TEST_PORT ?? 4387);
try{
 await context.request.get(base+'/login');await page.goto(base);
 const form=page.getByRole('form',{name:'サイト基本設定'});
 await form.getByLabel('サイト名',{exact:true}).waitFor();
 await form.getByLabel('サイト名',{exact:true}).fill('Browser saved '+Date.now());
 await form.getByRole('button',{name:'保存',exact:true}).click();
 await form.getByText('保存しました。適用するまで現在の動作は変わりません。').waitFor();
 await form.getByRole('button',{name:'保存済みを適用'}).click();
 await page.getByRole('button',{name:'最新の状態を確認'}).click();
 await page.waitForTimeout(450);await page.getByRole('button',{name:'最新の状態を確認'}).click();
 await form.locator('.mk-revisions strong').getByText('適用済み',{exact:true}).waitFor();
 // A second client edits while the first retains a local draft.
 await form.getByLabel('サイト名',{exact:true}).fill('Keep my draft');
 const s=await(await context.request.get(base+'/api/sitekit/management/settings')).json();
 await context.request.post(base+'/api/sitekit/management/settings/save',{headers:{Origin:base},data:{protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section:'site',value:{name:'Other editor value',url:'https://example.test'}}});
 await form.getByRole('button',{name:'保存',exact:true}).click();
 await form.getByText('更新の競合：入力は保持されています。').waitFor();assert.equal(await form.getByLabel('サイト名',{exact:true}).inputValue(),'Keep my draft');
 const before=await(await context.request.get(base+'/stats')).json();await page.waitForTimeout(100);assert.equal((await(await context.request.get(base+'/stats')).json()).saveCalls,before.saveCalls);
 await form.getByRole('button',{name:'最新の値を確認した・入力を保持して編集を続ける'}).click();
 await form.getByRole('button',{name:'保存',exact:true}).click();await form.getByText('保存しました。適用するまで現在の動作は変わりません。').waitFor();
 await form.getByLabel('サイト名',{exact:true}).fill('Unsaved for switch');await page.getByRole('button',{name:'サイトを切り替え'}).click();
 await page.getByRole('alertdialog',{name:'未保存の変更'}).waitFor();await page.getByRole('button',{name:'この画面にとどまる'}).click();assert.equal(await form.getByLabel('サイト名',{exact:true}).inputValue(),'Unsaved for switch');
 // Page navigation has the same guard.
 await page.getByRole('navigation',{name:'SiteKit',exact:true}).getByRole('button',{name:'SNS投稿'}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'入力を破棄して移動'}).click();
 await page.getByRole('heading',{name:'投稿を作成',exact:true}).waitFor();
 // Late settings completion must never populate a newly selected site.
 await page.getByRole('navigation',{name:'SiteKit',exact:true}).getByRole('button',{name:'設定',exact:true}).click();
 await form.getByLabel('サイト名',{exact:true}).fill('Late old site input');
 let release;const held=new Promise(resolve=>{release=resolve;});let arrived;const atResponse=new Promise(resolve=>{arrived=resolve;});
 await page.route('**/api/sitekit/management/settings/save',async route=>{const response=await route.fetch();arrived();await held;await route.fulfill({response});});
 await form.getByRole('button',{name:'保存',exact:true}).click();await atResponse;
 await page.getByRole('button',{name:'サイトを切り替え'}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'入力を破棄して移動'}).click();
 await page.waitForFunction(()=>document.querySelector('.mk-topbar')?.textContent?.includes('other /'));
 assert.equal(await form.getByLabel('サイト名',{exact:true}).inputValue(),'Other site');release();await page.waitForTimeout(150);assert.equal(await form.getByLabel('サイト名',{exact:true}).inputValue(),'Other site');
 await page.unroute('**/api/sitekit/management/settings/save');
 // Embedded host uses the same body, without sidebar.
 const embed=await context.newPage();await embed.goto(base+'/embedded');await embed.getByRole('form',{name:'サイト基本設定'}).waitFor();assert.equal(await embed.locator('.mk-sidebar').count(),0);
 await embed.screenshot({path:new URL('../../../.verification/public-management/embedded.png',import.meta.url).pathname,fullPage:true});
 await page.screenshot({path:new URL('../../../.verification/public-management/standalone.png',import.meta.url).pathname,fullPage:true});
 // Read-only display and server denial.
 const ro=await browser.newContext();await ro.request.get(base+'/login?readonly=1');const view=await ro.newPage();await view.goto(base);const rf=view.getByRole('form',{name:'サイト基本設定'});await rf.getByLabel('サイト名',{exact:true}).waitFor();await view.getByText('保存：権限なし', {exact:false}).waitFor();assert.equal(await rf.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);assert.equal((await ro.request.post(base+'/api/sitekit/management/settings/save',{headers:{Origin:base},data:{}})).status(),403);
 assert.deepEqual(errors,[]);console.log('PASS: save/apply, conflict retains input/no retry, explicit review, dirty guards, embedded body, read-only UI/server');
}finally{await browser.close();}
