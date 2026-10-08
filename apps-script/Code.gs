/**
 * The Task Force — Google Apps Script backend.
 *
 * One web app, three pages:
 *   <web app url>?page=index      the game (one device per group)
 *   <web app url>?page=dashboard  the live scoreboard for the room screen
 *   <web app url>?page=feedback   the end-of-day feedback form
 *
 * A Google Sheet is the database. Run setup() once (or use the "Task Force" menu)
 * to create the tabs below with default content.
 */

/* ================= WHICH SPREADSHEET =================
 * Standalone script (created at script.google.com): paste the sheet's ID below.
 *   The ID is the long part of the sheet's URL:
 *   https://docs.google.com/spreadsheets/d/  THIS_PART  /edit
 * Script created from the sheet (Extensions → Apps Script): leave it empty.
 */
const SHEET_ID = '';

/* ================= TABS ================= */
const TAB = {
  config: 'Config',
  options: 'Options',
  submissions: 'Submissions',
  feedback: 'Feedback',
  archive: 'Archive',
};

const SUBMISSION_HEADERS = ['Timestamp', 'Group', 'Round', 'Round 1 picks', 'Round 2 picks',
  'Leak', 'Board', 'Adoption', 'Coins spent in round 1', 'Score'];
const FEEDBACK_HEADERS = ['Timestamp', 'Rating (1-10)', 'Recommend (1-10)', 'Liked most',
  'Follow up?', 'Email', 'Comment'];
const OPTION_HEADERS = ['round', 'id', 'name', 'short_name', 'subtitle', 'icon', 'cost', 'points',
  'protects', 'only_if_hit', 'needs', 'points_without', 'note', 'note_without'];
const ICONS = ['mandate', 'guardrails', 'pilot', 'licences', 'training', 'workshop', 'cowide'];
const SHOCKS = ['leak', 'board', 'adopt'];

/* ================= DEFAULT CONTENT (the original game) ================= */
const DEFAULT_CONFIG = [
  ['EVENT_NAME', 'HR Leaders Roundtable', 'Shown on the feedback page.'],
  ['GROUPS', '5', 'Number of groups (tables).'],
  ['TOTAL_COINS', '100', 'Coins each group gets for the whole year.'],
  ['ROUND1_CAP', '50', 'Most a group can spend in round 1.'],
  ['REVEAL_CODE', '2026', 'Facilitator reads this out once every group has submitted round 1.'],
  ['LEAK_PENALTY', '20', 'Points lost when no option protects against the leak.'],
  ['ADOPT_PENALTY', '20', 'Points lost when no option protects against adoption stalling.'],
  ['BOARD_CUT_PERCENT', '50', 'How much of the remaining budget the board cuts when there is no pilot.'],
  ['REFRESH_SECONDS', '15', 'How often the scoreboard refreshes.'],
  ['WEB_APP_URL', '', 'Paste the Web app URL (ends in /exec) from Deploy → Manage deployments. Used by "Show page links".'],
  ['FEEDBACK_LIKED', 'The roundtable | The six principles | Your AI change-readiness | The Task Force experiential | The networking',
    'Choices for "What did you like most?", separated by |'],
];

const DEFAULT_OPTIONS = [
  [1, 'mandate', 'Secure The Mandate', 'Secure the mandate', 'One owner, clear authority.', 'mandate', 20, 20, '', '', '', '', '', ''],
  [1, 'guardrails', 'Guardrails (Data-Use Policy)', 'Guardrails', 'Rules before rollout.', 'guardrails', 10, 15, 'leak', '', '', '', '', ''],
  [1, 'pilot', 'Run A Quick-Win Pilot', 'Quick-win pilot', 'One visible win, fast.', 'pilot', 15, 20, 'board', '', '', '', '', ''],
  [1, 'licences', 'Roll Out Licences', 'Roll out licences', 'Tools for everyone.', 'licences', 15, 5, '', '', '', '', '', ''],
  [1, 'training', 'Train A Cohort', 'Train a cohort', 'Build real capability.', 'training', 30, 20, 'adopt', '', '', '', '', ''],
  [1, 'workshop', 'AI Strategy Workshop For Managers', 'Managers workshop', 'Managers lead adoption.', 'workshop', 15, 15, 'adopt', '', '', '', '', ''],
  [2, 'fixbreach', 'Fix The Breach', 'Fix the breach', 'Retrofit the rules and clean it up.', 'guardrails', 15, 14, '', 'leak', '', '', 'damage limited', ''],
  [2, 'rescue', 'Rescue Adoption', 'Rescue adoption', 'Get the rollout actually used.', 'workshop', 15, 14, '', 'adopt', '', '', 'people brought back on', ''],
  [2, 'cowide', 'Take It Company-Wide', 'Take it company-wide', 'Roll AI out across every department.', 'cowide', 25, 26, '', '', 'board, adopt', 8, '', 'no proven pilot or people to carry it'],
  [2, 'deepen', 'Build Lasting Capability', 'Build capability', 'Advanced skills and a champions network.', 'training', 15, 14, '', '', '', '', '', ''],
];

