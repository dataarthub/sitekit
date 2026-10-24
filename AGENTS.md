# Public SiteKit

Owns generic core and Cloudflare adapters. Exclude private templates, operator evidence, vendor tarballs and private SDKs. Keep the workspace root private and enforce full release validation in each publishable package. Validate with verify:public, typecheck:all, test:all, test:site-build and test:consumer. No GitHub, push or publish operations in local extraction.

## Coordinated maintenance

Apply the shared development policy's coordinated-maintenance contract when
public changes affect downstream consumers. Inspect affected consumers in their
own authorized environment and retain restricted evidence there. Public gates
remain independent of private checkouts and credentials. The shared
`scripts/check-paired.mjs` can verify this side independently; its regression tests
run through `test:paired-maintenance`. Final side plans need actual reviewed
commands and clean committed candidates; self-tests are not compatibility receipts.
See https://tech-docs.alneas.com/templates/paired-maintenance/README.md.

## Shared standards

### Documentation

For all documentation and JSDoc work in this project, follow the [ALNEAS documentation policy](https://tech-docs.alneas.com/policies/documentation-policy.md) and the [document-authoring skill](https://tech-docs.alneas.com/skills/document-authoring/SKILL.md) without requiring a separate user reminder. Use these public URLs as the shared references; a sibling github-docs checkout is not required.

Keep canonical English project guides and JSDoc here. Declare approved public documents and API entrypoints in docs.manifest.json for one-way ingestion by github-docs. Portal navigation, Japanese portal translations and generated API pages remain owned by github-docs; do not reproduce its portal in this project. Private guides, drafts, customer/operator evidence and secrets are excluded from public ingestion.

### Development and release

For implementation and verification selection, read:
- Policy: https://tech-docs.alneas.com/policies/development-policy.md
- Skill: https://tech-docs.alneas.com/skills/developing-projects/SKILL.md

For automated testing and verification setup (UI & non-UI):
- UI, Storybook, Playwright & Kratos auth: https://tech-docs.alneas.com/skills/testing-ui-services/SKILL.md (Boilerplate: https://tech-docs.alneas.com/templates/testing/README.md)
- Logic, Hono, Oracle DB & contracts: https://tech-docs.alneas.com/skills/testing-logic-services/SKILL.md (Boilerplate: https://tech-docs.alneas.com/templates/testing-logic/README.md)

For release preparation, publication or partial-release recovery, read:
- Policy: https://tech-docs.alneas.com/policies/release-policy.md
- Skill: https://tech-docs.alneas.com/skills/preparing-releases/SKILL.md

Keep local commands, architecture and release conditions in this repository's
CONTRIBUTING.md, RELEASING.md and executable configuration. Preserve stronger
local gates. Follow existing user authorization for Git and external writes.

### Project README verification

- README target list: `readme-policy.json`
- README validation: `bun run docs:readmes`
- Portal README metadata is generated from its owning source; update and verify it through the project documentation commands.

- Generated README/documentation freshness: `bun run docs:generated` (temporary regeneration; does not repair normal output).

- Generated output configuration: `generated-policy.json`.

### Release records and notes

- Changesets: `.changeset/*.md`; create with `bun run changeset`.
- PR impact records: `bun run release:records --base <commit-or-ref>`; existing CI supplies the PR base/body.
- Canonical package history: `packages/core/CHANGELOG.md`, `packages/cloudflare/CHANGELOG.md`; `bun run release:notes`.
- Explicit version preparation: `bun run version:packages`; never run from verification gates.
- Commit-bound bundle: `release:prepare` includes hash-bound `*.notes.md`; staging consumes exact verified archives and notes. Completion restores only the original successful run/attempt artifact and never rebuilds or republishes.
- Deterministic task graph: `turbo.json`, `scripts/task-runtime.mjs`; `bun run test:cache` verifies actual cache behavior.
- Initial npm registration remains an explicitly authorized local, exact-archive `npm publish` with interactive 2FA. Subsequent versions start staged Trusted Publishing when a stable package-specific GitHub Release is published; separate human npm approval precedes manual completion using the original successful Release run.
