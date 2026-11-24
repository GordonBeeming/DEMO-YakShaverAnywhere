export type Values = Record<string, string | number | boolean | null>;
export type AttachResult = { ok: boolean; reason?: string; errors?: string[]; seq?: number };
export type ContextDependencies = {
  snapshot: () => Values;
  send: (values: Values, label: string) => AttachResult;
  correlate: (recordingId: string | null) => void;
  event: (name: string, values: Values) => void;
  flush: () => void;
  status: (message: string) => void;
};

export class RecordingContext {
  enabled = false;
  recordingId: string | null = null;
  attachedEvents = 0;

  constructor(private readonly dependencies: ContextDependencies) {}

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    if (!enabled) {
      this.attach({ extraContext: false }, 'Extra context disabled');
      this.dependencies.event('ExtraContextDisabled', {});
      this.dependencies.flush();
    }
    this.enabled = enabled;
    this.dependencies.correlate(enabled ? this.recordingId : null);
    if (enabled) {
      this.dependencies.event('ExtraContextEnabled', {});
      this.attach(this.dependencies.snapshot(), 'Extra context enabled');
    }
    this.updateStatus();
  }

  start(recordingId: string): Values | undefined {
    this.recordingId = recordingId;
    this.attachedEvents = 0;
    this.dependencies.correlate(this.enabled ? recordingId : null);
    this.dependencies.event('RecordingStarted', { extraContext: this.enabled });
    this.updateStatus();
    if (this.enabled) return { ...this.dependencies.snapshot(), recordingId, extraContext: true };
  }

  end(): Values | undefined {
    const snapshot = this.enabled && this.recordingId
      ? { ...this.dependencies.snapshot(), recordingId: this.recordingId, extraContext: true, attachedEvents: this.attachedEvents }
      : undefined;
    this.dependencies.event('RecordingStopped', { extraContext: this.enabled, attachedEvents: this.attachedEvents });
    this.dependencies.flush();
    this.recordingId = null;
    this.dependencies.correlate(null);
    this.dependencies.status('Recording stopped');
    return snapshot;
  }

  attach(values: Values, label: string): void {
    if (!this.enabled || !this.recordingId) return;
    const result = this.dependencies.send({ ...values, recordingId: this.recordingId }, label);
    if (result.ok) this.attachedEvents++;
    if (!result.ok || result.errors?.length) {
      this.dependencies.event('ContextAttachmentFailed', { reason: result.reason ?? 'invalid', errors: result.errors?.join('; ') ?? '' });
      this.dependencies.status('Context attachment failed · check application logs');
    }
  }

  private updateStatus() {
    this.dependencies.status(this.recordingId
      ? `Recording · context ${this.enabled ? 'on' : 'off'}${this.enabled ? ` · ${this.recordingId}` : ''}`
      : `Ready to record · context ${this.enabled ? 'on' : 'off'}`);
  }
}
