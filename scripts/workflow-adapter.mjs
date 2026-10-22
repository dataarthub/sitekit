import {spawnSync} from 'node:child_process';
if(process.argv[2]!=='compatibility')throw Error('Use compatibility');
for(const script of ['build:all','typecheck:all','test:all']){const r=spawnSync('bun',['run',script],{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0){process.exitCode=r.status??1;break;}}
