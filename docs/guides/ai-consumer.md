---
title: "Use SiteKit with a Coding Agent"
description: "Locate the packaged consumer skill and public documentation without depending on a source checkout."
sidebar:
  order: 8
archetype: "how-to"
project: "sitekit"
tags: ["agents", "documentation"]
---

# Use SiteKit with a Coding Agent

## Prerequisites

Use the core package in an Astro site with Node.js 24 or later. Framework registry publication is pending; install the verified local artifact as shown in the [source guide](verify-source.md). The bundled skill supports consuming sites and does not authorize package publication or deployment.

## Public import

Configure a site through `@alneas/sitekit/config`; ordinary configuration needs no React runtime, provider or CSS:

```typescript
import { defineSite } from '@alneas/sitekit/config';
const site = defineSite({ id: 'example', content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } } });
console.log(site.id);
```

## Step-by-Step Implementation

### 1. Load the consumer guidance

Ask the agent to read `node_modules/@alneas/sitekit/skills/sitekit/SKILL.md`, adjusting the path for the package manager's installation layout. This is a packaged instruction file, not a JavaScript import or an automatically registered agent skill. Follow the agent client's documented installation mechanism when installing it as a named skill. The repository's `AGENTS.md` is for maintainers and is not shipped as consumer guidance.

### 2. Choose the documentation depth

Use `llms.txt` inside the package as an absolute-URL roadmap to the public portal. The packaged `llms-full.txt` concatenates the approved public guides in manifest order, with canonical source paths and public URLs. It is generated from those guides; source JSDoc remains the API behavior authority. These package files do not imply that the portal currently serves them at the same paths. Match guidance to the installed version or verified candidate: the default portal follows successfully delivered package versions and can lag unpublished source. If revisions differ, use the packaged guides and exported declarations rather than assuming a portal example is supported by the installed artifact.

### 3. Give the agent the relevant task

For configuration work, provide the chosen snapshot source and expected site/revision, using the [content-source guide](content-sources.md). For basic editing, provide the host's authentication and provider constraints using the [Studio guide](public-studio.md). Do not provide production credentials or customer records as example inputs. Optional external CMS integration and separately distributed extensions are defined in [architecture](../architecture.md).

## Verification

The package contains `llms.txt`, `llms-full.txt` and `skills/sitekit/SKILL.md`. The repository documentation gate verifies generated-guide freshness and typechecks the consumer skill's example alongside public guide/JSDoc examples. Bun and npm artifact checks verify that those files are actually present. Run the consuming site's normal typecheck/build and relevant behavior checks after applying agent changes.

## Troubleshooting / Common Pitfalls

- Missing guidance files: inspect the installed version and selected artifact; do not load files from a restricted sibling repository.
- Missing registry version: use the verified candidate archive or wait for the announced release; an example import does not establish npm availability.
- Relative web links: use the absolute URLs in `llms.txt`; packaged documentation is also readable offline.
- Agent proposes disabling authentication or integrity checks: repair the host configuration or content source instead. A successful import does not establish secure persistence or a production deployment.
