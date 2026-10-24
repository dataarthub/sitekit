import {execFileSync} from 'node:child_process';
/** Captures a local release-tool process without a shell; failures never return partial output. */
export function captureProcess(command,args,options={}){
 return execFileSync(command,args,{encoding:'utf8',maxBuffer:16*1024*1024,...options});
}
