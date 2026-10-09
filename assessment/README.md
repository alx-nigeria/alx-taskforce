# AI Maturity Assessment

A one-question-at-a-time front end for Tally form `0Q2da6`. The page scores the answers itself, shows the report, and hands everything to Tally as hidden fields. Tally stores the response and a webhook triggers the report email.

**Previews (private artifacts, open while signed in as the owner):**
- Assessment, demo mode with no Tally: https://claude.ai/artifact/6n8WarQmKfkcW897iBD2ns
- Report email as respondents see it: https://claude.ai/artifact/WzsP4MGJh2DZe38bg65y5e

| File | Purpose |
|---|---|
| `index.html` | The assessment. Set `TALLY_FORM_ID` in the `CONFIG` block (it is `0Q2da6` now). Leave it `null` for a preview with no Tally. |
| `report-email.gs` | Apps Script that emails the formatted report when Tally posts a submission. |

## Tally form

Hidden fields, spelled exactly like this (case-sensitive): `q1`–`q12`, `score`, `tier`, `report`, `name`, `email`. No visible fields, no results page. In Design, set the Submit button colour to `#EAB308`, its text to `#03134F`, and its label to "Email me my report".

## Email setup (Apps Script)

1. Go to script.google.com, create a project, and paste in `report-email.gs`.
2. Change `CONFIG.SECRET` to a long random string.
3. Run `testEmail` once and approve the permissions. A sample report arrives in your own inbox.
4. **Deploy → New deployment → Web app.** Execute as **Me**, who has access **Anyone**. Copy the URL ending in `/exec`.
5. In Tally: **Integrations → Webhooks**, endpoint `<that URL>?key=<your SECRET>`.
6. Turn off Tally's own respondent email so people don't get two.
7. Submit once. In Tally's webhook log the delivery should show as successful.

After editing the script, use **Deploy → Manage deployments → Edit → New version** so the web app picks up the change.

Gmail limits: about 100 recipients a day on a personal account, 1,500 on Google Workspace.

## Status

- `index.html` is wired to Tally form `0Q2da6`. It follows the visitor's light or dark setting, and scales Tally's Submit button up 40%.
- Still to verify with a real submission: that Tally's submit event reaches the page (so the report appears after the tap), and that the webhook delivers to the Apps Script and the email arrives formatted.
- Not committed: `.claude/launch.json`, which was changed locally to run the preview with Node.
