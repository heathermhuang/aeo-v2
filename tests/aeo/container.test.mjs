import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
test('container preserves AEO routing and includes migration data', async () => {
  const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
  assert.doesNotMatch(dockerfile, /COPY\s+docker\/proxy\.ts/);
  assert.match(dockerfile, /COPY --from=builder \/app\/db \.\/db/);
});

async function startup(failAt = '') {
  const dir = await mkdtemp(join(tmpdir(), 'aeo-container-'));
  await mkdir(join(dir, 'bin'));
  await writeFile(
    join(dir, 'bin/node'),
    '#!/bin/sh\necho "$*" >> "$CALL_LOG"\n[ "$*" != "$FAIL_AT" ]\n',
    { mode: 0o755 },
  );
  const result = spawnSync('sh', [new URL('scripts/start-docker.sh', root).pathname], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      CALL_LOG: join(dir, 'calls'),
      FAIL_AT: failAt,
    },
    encoding: 'utf8',
  });
  return { result, calls: (await readFile(join(dir, 'calls'), 'utf8')).trim().split('\n') };
}

test('startup applies all schema layers before serving', async () => {
  const { result, calls } = await startup();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls, [
    'scripts/check-db.js',
    'scripts/liekan-migrate.mjs',
    'scripts/aeo/migrate.mjs',
    'scripts/update-tracker.js',
    'server.js',
  ]);
});

test('failed AEO migration prevents the server from accepting requests', async () => {
  const { result, calls } = await startup('scripts/aeo/migrate.mjs');
  assert.notEqual(result.status, 0);
  assert.ok(!calls.includes('server.js'));
});
