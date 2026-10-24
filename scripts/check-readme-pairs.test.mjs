import test from 'node:test';import assert from 'node:assert/strict';
import {checkReadmePair} from './check-readme-pairs.mjs';
const links='[English](README.md) | [日本語](README.ja.md)';
const badges='[![TypeScript](https://img.shields.io/badge/TypeScript-blue)](https://www.typescriptlang.org/) [![Node](https://img.shields.io/badge/Node-green)](https://nodejs.org/) [![Astro](https://img.shields.io/badge/Astro-purple)](https://astro.build/)';
const en='# Example\n'+links+'\n'+badges+'\nEnglish questions and issue reports are welcome: https://github.com/example/project/issues\n```ts\nconst value = 1;\n```';
const ja='# Example\n'+links+'\n日本語ドキュメント https://tech-docs.alneas.com/ja/sitekit/ 一部は英語です。\n'+badges+'\n```ts\nconst value = 1;\n```';
test('paired readmes preserve badges, commands and language/support links',()=>assert.deepEqual(checkReadmePair(en,ja),[]));
test('missing language, support, badges or translated code drift fails',()=>{
 for(const text of [en.replace(links,''),en.replace('English questions and issue reports are welcome','Support'),en.replace(badges,'')])assert(checkReadmePair(text,ja).length);
 assert(checkReadmePair(en,ja.replace('value = 1','value = 2')).length);
});
