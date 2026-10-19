import test from 'node:test';
import assert from 'node:assert/strict';
import { packageReadme } from './package-readme.mjs';
const manifest = { projectId: 'sitekit', documents: [{ source: 'docs/api.md', slug: 'docs/api' }, { source: 'docs/cloudflare.md', slug: 'packages/cloudflare' }] };
test('package copies use public routes instead of ignored package docs', () => {
 assert.equal(packageReadme('[API](docs/api.md#types) [CF](packages/cloudflare/README.md)', manifest), '[API](https://tech-docs.alneas.com/sitekit/docs/api/#types) [CF](https://tech-docs.alneas.com/sitekit/packages/cloudflare/)');
});
test('preserves external and package-local license links, rejecting unknown sources', () => {
 assert.equal(packageReadme('[License](LICENSE) [Other](https://example.com)', manifest), '[License](LICENSE) [Other](https://example.com)');
 assert.throws(() => packageReadme('[Missing](docs/private.md)', manifest), /public manifest/);
});
