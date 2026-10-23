const {chromium}=await import(process.env.SITEKIT_PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const base='http://127.0.0.1:'+(process.env.SITEKIT_MANAGEMENT_TEST_PORT??4387);
const failures=[];
async function check(name,work){const c=await browser.newContext();let diagnosticPage;try{await c.request.get(base+'/login');const page=await c.newPage();diagnosticPage=page;page.setDefaultTimeout(4000);await work(page);console.log('PASS: '+name);}catch(e){console.log('UI: '+(await diagnosticPage?.locator('body').innerText())?.slice(0,1600));failures.push(name+': '+e.message);console.log('FAIL: '+name+': '+e.message);}finally{await c.close();}}
try{
 await check('post draft survives a transient context failure',async page=>{
  await page.goto(base);await page.getByRole('form',{name:'サイト基本設定'}).waitFor();
  await page.getByRole('navigation',{name:'SiteKit',exact:true}).getByRole('button',{name:'SNS投稿'}).click();
  await page.getByRole('textbox',{name:'投稿文',exact:true}).fill('Draft survives offline');
  await page.route('**/api/sitekit/management/context',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}));
  await page.getByRole('button',{name:'最新の状態を確認'}).click();await page.getByRole('alert').first().waitFor();
  await page.unroute('**/api/sitekit/management/context');await page.getByRole('button',{name:'最新の状態を確認'}).click();
  await page.getByRole('textbox',{name:'投稿文',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'投稿文',exact:true}).inputValue(),'Draft survives offline');
 });
 await check('StrictMode replay permits save and apply completion',async page=>{
  await page.goto(base+'/?strict=1');const form=page.getByRole('form',{name:'サイト基本設定'});await form.getByLabel('サイト名',{exact:true}).fill('Strict save');
  await form.getByRole('button',{name:'保存',exact:true}).click();await form.getByText('保存しました。適用するまで現在の動作は変わりません。').waitFor();
  await form.getByRole('button',{name:'保存済みを適用'}).click();await page.waitForTimeout(450);await page.getByRole('button',{name:'最新の状態を確認'}).click();await form.locator('.mk-revisions strong').getByText('適用済み',{exact:true}).waitFor();
 });
 await check('SNS rights work independently of settings read rights',async page=>{
  await page.context().request.get(base+'/login?marketing=1');await page.goto(base);
  await page.getByRole('navigation',{name:'SiteKit',exact:true}).getByRole('button',{name:'SNS投稿'}).click();
  await page.getByRole('textbox',{name:'投稿文',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'投稿文',exact:true}).isEnabled(),true);
 });
 assert.deepEqual(failures,[]);
}finally{await browser.close();}
