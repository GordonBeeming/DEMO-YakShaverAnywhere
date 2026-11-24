import './style.css';
import { ContactSaveError, ContactValidationError, contactFields, deleteContact, sampleContacts, searchContacts, updateContact, type Contact, type ContactDraft } from './phonebook';
import { setupYakShaver } from './yakshaver';
import { telemetryConfigured, track, trace, flush, reportException } from './telemetry';
import yakIconUrl from '../assets/yak-icon.svg';

const customRecordMode = new URLSearchParams(location.search).get('recorder') === 'custom';
const contextPreferenceKey = 'phonebook.extra-context';
let triggerSaveBug = true;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root is missing');
app.innerHTML = `
<header class="topbar"><div class="header-content"><a class="wordmark" href="/">PHONE BOOK<span>DEMO</span></a></div></header>
<main><section class="intro"><div><p class="eyebrow">YOUR PEOPLE, IN ONE PLACE</p><h1>A little more connected.</h1><p class="lede">Find a contact. Keep their details up to date.</p></div><div class="context-control"><label for="extra-context"><span>Extra context</span><input id="extra-context" type="checkbox" role="switch"><span class="switch-track" aria-hidden="true"></span><strong id="context-state">Off</strong></label><p id="context-hint">Record normally, then switch on more detail.</p></div></section>
<section class="workspace" aria-label="Phone book"><aside class="directory"><div class="directory-head"><h2>Contacts <span id="contact-count"></span></h2><button id="reset" type="button" class="text-button">Reset demo</button></div><label for="search" class="sr-only">Search contacts</label><input id="search" type="search" placeholder="Search name, company or phone…" autocomplete="off" maxlength="120"><div class="list-label"><span>NAME / COMPANY</span><span id="result-count"></span></div><div id="contacts" class="contacts" aria-label="Contact list"></div><p id="empty" hidden>No contacts found. Try another search.</p></aside>
<section class="detail" aria-label="Contact details"><div class="detail-head"><div id="avatar" class="avatar" aria-hidden="true"></div><div><p class="eyebrow">CONTACT DETAILS</p><h2 id="contact-name"></h2><p id="contact-subtitle"></p></div><span class="contact-id" id="contact-id"></span></div><form id="contact-form"><div class="fields"><label>Full name<input name="name" autocomplete="off" required maxlength="120"></label><label>Company<input name="company" autocomplete="off" maxlength="120"></label><label>Role<input name="role" autocomplete="off" maxlength="120"></label><label>Email address<input name="email" type="email" autocomplete="off" required maxlength="254"></label><label class="phone-field">Phone number<input name="phone" type="tel" autocomplete="off" required maxlength="40"><span>Include the country code.</span></label></div><div class="form-actions"><p id="save-status" role="status">All changes saved</p><button id="cancel" type="button" class="secondary">Discard changes</button><button type="submit" class="primary">Save contact</button></div></form></section></section>
<footer><span><i class="dot ${telemetryConfigured ? 'connected' : ''}"></i>Application Insights ${telemetryConfigured ? 'configured' : 'not configured'}</span><span>Fictional contacts · changes last until reset or reload</span><span id="recording-status" role="status">Loading YakShaver…</span></footer></main>`;

function element<T extends HTMLElement>(selector: string, type: { new(...args: never[]): T }): T {
  const result = document.querySelector(selector);
  if (!(result instanceof type)) throw new Error(`Missing phone book element: ${selector}`);
  return result;
}

