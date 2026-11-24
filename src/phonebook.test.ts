import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContactSaveError, deleteContact, deleteContactName, sampleContacts, searchContacts, updateContact } from './phonebook.ts';

test('search finds names, company, email and phone numbers across formatting', () => {
  assert.equal(searchContacts(sampleContacts, ' ALEX ')[0]?.id, 'contact-01');
  assert.equal(searchContacts(sampleContacts, 'Harbour').length, 2);
  assert.equal(searchContacts(sampleContacts, '2025550103')[0]?.name, 'Jordan Lee');
  assert.equal(searchContacts(sampleContacts, 'nobody').length, 0);
});

test('saving keeps the contact ID and phone formatting, returning changed fields for context', () => {
  const original = sampleContacts[0];
  assert.ok(original);
  const { contact, changedFields } = updateContact(original, { ...original, phone: '+1 202-555-0199' });
  assert.equal(contact.id, original.id);
  assert.equal(contact.phone, '+1 202-555-0199');
  assert.deepEqual(changedFields, ['phone']);
  assert.equal(original.phone, '+1 202-555-0101');
});

test('invalid phone and email values cannot be saved', () => {
  const original = sampleContacts[0];
  assert.ok(original);
  assert.throws(() => updateContact(original, { ...original, phone: 'call me' }), /phone/);
  assert.throws(() => updateContact(original, { ...original, email: '<script>' }), /email/);
});

test('delete succeeds with a zz marker, while a subsequent normal save fails', () => {
  const original = sampleContacts[0];
  assert.ok(original);
  const attemptedName = deleteContactName(original.name);
  assert.equal(attemptedName, 'zzAlex Morgan');
  assert.equal(deleteContactName(attemptedName), attemptedName);
  const deleted = deleteContact(original);
  assert.equal(deleted.name, attemptedName);
  assert.equal(deleted.id, original.id);
  assert.throws(() => updateContact(deleted, deleted), (error: unknown) => {
    assert.ok(error instanceof ContactSaveError);
    assert.equal(error.code, 'PHONEBOOK_ZZ_NAME');
    assert.equal(error.contactId, original.id);
    assert.match(error.message, /Delete contact/);
    return true;
  });
  assert.equal(original.name, 'Alex Morgan');
});

test('a directly entered zz name also fails on save', () => {
  const original = sampleContacts[0];
  assert.ok(original);
  assert.throws(() => updateContact(original, { ...original, name: 'zzTest contact' }), ContactSaveError);
});

test('turning off the save bug permits zz names while retaining normal validation', () => {
  const original = sampleContacts[0];
  assert.ok(original);
  const deleted = deleteContact(original);
  const result = updateContact(deleted, deleted, { triggerSaveBug: false });
  assert.equal(result.contact.name, 'zzAlex Morgan');
  assert.equal(result.contact.id, original.id);
  assert.throws(() => updateContact(original, { ...original, phone: 'invalid' }, { triggerSaveBug: false }), /phone/);
});
