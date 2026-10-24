# SiteKit

[English](https://github.com/dataarthub/sitekit/blob/main/packages/core/README.md) | [日本語](https://github.com/dataarthub/sitekit/blob/main/packages/core/README.ja.md)

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&style=flat)](https://www.typescriptlang.org/) [![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-green?logo=nodedotjs&style=flat)](https://nodejs.org/) [![Astro](https://img.shields.io/badge/Astro-framework-purple?logo=astro&style=flat)](https://docs.astro.build/)

## Elevator Pitch

Astro developers use this framework to build static sites and basic content management around explicit content and hosting contracts.

## Why & Value Proposition

Configure an independent site using explicit content sources and standard hosting contracts.
Build from one pinned publication so content, media and generated pages share a revision.
Add public editing and storage adapters where needed; domain templates and advanced Studio integrations remain separate extensions.

## Key Highlights

- Validated site configuration with inline, file or HTTP content sources.
- Revision and image integrity checks before static rendering.
- Basic Markdown management with list/search, draft saving and publishing.
- Optional Cloudflare projection, analytics, commerce and editing adapters.

## Quickstart

Use Node.js 24+. Bun 1.4.0 is used for repository development and the commands below; installed consumers may use npm, pnpm or Yarn. These guides target the 0.2.0 release candidate. Until that version is confirmed readable from npm, start with its locally packed public core artifact from a verified source candidate. Appkit Core 0.2.1 / React 0.3.0 is available from npmjs when using the optional React screen.

```bash
bun add ./alneas-sitekit-0.2.0.tgz astro@^7.3.3
```

Save as `example.ts`, then run `bun example.ts`:

```typescript
import { defineSite } from '@alneas/sitekit/config';

const site = defineSite({
  id: 'example', revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
console.log(site.id, site.revision); // example 1
```

## Next Steps

English questions and issue reports are welcome through [GitHub Issues](https://github.com/dataarthub/sitekit/issues). Never include credentials or customer data in reports.

- [Contributing and local checks](https://github.com/dataarthub/sitekit/blob/main/CONTRIBUTING.md) and [maintainer release procedure](https://github.com/dataarthub/sitekit/blob/main/RELEASING.md)

- [Core change history](https://github.com/dataarthub/sitekit/blob/main/packages/core/CHANGELOG.md)
- [Error codes and corrective actions](https://tech-docs.alneas.com/sitekit/docs/errors/) and [configuration JSON Schema](https://tech-docs.alneas.com/sitekit/docs/guides/site-schema/)
- [Consumer AI guidance](https://tech-docs.alneas.com/sitekit/docs/guides/ai-consumer/); `llms-full.txt` contains the generated full public guide compilation.
- [Release verification and publishing order](https://tech-docs.alneas.com/sitekit/docs/guides/release/)
- [Online documentation](https://tech-docs.alneas.com/sitekit/)
- [First site configuration](https://tech-docs.alneas.com/sitekit/docs/tutorials/first-site/)
- [Basic management tutorial](https://tech-docs.alneas.com/sitekit/docs/tutorials/basic-admin/)
- [Studio integration guide](https://tech-docs.alneas.com/sitekit/docs/guides/public-studio/)
- [Site API](https://tech-docs.alneas.com/sitekit/docs/api/), [Studio API](https://tech-docs.alneas.com/sitekit/docs/studio-api/) and [public exports](https://tech-docs.alneas.com/sitekit/docs/exports/)
- [Architecture and boundaries](https://tech-docs.alneas.com/sitekit/docs/architecture/)
- [Cloudflare adapters](https://tech-docs.alneas.com/sitekit/packages/cloudflare/)
- [Extension boundaries](https://tech-docs.alneas.com/sitekit/docs/extensions/)
- [Verify a source candidate](https://tech-docs.alneas.com/sitekit/docs/guides/verify-source/)

SiteKit is the new product name. The 0.1.0 packages are published; these guides describe the 0.2.0 release candidates. Portal links are navigation targets and do not establish that the portal serves this candidate revision. Keep candidate APIs out of the default released portal until each corresponding package is confirmed published; see the [documentation handoff](https://tech-docs.alneas.com/sitekit/docs/guides/release/#5-select-documentation-for-the-delivered-targets).
