import { build } from 'esbuild';
await build({
  entryPoints: ['src/liekan-worker/main.ts'],
  outfile: 'dist/liekan-worker.mjs',
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

// The AEO image carries Next's traced dependencies, not the upstream worker's node_modules.
await build({
  entryPoints: ['src/lib/aeo/crawler-ranges-cli.ts'],
  outfile: 'dist/aeo-crawler-ranges.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@prisma/adapter-pg', '@prisma/client', 'pg', 'pg-native', 'zod'],
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
