import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordingContext, type Values, type AttachResult } from './context.ts';

function fixture(result: AttachResult = { ok: true }) {
  const sent: { values: Values; label: string }[] = [];
  const correlation: (string | null)[] = [];
  const events: { name: string; correlation: string | null | undefined }[] = [];
  const context = new RecordingContext({
    snapshot: () => ({ selectedContactId: 'contact-01', searchQuery: 'Alex' }),
    send: (values, label) => { sent.push({ values, label }); return result; },
    correlate: id => { correlation.push(id); },
    event: name => { events.push({ name, correlation: correlation.at(-1) }); },
    flush: () => {}, status: () => {},
  });
  return { context, sent, correlation, events };
}

test('context off returns no snapshots and leaves normal telemetry uncorrelated', () => {
  const { context, sent, correlation } = fixture();
  assert.equal(context.start('recording-01'), undefined);
  context.attach({ contactId: 'contact-01' }, 'Contact saved');
  assert.equal(context.end(), undefined);
  assert.deepEqual(sent, []);
  assert.deepEqual(correlation, [null, null]);
});

test('switching on mid-recording attaches current state with the real recording ID', () => {
  const { context, sent, correlation, events } = fixture();
  context.start('recording-01');
  context.setEnabled(true);
  assert.deepEqual(sent[0], { label: 'Extra context enabled', values: { selectedContactId: 'contact-01', searchQuery: 'Alex', recordingId: 'recording-01' } });
  context.attach({ contactId: 'contact-01', changedFields: 'phone' }, 'Contact saved');
  assert.equal(sent[1]?.values.recordingId, 'recording-01');
  assert.equal(events.find(event => event.name === 'ExtraContextEnabled')?.correlation, 'recording-01');
  assert.equal(context.end()?.attachedEvents, 2);
  assert.equal(correlation.at(-1), null);
  assert.equal(events.at(-1)?.correlation, 'recording-01');
});

test('switching off stops subsequent attachments and correlation without ending the recording', () => {
  const { context, sent, correlation } = fixture();
  context.setEnabled(true);
  const start = context.start('recording-01');
  assert.equal(start?.recordingId, 'recording-01');
  context.setEnabled(false);
  const count = sent.length;
  context.attach({ contactId: 'contact-02' }, 'Contact saved');
  assert.equal(sent.length, count);
  assert.equal(context.recordingId, 'recording-01');
  assert.equal(correlation.at(-1), null);
  assert.equal(context.end(), undefined);
});

test('failed attachments are reported and do not increase the count', () => {
  const { context, events } = fixture({ ok: false, reason: 'invalid' });
  context.start('recording-01');
  context.setEnabled(true);
  assert.equal(context.attachedEvents, 0);
  assert.equal(events.at(-1)?.name, 'ContextAttachmentFailed');
});

test('repeated off/on switches preserve one recording ID and record both boundaries', () => {
  const { context, sent, events } = fixture();
  context.start('recording-01');
  context.setEnabled(true);
  context.setEnabled(false);
  assert.equal(events.find(event => event.name === 'ExtraContextDisabled')?.correlation, 'recording-01');
  context.setEnabled(true);
  assert.equal(sent.length, 3);
  assert.ok(sent.every(entry => entry.values.recordingId === 'recording-01'));
  assert.deepEqual(context.end(), { selectedContactId: 'contact-01', searchQuery: 'Alex', recordingId: 'recording-01', extraContext: true, attachedEvents: 3 });
});

test('a new start replaces any stale recording ID and resets attachment counts', () => {
  const { context, sent, correlation } = fixture();
  context.setEnabled(true);
  context.start('recording-01');
  context.attach({ contactId: 'contact-01' }, 'Contact saved');
  const start = context.start('recording-02');
  assert.equal(start?.recordingId, 'recording-02');
  assert.equal(context.attachedEvents, 0);
  context.attach({ contactId: 'contact-02' }, 'Contact saved');
  assert.equal(sent.at(-1)?.values.recordingId, 'recording-02');
  assert.equal(correlation.at(-1), 'recording-02');
});
