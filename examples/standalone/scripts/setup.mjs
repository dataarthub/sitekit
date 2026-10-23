import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createStandaloneBootstrapSql} from '@alneas/sitekit-cloudflare/standalone';
import {parseSettingsValues} from '@alneas/sitekit/management';
try { await readFile('.gitignore'); } catch (e) { if (e.code !== 'ENOENT') throw e; await writeFile('.gitignore', await readFile('gitignore.template', 'utf8')); }
const mode=process.argv.slice(2);if(mode.length!==1||!['--local','--remote'].includes(mode[0]))throw Error('Choose exactly --local or --remote.');
const source=await readFile('sitekit.config.json','utf8'),site=JSON.parse(source),hash=createHash('sha256').update(source).digest('hex');
await mkdir('.sitekit',{recursive:true});
try{const existing=await readFile('.sitekit/bootstrap-config.sha256','utf8');if(existing!==hash)throw Error('Configuration changed. Existing setup is preserved; use an explicit grant/migration operation.');}
catch(e){if(e.code!=='ENOENT')throw e;await writeFile('.sitekit/bootstrap.sql',createStandaloneBootstrapSql({...site,initialValues:parseSettingsValues(site.initialValues)},site.administrators),{mode:0o600});await writeFile('.sitekit/bootstrap-config.sha256',hash,{mode:0o600});}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','SITEKIT_DB',mode[0],'--file','.sitekit/bootstrap.sql'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
console.log('Saved settings and explicit grants are initialized. Sign in at /admin and apply each initial settings section.');
