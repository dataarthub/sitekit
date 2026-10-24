# SiteKit Cloudflare Adapters

[English](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/README.md) | [日本語](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/README.ja.md)

日本語の公開SiteKitドキュメントは[ドキュメントサイト](https://tech-docs.alneas.com/ja/sitekit/)を参照してください。未翻訳・レビュー待ちのページは英語へフォールバックする場合があります。

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&style=flat)](https://www.typescriptlang.org/) [![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-green?logo=nodedotjs&style=flat)](https://nodejs.org/) [![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-orange?logo=cloudflare&style=flat)](https://developers.cloudflare.com/d1/)

## Elevator Pitch

サイト開発者が、公開サイト・編集契約をCloudflareのストレージとイベントサービスへ接続するためのアダプターです。

## Why & Value

Cloudflareのバインディングと資格情報をブラウザや汎用Coreから分離します。上流の公開システムが原本を管理する場合はD1/R2の再構築可能な投影を使い、ホストが原本を持つ場合は独立した編集プロバイダーを使います。認証とテナント権限はサーバーが明示的に提供します。

## Key Highlights

- リビジョン付きD1/R2スナップショットの準備・昇格・ロールバック。
- ホストの認証境界を通したD1のMarkdown下書き・公開。
- コマース・メディア・実験・SNS outboxを任意で追加。
- QueueとAnalytics Engineへのイベント送信。

## Quickstart

Node.js 24以上が必要です。開発・手順ではBun 1.4.0を使用し、利用側はnpm・pnpm・Yarnも使えます。0.2.0の配信が確認されるまで、同じ検証済み候補から両方のアーカイブを導入してください。Worker例にはANALYTICSというQueue producer bindingを用意し、許可originを実際の公開サイトに置き換えます。POST /api/analyticsで検証したバッチを受け取り、濫用対策と下流処理はホストが担当します。Queueへの受理は永続化の完了を意味せず、origin制限は呼出元の認証にはなりません。

```bash
bun add ./alneas-sitekit-cloudflare-0.2.0.tgz ./alneas-sitekit-0.2.0.tgz astro@^7.3.3
```

```typescript
import {
  createAnalyticsIngestHandler, createQueueAnalyticsIngestAdapter,
  type CloudflareAnalyticsQueue,
} from '@alneas/sitekit-cloudflare';

type Env = { ANALYTICS: CloudflareAnalyticsQueue };
const analytics = createAnalyticsIngestHandler<Env>({
  bindings: env => createQueueAnalyticsIngestAdapter(env.ANALYTICS),
  allowedOrigins: ['https://example.com'],
});

export default {
  fetch(request: Request, env: Env) {
    return analytics(request, env);
  },
};
```

## Next Steps

英語での質問・不具合報告も歓迎します。上のEnglishから正本を確認し、次の窓口・ガイドをご利用ください。資格情報や顧客データを投稿しないでください。


English questions and issue reports are welcome through [GitHub Issues](https://github.com/dataarthub/sitekit/issues). Never include credentials or customer data in reports.

- [Cloudflare adapter change history](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/CHANGELOG.md)
- [Online documentation](https://tech-docs.alneas.com/sitekit/packages/cloudflare/)
- [Connect basic editing](https://tech-docs.alneas.com/sitekit/docs/guides/public-studio/)
- [Manifest parser API](https://tech-docs.alneas.com/sitekit/docs/cloudflare-api/)
- [Editing API](https://tech-docs.alneas.com/sitekit/docs/studio-api/)
- [Public imports and runtime constraints](https://tech-docs.alneas.com/sitekit/docs/exports/)
- [Architecture and content ownership](https://tech-docs.alneas.com/sitekit/docs/architecture/)
- [Verify the local adapters](https://tech-docs.alneas.com/sitekit/docs/guides/verify-source/)
