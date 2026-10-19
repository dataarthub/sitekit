import { SiteKitError } from '../errors/index.js';
import { readFile } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';
import { parsePublishedSnapshot, type EaosCmsPublishedSnapshot, type EaosCmsPublishedContentRecord } from './eaos-cms.js';
/**
 * Lazy build source: inline snapshot, then local file, then HTTP endpoint, with expected site/revision and request settings.
 */
export interface CmsSource {
  /**
   * Inline publication DTO; reading validates its contents before use.
   */
  snapshot?: unknown;
  /**
   * Publication endpoint URL; the consuming API enforces its transport restrictions.
   */
  endpoint?: string | undefined;
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId?: string | undefined;
  /**
   * HTTP headers supplied by the host; keep authentication values in server-side code.
   */
  headers?: Record<string,string>;
  /**
   * Local snapshot file path resolved by the build process.
   */
  file?: string | undefined;
  /**
   * Snapshot HTTP method: GET or POST; defaults to POST when omitted.
   */
  method?: string | undefined;
  /**
   * Explicit local-file preview opt-in; readers also require an unexpired draft marker.
   */
  draftPreview?: boolean;
  /**
   * Expected positive safe integer publication revision; a mismatch rejects the cached read.
   */
  revision?: number | undefined }
/**
 * Creates a lazy reader that caches one validated publication promise, including its failures.
 *
 * @param source - Callback evaluated on the first read to obtain the source and expected site/revision.
 * @param fetchClient - HTTP implementation used only for endpoint sources.
 * @returns A zero-argument reader whose first invocation evaluates source and creates one promise resolving to the validated snapshot, or null when no source is configured. Every later invocation returns that same promise, including a cached null result or rejection.
 * @throws The returned reader rejects SiteKitError for owned configuration, I/O, transport, JSON, size, validation, preview and identity/revision failures. Source callback errors propagate unchanged. Configured failures never fall back to another source.
 * @remarks Node/build use only. Reading is lazy: creating the reader does not evaluate source or load a publication. The first invocation pins the source and outcome for the reader lifecycle; missing sources and failures are cached without retry. Create a new reader to start a new read lifecycle. Inline data takes precedence over file, then endpoint. HTTP endpoints reject credentials, query strings, fragments, and non-HTTPS origins except loopback; redirects are rejected and requests time out after 30 seconds. Serialized snapshots are limited to 8 MiB. Draft previews require an unexpired draft marker and explicit local-file preview mode.
 * @example
 * ```ts
 * import { createCmsSnapshotReader } from '@alneas/sitekit/content/cms-loader';
 * const read = createCmsSnapshotReader(() => ({ siteId: 'example', snapshot: { siteId: 'example', revision: 1, posts: [] } }));
 * const snapshot = await read();
 * ```
 */
