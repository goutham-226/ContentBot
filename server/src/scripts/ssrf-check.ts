// Checks that article links can't reach the server itself or the local
// network. Run: npx tsx src/scripts/ssrf-check.ts (no database needed).
import assert from 'node:assert/strict';
import { assertPublicUrl, isPrivateAddress, publicLookup } from '../web.ts';

const blocked = [
  'http://[::ffff:7f00:1]/', // 127.0.0.1, as URL normalises [::ffff:127.0.0.1]
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:a9fe:a9fe]/', // 169.254.169.254, cloud metadata
  'http://127.0.0.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://10.0.0.1/',
  'http://[::1]/',
  'http://[fd00::1]/',
  'http://[64:ff9b::7f00:1]/',
  'http://[2002:7f00:1::]/',
  'http://localhost/',
];
for (const url of blocked) {
  await assert.rejects(assertPublicUrl(url), /private address/, `${url} should be rejected`);
  console.log(`rejected  ${url}`);
}

for (const address of ['8.8.8.8', '2606:4700:4700::1111', '::ffff:808:808']) {
  assert.equal(isPrivateAddress(address), false, `${address} should be allowed`);
  console.log(`allowed   ${address}`);
}

// The fetcher's own DNS lookup refuses names that resolve to private addresses.
await new Promise<void>((resolve) => {
  publicLookup('localhost', {}, (err) => {
    assert.ok(err, 'localhost should be refused at connect time');
    console.log('rejected  localhost at connect time');
    resolve();
  });
});

console.log('All SSRF checks passed.');
