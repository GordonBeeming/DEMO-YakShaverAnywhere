import { RecordingContext, type Values, type AttachResult } from './context';
import { flush, setRecordingId, trace, track } from './telemetry';

type ContextError = { phase?: string; reason?: string; errors?: string[] };
type StartResult = { status: 'started' | 'cancelled' | 'failed'; reason?: string; recordingId?: string };
type YakShaver = {
  startRecording(): Promise<StartResult>;
  setContextCallbacks(callbacks: {
    start: (context: { recordingId: string }) => Values | undefined;
    end: () => Values | undefined;
    onError: (error: ContextError) => void;
  }): void;
  attachContext(values: Values, options?: { label: string }): AttachResult;
};

declare global { interface Window { YakShaverAnywhere?: YakShaver } }

type RecordingControls = { customMode: boolean; button: HTMLButtonElement; lockMode: () => void; unlockMode: () => void };

export function setupYakShaver(snapshot: () => Values, status: (message: string) => void, controls: RecordingControls) {
  let ready = false;
  const context = new RecordingContext({
    snapshot,
    send: (values, label) => window.YakShaverAnywhere?.attachContext(values, { label }) ?? { ok: false, reason: 'unavailable' },
    correlate: setRecordingId,
    event: (name, values) => {
      track(name, values);
      trace(name, values, name === 'ContextAttachmentFailed');
    },
    flush,
    status: message => { if (ready) status(message); },
  });
  const key = import.meta.env.VITE_YAKSHAVER_PUBLIC_KEY;
  controls.button.addEventListener('click', () => {
    const yak = window.YakShaverAnywhere;
    if (!ready || !yak || !controls.customMode) return;
    controls.button.disabled = true;
    controls.lockMode();
    // Screen capture needs the click's activation; call the SDK before awaiting any work.
    yak.startRecording().then(result => {
      track('CustomRecordRequested', { status: result.status, reason: result.reason ?? '' });
      if (result.status !== 'started') controls.button.disabled = false;
      if (result.status !== 'started' && result.reason !== 'busy') controls.unlockMode();
      if (result.status === 'cancelled') status('Recording cancelled');
      if (result.status === 'failed') {
        status(result.reason === 'busy' ? 'A recording or review is already open' : `Could not start recording: ${result.reason ?? 'unknown'}`);
        trace('Custom recording request failed', { reason: result.reason ?? 'unknown' }, result.reason !== 'busy');
      }
    }).catch(error => {
      controls.button.disabled = context.recordingId !== null;
      if (!context.recordingId) {
        controls.unlockMode();
        status('Could not start recording');
      }
      trace('Custom recording request failed unexpectedly', { message: error instanceof Error ? error.message : String(error) }, true);
    });
  });
  if (!key) {
    status('YakShaver is not configured');
    return context;
  }
  const script = document.createElement('script');
  script.src = import.meta.env.VITE_YAKSHAVER_SCRIPT_URL || 'https://portal.yakshaver.ai/embed.js';
  script.setAttribute('data-yak-key', key);
  if (controls.customMode) script.setAttribute('data-yak-hidden', '');
  script.async = true;
  script.onload = () => {
    const yak = window.YakShaverAnywhere;
    if (!yak) {
      status('YakShaver did not initialise');
      trace('YakShaver API missing after script load', {}, true);
      return;
    }
    ready = true;
    // The start hook remembers the ID while context is off, returning no snapshot. This allows
    // enabling context during the same recording without inventing a correlation ID.
    yak.setContextCallbacks({
      start: ({ recordingId }) => {
        controls.lockMode();
        controls.button.disabled = true;
        return context.start(recordingId);
      },
      end: () => {
        controls.button.disabled = false;
        return context.end();
      },
      onError: error => {
        trace('YakShaver context callback failed', { phase: error.phase ?? 'unknown', reason: error.reason ?? 'unknown', errors: error.errors?.join('; ') ?? '' }, true);
        status(`Context error: ${error.reason ?? 'unknown'}`);
      },
    });
    controls.button.disabled = false;
    status(`Ready to record · context ${context.enabled ? 'on' : 'off'}`);
  };
  script.onerror = () => {
    status('YakShaver failed to load');
    trace('YakShaver embed failed to load', {}, true);
  };
  document.head.appendChild(script);
  return context;
}