const OPTION_NOTES = {
  round: '1 = first six months, 2 = next six months.',
  id: 'Short unique code. Saved in Submissions, so avoid renaming mid-event.',
  name: 'Shown on the option card in the game.',
  short_name: 'Shown on the scoreboard. Falls back to name.',
  icon: 'One of: ' + ICONS.join(', '),
  points: 'Points added to the final score when picked.',
  protects: 'Round 1 only. Which setback this option prevents: leak, board or adopt (comma-separated for more than one).',
  only_if_hit: 'Round 2 only. Offer this option only if the group was hit by this setback (leak, board or adopt). Blank = always offered.',
  needs: 'Round 2 only. Setbacks the group must have avoided in round 1 for full points, e.g. "board, adopt".',
  points_without: 'Round 2 only. Points instead of "points" when "needs" is not met.',
  note: 'Small text under the option on the results screen.',
  note_without: 'Note shown instead when "needs" is not met.',
};

/* ================= WEB APP ================= */
const PAGES = {
  index: 'The Task Force — ALX Enterprise',
  dashboard: 'The Task Force — Live Scoreboard',
  feedback: 'How was today? — ALX Enterprise',
};

function doGet(e) {
  const p = e && e.parameter && e.parameter.page;
  const path = e && e.pathInfo;
  let page = String(p || path || 'index').toLowerCase().replace(/\.html$/, '').replace(/\//g, '');
  if (!PAGES[page]) page = 'index';

  const t = HtmlService.createTemplateFromFile(page);
  t.boot = safeJson_(bootFor_(page));
  return t.evaluate()
    .setTitle(PAGES[page])
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Only what each page needs. The reveal code never goes to the browser. */
function bootFor_(page) {
  const cfg = readConfig_();
  if (page === 'feedback') {
    return {
      eventName: cfg.EVENT_NAME,
      liked: String(cfg.FEEDBACK_LIKED || '').split('|').map(s => s.trim()).filter(String),
    };
  }
  const options = readOptions_();
  if (page === 'dashboard') {
    return {
      groups: num_(cfg.GROUPS, 5),
      refreshMs: num_(cfg.REFRESH_SECONDS, 15) * 1000,
      names: options.reduce((m, o) => (m[o.id] = o.short, m), {}),
    };
  }
  return {
    groups: num_(cfg.GROUPS, 5),
    total: num_(cfg.TOTAL_COINS, 100),
    r1Cap: num_(cfg.ROUND1_CAP, 50),
    leakPenalty: num_(cfg.LEAK_PENALTY, 20),
    adoptPenalty: num_(cfg.ADOPT_PENALTY, 20),
    boardCut: num_(cfg.BOARD_CUT_PERCENT, 50),
    options: options,
  };
}

/* ================= CALLED FROM THE PAGES (google.script.run) ================= */

/** Game: a group submits round 1 or round 2. */
function submitRound(d) {
  const shock = ok => ok ? 'covered' : 'hit';
  const row = [new Date(), Number(d.group), Number(d.round), (d.r1 || []).join(', '), (d.r2 || []).join(', '),
    shock(d.leak), shock(d.board), shock(d.adopt), Number(d.spent) || 0,
    d.round == 2 ? Number(d.score) : ''];
  append_(TAB.submissions, SUBMISSION_HEADERS, row);
  return true;
}

/** Game: checks the facilitator's reveal code. */
function checkCode(code) {
  return String(code || '').trim() === String(readConfig_().REVEAL_CODE || '').trim();
}

/** Feedback page: one row per guest. */
function submitFeedback(d) {
  const row = [new Date(), d.rating == null ? '' : d.rating, d.nps == null ? '' : d.nps,
    (d.liked || []).join(' | '), d.followup || '', d.email || '', d.comment || ''];
  append_(TAB.feedback, FEEDBACK_HEADERS, row);
  return true;
}

/** Scoreboard: every submission for the current event, oldest first. */
function getBoard() {
  const sh = sheet_(TAB.submissions, SUBMISSION_HEADERS);
  const values = sh.getDataRange().getValues();
  const head = values.shift().map(h => String(h).trim());
  const col = name => head.indexOf(name);
  const c = {
    group: col('Group'), round: col('Round'), r1: col('Round 1 picks'), r2: col('Round 2 picks'),
    leak: col('Leak'), board: col('Board'), adopt: col('Adoption'), score: col('Score'),
  };
  const list = v => String(v || '').split(',').map(s => s.trim()).filter(String);
  const covered = v => String(v).trim().toLowerCase() === 'covered';
  // No Date objects here: google.script.run can't return them.
  return values.filter(r => r[c.group] !== '').map(r => ({
    group: String(r[c.group]).trim(),
    round: String(r[c.round]).trim(),
    r1: list(r[c.r1]),
    r2: list(r[c.r2]),
    leak: covered(r[c.leak]),
    board: covered(r[c.board]),
    adopt: covered(r[c.adopt]),
    score: r[c.score] === '' ? null : Number(r[c.score]),
  }));
}

/* ================= SPREADSHEET MENU ================= */
/** Adds the menu. Only runs for a script created from the sheet (Extensions → Apps Script). */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Task Force')
    .addItem('Show page links', 'showLinks')
    .addItem('Start a new event (clear the scoreboard)', 'startNewEvent')
    .addSeparator()
    .addItem('Set up / repair tabs', 'setup')
    .addToUi();
}

/** Creates any missing tab with its headers and default content. Never overwrites existing data. */
function setup() {
  const ss = ss_();

  let cfg = ss.getSheetByName(TAB.config);
  if (!cfg) {
    cfg = ss.insertSheet(TAB.config, 0);
    cfg.getRange('B:B').setNumberFormat('@'); // keep codes like 0420 as typed
    cfg.getRange(1, 1, 1, 3).setValues([['key', 'value', 'notes']]);
    cfg.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
    styleHeader_(cfg, 3);
    cfg.setColumnWidth(1, 170); cfg.setColumnWidth(2, 260); cfg.setColumnWidth(3, 460);
  } else {
    addMissingConfigKeys_(cfg);
  }

  let opt = ss.getSheetByName(TAB.options);
  if (!opt) {
    opt = ss.insertSheet(TAB.options, 1);
    opt.getRange(1, 1, 1, OPTION_HEADERS.length).setValues([OPTION_HEADERS]);
    opt.getRange(2, 1, DEFAULT_OPTIONS.length, OPTION_HEADERS.length).setValues(DEFAULT_OPTIONS);
    styleHeader_(opt, OPTION_HEADERS.length);
    OPTION_HEADERS.forEach((h, i) => { if (OPTION_NOTES[h]) opt.getRange(1, i + 1).setNote(OPTION_NOTES[h]); });
    const iconCol = OPTION_HEADERS.indexOf('icon') + 1;
    opt.getRange(2, iconCol, 200, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ICONS, true).setAllowInvalid(false).build());
    opt.autoResizeColumns(1, OPTION_HEADERS.length);
  }

  sheet_(TAB.submissions, SUBMISSION_HEADERS);
  sheet_(TAB.feedback, FEEDBACK_HEADERS);
  sheet_(TAB.archive, SUBMISSION_HEADERS);

  // A new spreadsheet starts with an empty "Sheet1"; drop it once our tabs exist.
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  toast_('Tabs are ready.');
}

