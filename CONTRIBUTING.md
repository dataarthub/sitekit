# Contributing to SiteKit

Follow the [development policy](https://tech-docs.alneas.com/policies/development-policy.md) and [developing-projects skill](https://tech-docs.alneas.com/skills/developing-projects/SKILL.md). Shared verification-selection rules remain there; this guide records the local implementation.

## Workspace and setup

Use Node.js 24+, npm and Bun 1.4.0. From the repository root:

```bash
bun install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
bun run quality:setup
```

`quality:setup` provisions pinned Biome and Gitleaks binaries in ignored `.verification/tools`. It does not install Git hooks automatically. The private root coordinates `packages/core` (`@alneas/sitekit`) and `packages/cloudflare` (`@alneas/sitekit-cloudflare`). Sources and tests belong to their package, operational tools in `scripts/`, canonical English guides in `docs/`. Public code, tools and tests must work without private checkouts or credentials.

Keep disposable fixtures and raw receipts in ignored `.verification/` storage or isolated system temporary directories, outside package payloads and public documentation manifests. Inspect and sanitize evidence before sharing it.

## Development checks

Choose focused checks for changed inputs, then run the required aggregate gate for the intended action. Commands and their implementations are declared in [package.json](package.json). Core-only iteration uses `bun run typecheck` and `bun run test`. To include the adapter and its upstream core build explicitly:

```bash
node scripts/task-runtime.mjs run build typecheck test --filter=@alneas/sitekit-cloudflare
```

A focused pass does not replace the required pre-push gate:

```bash
bun run quality:commit
bun run quality:push
```

`quality:commit` scans staged changes for secrets and checks staged code without rewriting or staging files. Its root Biome/Gitleaks configuration must be indexed and byte-identical to the working copy; an unstaged permissive rule cannot weaken a staged check. `quality:push` scans commit history and runs lint plus the full `release:check` gate: registry dependency verification, boundary/public-file checks, types, documentation freshness, tests, static builds, Bun/npm packed consumers and the example build. Formatting is an explicit developer action. Missing scanner prerequisites and scanner errors block verification.

The checked-in `.githooks/pre-commit` and `.githooks/pre-push` invoke these commands. The established plain Git hook integration is retained because it enforces the same tested index-byte and read-only contracts without installation-time Git configuration changes. To enable them explicitly for this checkout, after reviewing any existing `core.hooksPath` configuration:

```bash
git config --local core.hooksPath .githooks
```

Dependency installation does not install hooks. CI runs the same full gate on Node 24 for pushes to `main`, pull requests targeting `main`, and explicit manual runs. Tag pushes and feature-branch pushes do not start another run; open a PR to validate a feature branch. A separate Node 26 lane checks builds, types and unit tests against the additional supported runtime. PR release-impact records run once in the Node 24 lane. Superseded runs for the same branch or PR are cancelled, while publication remains serialized without cancellation in its separate workflow.

Build, type and unit tasks use the pinned Turbo graph through `scripts/task-runtime.mjs`. The wrapper binds actual Node/Bun interpreter versions, platform, OS and runner image, and rejects missing tasks in selected packages or their build dependencies. Core's generated package documents/schema and both `dist` trees are declared outputs; canonical root sources and helpers/configuration/lockfile remain inputs. Bun's download cache is separate from `.turbo/cache`; restoring a cache directory does not establish a hit until Turbo compares the task identity.

`bun run test:cache` exercises real isolated source copies: misses/hits, restored bytes, source/helper/config/lock/runtime/image changes, failures, missing tests and missing task scripts. The same regression check belongs to `quality:checks`, so local pre-push and Node 24 CI enforce it once. Security/history scans, registry queries and exact-archive consumers remain fresh outside the deterministic task cache. Without a validated change selector, source-quality runs retain the full required gate with validated task-result reuse. Release preparation still verifies the selected commit and exact archives through `release:prepare`; a green source run alone does not certify a later archive. A passing CI run does not establish that branch protection requires it. Commit-bound release preparation is described in [RELEASING.md](RELEASING.md).

## Documentation

Follow the [documentation policy](https://tech-docs.alneas.com/policies/documentation-policy.md) and [document-authoring skill](https://tech-docs.alneas.com/skills/document-authoring/SKILL.md). Keep canonical English guides and public API JSDoc here. `docs.manifest.json` approves public ingestion explicitly; drafts, receipts, private guides and maintainer runbooks are excluded. Portal navigation and Japanese translations belong to `github-docs`.

Edit canonical README, guide or declaration sources, then regenerate and check:

```bash
bun run docs:prepare
bun run docs:check
```

`generated-policy.json` owns the output inventory. `docs:generated` regenerates into temporary storage and compares output without repairing normal files. `docs:readmes` validates registered plain Markdown READMEs; `docs:check` additionally checks JSDoc, public imports and links. It compiles examples against actual packed package declarations and explicit peer/type dependencies in a disposable system-temporary npm consumer, independent of root workspace links. A regression checks packed imports, React examples, rejected exports and cleanup. Review descriptions against implementation; structural checks cannot establish prose accuracy. Portal ingestion and deployment are separate operations.

## Review and release impact

Use `bun run changeset` for consumer-visible changes. Select the actual affected package(s), semantic version impact and a consumer-oriented summary; include compatibility, security and upgrade requirements where applicable. The PR template records the baseline and deliberate no-release decisions. A maintainer-only change can use an explicit `No release: <specific rationale>` in the PR body; placeholders do not qualify. Review the rationale against actual payload and dependency impact.

`bun run release:records --base <commit-or-ref>` compares the merge-base, current worktree and untracked source files with the selected baseline and checks Changesets introduced or changed in that diff. An unchanged earlier fragment cannot cover a later PR. A release-preparation PR consuming fragments must advance the affected manifest version and provide its matching cumulative changelog entry. CI supplies the PR base SHA and body through environment variables on its existing pull-request trigger. Renames/deletions and accumulated changes are included. The checker conservatively selects both packages for shared manifest/lockfile changes. It cannot prove that prose or the proposed bump is semantically correct; reviewer judgment remains required.

`bun run version:packages` is an explicit preparation mutation: it consumes pending fragments, updates package versions/dependent constraints and prepends cumulative package history. Never run it as a check or to make CI pass. See [RELEASING.md](RELEASING.md) before using it.


Review changed paths, exports and dependency edges against the applicable baseline. Record selected targets, semantic impact and deliberate no-release decisions in the PR. Maintainer-only documentation normally needs no package release; packed READMEs and generated consumer documentation may need delivery. Preserve unrelated edits and existing release tags. Commit, push, tagging, package publication and deployment require their applicable authorization.
