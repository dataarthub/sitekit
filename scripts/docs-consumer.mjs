// Compile documentation against installed archive declarations, never workspace source links.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Project, ts } from 'ts-morph';

const publicDependencies = ['astro', '@alneas/appkit-core', '@alneas/appkit-react', 'react', 'react-dom', '@types/node', '@types/react', '@types/react-dom'];
function run(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NPM_CONFIG_USERCONFIG: '/dev/null', NODE_PATH: '' },
  });
  assert(!result.error && result.status === 0, `Documentation consumer npm command failed: ${args[0]}\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

export async function withDocumentationConsumer(root, inspect) {
  const temporary = await mkdtemp(join(tmpdir(), 'sitekit-docs-consumer-'));
  try {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const dependencies = {};
    for (const name of publicDependencies) {
      const version = manifest.devDependencies?.[name];
      assert(typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version), `Documentation peer requires an exact owning-manifest version: ${name}`);
      dependencies[name] = version;
    }
    for (const directory of ['core', 'cloudflare']) {
      const [artifact] = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], join(root, 'packages', directory)));
      dependencies[artifact.name] = `file:${join(temporary, artifact.filename)}`;
    }
    const consumer = join(temporary, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }));
    run(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], consumer);
    return await inspect(consumer);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function typecheckDocumentationExamples(consumer, snippets) {
  const examples = new Project({ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, noEmit: true } });
  // These exact stylesheet exports are independently verified by the public import checker.
  examples.createSourceFile(join(consumer, 'styles.d.ts'), "declare module '@alneas/appkit-react/styles'; declare module '@alneas/sitekit/studio/basic.css';");
  for (const [index, snippet] of snippets.entries()) {
    const extension = snippet.language === 'tsx' || /<(?:BasicStudioApp|ReactToolsCollectionList|p)[\s/>]/.test(snippet.code) ? 'tsx' : 'mts';
    examples.createSourceFile(join(consumer, `example-${index}.${extension}`), 'export {};\n' + snippet.code);
  }
  const diagnostics = examples.getPreEmitDiagnostics();
  if (diagnostics.length) {
    const details = diagnostics.map(item => {
      const match = /example-(\d+)\.(?:tsx|mts)$/.exec(item.getSourceFile()?.getFilePath() ?? '');
      return `${match ? snippets[Number(match[1])].source : 'declaration'}: ${item.getMessageText().toString()}`;
    });
    throw Error('Documentation examples do not typecheck:\n' + details.join('\n'));
  }
}
