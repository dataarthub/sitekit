import {defineSite} from '@alneas/sitekit/config';
import {createSiteAstroConfig} from '@alneas/sitekit/build';
import {fileURLToPath} from 'node:url';
// Choose one source. An EAOS or standalone CMS endpoint must return the same public snapshot DTO.
const content=process.env.SITE_SNAPSHOT_URL
 ? {endpoint:process.env.SITE_SNAPSHOT_URL,method:'GET'}
 : {file:fileURLToPath(new URL('./snapshot.json',import.meta.url))};
export default await createSiteAstroConfig(defineSite({id:'example',revision:1,content}),({snapshot})=>({
 site:'https://example.com',vite:{define:{__SITE_SNAPSHOT__:JSON.stringify(snapshot)}},
}));
