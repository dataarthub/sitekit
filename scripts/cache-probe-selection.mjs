// Bounded final-evidence runs use the same assertions as the full required gate.
export const cacheProbePhases=Object.freeze(['restore','inputs','environment','failures','coverage']);
export function parseCacheProbePhase(args){
 if(args.length===0)return 'all';
 if(args.length!==2||args[0]!=='--phase'||!['all',...cacheProbePhases].includes(args[1]))throw Error('Use --phase restore|inputs|environment|failures|coverage, or no arguments for all probes');
 return args[1];
}
export function executeCacheProbePhases(phase,groups){
 if(!['all',...cacheProbePhases].includes(phase)||!cacheProbePhases.every(name=>typeof groups[name]==='function'))throw Error('Complete known cache invariant groups required');
 for(const name of cacheProbePhases)if(phase==='all'||phase===name)groups[name]();
}
