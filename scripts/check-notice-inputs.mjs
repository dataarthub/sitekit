// Validates inventory identity; this is not a license/legal sufficiency opinion.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export function verifyNoticeInputs(notices,lock,required){
 const selected=new Set(Object.values(lock.packages).map(row=>row[0]));const recorded=new Map();
 assert(Array.isArray(notices.packages)&&notices.packages.length,'Nonempty notice inventory required');
 for(const entry of notices.packages){
  assert(typeof entry.name==='string'&&!recorded.has(entry.name),'Duplicate or missing notice identity');
  assert(typeof entry.license==='string'&&entry.license.trim(),'License metadata required');
  assert(Array.isArray(entry.versions)&&entry.versions.length&&new Set(entry.versions).size===entry.versions.length,'Unique notice versions required');
  for(const version of entry.versions)assert(selected.has(entry.name+'@'+version),'Notice version is absent from current lockfile');
  recorded.set(entry.name,new Set(entry.versions));
 }
 for(const [name,version]of Object.entries(required))assert(recorded.get(name)?.has(version),'Required integration version missing from notices');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const json=file=>JSON.parse(readFileSync(file,'utf8').replace(/,(\s*[}\]])/g,'$1'));
 verifyNoticeInputs(json('THIRD_PARTY_NOTICES.json'),json('bun.lock'),json('scripts/boundary.json').publicAppkitVersions);
 console.log('Notice versions match the lockfile and required public integrations.');
}
