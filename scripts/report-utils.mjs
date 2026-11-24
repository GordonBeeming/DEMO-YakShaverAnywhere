export function extractRecordingIds(text) {
  const matches = text.matchAll(/\brecording(?:[ _-]+id\b|Id\b)[ \t`*"<>]*[:=|][ \t`*"<>]*([a-zA-Z0-9_-]{8,128})(?![a-zA-Z0-9_-])/gi);
  return [...new Set([...matches].map(match => match[1]))];
}

export function containsRecordingId(text, recordingId) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(recordingId)) return false;
  return new RegExp(`(?<![a-zA-Z0-9_-])${recordingId}(?![a-zA-Z0-9_-])`).test(text);
}

export function escaped(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
