// Loopback development identity only. Production Worker rejects these keys on public origins.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {generateKeyPair,exportJWK,importJWK,SignJWT} from 'jose';
import {randomBytes} from 'node:crypto';
try { await readFile('.gitignore'); } catch (e) { if (e.code !== 'ENOENT') throw e; await writeFile('.gitignore', await readFile('gitignore.template', 'utf8')); }
const site=JSON.parse(await readFile('sitekit.config.json','utf8'));await mkdir('.sitekit',{recursive:true});
let pair;try{pair=JSON.parse(await readFile('.sitekit/dev-keys.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const keys=await generateKeyPair('RS256',{extractable:true});pair={private:await exportJWK(keys.privateKey),public:{...await exportJWK(keys.publicKey),kid:'local-dev'}};await writeFile('.sitekit/dev-keys.json',JSON.stringify(pair),{mode:0o600});}
const key=await importJWK(pair.private,'RS256');const origin='http://127.0.0.1:8787';
try{await readFile('.dev.vars');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile('.dev.vars',`SITEKIT_DEV_ORIGIN=${JSON.stringify(origin)}\nSITEKIT_DEV_JWKS='${JSON.stringify({keys:[pair.public]})}'\nSITEKIT_CURRENT_KEY_ID="local"\nSITEKIT_SECRET_KEYS='${JSON.stringify({local:randomBytes(32).toString('base64')})}'\n`,{mode:0o600});}
createServer(async(req,res)=>{if(req.url!=='/login'){res.writeHead(404);res.end();return;}const jwt=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'local-dev'}).setSubject('local-editor').setIssuer(site.access.issuer).setAudience(site.access.audience).setIssuedAt().setExpirationTime('1h').sign(key);res.writeHead(303,{'Set-Cookie':`CF_Authorization=${jwt}; HttpOnly; SameSite=Strict; Path=/`,'Location':origin+'/admin','Cache-Control':'no-store'});res.end();}).listen(8790,'127.0.0.1',()=>console.log('Local signed login: http://127.0.0.1:8790/login — keep this process running, then start npm run dev.'));
