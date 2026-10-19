import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { withDocumentationConsumer, typecheckDocumentationExamples } from './docs-consumer.mjs';

const root = resolve(import.meta.dirname, '..');
test('documentation resolves packed exports and React types in a clean consumer without workspace links', async () => {
  let consumer;
  await assert.rejects(withDocumentationConsumer(root, async directory => {
    consumer = directory;
    assert(realpathSync(directory).startsWith(realpathSync(tmpdir()) + '/'));
    assert(!realpathSync(directory).startsWith(realpathSync(root) + '/'));
    for (const name of ['@alneas/sitekit', '@alneas/sitekit-cloudflare']) {
      const installed = join(directory, 'node_modules', name);
      assert(!lstatSync(installed).isSymbolicLink(), 'Packed packages must not resolve through workspace symlinks');
      assert(realpathSync(installed).startsWith(realpathSync(directory) + '/'));
    }
    const require = createRequire(join(directory, 'package.json'));
    assert(realpathSync(require.resolve('@alneas/sitekit/config')).startsWith(realpathSync(directory) + '/node_modules/'));
    typecheckDocumentationExamples(directory, [
      {source:'clean-core', code:"import {defineSite} from '@alneas/sitekit/config'; const site = defineSite({id:'example',content:{snapshot:{siteId:'example',revision:1,posts:[],assets:[]}}}); console.log(site.id);"},
      {source:'clean-adapter', code:"import {parseCloudflareSnapshotManifest} from '@alneas/sitekit-cloudflare'; console.log(typeof parseCloudflareSnapshotManifest);"},
      {source:'clean-react', language:'tsx', code:"import '@alneas/appkit-react/styles'; import '@alneas/sitekit/studio/basic.css'; import {BasicStudioApp} from '@alneas/sitekit/studio/basic'; import {createHttpStudioProvider} from '@alneas/sitekit/studio/http-provider'; export const screen = <BasicStudioApp provider={createHttpStudioProvider()} collections={[{id:'posts',label:'Posts'}]} />;"},
    ]);
    assert.throws(() => typecheckDocumentationExamples(directory, [{source:'unsupported-export',code:"import {missing} from '@alneas/sitekit/not-public'; console.log(missing);"}]), /unsupported-export:.*Cannot find module/);
    throw Error('Exercise consumer cleanup after a failed check');
  }), /Exercise consumer cleanup/);
  assert(consumer);
  assert(!existsSync(consumer), 'Failed checks must remove their disposable consumer');
});
