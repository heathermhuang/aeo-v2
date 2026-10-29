"""Convert an explicitly supplied private v1 SQL snapshot to a provenance archive.

No network access; no credentials, sessions, private-share tokens or billing rows
enter the portable archive. Retain the original SQL separately with mode 0600.
"""
import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--sql', required=True)
parser.add_argument('--release', required=True)
parser.add_argument('--database-id', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
os.umask(0o077)
raw = Path(args.sql).read_bytes()
if len(raw) > 150 * 1024 * 1024:
    raise ValueError('Snapshot exceeds 150 MiB')
con = sqlite3.connect(':memory:')
con.row_factory = sqlite3.Row
def authorizer(action, arg1, arg2, *_):
    if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH, sqlite3.SQLITE_CREATE_VTABLE):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and (arg2 or '').lower() in ('load_extension', 'readfile', 'writefile'):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_PRAGMA and (arg1 or '').lower() not in ('foreign_keys', 'defer_foreign_keys'):
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK
con.set_authorizer(authorizer)
con.executescript(raw.decode('utf-8'))
con.set_authorizer(None)
if con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
    raise ValueError('Snapshot integrity check failed')
if con.execute('PRAGMA foreign_key_check').fetchone() is not None:
    raise ValueError('Snapshot foreign-key integrity check failed')
tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
def rows(table):
    return [dict(r) for r in con.execute('SELECT * FROM "' + table + '"')] if table in tables else []
users = {r['id']: r for r in rows('users')}
credentials = {r['user_id']: r for r in rows('auth_credentials')}
verification = {r['user_id']: r for r in rows('auth_email_verifications')}
quarantine = {r['user_id'] for r in rows('legacy_account_quarantine')}
accounts = []
for uid, user in users.items():
    account = credentials.get(uid)
    eligible = bool(account and not account.get('disabled_at') and uid not in quarantine and verification.get(uid, {}).get('verified_at'))
    accounts.append({'legacyId': uid, 'email': user['email'].strip().lower(), 'eligible': eligible})
brands = {r['id']: r for r in rows('brands')}
checks = {r['id']: r for r in rows('checks')}
# Only evidence tables with a direct, auditable ownership chain are portable.
portable = ['brands', 'checks', 'answers', 'prompts', 'prompt_universe_items',
            'content_assets', 'evidence_atoms', 'source_ledger', 'page_briefs',
            'citation_selection_events', 'citation_absorption_events',
            'geo_correction_tasks', 'confirmed_profile_snapshots']
records = []
for table in portable:
    for row in rows(table):
        if 'id' not in row:
            raise ValueError('Evidence row has no stable identity: ' + table)
        brand_id = row['id'] if table == 'brands' else row.get('brand_id')
        if not brand_id and row.get('check_id'):
            brand_id = checks.get(row['check_id'], {}).get('brand_id')
        owner_id = brands.get(brand_id, {}).get('user_id')
        if owner_id not in users:
            owner_id = None  # preserve unowned evidence without granting customer access
        if row.get('user_id') and row['user_id'] != owner_id:
            owner_id = None  # conflicting ownership remains operator-held
        payload = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        records.append({'kind': table, 'legacyId': row['id'], 'ownerId': owner_id,
                        'brandId': brand_id, 'createdAt': row.get('created_at'),
                        'raw': payload, 'sha256': hashlib.sha256(payload.encode()).hexdigest()})
archive = {'format': 'aeo-v1-archive/1', 'source': {
    'snapshotSha256': hashlib.sha256(raw).hexdigest(), 'releaseId': args.release,
    'databaseId': args.database_id, 'exportedAt': datetime.fromtimestamp(Path(args.sql).stat().st_mtime, timezone.utc).isoformat()},
    'accounts': accounts, 'records': records}
with open(args.output, 'x', encoding='utf-8') as output:
    json.dump(archive, output, ensure_ascii=False, separators=(',', ':'))
os.chmod(args.output, 0o600)
print(json.dumps({'accounts': len(accounts), 'eligibleAccounts': sum(a['eligible'] for a in accounts),
                  'records': len(records), 'snapshotSha256': archive['source']['snapshotSha256']}))