/** Sheet menu: moves this event's submissions to Archive so the scoreboard starts empty. */
function startNewEvent() {
  const ui = ui_();
  if (ui) { // from the sheet's menu: confirm first. From the editor's Run button: just do it.
    const ok = ui.alert('Start a new event?',
      'This moves every row in Submissions to the Archive tab, so the scoreboard starts empty. Feedback is not touched.',
      ui.ButtonSet.OK_CANCEL);
    if (ok !== ui.Button.OK) return;
  }
  const n = archiveSubmissions_();
  toast_(n > 0 ? `Archived ${n} rows. The scoreboard is empty.` : 'Submissions was already empty.');
  console.log(n > 0 ? `Archived ${n} rows.` : 'Submissions was already empty.');
}

/** Scoreboard button: same as the menu item. Returns how many rows were archived. */
function newEventFromDashboard() {
  return archiveSubmissions_();
}

function archiveSubmissions_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sub = sheet_(TAB.submissions, SUBMISSION_HEADERS);
    const arc = sheet_(TAB.archive, SUBMISSION_HEADERS);
    const n = sub.getLastRow() - 1;
    if (n > 0) {
      const rows = sub.getRange(2, 1, n, SUBMISSION_HEADERS.length).getValues();
      arc.getRange(arc.getLastRow() + 1, 1, n, SUBMISSION_HEADERS.length).setValues(rows);
      sub.deleteRows(2, n);
    }
    return n;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Shows the three shareable links, built from WEB_APP_URL in the Config tab.
 * (ScriptApp.getService().getUrl() can't be trusted: it often returns an older deployment's URL.)
 */
