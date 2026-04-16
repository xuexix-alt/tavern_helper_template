import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = relativePath =>
  fs.readFileSync(path.resolve(__dirname, relativePath), {
    encoding: 'utf8',
  });

test('same-layer user creation inherits latest mvu snapshot instead of fragile -2 host fetch', () => {
  const source = read('../useStreamingDemo.ts');
  assert.match(source, /function resolveInheritedUserMessageData\(\)/);
  assert.match(source, /Mvu\.getMvuData\(\{ type: 'message', message_id: Math\.trunc\(latestMessageId\) \}\)/);
  assert.match(
    source,
    /await createChatMessages\(\[\{ role: 'user', message: prompt, is_hidden: false, data: userData \}\]/,
  );
  assert.doesNotMatch(source, /callHostGetChatMessages\(-2,\s*\{ hide_state: 'all' \}\)/);
});

test('mvu reprocess base lookup scans backward for non-empty state to avoid accidental re-init', () => {
  const source = read('../../../../mvu_reprocess.ts');
  assert.match(source, /const LOOKBACK_LIMIT = 120/);
  assert.match(source, /for \(let offset = 0; offset < LOOKBACK_LIMIT; offset \+= 1\)/);
  assert.match(source, /Object\.keys\(statData\)\.length > 0 \|\| Object\.keys\(initializedLorebooks\)\.length > 0/);
});
