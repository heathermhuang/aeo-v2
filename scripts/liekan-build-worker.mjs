import { build } from 'esbuild';
await build({
  entryPoints: {
    'liekan-worker': 'src/liekan-worker/main.ts',
    'aeo-crawler-ranges': 'src/lib/aeo/crawler-ranges-cli.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  banner: {
    js: "import { createRequire } from 'node:module'; const require=createRequire(import.meta.url);",
  },
  plugins: [
    {
      name: 'prisma-runtime',
      setup(builder) {
        builder.onResolve({ filter: /^@\/generated\/prisma\/client$/ }, () => ({
          path: '../generated/prisma/client.js',
          external: true,
        }));
      },
    },
  ],
});
await build({
  entryPoints: ['src/liekan-worker/analytics.ts'], outfile: 'dist/liekan-analytics-worker.mjs',
  bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external',
  banner: { js: "import { createRequire } from 'node:module'; const require=createRequire(import.meta.url);" },
  plugins: [{ name: 'prisma-runtime', setup(builder) {
    builder.onResolve({ filter: /^@\/generated\/prisma\/client$/ }, () => ({ path: '../generated/prisma/client.js', external: true }));
  } }],
});
