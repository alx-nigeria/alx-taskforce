# The Task Force — Apps Script

The AI change simulator, live scoreboard and feedback form for the ALX Enterprise HR Leaders Roundtable, as one Google Apps Script web app. A Google Sheet is the database and holds the game's rules.

**Handover doc:** [claude.ai/artifact/BCSwPsdBcssBKHDw9ocm3C](https://claude.ai/artifact/BCSwPsdBcssBKHDw9ocm3C) (live links, hosting, how it works, how to adapt it). A copy is in [`docs/handover.html`](docs/handover.html).

## Pages

One deployment serves all three. Add `?page=` to the web app URL:

| Page | Link | Used by |
|---|---|---|
| Game | `…/exec?page=index` | One device per group |
| Scoreboard | `…/exec?page=dashboard` | The room screen |
| Feedback | `…/exec?page=feedback` | Guests, from the QR on the closing slide |

Live web app: `https://script.google.com/macros/s/AKfycbxLqx7MnKkHrQ9-gjfnVtFPw6MckWOEW6Sd6wR4WkQAKfbnIsRxtXWSTZ6IZEkFvfuCdg/exec`

## What's in this folder

| File | Purpose |
|---|---|
| `Code.gs` | Server: page routing, reading the rules, saving results and feedback, the sheet's **Task Force** menu |
| `index.html` | The game |
| `dashboard.html` | The live scoreboard, with the **Start a new event** button |
| `feedback.html` | The feedback form (every question except the comment is required) |
| `.claspignore` | Stops `clasp` uploading the docs folder and this README |
| `docs/handover.html` | The handover doc, to open in a browser |

## Setup

About 10 minutes, once.

1. Create a blank Google Sheet, then open **Extensions → Apps Script**.
2. Replace `Code.gs` with this folder's `Code.gs`. Add three HTML files named exactly `index`, `dashboard` and `feedback` (the editor adds `.html`) and paste in the matching files. Save.
3. Pick `setup` in the function dropdown and click **Run**. Approve the permission prompt (*Advanced → Go to project → Allow*). The sheet now has every tab, filled with the original game's content.
4. **Deploy → New deployment →** gear → **Web app**. Set *Execute as* to **Me** and *Who has access* to **Anyone**, then deploy and copy the URL ending in `/exec`.
5. Paste that URL into the `WEB_APP_URL` row of the **Config** tab. Reload the sheet, then click **Task Force → Show page links**.

Shortcut: **File → Make a copy** of an existing Task Force sheet copies the script with it. Then do steps 4–5.

If the script was created at script.google.com instead of from the sheet, put the sheet's ID (the part of its URL between `/d/` and `/edit`) in `SHEET_ID` at the top of `Code.gs`. Everything works except the sheet menu: run `startNewEvent` and `showLinks` from the editor instead.

## Making changes

- **Sheet edits** (Config, Options) apply the next time a page is opened. No redeploy needed.
- **Code edits** only go live after **Deploy → Manage deployments → Edit → Version: New version → Deploy**. The URL stays the same.
- **New deployment** creates a new URL. If you do that, update `WEB_APP_URL` and regenerate every QR code.

## Sheet tabs

| Tab | Written by | Contents |
|---|---|---|
| **Config** | You | One setting per row (below) |
| **Options** | You | One row per card in the game (below) |
| **Submissions** | The game | Timestamp, Group, Round, Round 1 picks, Round 2 picks, Leak, Board, Adoption (`covered` or `hit`), Coins spent in round 1, Score |
| **Feedback** | Feedback page | Timestamp, Rating (1-10), Recommend (1-10), Liked most, Follow up?, Email, Comment |
| **Archive** | Start a new event | Previous events' submissions |

The scoreboard reads Submissions live. A group's latest round 2 row is its final score; a group with only a round 1 row shows "Playing…".

### Config

| Key | Default | Controls |
|---|---|---|
| `EVENT_NAME` | HR Leaders Roundtable | Heading on the feedback page |
| `GROUPS` | 5 | Group buttons in the game and rows on the scoreboard |
| `TOTAL_COINS` | 100 | Coins per group for the year |
| `ROUND1_CAP` | 50 | Most a group can spend in round 1 |
| `REVEAL_CODE` | 2026 | Code read out to unlock the reveal. Checked on the server, never sent to phones |
| `LEAK_PENALTY` | 20 | Points lost with no protection against the leak |
| `ADOPT_PENALTY` | 20 | Points lost with no protection against adoption stalling |
| `BOARD_CUT_PERCENT` | 50 | Share of the remaining budget cut when there's no pilot |
| `REFRESH_SECONDS` | 15 | Scoreboard refresh interval |
| `WEB_APP_URL` | *(empty)* | Your `/exec` URL, used by **Show page links** |
| `FEEDBACK_LIKED` | The roundtable \| The six principles \| … | "What did you like most?" choices, separated by `\|` |

### Options

Hover a header cell in the sheet for a reminder of what it means.

| Column | Meaning |
|---|---|
| `round` | `1` = first six months, `2` = next six months |
| `id` | Short unique code saved in Submissions. Don't rename it mid-event |
| `name` / `short_name` | Card title in the game / label on the scoreboard |
| `subtitle` | Line under the card title |
| `icon` | mandate, guardrails, pilot, licences, training, workshop or cowide |
| `cost` / `points` | Coins it costs / points it adds |
| `protects` | Round 1: the setback it prevents — `leak`, `board` or `adopt` |
| `only_if_hit` | Round 2: offered only if the group was hit by this setback |
| `needs` | Round 2: setbacks the group must have avoided for full points, e.g. `board, adopt` |
| `points_without` | Round 2: points instead of `points` when `needs` isn't met |
| `note` / `note_without` | Small text under the option on the results screen |

The setbacks' names and story text, the brief and the verdict lines are in `index.html`. The handover doc lists where to change each one.

## Running an event

1. Open the scoreboard on the room screen and tap **Start a new event** twice. This moves the last event's results to Archive.
2. Groups scan the game QR, tap their table number and play round 1.
3. When every group shows "Playing…", read out the reveal code.
4. Groups play round 2. Scores appear within the refresh interval.
5. Closing slide: the feedback QR.

Each device remembers its game if the tab is refreshed. **Reset** (tap twice) clears it for the next group.

## Notes

- **Security is light on purpose.** Anyone with the game link can submit, and scores are calculated on the phone. That's fine for a room of guests.
- **Quotas.** A normal Google account easily covers one event. Each open scoreboard makes one small request per refresh.
- **Time zone.** Timestamps follow the sheet's time zone (**File → Settings**).
