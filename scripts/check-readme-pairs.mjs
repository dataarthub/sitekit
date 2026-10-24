// Project-owned checks complement the unchanged shared structural README checker.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const languages=text=>/\[English\]\([^)]*README\.md\)\s*\|\s*\[日本語\]\([^)]*README\.ja\.md\)/.test(text.split(/^## /m)[0]);
const badges=text=>[...text.matchAll(/!\[[^\]]+\]\(https:\/\/img\.shields\.io\/[^)]+\)/g)].map(m=>m[0]);
const blocks=text=>[...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(m=>m[1]);
export function checkReadmePair(english,japanese){
 const errors=[];
 if(!languages(english)||!languages(japanese))errors.push('Reciprocal English/Japanese links required');
 const en=badges(english),ja=badges(japanese);
 if(en.length<3||en.length>6||JSON.stringify(en)!==JSON.stringify(ja))errors.push('Matching 3–6 descriptive technology badges required');
 if(!english.includes('English questions and issue reports are welcome')||!english.includes('/issues'))errors.push('English support and actual issue channel required');
 if(!japanese.includes('https://tech-docs.alneas.com/ja/sitekit/')||!japanese.includes('英語'))errors.push('Japanese landing and translation coverage notice required');
 if(JSON.stringify(blocks(english))!==JSON.stringify(blocks(japanese)))errors.push('README code/commands differ between languages');
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const config=JSON.parse(readFileSync('readme-policy.json','utf8'));let failed=false;
 for(const name of config.readmes.filter(name=>name.endsWith('README.md'))){
  try{const issues=checkReadmePair(readFileSync(name,'utf8'),readFileSync(name.replace(/README\.md$/,'README.ja.md'),'utf8'));for(const issue of issues){console.error(name+': '+issue);failed=true;}}catch{console.error(name+': missing or unreadable README pair');failed=true;}
 }
 if(failed)process.exitCode=1;else console.log('README language, badge, support and code parity checks passed.');
}
