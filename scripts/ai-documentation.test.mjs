import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
test('AI compilation uses normalized public routes, manifest order and same-run wrappers',()=>{
 const directory=mkdtempSync(join(tmpdir(),'sitekit-ai-docs-'));
 try{
  mkdirSync(join(directory,'packages/cloudflare'),{recursive:true});mkdirSync(join(directory,'docs'),{recursive:true});
  mkdirSync(join(directory,'skills/sitekit'),{recursive:true});
  writeFileSync(join(directory,'llms.txt'),'# Roadmap');
  writeFileSync(join(directory,'skills/sitekit/SKILL.md'),'Consumer fixture');
  writeFileSync(join(directory,'README.md'),'# Current overview\n\n[Guide](docs/page.md)\n');
  writeFileSync(join(directory,'packages/cloudflare/README.md'),'# Adapter\n');
  writeFileSync(join(directory,'docs/index.md'),'STALE WRAPPER');
  writeFileSync(join(directory,'docs/page.md'),'# Public guide\n');
  writeFileSync(join(directory,'docs/internal.md'),'INTERNAL FIXTURE EXCLUDED');
  writeFileSync(join(directory,'docs.manifest.json'),JSON.stringify({projectId:'sitekit',documents:[{source:'docs/index.md',slug:'index',visibility:'public'},{source:'docs/page.md',slug:'docs/page',visibility:'public'},{source:'docs/internal.md',slug:'internal',visibility:'internal'}]}));
  const output=join(directory,'output');
  const result=spawnSync(process.execPath,[join(root,'scripts/prepare-docs.mjs'),'--output-dir',output],{cwd:directory,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const full=readFileSync(join(output,'llms-full.txt'),'utf8');
  assert(full.includes('Canonical guide: https://tech-docs.alneas.com/sitekit/\n'));
  assert(!full.includes('sitekit//'));
  assert(full.includes('[Guide](https://tech-docs.alneas.com/sitekit/docs/page/)'));
  assert(full.indexOf('# Current overview')<full.indexOf('# Public guide'));
  assert(!full.includes('INTERNAL FIXTURE EXCLUDED'));assert(!full.includes('STALE WRAPPER'));
  assert.equal(readFileSync(join(directory,'docs/index.md'),'utf8'),'STALE WRAPPER');
  assert(!existsSync(join(directory,'llms-full.txt')));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('AI roadmap uses absolute HTTPS targets',()=>{
 const text=readFileSync(join(root,'llms.txt'),'utf8');
 const links=[...text.matchAll(/\]\(([^)]+)\)/g)];assert(links.length>=14);
 for(const [,target] of links)assert(target.startsWith('https://tech-docs.alneas.com/'),target);
});
