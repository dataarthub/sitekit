import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// SHA-256 digests published in the upstream GitHub release asset metadata.
// Update version, URL and digest together after reviewing the upstream release.
const releases = {
  "darwin-arm64": {
    "biome": {
      "version": "2.2.6",
      "asset": "biome-darwin-arm64",
      "url": "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%402.2.6/biome-darwin-arm64",
      "sha256": "e1ace7fd9eab58c049b543c3f4d81a60d961c7a7d7b3d30600c56273d0d3427c"
    },
    "gitleaks": {
      "version": "8.30.1",
      "asset": "gitleaks_8.30.1_darwin_arm64.tar.gz",
      "url": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_arm64.tar.gz",
      "sha256": "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    }
  },
  "darwin-x64": {
    "biome": {
      "version": "2.2.6",
      "asset": "biome-darwin-x64",
      "url": "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%402.2.6/biome-darwin-x64",
      "sha256": "e4234ac5addfdb68d0d646390da0ec4064afc667f3c6d2189342a99f001d1b4d"
    },
    "gitleaks": {
      "version": "8.30.1",
      "asset": "gitleaks_8.30.1_darwin_x64.tar.gz",
      "url": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_x64.tar.gz",
      "sha256": "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"
    }
  },
  "linux-arm64": {
    "biome": {
      "version": "2.2.6",
      "asset": "biome-linux-arm64",
      "url": "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%402.2.6/biome-linux-arm64",
      "sha256": "d8c2e05753a937e21a76eca5556a5f0f2baaf0583fa7e35ef74d510b3b7f5ed9"
    },
    "gitleaks": {
      "version": "8.30.1",
      "asset": "gitleaks_8.30.1_linux_arm64.tar.gz",
      "url": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_arm64.tar.gz",
      "sha256": "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"
    }
  },
  "linux-x64": {
    "biome": {
      "version": "2.2.6",
      "asset": "biome-linux-x64",
      "url": "https://github.com/biomejs/biome/releases/download/%40biomejs/biome%402.2.6/biome-linux-x64",
      "sha256": "ad989034fff59c9b4e45a55d0d71cbfbd5bc673cfb7193ee01268773e1eb84a7"
    },
    "gitleaks": {
      "version": "8.30.1",
      "asset": "gitleaks_8.30.1_linux_x64.tar.gz",
      "url": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz",
      "sha256": "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    }
  }
};

export function toolSpec(name, platform = process.platform, arch = process.arch) {
  const spec = releases[`${platform}-${arch}`]?.[name];
  if (!spec) throw new Error(`Unsupported quality tool platform: ${platform}-${arch}/${name}`);
  return { ...spec, name, platform: `${platform}-${arch}` };
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyDigest(bytes, digest) {
  if (sha256(bytes) !== digest) throw new Error('Quality tool checksum mismatch; run quality:setup again.');
}

function paths(root, spec) {
  const directory = join(root, '.verification/tools', `${spec.name}-${spec.version}-${spec.platform}`);
  return { directory, asset: join(directory, spec.asset), binary: join(directory, spec.name) };
}

function unpack(archive) {
  const result = spawnSync('tar', ['-xzOf', archive, 'gitleaks'], { maxBuffer: 100 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Cannot extract the verified Gitleaks archive.');
  return result.stdout;
}

export function qualityTool(root, name) {
  const spec = toolSpec(name);
  const target = paths(root, spec);
  if (!existsSync(target.asset) || !existsSync(target.binary)) {
    throw new Error(`Missing ${name}; run bun run quality:setup explicitly before verification.`);
  }
  verifyDigest(readFileSync(target.asset), spec.sha256);
  verifyDigest(readFileSync(target.binary), name === 'gitleaks' ? sha256(unpack(target.asset)) : spec.sha256);
  return target.binary;
}

export async function setupQualityTools(root) {
  const temporaryRoot = join(root, '.verification/tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const temporary = mkdtempSync(join(temporaryRoot, 'quality-tools-'));
  try {
    for (const name of ['biome', 'gitleaks']) {
      const spec = toolSpec(name);
      const target = paths(root, spec);
      try { qualityTool(root, name); continue; } catch { /* Explicit setup repairs missing/corrupt tools. */ }
      const response = await fetch(spec.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Cannot download ${name}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      verifyDigest(bytes, spec.sha256);
      const asset = join(temporary, spec.asset);
      writeFileSync(asset, bytes);
      const binary = name === 'gitleaks' ? unpack(asset) : bytes;
      mkdirSync(target.directory, { recursive: true });
      if (name === 'gitleaks') {
        const executable = join(temporary, name);
        writeFileSync(executable, binary, { mode: 0o755 });
        renameSync(executable, target.binary);
      }
      renameSync(asset, target.asset);
      if (name === 'biome') {
        // Biome's upstream asset is already an executable.
        const executable = join(temporary, name);
        writeFileSync(executable, binary, { mode: 0o755 });
        renameSync(executable, target.binary);
      }
      chmodSync(target.binary, 0o755);
      qualityTool(root, name);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