export function createCmsSnapshotReader(source: () => CmsSource, fetchClient: typeof fetch = fetch) {
 let publication: Promise<EaosCmsPublishedSnapshot | null> | undefined;
 /**
  * Reads the configured publication once and reuses its validated result or failure on later calls.
  *
  * @returns The cached promise resolving to the validated publication, or null when no inline, file, or endpoint source is configured.
  * @throws Rejects with SiteKitError for configuration, reading, validation, preview, site, or revision failures; source callback errors propagate unchanged. The rejected promise is cached without retry.
  * @remarks The source callback is evaluated on the first invocation. Reusing this reader pins all callers to that first read, including an absent source or failure; create another reader to begin a new read lifecycle.
  * @example
  * ```ts
  * import { createCmsSnapshotReader } from '@alneas/sitekit/content/cms-loader';
  * const read = createCmsSnapshotReader(() => ({
  *   siteId: 'example',
  *   snapshot: { siteId: 'example', revision: 1, posts: [] },
  * }));
  * const firstRead = read();
  * const repeatedRead = read();
  * console.log(firstRead === repeatedRead); // true: both calls share the pinned read.
  * const publication = await firstRead;
  * console.log(publication?.revision); // 1
  * ```
  */
 return () => publication ??= (async () => {
  const input=source(); if(input.snapshot===undefined&&!input.endpoint&&!input.file)return null;
  if(!input.siteId)throw new SiteKitError('SK_CONFIG_INVALID','EAOS_CMS_SITE_ID is required for configured CMS builds');
  if(input.revision!==undefined&&(!Number.isSafeInteger(input.revision)||input.revision<1))throw new SiteKitError('SK_CONFIG_INVALID','CMS revision must be a positive integer');
  let text: string;
  if(input.snapshot!==undefined) {
   try { text=JSON.stringify(input.snapshot); }
   catch(cause) { throw new SiteKitError('SK_SNAPSHOT_INVALID','Snapshot cannot be serialized',{cause}); }
  } else if(input.file) {
   try { text=await readFile(input.file,'utf8'); }
   catch(cause) { throw new SiteKitError('SK_CONTENT_READ_FAILED','CMS snapshot file could not be read',{cause}); }
  } else {
   let endpoint: URL;
   try { endpoint=new URL(input.endpoint!); }
   catch(cause) { throw new SiteKitError('SK_CONFIG_INVALID','Invalid CMS endpoint URL',{cause}); }
   if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)))throw new SiteKitError('SK_CONFIG_INVALID','CMS endpoint requires a trusted HTTPS origin without credentials');
   const method=input.method??'POST';if(!['GET','POST'].includes(method))throw new SiteKitError('SK_CONFIG_INVALID','EAOS_CMS_HTTP_METHOD must be GET or POST');
   try {
    const response=await fetchClient(input.endpoint!,{method,redirect:'error',headers:{'Content-Type':'application/json',...input.headers},...(method==='POST'?{body:JSON.stringify({siteId:input.siteId})}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new SiteKitError('SK_CONTENT_READ_FAILED',`CMS snapshot request failed (${response.status})`);
    text=await response.text();
   } catch(cause) {
    if(cause instanceof SiteKitError)throw cause;
    throw new SiteKitError('SK_CONTENT_READ_FAILED','CMS snapshot request failed',{cause});
   }
  }
  if(new TextEncoder().encode(text).length>8*1024*1024)throw new SiteKitError('SK_SNAPSHOT_INVALID','CMS snapshot too large');
  let raw: any;
  try { raw=JSON.parse(text); }
  catch(cause) { throw new SiteKitError('SK_SNAPSHOT_INVALID','CMS snapshot is not valid JSON',{cause}); }
  const marker=raw?.preview;
  if(marker&&(!input.file||!input.draftPreview||marker.kind!=='draft'||!Number.isFinite(Date.parse(marker.expiresAt))||Date.parse(marker.expiresAt)<=Date.now()))throw new SiteKitError('SK_SNAPSHOT_INVALID','Authorized unexpired draft preview mode required');
  let validated: EaosCmsPublishedSnapshot;
  try { validated=parsePublishedSnapshot(raw); }
  catch(cause) { throw new SiteKitError('SK_SNAPSHOT_INVALID','Invalid CMS snapshot publication',{cause}); }
  if(validated.siteId!==input.siteId)throw new SiteKitError('SK_SITE_ID_MISMATCH','CMS snapshot siteId mismatch');
  if(input.revision!==undefined&&validated.revision!==input.revision)throw new SiteKitError('SK_REVISION_MISMATCH',`CMS snapshot revision mismatch: expected ${input.revision}, received ${validated.revision}`);
  return validated;
 })();
}
/**
 * Mapped CMS entry targeting an Astro collection with schema input and optional Markdown body.
 */
export interface CmsLoaderRecord {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id:string;
  /**
   * Collection name used to group and select records.
   */
  collection:string;
  /**
   * Source-specific payload retained without sanitizing arbitrary fields.
   */
  data:Record<string,unknown>;
  /**
   * Optional Markdown body passed to Astro rendering after data parsing.
   */
  body?:string }
