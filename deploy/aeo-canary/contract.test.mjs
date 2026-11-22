import assert from 'node:assert/strict';
import test from 'node:test';
import { proofFromLink } from './contract.mjs';

const token = 'A'.repeat(43);
const valid = 'https://aeo.io/#account=' + token;

test('accepts canonical fragment links for both email purposes', () => {
  for (const purpose of ['verify', 'recover']) {
    assert.deepEqual(proofFromLink(valid + '&purpose=' + purpose), { token, purpose });
  }
});

test('rejects redirects, credentials, query tokens, and ambiguous fragments', () => {
  const suffix = '#account=' + token + '&purpose=recover';
  for (const link of [
    'https://staging.aeo.io/' + suffix,
    'https://aeo.io.example/' + suffix,
    'https://aeo.io@other.example/' + suffix,
    'https://someone@aeo.io/' + suffix,
    'https://aeo.io/other' + suffix,
    'https://aeo.io/?account=' + token,
    valid + '&purpose=login',
    valid + '&purpose=recover&purpose=verify',
    valid + '&purpose=recover&next=//example.com',
    'https://aeo.io/#account=short&purpose=recover',
  ]) assert.equal(proofFromLink(link), null);
});
