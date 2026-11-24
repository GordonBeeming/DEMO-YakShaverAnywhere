# Phonebook

A lightweight contact directory with search, inline editing, soft deletion, and embedded issue reporting through YakShaver Anywhere. Application Insights captures application events and exceptions, with optional correlation to a YakShaver recording.

Built with TypeScript and Vite. Contacts are held in memory and reset when the page reloads.

## Getting started

Requires Node.js 22.12 or later and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The contact directory works without external services. Configure the environment variables below to enable telemetry and issue reporting. Restart the development server after changing `.env.local`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | Application Insights destination for browser telemetry. |
| `VITE_YAKSHAVER_PUBLIC_KEY` | Public key from a YakShaver website snippet. |
| `VITE_YAKSHAVER_SCRIPT_URL` | Embed loader URL; defaults to `https://portal.yakshaver.ai/embed.js`. |

Create a website widget in the YakShaver project's settings, select its GitHub work item destination, and allow the application's origin. For local development, allow `http://127.0.0.1:5173` and `http://localhost:5173`.

Only browser-safe configuration belongs in `VITE_` variables. Vite includes those values in the client bundle. Keep GitHub tokens and Azure query credentials in the authenticated CLI sessions used by the reporting tools.

Local configuration, build output, and generated reports are excluded from Git.

## Contact management

Search by name, company, role, email, or phone number. Select a contact to edit their details, then use **Save contact** or **Discard changes**.

**Delete contact** performs a soft deletion by adding `zz` to the stored full name. The record remains in the directory. **Reset demo** restores the supplied fictional contacts.

## Settings

Open **Settings** in the header to access the application controls.

| Setting | Behavior |
| --- | --- |
| Extra context | Attaches contact state to an active YakShaver recording and tags subsequent telemetry with its recording ID. Starts off and can change during capture. |
| Custom record button | Replaces the floating widget launcher with the header's **Record with YakShaver** button. Changing this setting reloads the page; choose it before recording. |
| Trigger save bug | Enables the diagnostic save failure described below. Starts on and changes immediately without reloading. |

The custom button uses the embed's `data-yak-hidden` mode and calls `YakShaverAnywhere.startRecording()` directly from its click handler. Some browsers require an additional click on the widget's Start button to grant screen capture.

Recording controls lock while capture is starting and after a recording begins. Reload after submitting or discarding a recording to change modes. Screen and microphone capture require browser permission.

### Save diagnostics

With **Trigger save bug** enabled, normal Save rejects full names beginning with `zz`, case insensitive. The form displays a generic save error, and Application Insights receives a `ContactSaveError` exception, an error-level trace, and a `ContactSaveFailed` event with code `PHONEBOOK_ZZ_NAME`.

Delete uses a separate path and succeeds while adding the prefix. Saving that contact afterwards reproduces the failure. Disable **Trigger save bug** to save prefixed names normally. Other field validation remains active.

Settings return to their initial state on reload, except the recording mode selected by `?recorder=custom`.

## Telemetry and recording context

Searches, selections, field changes, save attempts, saves, failures, deletions, and resets emit events and traces. Individual field-change events include the field name and value length. Contact state and diagnostic properties accompany relevant actions.

With **Extra context** enabled during recording:

- The current contact and search state are attached when context is enabled.
- Contact selections, save attempts, successful saves, deletions, and resets add timeline entries.
- Subsequent telemetry carries the recording's real `recordingId`.
- Stopping flushes telemetry and clears the recording correlation.

Earlier telemetry remains uncorrelated. Disabling context stops further attachments and correlation; it does not remove entries already attached. Use fictional data while exercising diagnostic logging.

## Recording evidence reports

The report command reads a GitHub issue in this repository, extracts its YakShaver recording ID, and queries the matching Azure telemetry. It generates a self-contained SSW HTML report with save failures, contact changes, a searchable timeline, and expandable properties, plus a raw JSON export.

Requires authenticated `gh` and Azure CLI sessions, access to the GitHub issue, and read access to the Log Analytics workspace.

```sh
cp infra/demo-config.example.json infra/demo-config.json
```

Fill in the subscription, tenant, workspace customer ID, and resource IDs for your environment. Select that subscription before running a report:

```sh
az account set --subscription <subscription-id>
npm run report -- --issue 123 --out reports/issue-123.html
```

If automatic ID extraction is ambiguous, supply the exact ID shown in the issue:

```sh
npm run report -- --issue 123 --recording-id <recording-id> --out reports/issue-123.html
```

The supplied ID must occur in the issue or its comments. The command queries seven days by default; `--days` accepts values from 1 to 30. It rejects empty results, partial Azure responses, and results exceeding 5,000 records. Allow time for telemetry ingestion before generating a report.

Reports display Australia/Brisbane time, labelled AEST. JSON exports retain UTC timestamps. The command reads one issue and does not post to GitHub.

The workspace query is also available in [scripts/recording-logs.kql](scripts/recording-logs.kql). The [Azure resource template](infra/azure.json) provisions an Application Insights component and Log Analytics workspace with 30-day retention and a 0.1 GB daily ingestion cap.

## Development

```sh
npm test          # Run unit tests
npm run build     # Type-check and build
npm run preview   # Serve the production build locally
```

Application code lives in `src/`, Azure templates in `infra/`, and report tooling in `scripts/`. The repository's `yakshaver-report` skill provides the issue-report workflow for compatible coding agents.
