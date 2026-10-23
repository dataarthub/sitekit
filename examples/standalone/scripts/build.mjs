import {build} from 'esbuild';
import {mkdir,rename} from 'node:fs/promises';
await mkdir('dist/admin',{recursive:true});await mkdir('dist/assets',{recursive:true});
await build({entryPoints:['src/client.tsx'],outdir:'dist/admin',bundle:true,format:'esm',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:['src/analytics.ts'],outdir:'dist/assets',bundle:true,format:'esm',target:'es2022',minify:true,entryNames:'sitekit-analytics',define:{'process.env.NODE_ENV':'"production"'}});
await rename('dist/assets/sitekit-analytics.css','dist/assets/sitekit-consent.css');
