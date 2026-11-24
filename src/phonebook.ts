export type Contact = { id: string; name: string; company: string; role: string; email: string; phone: string };
export type ContactDraft = Omit<Contact, 'id'>;
export const contactFields: (keyof ContactDraft)[] = ['name', 'company', 'role', 'email', 'phone'];

export class ContactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactValidationError';
  }
}

export class ContactSaveError extends Error {
  readonly code = 'PHONEBOOK_ZZ_NAME';
  constructor(readonly contactId: string, readonly attemptedName: string) {
    super(`Contact ${contactId} could not be saved: name "${attemptedName}" starts with the reserved "zz" prefix. Normal Save cannot process a name carrying the soft-delete marker used by Delete contact.`);
    this.name = 'ContactSaveError';
  }
}

export function deleteContactName(name: string): string {
  return /^zz/i.test(name) ? name : `zz${name}`;
}

export function deleteContact(contact: Contact): Contact {
  return { ...contact, name: deleteContactName(contact.name) };
}

export const sampleContacts: readonly Contact[] = [
  { id: 'contact-01', name: 'Alex Morgan', company: 'Northstar Studio', role: 'Designer', email: 'alex@northstar.example', phone: '+1 202-555-0101' },
  { id: 'contact-02', name: 'Casey Taylor', company: 'Harbour Works', role: 'Project manager', email: 'casey@harbour.example', phone: '+1 202-555-0102' },
  { id: 'contact-03', name: 'Jordan Lee', company: 'Field Notes', role: 'Developer', email: 'jordan@fieldnotes.example', phone: '+1 202-555-0103' },
  { id: 'contact-04', name: 'Morgan Chen', company: 'Northstar Studio', role: 'Product manager', email: 'morgan@northstar.example', phone: '+1 202-555-0104' },
  { id: 'contact-05', name: 'Riley Brooks', company: 'Paper Plane', role: 'Account manager', email: 'riley@paperplane.example', phone: '+1 202-555-0105' },
  { id: 'contact-06', name: 'Sam Rivera', company: 'Harbour Works', role: 'Engineer', email: 'sam@harbour.example', phone: '+1 202-555-0106' },
];

export function searchContacts(contacts: readonly Contact[], query: string): Contact[] {
  const text = query.trim().toLowerCase();
  const digits = text.replace(/\D/g, '');
  return contacts.filter(contact => !text || contactFields.some(field => contact[field].toLowerCase().includes(text)) ||
    (digits.length > 0 && /^[\d\s()+.-]+$/.test(text) && contact.phone.replace(/\D/g, '').includes(digits)));
}

export function updateContact(contact: Contact, draft: ContactDraft, options: { triggerSaveBug: boolean } = { triggerSaveBug: true }): { contact: Contact; changedFields: string[] } {
  const normalized = { name: draft.name.trim(), company: draft.company.trim(), role: draft.role.trim(), email: draft.email.trim(), phone: draft.phone.trim() };
  // This reserved-prefix failure is the reproducible fault used in the recording demo.
  if (options.triggerSaveBug && /^zz/i.test(normalized.name)) throw new ContactSaveError(contact.id, normalized.name);
  if (!normalized.name || normalized.name.length > 120) throw new ContactValidationError('Enter a name of 1–120 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email) || normalized.email.length > 254) throw new ContactValidationError('Enter a valid email address.');
  if (!/^[+\d\s().-]{5,40}$/.test(normalized.phone) || normalized.phone.replace(/\D/g, '').length < 5) throw new ContactValidationError('Enter a valid phone number.');
  if (normalized.company.length > 120 || normalized.role.length > 120) throw new ContactValidationError('Company and role must be at most 120 characters.');
  return { contact: { id: contact.id, ...normalized }, changedFields: contactFields.filter(field => normalized[field] !== contact[field]) };
}
