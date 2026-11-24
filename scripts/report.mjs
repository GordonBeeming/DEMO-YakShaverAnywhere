import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { containsRecordingId, escaped, extractRecordingIds } from './report-utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'infra/demo-config.json'), 'utf8'));
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--issue', '--recording-id', '--days', '--out'].includes(key) || !value) {
    throw new Error('Usage: npm run report -- --issue <issue URL or number> [--recording-id <id>] [--days 7] [--out <report.html>]');
  }
  options.set(key, value);
}

function commandJson(command, args) {
  try {
    return JSON.parse(execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} failed: ${detail}`, { cause: error });
  }
}

const issueArgument = options.get('--issue');
const match = issueArgument?.match(/^(?:https:\/\/github\.com\/GordonBeeming\/DEMO-YakShaverAnywhere\/issues\/)?([1-9]\d*)$/i);
if (!match) throw new Error('--issue must be an issue number or URL in GordonBeeming/DEMO-YakShaverAnywhere.');
const issueNumber = match[1];
const issue = commandJson('gh', ['issue', 'view', issueNumber, '--repo', 'GordonBeeming/DEMO-YakShaverAnywhere', '--json', 'number,title,body,url,createdAt,comments']);
const issueText = [issue.body, ...issue.comments.map(comment => comment.body)].join('\n');
const uniqueIds = extractRecordingIds(issueText);
const recordingId = options.get('--recording-id') ?? (uniqueIds.length === 1 ? uniqueIds[0] : null);
if (!recordingId || !/^[a-zA-Z0-9_-]{8,128}$/.test(recordingId)) {
  throw new Error('No unambiguous recording ID found in the issue. Pass --recording-id with the exact ID from YakShaver recording context.');
}
if (!containsRecordingId(issueText, recordingId)) throw new Error('The recording ID does not appear in this issue or its comments. Refusing to attribute unrelated telemetry.');
const days = Number(options.get('--days') ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('--days must be a whole number between 1 and 30.');
const account = commandJson('az', ['account', 'show', '-o', 'json']);
if (account.id !== config.subscriptionId || account.tenantId !== config.tenantId) {
  throw new Error('Select the MVP subscription and tenant before querying. See infra/demo-config.json.');
}

const query = `union isfuzzy=true withsource=TelemetryTable AppEvents, AppTraces, AppExceptions, AppDependencies, AppRequests, AppPageViews, AppBrowserTimings
| where TimeGenerated > ago(${days}d)
| where tostring(Properties["recordingId"]) == "${recordingId}"
| project TimeGenerated, TelemetryTable, Name=column_ifexists("Name", ""), Message=column_ifexists("Message", ""), OuterMessage=column_ifexists("OuterMessage", ""), SeverityLevel=column_ifexists("SeverityLevel", int(null)), Properties, OperationId=column_ifexists("OperationId", "")
| order by TimeGenerated asc
| take 5001`;
const data = commandJson('az', ['rest', '--method', 'post', '--resource', 'https://api.loganalytics.io', '--url', `https://api.loganalytics.azure.com/v1/workspaces/${config.workspaceId}/query`, '--body', JSON.stringify({ query }), '-o', 'json']);
if (data.error) throw new Error(`Azure query failed or returned partial results: ${JSON.stringify(data.error)}`);
const table = data.tables?.[0];
if (!table?.columns || !Array.isArray(table.rows)) throw new Error('Azure returned no query table.');
if (table.rows.length > 5000) throw new Error('More than 5,000 rows match. Refusing to create a truncated report; narrow the query window.');
const rows = table.rows.map(values => Object.fromEntries(table.columns.map((column, index) => [column.name, values[index]])));
for (const row of rows) {
  if (typeof row.Properties === 'string') row.Properties = JSON.parse(row.Properties);
}
if (!rows.length) throw new Error('No Azure telemetry matches this recording ID. Allow ingestion to finish, check the ID, and rerun. No report was generated.');

const aest = value => new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' AEST';
const events = rows.filter(row => row.TelemetryTable === 'AppEvents');
const saves = events.filter(row => row.Name === 'ContactSaved');
const failures = events.filter(row => row.Name === 'ContactSaveFailed');
const interactions = events.filter(row => /^(Contact|Phonebook)/.test(row.Name));
const errors = rows.filter(row => Number(row.SeverityLevel) >= 3 || row.TelemetryTable === 'AppExceptions');
const logo = readFileSync(resolve(root, 'assets/ssw-logo-light.png')).toString('base64');
const generatedAt = new Date().toISOString();
const output = resolve(options.get('--out') ?? resolve(homedir(), 'Developer/artifacts/yakshaver-anywhere', `issue-${issueNumber}.html`));
const kqlUrl = `https://portal.azure.com/#@${config.tenantId}/resource${config.workspaceResourceId}/logs`;
const html = `<!doctype html>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Issue #${escaped(issueNumber)} · Recording evidence</title>
<style>
:root{font-family:Inter,-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;background:#fff;color:#333;color-scheme:light}*{box-sizing:border-box}body{margin:0}header{border-bottom:1px solid #dadada;padding:26px 5vw;display:flex;align-items:center;gap:28px}header img{width:110px;height:auto}header span{font-size:12px;letter-spacing:1.5px;color:#6e6e6e}main{max-width:1500px;margin:auto;padding:45px 5vw}h1{font-size:38px;letter-spacing:-1.4px;max-width:1100px;margin:10px 0 18px}.eyebrow{color:#9e3232;font-size:12px;font-weight:700;letter-spacing:1.5px}a{color:#8a2323}p{line-height:1.7}code,pre{font-family:"IBM Plex Mono",ui-monospace,monospace;overflow-wrap:anywhere}code{background:#f5f5f5;padding:3px 6px;font-size:12px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:30px 0}.tile{border:1px solid #dadada;border-top:3px solid #cc4141;padding:22px;min-width:0}.tile strong{display:block;font-size:34px;font-weight:600}.tile span{font-size:13px;color:#6e6e6e}h2{font-size:23px;font-weight:600;margin:38px 0 14px}.calc{border-left:3px solid #cc4141;background:#fafafa;padding:16px 20px;margin:10px 0}.calc strong{font:20px ui-monospace,monospace;overflow-wrap:anywhere}.calc small{display:block;color:#6e6e6e;margin-bottom:9px}.controls{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}input,select{font:inherit;padding:10px 12px;border:1px solid #aaa;border-radius:5px;background:white;color:#333}input{min-width:250px;flex:1}label{display:flex;align-items:center;gap:8px;font-size:13px}.table-wrap{overflow-x:auto;border:1px solid #dadada}table{border-collapse:collapse;width:100%;font-size:12px}th{text-align:left;background:#f5f5f5;padding:14px;white-space:nowrap}td{padding:12px 14px;border-top:1px solid #dadada;vertical-align:top;max-width:480px;overflow-wrap:anywhere}td:first-child{min-width:190px}td code{background:transparent;padding:0}details pre{white-space:pre-wrap;max-height:380px;overflow:auto;font-size:11px;line-height:1.6;background:#fafafa;padding:14px}summary{cursor:pointer;color:#8a2323}.notice{background:#fafafa;border-left:3px solid #cc4141;padding:16px 20px;font-size:13px}pre.query{white-space:pre-wrap;background:#f5f5f5;padding:20px;line-height:1.6;font-size:12px}footer{border-top:1px solid #dadada;margin-top:35px;padding:20px 0;font-size:12px;color:#6e6e6e}button{font:inherit;background:#cc4141;color:white;border:0;padding:10px 16px;border-radius:5px;cursor:pointer}@media print{.controls,button{display:none}main{padding:20px}.table-wrap{overflow:visible}details[open] pre{max-height:none}header{padding:15px}}
</style>
<header><img src="data:image/png;base64,${logo}" alt="SSW"><span>YAKSHAVER ANYWHERE / RECORDING EVIDENCE</span></header>
<main><div class="eyebrow">GITHUB ISSUE #${escaped(issueNumber)}</div><h1>${escaped(issue.title)}</h1><p><a href="${escaped(issue.url)}">Open GitHub issue</a> · <a href="${escaped(kqlUrl)}">Open Azure logs</a><br>Recording ID <code>${escaped(recordingId)}</code><br>Generated ${escaped(aest(generatedAt))}</p>
<div class="summary"><div class="tile"><strong>${rows.length}</strong><span>Telemetry records</span></div><div class="tile"><strong>${interactions.length}</strong><span>Phone book interactions</span></div><div class="tile"><strong>${failures.length}</strong><span>Failed saves</span></div><div class="tile"><strong>${errors.length}</strong><span>Error records</span></div></div>
<p class="notice">These browser-reported telemetry rows are selected by an exact match on the recording ID in Azure properties. Query window: the past ${days} days. Correlation begins when Extra context is enabled during a recording. Earlier uncorrelated logs are excluded. The report includes records available at generation time; telemetry can arrive later. Error records count traces and exceptions, so one failure can produce multiple records.</p>
${failures.length ? `<h2>Save failures</h2>${failures.map(row => `<div class="calc"><small>${escaped(aest(row.TimeGenerated))} · ${escaped(row.Properties?.contactId)}</small><strong>${escaped(row.Properties?.attemptedName)}</strong><p><code>${escaped(row.Properties?.errorCode)}</code><br>${escaped(row.Properties?.message)}</p></div>`).join('')}` : ''}
<h2>Contact changes during the recording</h2>${saves.length ? saves.map(row => `<div class="calc"><small>${escaped(aest(row.TimeGenerated))} · ${escaped(row.Properties?.contactId)}</small><strong>${escaped(row.Properties?.selectedContactName)}</strong><p>Changed: ${escaped(row.Properties?.changedFields || "No fields changed")}<br>Phone: ${escaped(row.Properties?.previousPhone)} → ${escaped(row.Properties?.savedPhone)}</p></div>`).join('') : '<p>No contact-save events were returned for this recording.</p>'}
<h2>Recording timeline</h2><div class="controls"><input id="search" type="search" aria-label="Search telemetry" placeholder="Search contacts, fields, messages…"><label>Type <select id="type"><option value="">All telemetry</option>${[...new Set(rows.map(row => row.TelemetryTable))].map(type => `<option>${escaped(type)}</option>`).join('')}</select></label><button onclick="window.print()">Print report</button></div><p id="count">${rows.length} records</p>
<div class="table-wrap"><table><thead><tr><th>Time (AEST)</th><th>Type</th><th>Event / message</th><th>Evidence</th></tr></thead><tbody>${rows.map(row => `<tr data-type="${escaped(row.TelemetryTable)}"><td>${escaped(aest(row.TimeGenerated))}</td><td>${escaped(row.TelemetryTable.replace(/^App/, ''))}</td><td><code>${escaped(row.Name || row.Message || row.OuterMessage)}</code></td><td><details><summary>View properties</summary><pre>${escaped(JSON.stringify(row, (key, value) => key === 'TimeGenerated' ? aest(value) : value, 2))}</pre></details></td></tr>`).join('')}</tbody></table></div>
<h2>Query used</h2><pre class="query">${escaped(query)}</pre><footer>Source: ${escaped(config.resourceGroup)} / law-yakshaver-anywhere-dev. All displayed times are Australia/Brisbane (AEST). The adjacent JSON export preserves UTC timestamps.</footer></main>
<script>const search=document.querySelector('#search'),type=document.querySelector('#type'),rows=[...document.querySelectorAll('tbody tr')];function filter(){let count=0;for(const row of rows){row.hidden=!(row.textContent.toLowerCase().includes(search.value.toLowerCase())&&(!type.value||row.dataset.type===type.value));if(!row.hidden)count++}document.querySelector('#count').textContent=count+' records'}search.addEventListener('input',filter);type.addEventListener('change',filter);</script>`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html);
writeFileSync(output.replace(/\.html$/i, '') + '.json', JSON.stringify({ generatedAt, issue: { number: issue.number, title: issue.title, url: issue.url }, recordingId, query, rows }, null, 2) + '\n');
console.log(`Exported ${rows.length} matching telemetry records for issue #${issueNumber}.`);
console.log(pathToFileURL(output).href);
