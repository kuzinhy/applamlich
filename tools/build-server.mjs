import { build } from 'esbuild';
await build({
  entryPoints: ['server/app.ts'],
  outfile: 'server-build/app.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
});
