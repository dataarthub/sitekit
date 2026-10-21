---
title: "Verify and Release SiteKit Packages"
description: "Validate registry dependencies and packed artifacts before an explicitly authorized package release."
sidebar:
  order: 20
archetype: "how-to"
project: "sitekit"
tags: ["release", "verification"]
---

# Verify and Release SiteKit Packages

## Prerequisites

Use Node.js 24+, npm and Bun 1.4.0, public npm access, and a reviewed source revision. The private workspace root is never published. Targets are `@alneas/sitekit` and `@alneas/sitekit-cloudflare`; inspect their manifests for exact versions and dependency constraints.

Follow the [release policy](https://tech-docs.alneas.com/policies/release-policy.md) and [preparing-releases skill](https://tech-docs.alneas.com/skills/preparing-releases/SKILL.md). Preparation does not authorize commit, push, tag, registry or documentation deployment writes. Maintainers use the repository's `RELEASING.md` for local publication and recovery procedures.

## Public import

Install candidate archives using the [source verification guide](verify-source.md). A minimal core import is:

```typescript
import { defineSite } from '@alneas/sitekit/config';
console.log(defineSite({ id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } } }).id);
```

## Step-by-Step Implementation

### Review release impact and notes

Check pending Changesets with `bun run changeset status`. Select targets against an explicit baseline and confirm dependency delivery; do not infer publication from a local version heading. Maintainers explicitly prepare versions and cumulative package changelogs before the authorized release commit. Read the repository's `RELEASING.md` for the maintained commands and side effects.

```bash
bun run release:notes
```

This validates the current package/version notes without changing versions or consuming fragments. The release bundle includes package-specific `*.notes.md` and binds their SHA-256 hashes with the exact tested archives. The same entry supplies a separately authorized GitHub Release body. Registry publication, GitHub Release creation and documentation deployment are separate operations.


### 1. Verify the selected changes

```bash
bun install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
bun run release:check
```

The gate checks Appkit registry versions and lockfile integrity, boundaries, public-file rules, types, documentation freshness, tests, static builds, Bun/npm packed consumers and the example build. Both consumer lanes inspect actual archives, exports, declarations, licenses and excluded files. Two exported CSS source files are intentional package assets. The Astro peer floor `>=7.3.3 <8` records the lowest version exercised by these checks.

Review affected targets and dependency delivery against their applicable release baseline. Record version choices and deliberate no-release decisions in the existing review process. Preserve existing release tags. Neither source version strings nor a GitHub release establish npm registration status.

### 2. Prepare a commit-bound release bundle

Complete source and generated-document changes before the authorized release commit. From clean, committed source:

```bash
bun run release:prepare
```

Preparation runs the full gate, packs npm archives and checks those exact archives in isolated Bun and npm consumers. The default destination is `.verification/releases/<commit>/`; `release.json` records commit, versions, archive hashes and toolchain identity. Use `--output-dir <path>` for a different destination. Keep local receipts outside public documentation and package payloads.

### 3. Validate the handoff

```bash
bun run release:verify --bundle .verification/releases/<commit>
```

This validates bundle/source identity without rebuilding. A changed source, version, dependency, packed file or amended commit requires a new bundle. Publish only the verified archive bytes after validation; do not rebuild or publish package directories in the publishing stage.

### 4. Use the required publication path

Subsequent versions require GitHub Actions with npm Trusted Publishing (OIDC), using the repository's `publish.yml` workflow. The account must trust the exact repository, workflow and environment when used, with permission for both publication and distribution-tag operations. Repository edits alone do not establish account configuration; unresolved trust setup blocks subsequent releases.

A genuinely new npm package's first registration alone may use an authorized manual session with the same commit-bound archives. Confirm that each package is new rather than inaccessible. A new workflow or a failed OIDC setup does not permit manual fallback for existing packages.

Publish core before the adapter when its dependency requires it, and confirm registry integrity before the dependent write. Below `1.0.0`, both `beta` and `latest` must point to the verified version. Confirm integrity and required tag mappings after publication; check for newer channels before tag writes. At or above `1.0.0`, require `latest` without changing `beta` under this rule.

### 5. Select documentation for the delivered targets

The `0.1.0` core and Cloudflare packages are unpublished source candidates. Keep their new APIs and usage out of the default released portal until registry publication is confirmed. A merged change, source tag, GitHub Release or locally generated guide is not proof of delivery.

After each target succeeds, select its reviewed source revision against the confirmed registry version. If only core is delivered, defer Cloudflare-only guides and API updates; do not advance the whole manifest merely because one target succeeded. If the portal cannot separate those revisions, defer the affected ingestion. Use a separate, clearly labeled development area only when the portal supports it.

For reviewed spelling, explanation or link corrections to already released behavior, a later documentation source revision is permitted without republishing the package. Keep generated API input at the released revision, or defer it when the newer source would expose unrelated candidate contracts. An immutable npm README or bundled guide changes only through a separately reviewed new package version.

Hand off only the approved public manifest documents and matching API entrypoints. Ingestion, portal-owned Japanese translation and portal deployment require their own authorization and checks. Local documentation preparation does not initiate any of those operations.

## Verification

A prepared bundle establishes local source/artifact identity and completed checks. Release completion additionally requires confirmed public versions, matching registry integrity, dependency resolution, required tags and a fresh registry-only consumer install. Verify delivered README/metadata after authorized publication. Report preparation, publication and remote verification separately; local success cannot prove account-side trust or remote delivery.

## Troubleshooting / Common Pitfalls

- Registry dependency or integrity mismatch: resolve the registry/lockfile conflict before release.
- Dirty source or bundle hash/commit mismatch: finish the reviewed source commit and prepare a new bundle; do not edit the manifest to bless changed bytes.
- Unresolved local dependency protocols in an archive: fix packaging and rerun both consumer lanes.
- Missing Trusted Publisher configuration or permissions: repair Actions/account setup before subsequent publication; do not introduce a manual fallback.
- Timeout or ambiguous registry response: stop writes, inspect version/integrity/tag state read-only, and resume only missing work. Never republish an existing version, delete successful targets or roll a newer channel backwards.
- Missing tags after successful publication: verify existing integrity and repair only missing required mappings; the release remains incomplete until confirmed.
- Generated-document drift: edit canonical sources, run `bun run docs:prepare`, then rerun checks. Keep operator receipts outside approved public content.
