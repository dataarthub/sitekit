---
title: "Verify the Source Candidate"
description: "Install public dependencies and verify the isolated core and Cloudflare packages."
sidebar:
  order: 10
archetype: "how-to"
project: "sitekit"
tags: ["astro", "verification"]
---

# Verify the Source Candidate

## Prerequisites

Bun 1.4.0, Node.js 24 or later, access to the public npm registry, and an extracted source candidate. No private registry or CMS credentials are required.

## Public import

The checks consume the package names and subpaths documented in the [public export reference](../exports.md). No private SDK or credentials are required. A minimal runtime import is:

```typescript
import { defineSite } from '@alneas/sitekit/config';
console.log(defineSite({ id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } } }).id);
```

## Step-by-Step Implementation

### 1. Install the locked dependencies

Run from the extracted project root:

```bash
bun install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
```

### 2. Validate the source boundary and packages

```bash
bun run verify:public
bun run typecheck:all
bun run docs:check
bun run test:all
bun run build:all
```

### 3. Verify builds and isolated package installation

```bash
bun run test:site-build
bun run test:consumer
```

### 4. Pack artifacts for the quickstarts

From the candidate root, put archives outside the checkout:

```bash
artifact_dir=$(mktemp -d)
bun pm pack --cwd packages/core --ignore-scripts --filename "$artifact_dir/alneas-sitekit-0.1.0.tgz"
bun pm pack --cwd packages/cloudflare --ignore-scripts --filename "$artifact_dir/alneas-sitekit-cloudflare-0.1.0.tgz"
```

Expected result: both tarballs exist in `$artifact_dir`; packing does not publish them. Copy the selected archives into a separate disposable consumer directory to use the quickstarts' `bun add ./alneas-sitekit-0.1.0.tgz` commands, or pass their absolute paths to `bun add`. Do not place archives in the checkout or commit them. Remove the temporary archives after verification.

These are development candidates. For a committed release candidate, use the [release guide](release.md) to prepare and validate a commit-bound bundle instead.

## Verification

The boundary check reports registered documentation, publishable package configuration and the required full release validation hook. The tests cover the generic core and adapter. The build smoke test produces equivalent static HTML from inline, file and HTTP inputs, with verified image bytes. The consumer test packs both packages, checks their MIT license files, installs them into a temporary project and imports their public entry points, including the basic management screen, HTTP client, Studio contracts, metadata, the collection table and Cloudflare editing APIs. SQLite persistence is checked with the actual public schema. The optional table requires compatible React peers and the Appkit stylesheet; see [public Studio integrations](public-studio.md).

## Troubleshooting / Common Pitfalls

- Dependency download failures: check public npm connectivity and Bun's writable temporary/cache directories.
- Image mismatch or missing hash: correct the publication and image bytes together; do not disable verification.
- A private-file boundary failure: keep operator records, proprietary integrations and dependency archives outside the source candidate.
- Package publication fails during validation: correct the reported boundary, dependency, documentation, build or test failure, then rerun the gate. The workspace root remains private; select one of the two publishable packages.

## Maintainer documentation checks

`bun run docs:prepare` wraps the canonical plain READMEs in metadata-bearing landing documents. `bun run docs:check` runs `test:jsdoc`, builds declarations, checks the explicit public manifest, validates feature imports against the selected package exports, and typechecks guide/JSDoc examples as ESM with Astro-style bundler resolution. JSDoc coverage follows canonical declarations reachable through the approved exports, including nested members, callbacks, overloads, type parameters and constraints, and inferred return types inside containers. Re-exported contracts are checked once; private and protected class members and unrelated implementation locals are excluded. Summaries and callable parameter, result and example tags are required at the owning contract. Regression tests exercise missing contracts and valid examples; structural coverage cannot establish that prose accurately describes behavior, so review descriptions against implementation and existing behavior tests. Stylesheet imports are validated against exports; bundling is checked separately by the consumer test.

The source candidate contains no documentation website or translation runtime. Run the downstream portal's importer with `--verify` against this project's manifest when its checkout is available; that read-only preflight is separate from actual ingestion and publication. Edit sources here, not generated portal pages.

## Content, authority and lifecycle assessment

`bun run test:contracts` executes the required content/build, access/AI, stored
projection and Studio handler contracts. Its JSON report must contain every
selected file, with nonempty tests and no skipped, todo or failed assertions.
The runner's regression executes real empty and skip-only fixtures and rejects
both. The gate runs before `release:check` and the source selector retains it for
source, test and shared helper changes. It supplements the full suites and packed
consumers; it does not certify every development-policy clause. The installed
policy catalog predates the current coding and lifecycle additions.

For coding and adapter reuse, generic content/checksum contracts remain in Core;
D1/R2 persistence remains in Cloudflare. Studio uses the existing Appkit provider
contract, and EAOS publication uses the existing compatibility adapter. No new
provider connection is introduced. Public dependency/import inspection and packed
consumers remain required; declarations alone do not prove a provider's behavior.

Publication tests bind the site, revision and image bytes before rendering. Stored
projection reads now require both content and media objects to match the selected
manifest checksum. Promoting an empty replacement revision removes those records
from current-head reads without changing another site. Explicitly pinned older
revisions remain readable, and restaging the same revision is supported; hosts
must control these administrative operations. Separate D1/R2 writes are not an
atomic transaction. Existing readers, built pages, media URLs, search/AI indexes,
previews and external caches require host-owned rebuild, purge and access controls;
the tests do not prove delivery-wide withdrawal. AI helpers omit restricted body
text but retain descriptive metadata and do not check publication status; hosts
must apply the access decision before projecting unpublished content.

Tenant tests cover the projection's site/revision lookup boundary and Studio's
injected host authority. They do not establish tenant isolation for external
search/vector indexes, jobs, exports, signed links, backups or offboarding. Studio
origin controls do not authenticate callers. Hosts own identity verification,
provider tenant scoping and revocation. There is no model/MCP execution engine or
approval-token protocol here; replay/revision-bound approvals belong to the
executing host, not a content document.

Durable adapters have local tests, but this gate does not establish exactly-once
external effects, restart recovery, deduplication retention, quarantine/replay
ownership or plugin suspension. Hosts must verify those operational contracts.
AI representations make no model calls: approved destinations, retention, fallback
and retry/delegation budgets are host responsibilities and are unverified here.

No dedicated vulnerability reporting/triage contract is declared in this source
candidate; maintainer ownership, advisory handling, supported-version fix delivery
and expiring exceptions remain unverified. Node 24/26
and packed-consumer checks cover declared source compatibility; provider versions,
persisted-data migration, deprecation/removal and security-fix support need owner
review. Rollback selects retained revisions; it is not tested backup restoration,
a recovery-time/data-loss guarantee or a production migration. Domain, security,
data, API and CI review ownership and consequential decisions require maintainer
review; local tests and workflow declarations do not establish branch-protection
or human-approval enforcement. No production, live-provider or restore operation
is performed by these checks.
