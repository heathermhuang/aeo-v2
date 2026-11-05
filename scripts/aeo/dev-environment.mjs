import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
await mkdir('.local', { recursive: true });
try {
  await access('.env.local');
  console.log('Keeping existing private development environment.');
} catch {
  const password = randomBytes(24).toString('hex');
  const lines = [
    `DATABASE_URL=postgresql://aeo_v2:${password}@127.0.0.1:15472/aeo_v2_candidate`,
    `APP_SECRET=${randomBytes(32).toString('hex')}`,
    `TWO_FACTOR_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    'AEO_SIGNUP_ENABLED=true',
    'AEO_PUBLIC_URL=http://127.0.0.1:3102',
    'DEFAULT_LOCALE=en-US',
    'DISABLE_TELEMETRY=1',
    'NEXT_TELEMETRY_DISABLED=1',
    `POSTGRES_PASSWORD=${password}`,
  ];
  await writeFile('.env.local', lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
}
await writeFile(
  '.local/compose.yml',
  `name: aeo-v2-candidate
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: aeo_v2
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: aeo_v2_candidate
    ports:
      - "127.0.0.1:15472:5432"
    volumes:
      - aeo-v2-candidate:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aeo_v2 -d aeo_v2_candidate"]
      interval: 2s
      retries: 20
volumes:
  aeo-v2-candidate:
`,
);
console.log('Private environment and isolated PostgreSQL compose definition ready.');
