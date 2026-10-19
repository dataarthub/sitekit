# SiteKit

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

Use Node.js 24+. Bun 1.4.0 is used for repository development and the commands below; installed consumers may use npm, pnpm or Yarn. Initial npm publication of this framework is pending; start with the locally packed public core artifact from a verified source candidate. Appkit 0.2.0 is available from npmjs when using the optional React screen.

```bash
bun add ./alneas-sitekit-0.1.0.tgz astro@^7.3.3
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

SiteKit is the new product name. These guides describe the unpublished 0.1.0 source candidates. Portal links are navigation targets and do not establish that the portal serves this candidate revision. Keep candidate APIs out of the default released portal until each corresponding package is confirmed published; see the [documentation handoff](docs/guides/release.md#5-select-documentation-for-the-delivered-targets).
