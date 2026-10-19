# Changelog

## 0.1.0 — npm publication pending

### Added

- Project immutable site snapshots into D1/R2 with staging, promotion and rollback through injected Cloudflare bindings.
- Connect host-owned content editing and media libraries through explicit server authorization and storage boundaries.
- Forward analytics through Queue or Analytics Engine and use optional commerce, experiment and social outbox adapters.

### Compatibility

Use the declared `@alneas/sitekit` peer range. Optional editing integrations require the declared Appkit peer; bindings and credentials remain server-owned. This adapter does not bundle private templates, customer settings or infrastructure credentials. Publication is a separate verified operation.

### Changed

- Use the SiteKit documentation routes under `https://tech-docs.alneas.com/sitekit/` in package metadata and consumer guidance.

- Align npm author, descriptive summary and discovery keywords with the ALNEAS package metadata standard.

- Use public Appkit 0.2.0 for the optional UI/editing integrations. Node.js 24 or later is required; React peers remain compatible with the declared React 19 range.

- Package history is linked from npm/GitHub READMEs and retained per package during builds; reviewed release notes are bound to the exact archive bundle.
- Fix adapter tests to resolve the built core package through its workspace export instead of a stale root output alias.
