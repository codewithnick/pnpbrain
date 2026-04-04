/**
 * Build script for the standalone embed bundle (pnpbrain-widget.js).
 *
 * Run: pnpm --filter @pnpbrain/widget build:embed
 *
 * Output:
 *   - apps/widget/dist/pnpbrain-widget.js
 *   - apps/widget/dist/pnpbrain-widget.v<version>.js
 *   - apps/widget/dist/v<version>/pnpbrain-widget.js
 *   - apps/widget/dist/cdn-manifest.json
 *
 * This uses esbuild to produce a self-contained IIFE bundle that can be
 * hosted on jsDelivr and dropped into any HTML page via a <script> tag.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');
const bundlePath = path.join(distDir, 'pnpbrain-widget.js');
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const version = String(packageJson.version ?? '0.0.1').replace(/^v/, '');
const releaseTag = `widget-v${version}`;
const versionedDir = path.join(distDir, `v${version}`);
const versionedBundlePath = path.join(versionedDir, 'pnpbrain-widget.js');
const aliasedBundlePath = path.join(distDir, `pnpbrain-widget.v${version}.js`);
const jsDelivrLatestUrl =
  'https://cdn.jsdelivr.net/gh/codewithnick/pnpbrain@main/apps/widget/dist/pnpbrain-widget.js';
const jsDelivrVersionedUrl = `https://cdn.jsdelivr.net/gh/codewithnick/pnpbrain@${releaseTag}/apps/widget/dist/pnpbrain-widget.js`;

await mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, '../embed.tsx')],
  bundle: true,
  outfile: bundlePath,
  format: 'iife',
  globalName: 'PNPBRAINWidget',
  platform: 'browser',
  target: ['es2020', 'chrome80', 'firefox80', 'safari14'],
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_PNPBRAIN_WIDGET_VERSION': JSON.stringify(version),
    __PNPBRAIN_WIDGET_VERSION__: JSON.stringify(version),
  },
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
});

await mkdir(versionedDir, { recursive: true });
await copyFile(bundlePath, versionedBundlePath);
await copyFile(bundlePath, aliasedBundlePath);

const generatedAt = new Date().toISOString();

await writeFile(
  path.join(distDir, 'version.json'),
  `${JSON.stringify(
    {
      provider: 'jsdelivr',
      version,
      tag: releaseTag,
      generatedAt,
    },
    null,
    2
  )}\n`
);

await writeFile(
  path.join(distDir, 'cdn-manifest.json'),
  `${JSON.stringify(
    {
      provider: 'jsdelivr',
      repo: 'codewithnick/pnpbrain',
      version,
      tag: releaseTag,
      generatedAt,
      files: {
        latest: 'dist/pnpbrain-widget.js',
        aliased: `dist/pnpbrain-widget.v${version}.js`,
        versioned: `dist/v${version}/pnpbrain-widget.js`,
      },
      urls: {
        latest: jsDelivrLatestUrl,
        versioned: jsDelivrVersionedUrl,
        purge: jsDelivrVersionedUrl.replace(
          'https://cdn.jsdelivr.net/',
          'https://purge.jsdelivr.net/'
        ),
      },
    },
    null,
    2
  )}\n`
);

console.log('✅ PNpbrain widget embed bundle built to dist/pnpbrain-widget.js');
console.log(`📦 Versioned CDN bundle prepared for ${releaseTag}`);
console.log(`🌐 jsDelivr latest URL: ${jsDelivrLatestUrl}`);
console.log(`🔒 jsDelivr versioned URL: ${jsDelivrVersionedUrl}`);
