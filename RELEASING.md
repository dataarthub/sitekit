# Releasing SiteKit

Apply the [release policy](https://tech-docs.alneas.com/policies/release-policy.md) and [preparing-releases skill](https://tech-docs.alneas.com/skills/preparing-releases/SKILL.md). Preparation does not authorize Git or registry writes.

## Targets and readiness

The private root is never published. Public npm targets are `@alneas/sitekit` (`packages/core`) and `@alneas/sitekit-cloudflare` (`packages/cloudflare`), using `https://registry.npmjs.org`. Read their manifests for versions and constraints; do not assume both always need a release. Core must be available before the selected adapter's publication when its dependency requires it. Use Node.js 24+, npm and Bun 1.4.0.

Compare changes with the applicable release baseline and record selected targets, dependency delivery, version increments and reasons in the PR. Preserve release tags unless the owner explicitly authorizes rewriting a private, unreleased candidate. Such authorization does not permit overwriting a registered npm version. Source version `0.1.0` does not prove npm registration or absence. Confirm ownership, visibility, versions and tags through registry queries and the authorized account; inaccessible state or an ambiguous 404 does not establish a new package.

## Prepare notes and versions

Use `.changeset/*.md` as reviewed unreleased records and keep one canonical `CHANGELOG.md` in each independently versioned package. Core's build preserves its own changelog. Root/package READMEs link to package-specific history that works on both GitHub and npm.

In a dedicated release-preparation change, inspect `bun run changeset status`, reconcile the selected targets with accumulated changes and registered prerequisites, then run `bun run version:packages` explicitly. Review all version, dependency, changelog and consumed-fragment changes; preserve published entries and unrelated fragments. Changesets may include other pending targets, so inspect its plan and isolate the intended preparation rather than assuming `--targets` selects version mutations. Do not run versioning here merely because the tool is available. Version `0.1.0` remains a locally prepared candidate until registry state confirms publication.

Run `bun run release:notes` to validate current version entries. `release:prepare` also rejects pending fragments for selected targets: finish their version/notes preparation before the authorized commit. Nonselected fragments remain pending. Maintainer-only work needs a reviewed no-release rationale rather than invented consumer notes.

## Prepare the commit-bound bundle

Install with `bun install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org`, then run `bun run quality:setup`. Finish version, dependency, release-note and generated-document changes and required checks before the authorized release commit. Final preparation requires clean, committed source:

```bash
bun run release:prepare
```

This runs the full `quality:push` / `release:check` gate, packs actual npm archives and tests those exact archives with the Bun and npm consumer checks. The default bundle is `.verification/releases/<commit>/`; `release.json` binds commit, target versions, archive hashes, package-specific release-note hashes and toolchain identity. Use `bun run release:prepare --output-dir <path>` for another destination. Select publication targets explicitly with `--targets core`, `--targets cloudflare`, or `--targets core,cloudflare` (the default). Both archives are retained and tested as consumer fixtures, but `release.json.targets` selects which packages may be published. Keep raw receipts ignored and review evidence before sharing.

The full gate includes secret/history scans, lint and tooling regression tests, and retains registry dependency verification, boundary tests, public-file checks, types, documentation freshness, package tests, static builds, both packed consumers and the example build. Appkit availability and integrity are checked against the lockfile. Source, version, dependency or packed-content changes require a new reviewed commit and bundle, including after amending a commit.

Before handoff or publication, validate the bundle without rebuilding:

```bash
bun run release:verify --bundle .verification/releases/<commit>
```

Each `*.notes.md` is derived from the selected package/version entry and retained alongside the archives. Verification rejects changed/missing notes, packed changelog drift and notes that differ from canonical source. Use that same notes body for an authorized GitHub Release; preparing it does not create or publish a Release. Transfer exact archives, notes and manifest together. Publication must validate the binding and use those bytes. Package directory `prepublishOnly` gates remain protections; directory publication or a new pack cannot substitute for this handoff.

## Subsequent versions through staged Trusted Publishing

The owning workflow is `.github/workflows/release.yml`. It uses explicit manual dispatch on `main`; source/tag pushes never publish or stage packages. Both phases share serialized concurrency with cancellation disabled. Use Node 24 and the pinned npm 11.21.0 in the writing jobs. The verification job has no OIDC or registry write credentials, runs the full mandatory gate and tests the exact retained archives.

After each target's manual first registration, configure its npm Trusted Publisher for `dataarthub/sitekit`, workflow `release.yml`: allow staging and required `npm dist-tag`, keep direct `npm publish` disabled, and require maintainer 2FA. Verify account-side permissions separately; repository changes cannot establish trust. Do not fall back to a write token or local publishing when a subsequent release's OIDC setup fails.

For **stage**, dispatch with `phase=stage`, the exact reviewed current-main SHA in `reviewed_commit`, and the selected `targets`. The bundle binds both source SHA and Actions run/attempt; an immutable `verified-npm-release-<run>-<attempt>` artifact retains exact archives/notes for 14 days. The stage job downloads that artifact by ID, verifies its digest and package binding, and runs only `npm stage publish` on the inspection tag `staged`. It neither promotes `beta`/`latest` nor records a successful Deployment. A successful submission means awaiting human approval, not public publication. An ambiguous staging error stops without retry; inspect npm Staged Packages first.

Preflight every selected target before any submission. If a new adapter needs an unpublished Core version, stage Core alone, approve/complete it and confirm registry readability before staging the adapter; selecting both does not waive its predecessor requirement. Existing compatible Core versions may satisfy that requirement independently of the candidate Core.

The maintainer then inspects the staged package/version/source/bytes and approves through npm with 2FA. CI never impersonates this approval. For **complete**, dispatch the same workflow on `main` with `phase=complete` and the original successful `staged_run` ID. Other target/version inputs do not replace the original selection.

Completion uses trusted default-branch code to query GitHub for the original repository/workflow, main source SHA, successful current attempt and required verify/stage jobs. It resolves one unexpired immutable artifact, enforces download digest validation, and rechecks its source/version/archive/notes hashes against the original commit and run/attempt. Newer main versions do not replace the original source. Missing, failed, stale-attempt, ambiguous or expired evidence blocks completion; never rebuild a substitute and label it as the approved archive.

After all selected public archives match their original reviewed bytes, completion rechecks channel ordering and repairs only missing required tags. It never rebuilds, re-packs, stages, publishes or reruns unchanged source tests. It preserves the inspection tag to avoid a non-atomic removal racing another stage. Matching existing public bytes/tags are reusable; a mismatch, newer channel or pending approval stops writes. Only after bytes and required channels pass does it create or resume successful `npm-core`/`npm-cloudflare` Deployment records with the original release SHA and npm URL. Existing successful records are preserved.

Manual completion is the maintained recovery path; an automatic approval observer is optional and not configured. Read-only registry polling is bounded; a pending or expired candidate is not reported as a completed release. No account configuration, stage submission, approval, tag write or Deployment is performed merely by adopting this procedure.

## Manual first registration only

Only a genuinely new package's first npm registration may use an explicitly authorized manual maintainer session. An existing package changing workflow, repository or maintainer does not qualify. Confirm new-package status separately for every target. For this initial registration, use local `npm publish` with the exact verified archive and complete the maintainer's interactive 2FA challenge. Do not use `npm stage publish`, a dummy version or `0.0.0-stage`: staging a new package can create a public placeholder whose history is not automatically removed.

Preflight all targets before writes, including visibility, intended version absence and channel state. Stop on uncertain access, conflicting integrity or a newer channel that would move backwards. For versions below `1.0.0`, both `beta` and `latest` must resolve to the exact verified version. These distribution tags do not require a prerelease version suffix.

After validating the bundle, publish core first with an explicit initial tag. Substitute archive paths and versions from `release.json`:

```bash
npm publish <core-archive.tgz> --ignore-scripts --access public --tag beta --registry=https://registry.npmjs.org
npm view @alneas/sitekit@<version> version dist.integrity dist.shasum --json --registry=https://registry.npmjs.org
```

Compare registry integrity with the selected archive before publishing the Cloudflare archive with the same flags. Confirm its core prerequisite is readable first. `--ignore-scripts` is appropriate only after full validation of these exact archives; publication must not rebuild them.

Recheck current channels before attaching a missing `latest` tag, then verify both mappings for each selected target:

```bash
npm dist-tag add @alneas/sitekit@<version> latest --registry=https://registry.npmjs.org
npm dist-tag add @alneas/sitekit-cloudflare@<version> latest --registry=https://registry.npmjs.org
npm view @alneas/sitekit dist-tags --json --registry=https://registry.npmjs.org
npm view @alneas/sitekit-cloudflare dist-tags --json --registry=https://registry.npmjs.org
```

Skip unselected or completed targets. At or above `1.0.0`, require `latest` without changing `beta` under this rule. Configure and verify Trusted Publishing after initial registration and before any subsequent version. Adopting this guide does not authorize publication or historical tag backfill.

## Completion and partial recovery

Confirm public visibility, exact versions, dependency resolution, registry integrity and required tags. Run a fresh registry-only consumer installation and compare delivered README/metadata with reviewed source. Update candidate-only installation instructions only after availability is confirmed, then regenerate owning outputs and report those changes separately from immutable publication.

On a timeout, ambiguous response or partial failure, stop writes and query registry state read-only. Compare integrity against the bundle; retry only confirmed missing work under the applicable phase and authorization. Completion repairs tags/records without resubmitting a stage; an ambiguous stage upload first requires maintainer inspection. Never republish an existing version, delete successful targets, overwrite release tags or roll channels backwards. Newer channel state or a content mismatch requires investigation; missing tags leave the release incomplete.

Report preparation, checks, commit, selected versions, bundle identity, actual writes, remote verification and blockers separately. GitHub Release creation and documentation ingestion/deployment remain distinct operations. Local checks do not establish account-side Trusted Publisher configuration.
