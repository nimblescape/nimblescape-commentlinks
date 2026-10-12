// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundle the extension into dist/extension.js. VS Code provides the module
// `vscode` at run time, so the bundle leaves it out. A production build
// (--production, which vscode:prepublish passes) is minified and has no source
// map.

import * as fs from 'fs';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const outfile = 'dist/extension.js';

// A production build writes no source map: remove the map of an earlier
// development build, so that no map that does not match the minified bundle
// stays in dist/.
if (production) fs.rmSync(`${outfile}.map`, { force: true });

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});
