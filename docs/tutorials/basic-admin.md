---
title: "Try Basic Content Management"
description: "Create, edit and publish a local test article using only the public source candidate and npm dependencies."
sidebar:
  order: 4
archetype: "tutorial"
project: "sitekit"
tags: ["studio", "tutorial"]
---

# Try Basic Content Management

In about five minutes, manage a test article in an isolated local browser fixture. Use Node.js 24+, Bun 1.4.0, npmjs connectivity and an extracted public source candidate. Start a terminal in that candidate's root. No private registry or CMS credentials are required.

## Public import

The fixture consumes the core `/studio/basic`, `/studio/http-provider` and `/studio/basic.css` exports plus the Cloudflare `/studio` and `/studio-handler` exports. Package names are listed in the [exports reference](../exports.md). This React example shows the actual browser imports used by the fixture:

```tsx
import '@alneas/appkit-react/styles';
import '@alneas/sitekit/studio/basic.css';
import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
const provider = createHttpStudioProvider();
export function Admin() {
  return <BasicStudioApp provider={provider} collections={[{ id: 'posts', label: 'Posts' }]} />;
}
```

## 1. Install the locked dependencies

```bash
bun install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
```

Expected result: the candidate's locked public dependencies are installed.

## 2. Start the local fixture

```bash
bun scripts/public-consumer-smoke.mjs --preview
```

Expected result: the script packs both framework packages, installs them in an isolated consumer with npmjs Appkit, checks the actual SQLite schema and HTTP path, then prints `Basic Studio preview: http://127.0.0.1:4317/`.

## 3. Create an article

Open the printed URL. Select **新規作成**, enter a title and slug, and write Markdown in the body field. Leave summary and tags empty. Select **下書き保存**.

Expected result: **下書きを保存しました** appears. Return to the list and open the article using its title button. The entered values remain.

## 4. Publish and reopen

Select **公開**, then reload the page.

Expected result: **公開しました** appears before reloading, and the list shows the article's **公開** state afterwards. This changes the temporary fixture record; it does not publish a website to the Internet.

## 5. Finish

Stop the terminal process with Ctrl-C. The fixture uses a temporary SQLite database and a local test session; neither is a production authentication setup. You have verified the basic public management flow. Follow the [integration guide](../guides/public-studio.md) to connect your own authenticated server and D1 binding.