function showLinks() {
  const cfg = ss_().getSheetByName(TAB.config);
  if (cfg) addMissingConfigKeys_(cfg); // adds the WEB_APP_URL row if this sheet predates it
  const raw = String(readConfig_().WEB_APP_URL || '').trim();
  const m = raw.match(/^https:\/\/script\.google\.com\/\S*?\/exec/);
  const url = m && m[0];
  const ui = ui_();
  const help = 'In Apps Script: Deploy → Manage deployments → copy the Web app URL (ends in /exec). ' +
    'Paste it into the WEB_APP_URL row of the Config tab, then try again.';

  if (!url) {
    if (ui) ui.alert('Web app URL needed', help, ui.ButtonSet.OK); else console.log(help);
    return;
  }
  const pages = [['Game (one device per group)', 'index'], ['Scoreboard (room screen)', 'dashboard'],
    ['Feedback (QR on the closing slide)', 'feedback']];
  if (!ui) { // run from the editor: links go to the execution log
    console.log(pages.map(([, p]) => `${p}: ${url}?page=${p}`).join('\n'));
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;font-size:13px;word-break:break-all">' +
    pages.map(([label, p]) =>
      `<p><b>${label}</b><br><a href="${url}?page=${p}" target="_blank">${url}?page=${p}</a></p>`).join('') +
    '</div>').setWidth(520).setHeight(260);
  ui.showModalDialog(html, 'Task Force links');
}

/* ================= HELPERS ================= */
function ss_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet. Paste your sheet\'s ID into SHEET_ID at the top of Code.gs.');
  return ss;
}

/** The sheet's UI when running from its menu; null when running from the editor or the web app. */
function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

/** Appends any Config keys added in newer versions of this script. Never touches existing rows. */
function addMissingConfigKeys_(cfg) {
  const have = cfg.getRange('A:A').getValues().map(r => String(r[0]).trim());
  DEFAULT_CONFIG.filter(r => have.indexOf(r[0]) < 0).forEach(r => cfg.appendRow(r));
}

function readConfig_() {
  const sh = ss_().getSheetByName(TAB.config);
  const out = {};
  DEFAULT_CONFIG.forEach(r => out[r[0]] = r[1]); // defaults if a key is missing
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const k = String(r[0]).trim();
    if (k) out[k] = String(r[1]).trim();
  });
  return out;
}

function readOptions_() {
  const sh = ss_().getSheetByName(TAB.options);
  const rows = sh ? sh.getDataRange().getValues() : [OPTION_HEADERS].concat(DEFAULT_OPTIONS);
  const head = rows.shift().map(h => String(h).trim().toLowerCase());
  const get = (r, k) => { const i = head.indexOf(k); return i < 0 ? '' : r[i]; };
  const shocks = v => String(v || '').toLowerCase().split(/[,|]/).map(s => s.trim())
    .map(s => s.indexOf('adopt') === 0 ? 'adopt' : s).filter(s => SHOCKS.indexOf(s) >= 0);

  return rows.filter(r => String(get(r, 'id')).trim()).map(r => {
    const name = String(get(r, 'name')).trim();
    const points = num_(get(r, 'points'), 0);
    const without = get(r, 'points_without');
    return {
      round: num_(get(r, 'round'), 1),
      id: String(get(r, 'id')).trim(),
      name: name,
      short: String(get(r, 'short_name')).trim() || name,
      sub: String(get(r, 'subtitle')).trim(),
      icon: String(get(r, 'icon')).trim(),
      cost: num_(get(r, 'cost'), 0),
      points: points,
      protects: shocks(get(r, 'protects')),
      onlyIfHit: shocks(get(r, 'only_if_hit'))[0] || '',
      needs: shocks(get(r, 'needs')),
      pointsWithout: without === '' ? points : num_(without, points),
      note: String(get(r, 'note')).trim(),
      noteWithout: String(get(r, 'note_without')).trim(),
    };
  });
}

function append_(name, headers, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet_(name, headers).appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

/** Returns the tab, creating it with a header row if it doesn't exist. */
function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sh, headers.length);
  }
  return sh;
}

function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#03134F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
}

function num_(v, fallback) {
  const n = Number(v);
  return v === '' || v == null || isNaN(n) ? fallback : n;
}

/** JSON that is safe to drop inside a <script> tag. */
function safeJson_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function toast_(msg) {
  try { ss_().toast(msg, 'Task Force'); } catch (e) {}
}