const list = element('#contacts', HTMLDivElement);
const search = element('#search', HTMLInputElement);
const form = element('#contact-form', HTMLFormElement);
const contextToggle = element('#extra-context', HTMLInputElement);
contextToggle.autocomplete = 'off';
let initialExtraContext = true;
try {
  initialExtraContext = sessionStorage.getItem(contextPreferenceKey) !== 'off';
} catch (error) {
  trace('Could not read extra context preference', { message: error instanceof Error ? error.message : String(error) });
}
function renderContextSetting(enabled: boolean) {
  contextToggle.checked = enabled;
  element('#context-state', HTMLElement).textContent = enabled ? 'On' : 'Off';
  element('#context-hint', HTMLParagraphElement).textContent = enabled ? 'Contact details and saves attach while recording.' : 'Record normally, then switch on more detail.';
}
renderContextSetting(initialExtraContext);
const headerActions = document.createElement('div');
headerActions.className = 'header-actions';
const recordButton = document.createElement('button');
recordButton.type = 'button';
recordButton.id = 'custom-record-button';
recordButton.className = 'record-button';
recordButton.hidden = !customRecordMode;
recordButton.disabled = true;
const yakIcon = document.createElement('img');
yakIcon.src = yakIconUrl;
yakIcon.alt = '';
recordButton.append(yakIcon, document.createTextNode('Record with YakShaver'));
headerActions.append(recordButton);
element('.header-content', HTMLDivElement).append(headerActions);
const recordModeControl = document.createElement('div');
recordModeControl.className = 'record-mode-control';
recordModeControl.innerHTML = `<label for="custom-record-toggle"><span>Custom record button</span><input id="custom-record-toggle" type="checkbox" role="switch" autocomplete="off"><span class="switch-track" aria-hidden="true"></span><strong>${customRecordMode ? 'On' : 'Off'}</strong></label><p>Choose your recording controls before you start.</p>`;
element('.context-control', HTMLDivElement).append(recordModeControl);
const settingsPanel = element('.context-control', HTMLDivElement);
settingsPanel.id = 'demo-settings';
settingsPanel.popover = 'auto';
settingsPanel.setAttribute('role', 'group');
settingsPanel.setAttribute('aria-label', 'Demo settings');
const settingsTitle = document.createElement('h2');
settingsTitle.className = 'settings-title';
settingsTitle.textContent = 'Demo settings';
settingsPanel.prepend(settingsTitle);
const settingsButton = document.createElement('button');
settingsButton.type = 'button';
settingsButton.id = 'settings-button';
settingsButton.className = 'settings-button';
settingsButton.setAttribute('popovertarget', settingsPanel.id);
settingsButton.setAttribute('aria-label', 'Settings');
settingsButton.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.7 2.2-2 .9-2.1-.5-2 3.4 1.5 1.7v2.6L2.7 15l2 3.4 2.1-.5 2 .9.7 2.2h4.9l.8-2.2 2-.9 2.1.5 2-3.4-1.5-1.7v-2.6L21.8 9l-2-3.4-2.1.5-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/></svg><span>Settings</span>';
headerActions.append(settingsButton, settingsPanel);
const recordModeToggle = element('#custom-record-toggle', HTMLInputElement);
recordModeToggle.checked = customRecordMode;
recordModeToggle.addEventListener('change', () => {
  const url = new URL(location.href);
  if (recordModeToggle.checked) url.searchParams.set('recorder', 'custom');
  else url.searchParams.delete('recorder');
  location.assign(url.href);
});
const bugControl = document.createElement('div');
bugControl.className = 'record-mode-control';
bugControl.innerHTML = '<label for="trigger-save-bug"><span>Trigger save bug</span><input id="trigger-save-bug" type="checkbox" role="switch" autocomplete="off"><span class="switch-track" aria-hidden="true"></span><strong id="bug-state">On</strong></label><p>Fail normal saves when the full name starts with zz.</p>';
settingsPanel.append(bugControl);
const bugToggle = element('#trigger-save-bug', HTMLInputElement);
bugToggle.checked = triggerSaveBug;
bugToggle.addEventListener('change', () => {
  triggerSaveBug = bugToggle.checked;
  element('#bug-state', HTMLElement).textContent = triggerSaveBug ? 'On' : 'Off';
  log('SaveBugToggled', { triggerSaveBug });
  context.attach({ triggerSaveBug }, 'Save bug toggled');
});
const saveStatus = element('#save-status', HTMLParagraphElement);
const recordingStatus = element('#recording-status', HTMLSpanElement);
let contacts: Contact[] = sampleContacts.map(contact => ({ ...contact }));
let selectedId = 'contact-01';

function selected(): Contact {
  const contact = contacts.find(contact => contact.id === selectedId);
  if (!contact) throw new Error('Selected contact is missing');
  return contact;
}

function snapshot() {
  const contact = selected();
  return { application: 'Phone book', selectedContactId: contact.id, selectedContactName: contact.name, company: contact.company, phone: contact.phone, searchQuery: search.value, resultCount: searchContacts(contacts, search.value).length, contactCount: contacts.length, view: 'contact-details', recorderMode: customRecordMode ? 'custom-button' : 'orb', triggerSaveBug };
}
const context = setupYakShaver(snapshot, message => { recordingStatus.textContent = message; }, {
  customMode: customRecordMode,
  button: recordButton,
  lockMode: () => {
    recordModeToggle.disabled = true;
    recordModeControl.title = 'Reload after submitting or discarding the recording to change recording controls.';
  },
  unlockMode: () => {
    recordModeToggle.disabled = false;
    recordModeControl.title = '';
  },
});
context.setEnabled(initialExtraContext);

function log(name: string, properties: Record<string, string | number | boolean | null> = {}) {
  track(name, properties);
  trace(name, properties);
}

function renderList() {
  const results = searchContacts(contacts, search.value);
  element('#contact-count', HTMLSpanElement).textContent = String(contacts.length).padStart(2, '0');
  element('#result-count', HTMLSpanElement).textContent = `${results.length} shown`;
  element('#empty', HTMLParagraphElement).hidden = results.length > 0;
  list.replaceChildren(...results.map(contact => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `contact-row${contact.id === selectedId ? ' selected' : ''}`;
    button.dataset.contactId = contact.id;
    button.setAttribute('aria-pressed', String(contact.id === selectedId));
    const initials = document.createElement('span');
    initials.className = 'list-avatar';
    initials.textContent = contact.name.split(' ').map(word => word[0]).join('').slice(0, 2);
    initials.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = contact.name;
    const company = document.createElement('small');
    company.textContent = contact.company;
    text.append(name, company);
    button.append(initials, text);
    button.addEventListener('click', () => {
      if (selectedId === contact.id) return;
      selectedId = contact.id;
      log('ContactSelected', { contactId: contact.id, contactName: contact.name });
      renderList();
      renderDetail();
      context.attach(snapshot(), 'Contact opened');
    });
    return button;
  }));
}

