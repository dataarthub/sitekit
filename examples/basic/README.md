# Basic static site

After the initial npm release: `npm install` then `npm run build`. Before publication, use `bun run test:example` from the repository root; it installs the locally packed core in isolation.

The default source is snapshot.json. Set SITE_SNAPSHOT_URL to a public snapshot endpoint to use the same build path with an EAOS-managed or independent CMS. Credentials, if needed, belong in build options and must not be embedded in the snapshot or browser. This example requires no CMS account.
