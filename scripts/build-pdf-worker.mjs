import { build } from 'esbuild';
await build({
  entryPoints: ['src/workers/pdf-import.worker.ts'],
  outfile: 'public/pdf-import.worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
});
