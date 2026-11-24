import { ApplicationInsights, SeverityLevel } from '@microsoft/applicationinsights-web';

export type Properties = Record<string, string | number | boolean | null>;
let recordingId: string | null = null;
const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;
export const telemetryConfigured = Boolean(connectionString);
const pageSessionId = crypto.randomUUID();
const appInsights = connectionString ? new ApplicationInsights({ config: {
  connectionString,
  enableAutoRouteTracking: false,
  disableAjaxTracking: true,
  disableFetchTracking: true,
  enableCorsCorrelation: false,
  samplingPercentage: 100,
  maxBatchInterval: 5000,
  disableCookiesUsage: true,
} }) : null;

if (appInsights) {
  appInsights.loadAppInsights();
  appInsights.addTelemetryInitializer(item => {
    item.baseData ??= {};
    item.baseData.properties = { ...item.baseData.properties, demo: 'yakshaver-anywhere', application: 'phonebook', pageSessionId,
      ...(recordingId ? { recordingId } : {}) };
  });
  appInsights.trackPageView({ name: 'Phone book', uri: location.href });
}

export function setRecordingId(id: string | null) { recordingId = id; }

export function track(name: string, properties: Properties = {}) {
  appInsights?.trackEvent({ name }, properties);
}

export function trace(message: string, properties: Properties = {}, error = false) {
  appInsights?.trackTrace({ message, severityLevel: error ? SeverityLevel.Error : SeverityLevel.Information }, properties);
}

export function reportException(exception: Error, properties: Properties = {}) {
  appInsights?.trackException({ exception, severityLevel: SeverityLevel.Error }, properties);
}

export function flush() { appInsights?.flush(); }

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);
