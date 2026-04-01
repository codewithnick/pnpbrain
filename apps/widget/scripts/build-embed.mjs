/**
 * Build script for the standalone embed bundle (gcfis-widget.js).
 *
 * Run: pnpm --filter widget build:embed
 *
 * Output: apps/widget/dist/gcfis-widget.js
 *
 * This uses esbuild to produce a self-contained IIFE bundle that can be
 * hosted on a CDN and dropped into any HTML page via a <script> tag.
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, '../embed.tsx')],
  bundle: true,
  outfile: path.join(__dirname, '../dist/gcfis-widget.js'),
  format: 'iife',
  globalName: 'GCFISWidget',
  platform: 'browser',
  target: ['es2020', 'chrome80', 'firefox80', 'safari14'],
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  // External deps that should NOT be bundled (they're provided by host page)
  // For the embed bundle we actually want React bundled so no externals.
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
});

console.log('✅ GCFIS widget embed bundle built to dist/gcfis-widget.js');