/**
 * Creates an Astro Content Layer loader that replaces a collection with mapped CMS entries when available.
 *
 * @param name - Collection name; media selects the dedicated asset mapping path.
 * @param options - Local fallback loader, managed-mode flag, snapshot reader, post mapper, and optional localized-alt requirement.
 * @returns An Astro loader that parses entries before clearing and replacing its collection store.
 * @throws Snapshot, mapping, parsing, rendering, store, and required-media-metadata errors reject the loader operation.
 * @remarks Requires Astro loader context. Unmanaged non-media collections use the local loader; any collection falls back locally when no snapshot is configured. CMS media requires supported formats and positive integer dimensions.
 * @example
 * ```ts
 * import { createCmsContentLoader, createCmsSnapshotReader } from '@alneas/sitekit/content/cms-loader';
 * const loadSnapshot = createCmsSnapshotReader(() => ({}));
 * import type { Loader } from 'astro/loaders';
 * export function postsLoader(local: Loader) {
 *   return createCmsContentLoader('posts', {
 *     local, managed: true, loadSnapshot,
 *     mapPost: post => ({ id: post.id, collection: 'posts', data: { title: post.title }, body: post.bodyMarkdown }),
 *   });
 * }
 * ```
 */
export function createCmsContentLoader(name:string, options:{
  /**
   * Astro loader used when the collection is unmanaged or no snapshot is available.
   */
  local:Loader;
  /**
   * Whether CMS content replaces this non-media collection; unmanaged collections use the local loader.
   */
  managed:boolean;
  /**
   * Reads the build-pinned publication or indicates that no source is configured.
   *
   * @returns The selected publication snapshot, or null when no source is configured.
   * @example
   * ```ts
   * import type { createCmsContentLoader } from '@alneas/sitekit/content/cms-loader';
   * type Callback = NonNullable<Parameters<typeof createCmsContentLoader>[1]['loadSnapshot']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  loadSnapshot:()=>Promise<EaosCmsPublishedSnapshot|null>;
  /**
   * Maps a published CMS record to one Astro collection entry.
   *
   * @param post - Approved CMS publication record to map into an Astro collection.
   * @returns An Astro collection record including parsed-data input and optional Markdown.
   * @example
   * ```ts
   * import type { createCmsContentLoader } from '@alneas/sitekit/content/cms-loader';
   * type Callback = NonNullable<Parameters<typeof createCmsContentLoader>[1]['mapPost']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  mapPost:(post:EaosCmsPublishedContentRecord)=>CmsLoaderRecord;
  /**
   * Whether CMS media must include both Japanese and English alt text.
   */
  requireLocalizedAlt?:boolean}):Loader {
 return {name:`eaos-cms-${name}`,async load(context){
  if(!options.managed&&name!=='media')return options.local.load(context);
  const snapshot=await options.loadSnapshot();if(!snapshot)return options.local.load(context);
  if(name==='media'){
   const entries=await Promise.all((snapshot.assets??[]).map(async asset=>{
    if(options.requireLocalizedAlt&&(typeof asset.altJa!=='string'||typeof asset.altEn!=='string'))throw Error(`Language-specific media alt text required: ${asset.id}`);
    const data:any=await context.parseData({id:asset.id,data:{file:asset.cdnUrl,altJa:asset.altJa??'',altEn:asset.altEn??'',...(asset.category!==undefined?{category:asset.category}:{}),...(asset.tags?{tags:asset.tags}:{})}});
    const format=asset.mimeType?.replace('image/','').replace('jpeg','jpg').replace('svg+xml','svg');
    if(!format||!['avif','gif','jpg','png','svg','tiff','webp'].includes(format)||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width!<=0||asset.height!<=0)throw Error(`Verified image dimensions and format required: ${asset.id}`);
    data.file={src:asset.cdnUrl,width:asset.width,height:asset.height,format};return {id:asset.id,data,rendered:{html:'',metadata:{eaosCms:true,cmsRevision:snapshot.revision}}};
   }));context.store.clear();for(const entry of entries)context.store.set(entry);return;
  }
  const posts=snapshot.posts.map(options.mapPost).filter(record=>record.collection===name);
  const entries=await Promise.all(posts.map(async record=>{
   const fields={...record.data};if(typeof fields.publishDate==='string')fields.publishDate=new Date(fields.publishDate);
   const data=await context.parseData({id:record.id,data:fields}),rendered=await context.renderMarkdown(record.body??'');
   return {id:record.id,data,body:record.body??'',digest:context.generateDigest({...record}),rendered:{...rendered,metadata:{...rendered.metadata,eaosCms:true,cmsRevision:snapshot.revision}}};
  }));context.store.clear();for(const entry of entries)context.store.set(entry);context.logger.info(`CMS ${snapshot.siteId} revision ${snapshot.revision}: ${name} ${entries.length}`);
 }};
}
