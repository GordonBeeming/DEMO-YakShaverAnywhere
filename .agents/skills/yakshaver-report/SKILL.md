---
name: yakshaver-report
description: Generate an SSW HTML evidence report for a specific GitHub issue in DEMO-YakShaverAnywhere by querying real Azure telemetry for its YakShaver recording ID.
---

# YakShaver recording report

Use the repository's `npm run report -- --issue <number-or-URL>` command. It reads the chosen issue and its comments, identifies its recording ID, queries the demo's Log Analytics workspace, and exports a self-contained HTML report plus raw JSON.

Read `infra/demo-config.json` for the required Azure subscription and tenant. Apply the Azure skill before Azure commands; this repository uses Gordon's MVP / personal Azure subscription. Use existing authenticated `gh` and Azure CLI sessions.

If extraction finds no unambiguous ID, read the issue's recording context and pass `--recording-id <exact-id>`. The script requires that ID to appear in the chosen issue. If no recording context is present, report that limitation and ask for the enhanced issue. Empty Azure results require checking ingestion and configuration, not generating sample evidence.

The command prints the output URL. Inspect the HTML in Browser.app at 1920×1080: check the SSW logo, AEST times, saved contacts and changed fields, timeline filtering, and expanded properties. Report the number of returned records and provide the HTML link. The adjacent JSON keeps UTC timestamps for machine use.

This workflow reads one issue and Azure logs. Posting a report or changing an issue requires a separate user request. See `README.md` for configuration, query windows, and report output options.
