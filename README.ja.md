# SiteKit

[English](https://github.com/dataarthub/sitekit/blob/main/README.md) | [日本語](https://github.com/dataarthub/sitekit/blob/main/README.ja.md)

日本語の公開SiteKitドキュメントは[ドキュメントサイト](https://tech-docs.alneas.com/ja/sitekit/)を参照してください。未翻訳・レビュー待ちのページは英語へフォールバックする場合があります。

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&style=flat)](https://www.typescriptlang.org/) [![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-green?logo=nodedotjs&style=flat)](https://nodejs.org/) [![Astro](https://img.shields.io/badge/Astro-framework-purple?logo=astro&style=flat)](https://docs.astro.build/)

## Elevator Pitch

Astroの開発者が、明示的なコンテンツ・ホスティング契約を使って静的サイトと基本的なコンテンツ管理を構築するためのフレームワークです。

## Why & Value

独立したサイトのコンテンツ入力とホスティングを設定できます。一つの固定リビジョンからビルドし、コンテンツ・画像・ページの版を揃えます。基本編集とストレージは公開アダプターで追加し、業務固有のテーマや高度なStudio連携は別の拡張として扱います。

## Key Highlights

- インライン・ファイル・HTTP入力を検証するサイト設定。
- 静的生成前のリビジョン・画像整合性確認。
- 一覧・検索・下書き保存・公開を備えた基本Markdown管理。
- Cloudflareの投影・計測・コマース・編集アダプターを任意で追加。

## Quickstart

Node.js 24以上が必要です。リポジトリ開発と次の手順ではBun 1.4.0を使用します。利用者はnpm・pnpm・Yarnも選べます。この案内は0.2.0候補を対象とし、npm配信が確認されるまでは検証済みのローカルアーカイブを使用します。任意のReact画面は公開Appkit Core 0.2.1／React 0.3.0を使用します。

```bash
bun add ./alneas-sitekit-0.2.0.tgz astro@^7.3.3
```

次をexample.tsとして保存し、bun example.tsで実行してください。

```typescript
import { defineSite } from '@alneas/sitekit/config';

const site = defineSite({
  id: 'example', revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
console.log(site.id, site.revision); // example 1
```

## Next Steps

英語での質問・不具合報告も歓迎します。上のEnglishから正本を確認し、次の窓口・ガイドをご利用ください。資格情報や顧客データを投稿しないでください。


English questions and issue reports are welcome through [GitHub Issues](https://github.com/dataarthub/sitekit/issues). Never include credentials or customer data in reports.

- [Contributing and local checks](https://github.com/dataarthub/sitekit/blob/main/CONTRIBUTING.md) and [maintainer release procedure](https://github.com/dataarthub/sitekit/blob/main/RELEASING.md)

- [Core change history](https://github.com/dataarthub/sitekit/blob/main/packages/core/CHANGELOG.md)
- [Error codes and corrective actions](docs/errors.md) and [configuration JSON Schema](docs/guides/site-schema.md)
- [Consumer AI guidance](docs/guides/ai-consumer.md); `llms-full.txt` contains the generated full public guide compilation.
- [Release verification and publishing order](docs/guides/release.md)
- [Online documentation](https://tech-docs.alneas.com/sitekit/)
- [First site configuration](docs/tutorials/first-site.md)
- [Basic management tutorial](docs/tutorials/basic-admin.md)
- [Studio integration guide](docs/guides/public-studio.md)
- [Site API](docs/api.md), [Studio API](docs/studio-api.md) and [public exports](docs/exports.md)
- [Architecture and boundaries](docs/architecture.md)
- [Cloudflare adapters](packages/cloudflare/README.md)
- [Extension boundaries](docs/extensions.md)
- [Verify a source candidate](docs/guides/verify-source.md)

SiteKit is the new product name. The 0.1.0 packages are published; these guides describe the 0.2.0 release candidates. Portal links are navigation targets and do not establish that the portal serves this candidate revision. Keep candidate APIs out of the default released portal until each corresponding package is confirmed published; see the [documentation handoff](docs/guides/release.md#5-select-documentation-for-the-delivered-targets).
