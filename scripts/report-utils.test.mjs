import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsRecordingId, escaped, extractRecordingIds } from './report-utils.mjs';

const id = 'cc4eecb4-f6ce-44be-a58b-45edfa7b55af';
test('reads JSON, markdown table and labelled recording IDs without matching identifier prose', () => {
  for (const text of [`{"recordingId":"${id}"}`, `| \`recordingId\` | \`${id}\` |`, `Recording ID: ${id}`, `**Recording ID:** \`${id}\``]) {
    assert.deepEqual(extractRecordingIds(text), [id]);
  }
  assert.deepEqual(extractRecordingIds('Recording identifier: abcdefgh'), []);
  assert.deepEqual(extractRecordingIds(`Recording ID is ${id}`), []);
  assert.deepEqual(extractRecordingIds(`recordingId: ${id}\nRecording ID: ${id}`), [id]);
});

test('requires a whole recording ID token in the selected issue', () => {
  assert.equal(containsRecordingId(`ID: \`${id}\``, id), true);
  assert.equal(containsRecordingId(`ID: ${id}-other`, id), false);
  assert.equal(containsRecordingId(`ID: prefix${id}`, id), false);
  assert.equal(containsRecordingId(id, 'x" OR 1=1'), false);
});

test('escapes issue titles and telemetry values as text', () => {
  assert.equal(escaped('<script>alert("x")</script> & \'y\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
});
