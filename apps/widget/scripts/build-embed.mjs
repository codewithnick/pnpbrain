/**
 * Build script for the standalone embed bundle (pnpbrain-widget.js).
 *
 * Run: pnpm --filter widget build:embed
 *
 * Output: apps/widget/dist/pnpbrain-widget.js
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
  outfile: path.join(__dirname, '../dist/pnpbrain-widget.js'),
  format: 'iife',
  globalName: 'PNPBRAINWidget',
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

console.log('✅ PNpbrain widget embed bundle built to dist/pnpbrain-widget.js');