function renderDetail() {
  const contact = selected();
  element('#contact-name', HTMLHeadingElement).textContent = contact.name;
  element('#contact-subtitle', HTMLParagraphElement).textContent = [contact.role, contact.company].filter(Boolean).join(' · ');
  element('#contact-id', HTMLSpanElement).textContent = contact.id;
  element('#avatar', HTMLDivElement).textContent = contact.name.split(' ').map(word => word[0]).join('').slice(0, 2);
  for (const field of contactFields) element(`input[name="${field}"]`, HTMLInputElement).value = contact[field];
  saveStatus.textContent = 'All changes saved';
  saveStatus.classList.remove('error');
}

search.addEventListener('input', () => {
  renderList();
  log('PhonebookSearchChanged', { query: search.value, resultCount: searchContacts(contacts, search.value).length });
});
contextToggle.addEventListener('change', () => {
  context.setEnabled(contextToggle.checked);
  renderContextSetting(contextToggle.checked);
  try {
    sessionStorage.setItem(contextPreferenceKey, contextToggle.checked ? 'on' : 'off');
  } catch (error) {
    trace('Could not save extra context preference', { message: error instanceof Error ? error.message : String(error) });
  }
});
form.addEventListener('input', () => { saveStatus.textContent = 'Unsaved changes'; saveStatus.classList.remove('error'); });
form.addEventListener('change', event => {
  if (event.target instanceof HTMLInputElement) log('ContactFieldChanged', { contactId: selectedId, field: event.target.name, valueLength: event.target.value.length });
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const value = (name: keyof ContactDraft): string => {
    const entry = data.get(name);
    if (typeof entry !== 'string') throw new Error(`Missing contact field: ${name}`);
    return entry;
  };
  try {
    const before = selected();
    const draft = { name: value('name'), company: value('company'), role: value('role'), email: value('email'), phone: value('phone') };
    const attempt = { contactId: selectedId, attemptedName: draft.name, actionSource: 'save-button' };
    log('ContactSaveAttempted', attempt);
    context.attach({ ...snapshot(), ...attempt }, 'Contact save attempted');
    const result = updateContact(before, draft, { triggerSaveBug });
    contacts = contacts.map(contact => contact.id === selectedId ? result.contact : contact);
    const details = { ...snapshot(), contactId: selectedId, changedFields: result.changedFields.join(', '), previousPhone: before.phone, savedPhone: result.contact.phone };
    log('ContactSaved', details);
    context.attach(details, 'Contact saved');
    flush();
    renderList();
    renderDetail();
    saveStatus.textContent = result.changedFields.length ? 'Contact saved' : 'No changes to save';
  } catch (error) {
    if (error instanceof ContactValidationError) {
      saveStatus.textContent = error.message;
      saveStatus.classList.add('error');
      log('ContactValidationFailed', { contactId: selectedId, message: error.message });
      return;
    }
    const exception = error instanceof Error ? error : new Error('Could not save the contact');
    const details = { ...snapshot(), contactId: selectedId, attemptedName: String(data.get('name') ?? ''), actionSource: 'save-button', errorCode: error instanceof ContactSaveError ? error.code : 'PHONEBOOK_SAVE_FAILED', message: exception.message };
    saveStatus.textContent = 'Could not save contact. Please try again.';
    saveStatus.classList.add('error');
    track('ContactSaveFailed', details);
    trace('Contact save failed', details, true);
    reportException(exception, details);
    flush();
  }
});
const deleteLink = document.createElement('button');
deleteLink.type = 'button';
deleteLink.id = 'delete-contact';
deleteLink.className = 'delete-link';
deleteLink.textContent = 'Delete contact';
element('.form-actions', HTMLDivElement).prepend(deleteLink);
deleteLink.addEventListener('click', () => {
  const before = selected();
  const deleted = deleteContact(before);
  contacts = contacts.map(contact => contact.id === selectedId ? deleted : contact);
  const details = { ...snapshot(), contactId: selectedId, previousName: before.name, deletedName: deleted.name, actionSource: 'delete-link' };
  log('ContactDeleted', details);
  context.attach(details, 'Contact deleted');
  flush();
  renderList();
  renderDetail();
  saveStatus.textContent = 'Contact deleted';
});
element('#cancel', HTMLButtonElement).addEventListener('click', () => { log('ContactChangesDiscarded', { contactId: selectedId }); renderDetail(); });
element('#reset', HTMLButtonElement).addEventListener('click', () => {
  contacts = sampleContacts.map(contact => ({ ...contact }));
  selectedId = 'contact-01';
  search.value = '';
  log('PhonebookReset');
  renderList();
  renderDetail();
  context.attach(snapshot(), 'Phone book reset');
});
renderList();
renderDetail();
