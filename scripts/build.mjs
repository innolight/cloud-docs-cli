import { build } from 'esbuild';

const banner = `#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);`;

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: { js: banner },
  alias: { 'react-devtools-core': 'data:text/javascript,export default {}' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
