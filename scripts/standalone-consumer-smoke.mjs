// Public-only reference project and actual Workers/D1 acceptance; external identity/Meta are local fixtures.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {generateKeyPair,exportJWK,SignJWT}=await import(createRequire(new URL('../packages/cloudflare/package.json',import.meta.url)).resolve('jose'));
const root=resolve(import.meta.dirname,'..'),scratch=await mkdtemp(join(tmpdir(),'sitekit-standard-'));
const env={...process.env,NPM_CONFIG_USERCONFIG:'/dev/null',NODE_PATH:'',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(scratch,'wrangler.log')};
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,env,encoding:'utf8',maxBuffer:12*1024*1024});assert.equal(r.status,0,`${command} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);return r.stdout;}
let mf;
try{
 run('bun',['run','build:all']);
 const core=join(scratch,'core.tgz'),adapter=join(scratch,'adapter.tgz');run('bun',['pm','pack','--ignore-scripts','--filename',core],join(root,'packages/core'));run('bun',['pm','pack','--ignore-scripts','--filename',adapter],join(root,'packages/cloudflare'));
 const consumer=join(scratch,'consumer');await cp(join(root,'examples/standalone'),consumer,{recursive:true});
 const manifest=JSON.parse(await readFile(join(consumer,'package.json'),'utf8'));manifest.dependencies['@alneas/sitekit']='file:'+core;manifest.dependencies['@alneas/sitekit-cloudflare']='file:'+adapter;manifest.overrides={'@alneas/sitekit':'file:'+core};await writeFile(join(consumer,'package.json'),JSON.stringify(manifest));
 run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],consumer);
 run('npm',['exec','--no','--','sitekit-standalone','scaffold-check'],consumer);
 const scaffold=JSON.parse(await readFile(join(consumer,'scaffold-check/package.json'),'utf8'));assert.equal(scaffold.dependencies['@alneas/sitekit'],JSON.parse(await readFile(join(consumer,'node_modules/@alneas/sitekit/package.json'),'utf8')).version);
 console.log('Fresh standard reference and packaged scaffold installed with public registry only.');
 run('npm',['run','build'],consumer);run('npm',['run','db:local'],consumer);run('npm',['run','typegen'],consumer);run('npm',['run','typecheck'],consumer);run('npm',['run','deploy:check'],consumer);
 console.log('Reference build, local D1 setup, generated binding types, typecheck and Wrangler dry run passed.');
 const r=createRequire(join(consumer,'package.json')),wranglerRequire=createRequire(r.resolve('wrangler/package.json'));
 const {Miniflare,convertV4MiniflareOptions}=wranglerRequire('miniflare');
 const esbuild=r('esbuild');
 const site=JSON.parse(await readFile(join(consumer,'sitekit.config.json'),'utf8'));
 site.meta={appId:'123',apiVersion:'v25.0',permissions:['pages_show_list'],allowedMediaOrigins:['https://media.test']};
 await writeFile(join(consumer,'sitekit.config.json'),JSON.stringify(site));
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwks={keys:[{...await exportJWK(publicKey),kid:'local'}]};
 const port=4391,origin='http://127.0.0.1:'+port;
 await esbuild.build({entryPoints:[join(consumer,'src/worker.ts')],outfile:join(consumer,'worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
 let deliveries=0;const providerCalls=[];
 const external=async request=>{const url=new URL(request.url);assert.equal(url.hostname,'graph.facebook.com');providerCalls.push(url.pathname);if(url.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'fixture-encrypted-token',expires_in:86400});if(url.pathname.endsWith('/me/permissions'))return Response.json({data:[{permission:'pages_show_list',status:'granted'}]});if(url.pathname.endsWith('/me/accounts'))return Response.json({data:[{id:'123',name:'Page',access_token:'fixture-encrypted-token',tasks:['CREATE_CONTENT'],instagram_business_account:{id:'456',username:'IG'}}]});if(url.pathname.endsWith('/photos')||url.pathname.endsWith('/feed')||url.pathname.endsWith('/media_publish')){deliveries++;return Response.json({id:url.pathname.endsWith('/media_publish')?'789':'123_789'});}if(url.pathname.endsWith('/media'))return Response.json({id:'999'});if(url.pathname.endsWith('/999'))return Response.json({status_code:'FINISHED'});throw Error('Unexpected provider fixture path');};
 const assets=async request=>{const path=new URL(request.url).pathname;try{const bytes=await readFile(join(consumer,'dist',path));return new Response(bytes,{headers:{'Content-Type':path.endsWith('.css')?'text/css':'text/javascript'}});}catch{return new Response('Not found',{status:404});}};
 const options={modules:true,script:await readFile(join(consumer,'worker.mjs'),'utf8'),compatibilityDate:'2026-10-23',port,host:'127.0.0.1',d1Databases:{SITEKIT_DB:'sitekit-standard'},resourcePersistencePath:join(scratch,'d1'),bindings:{SITEKIT_DEV_ORIGIN:origin,SITEKIT_DEV_JWKS:JSON.stringify(jwks),SITEKIT_CURRENT_KEY_ID:'fixture',SITEKIT_SECRET_KEYS:JSON.stringify({fixture:Buffer.alloc(32,7).toString('base64')}),META_APP_SECRET:'fixture-app-secret'},serviceBindings:{ASSETS:assets},outboundService:external};
 mf=new Miniflare(convertV4MiniflareOptions(options));await mf.ready;
 const db=await mf.getD1Database('SITEKIT_DB');
 const {initializeStandaloneDatabase}=await import(r.resolve('@alneas/sitekit-cloudflare/standalone'));
 await initializeStandaloneDatabase(db,{...site,initialValues:(await import(r.resolve('@alneas/sitekit/management'))).parseSettingsValues(site.initialValues)},['local-editor']);
 const token=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'local'}).setSubject('local-editor').setIssuer(site.access.issuer).setAudience(site.access.audience).setIssuedAt().setExpirationTime('10m').sign(privateKey);
 const call=(path,body)=>fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Cookie:'CF_Authorization='+token,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await fetch(origin+'/admin')).status,401);assert.equal((await fetch(origin+'/admin/client.js')).status,401);assert.equal((await call('/admin')).status,200);
 const settings=async()=>{const response=await call('/api/sitekit/management/settings');assert.equal(response.status,200);return response.json();};
 const apply=async section=>{const s=await settings();const response=await call('/api/sitekit/management/settings/apply',{protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section,savedRevision:s.sections[section].saved.revision,expectedEffectiveRevision:s.sections[section].effective?.revision??null});assert.equal(response.status,202);};
 for(const section of ['site','localization','measurement','reporting'])await apply(section);
 assert.match(await(await fetch(origin+'/')).text(),/My Site/);
 const start=await(await call('/api/sitekit/management/connect',{})).json();const callback=await call('/api/sitekit/management/oauth/callback?'+new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'fixture'}));if(callback.status!==303)console.log({providerCalls,callback:await callback.clone().text()});assert.equal(callback.status,303);
 const accounts=await(await call('/api/sitekit/management/accounts')).json();assert.equal(accounts.length,2);
 const s=await settings();assert.equal((await call('/api/sitekit/management/settings/save',{protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section:'social',value:{enabled:true,accountIds:accounts.map(a=>a.id),requiresApproval:true}})).status,200);await apply('social');
 const posts=await(await call('/api/sitekit/management/posts',{idempotencyKey:'scheduled-fixture',accountIds:accounts.map(a=>a.id),text:'One public-only post',imageUrl:'https://media.test/photo.jpg'})).json();assert.equal(posts.length,2);
 const worker=await mf.getWorker();await Promise.all([worker.scheduled({cron:'* * * * *'}),worker.scheduled({cron:'* * * * *'})]);assert.equal(deliveries,2);
 await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions(options));await mf.ready;await(await mf.getWorker()).scheduled({cron:'* * * * *'});assert.equal(deliveries,2);assert.equal((await settings()).sections.site.effective.value.name,'My Site');
 console.log('Actual Worker/D1: verified admin, protected assets, apply/render, encrypted Meta OAuth, two-platform Cron and restart without resend passed.');
 if(process.env.SITEKIT_PLAYWRIGHT_MODULE){const {chromium}=await import(process.env.SITEKIT_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();await context.addCookies([{name:'CF_Authorization',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();await page.goto(origin+'/admin');const form=page.getByRole('form',{name:'サイト基本設定'});await form.getByLabel('サイト名',{exact:true}).fill('Browser actual runtime');await form.getByRole('button',{name:'保存',exact:true}).click();await form.getByText('保存しました。適用するまで現在の動作は変わりません。').waitFor();assert.match(await(await fetch(origin+'/')).text(),/My Site/);await form.getByRole('button',{name:'保存済みを適用'}).click();await form.locator('.mk-revisions strong').getByText('適用済み',{exact:true}).waitFor();assert.match(await(await fetch(origin+'/')).text(),/Browser actual runtime/);await page.screenshot({path:join(root,'.verification/standalone-standard/worker-admin.png'),fullPage:true});console.log('Browser on installed reference Worker: login, saved/effective distinction and actual public-page application passed.');}finally{await browser.close();}}
 // Exercise the documented CLI host as well as the explicit runtime API.
 const cliOrigin='http://127.0.0.1:4392';
 await writeFile(join(consumer,'.dev.vars'),`SITEKIT_DEV_ORIGIN=${JSON.stringify(cliOrigin)}\nSITEKIT_DEV_JWKS='${JSON.stringify(jwks)}'\n`,{mode:0o600});
 const cli=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port','4392','--test-scheduled'],{cwd:consumer,env,stdio:['ignore','pipe','pipe']});
 let output='';cli.stdout.on('data',d=>{output+=d;});cli.stderr.on('data',d=>{output+=d;});
 try{
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(cliOrigin+'/admin')).status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert(ready,'CLI startup failed: '+output);
  const cliCall=(path,body)=>fetch(cliOrigin+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'CF_Authorization='+token,Origin:cliOrigin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await cliCall('/admin')).status,200);
  for(const section of ['site','localization']){const snapshot=await(await cliCall('/api/sitekit/management/settings')).json();const response=await cliCall('/api/sitekit/management/settings/apply',{protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:snapshot.version,authorityEpoch:snapshot.authority.epoch,section,savedRevision:snapshot.sections[section].saved.revision,expectedEffectiveRevision:snapshot.sections[section].effective?.revision??null});assert.equal(response.status,202);}
  assert.match(await(await fetch(cliOrigin+'/')).text(),/My Site/);
  assert.equal((await fetch(cliOrigin+'/cdn-cgi/local/scheduled?format=json')).status,200);
  console.log('Documented wrangler dev host: signed login, actual application/render and native local scheduled event passed.');
 }finally{cli.kill('SIGTERM');await new Promise(resolve=>{if(cli.exitCode!==null)return resolve();const timer=setTimeout(()=>{cli.kill('SIGKILL');resolve();},5000);cli.once('exit',()=>{clearTimeout(timer);resolve();});});}

}finally{try{await mf?.dispose();}catch{}if(process.env.SITEKIT_KEEP_ACCEPTANCE)console.log('Acceptance workspace: '+scratch);else await rm(scratch,{recursive:true,force:true});}
