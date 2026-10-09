/**
 * AI Maturity Assessment: emails each respondent their report.
 *
 * Flow: Tally form 0Q2da6 -> webhook -> this web app (doPost) -> GmailApp.
 *
 * The Tally form's hidden fields (all sent by assessment/index.html):
 *   q1..q12  the answers (A, B or C)
 *   score    total out of 60
 *   tier     Nascent | Developing | Mature | Transformative
 *   report   the report as text, labelled paragraphs ("Insight: ...", "Focus: ...")
 *   name     respondent's name
 *   email    respondent's email
 *
 * Setup is in assessment/README.md. In short: paste this into a new Apps Script project, set SECRET,
 * deploy as a web app (Execute as: Me, Who has access: Anyone), then add
 *   <web app URL>?key=<SECRET>
 * as a webhook endpoint on the Tally form (Integrations -> Webhooks).
 */

const CONFIG = {
  SECRET: 'change-this-to-a-long-random-string',   // must match ?key= on the Tally webhook URL
  FROM_NAME: 'ALX Enterprise',
  REPLY_TO: 'gm@alxafrica.com',
  BCC: '',                                          // optional: a copy of every report to you
  SUBJECT: 'Your AI Maturity Report: {tier} ({score}/60)',
  CONTACT: 'gm@alxafrica.com',
  AREA_MAX: 15                                      // each of the four areas is scored out of 15
};

/* ---------- Entry point: Tally webhook ---------- */

function doPost(e) {
  // Apps Script cannot read request headers, so the shared secret travels in the URL instead.
  if (!e || !e.parameter || e.parameter.key !== CONFIG.SECRET) return reply_('forbidden');

  let payload;
  try { payload = JSON.parse(e.postData.contents); } catch (err) { return reply_('bad json'); }
  if (payload.eventType !== 'FORM_RESPONSE' || !payload.data) return reply_('ignored');

  const submissionId = String(payload.data.submissionId || payload.data.responseId || payload.eventId || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Tally retries a webhook it thinks failed, and Apps Script answers POSTs with a redirect.
    // Remember each submission for six hours so nobody gets the report twice.
    const cache = CacheService.getScriptCache();
    if (submissionId && cache.get('sent:' + submissionId)) return reply_('duplicate');

    const d = readFields_(payload.data.fields || []);
    if (!d.email) { console.warn('No email in submission ' + submissionId); return reply_('no email'); }

    sendReport_(d);
    if (submissionId) cache.put('sent:' + submissionId, '1', 21600);
    return reply_('sent');
  } catch (err) {
    console.error(err && err.stack || err);
    return reply_('error');
  } finally {
    lock.releaseLock();
  }
}

function reply_(msg) {
  return ContentService.createTextOutput(msg);
}

/* ---------- Reading the submission ---------- */

// Tally lists every field as {key, label, type, value}. A hidden field's label is its name.
function readFields_(fields) {
  const byLabel = {};
  fields.forEach(function (f) { byLabel[String(f.label || '').trim().toLowerCase()] = f.value; });
  const text = function (k) { const v = byLabel[k]; return v == null ? '' : String(Array.isArray(v) ? v.join(', ') : v).trim(); };

  const answers = [];
  for (let i = 1; i <= 12; i++) answers.push(text('q' + i));
  return {
    name: text('name') || 'there',
    email: text('email'),
    score: Number(text('score')) || 0,
    tier: text('tier'),
    report: text('report'),
    answers: answers
  };
}

// The page sends the report as labelled paragraphs. Split on the labels so the copy lives in one place
// (assessment/index.html) and this script only handles layout.
function parseReport_(report) {
  const labels = ['Overall AI maturity', 'By area', 'Insight', 'Context', 'Focus', 'Your next step'];
  const re = new RegExp('(' + labels.join('|') + '):\\s*', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(report)) !== null) hits.push({ label: m[1], start: m.index, from: re.lastIndex });
  const parts = {};
  hits.forEach(function (h, i) {
    parts[h.label] = report.slice(h.from, i + 1 < hits.length ? hits[i + 1].start : report.length).trim();
  });

  const phaseMatch = (parts['Overall AI maturity'] || '').match(/\((.+)\)\.?\s*$/);
  const areas = (parts['By area'] || '').replace(/\.\s*$/, '').split(';').map(function (s) {
    const a = s.trim().match(/^(.*\S)\s+(\d+)\s*\/\s*\d+$/);
    return a ? { name: a[1], points: Number(a[2]) } : null;
  }).filter(Boolean);

  const next = parts['Your next step'] || '';
  const cut = next.indexOf('. ');
  return {
    phase: phaseMatch ? phaseMatch[1] : '',
    areas: areas,
    insight: parts['Insight'] || '',
    context: parts['Context'] || '',
    focus: parts['Focus'] || '',
    nextTitle: cut > 0 ? next.slice(0, cut).replace(/\.$/, '') : next,
    nextText: cut > 0 ? next.slice(cut + 2) : ''
  };
}

/* ---------- Sending ---------- */

function sendReport_(d) {
  const mail = buildEmail_(d);
  const options = { htmlBody: mail.html, name: CONFIG.FROM_NAME, replyTo: CONFIG.REPLY_TO };
  if (CONFIG.BCC) options.bcc = CONFIG.BCC;
  GmailApp.sendEmail(d.email, mail.subject, mail.text, options);
}

function buildEmail_(d) {
  const r = parseReport_(d.report);
  const subject = CONFIG.SUBJECT.replace('{tier}', d.tier || 'Your result').replace('{score}', String(d.score));
  return { subject: subject, text: buildText_(d, r), html: buildHtml_(d, r) };
}

/* ---------- Plain-text version (for clients that block HTML) ---------- */

function buildText_(d, r) {
  if (!r.areas.length && !r.insight) {
    return 'Hi ' + d.name + ',\n\nThanks for completing the AI Maturity Assessment.\n\n' + d.report +
           '\n\nQuestions? Reply to this email or write to ' + CONFIG.CONTACT + '.\n\nALX Enterprise';
  }
  const lines = [
    'Hi ' + d.name + ',', '',
    'Thanks for completing the AI Maturity Assessment. Here is your report.', '',
    'YOUR SCORE: ' + d.score + ' / 60 (' + d.tier + ')'
  ];
  if (r.phase) lines.push(r.phase);
  lines.push('', 'HOW YOU SCORED BY AREA');
  r.areas.forEach(function (a) { lines.push('- ' + a.name + ': ' + a.points + ' / ' + CONFIG.AREA_MAX); });
  [['INSIGHT', r.insight], ['CONTEXT', r.context], ['FOCUS', r.focus]].forEach(function (s) {
    if (s[1]) lines.push('', s[0], s[1]);
  });
  if (r.nextTitle) lines.push('', 'YOUR NEXT STEP', r.nextTitle + '.' + (r.nextText ? ' ' + r.nextText : ''));
  lines.push('', 'Questions? Reply to this email or write to ' + CONFIG.CONTACT + '.', '', 'ALX Enterprise');
  return lines.join('\n');
}

/* ---------- HTML version ----------
   Email clients ignore most modern CSS, so this is a table layout with inline styles only. */

const C = { navy: '#03134F', blue: '#0452F0', icy: '#C5E5FF', pale: '#EBF6FF', sun: '#EAB308',
            bg: '#EEF3FC', ink: '#20304F', grey: '#5B6B86', line: '#DCE6F7' };
const FONT = "Poppins,'Segoe UI',Helvetica,Arial,sans-serif";

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function section_(title, body) {
  if (!body) return '';
  return '<tr><td style="padding:0 32px 22px;">' +
    '<div style="font:700 12px/1.2 ' + FONT + ';letter-spacing:1.3px;text-transform:uppercase;color:' + C.blue + ';padding-bottom:6px;">' + esc_(title) + '</div>' +
    '<div style="font:400 15px/1.6 ' + FONT + ';color:' + C.ink + ';">' + esc_(body) + '</div></td></tr>';
}

function buildHtml_(d, r) {
  const areaItems = r.areas.map(function (a) {
    const pct = Math.max(4, Math.round(a.points / CONFIG.AREA_MAX * 100));
    return '<li style="margin:0 0 14px;padding:0;">' +
      '<div style="font:600 15px/1.4 ' + FONT + ';color:' + C.ink + ';">' + esc_(a.name) +
      ' <span style="color:' + C.blue + ';font-weight:700;">&ndash; ' + a.points + '/' + CONFIG.AREA_MAX + '</span></div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>' +
      '<td width="' + pct + '%" height="8" style="background:' + C.blue + ';border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>' +
      '<td height="8" style="background:' + C.line + ';border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>' +
      '</tr></table></li>';
  }).join('');

  const areas = areaItems
    ? '<tr><td style="padding:0 32px 22px;">' +
      '<div style="font:700 12px/1.2 ' + FONT + ';letter-spacing:1.3px;text-transform:uppercase;color:' + C.blue + ';padding-bottom:12px;">How you scored by area</div>' +
      '<ul style="margin:0;padding:0 0 0 20px;list-style:disc;color:' + C.blue + ';">' + areaItems + '</ul></td></tr>'
    : '';

  const next = r.nextTitle
    ? '<tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background:' + C.navy + ';border-radius:14px;padding:20px 22px;">' +
      '<div style="font:700 12px/1.2 ' + FONT + ';letter-spacing:1.3px;text-transform:uppercase;color:' + C.sun + ';padding-bottom:8px;">Your next step</div>' +
      '<div style="font:700 17px/1.4 ' + FONT + ';color:#FFFFFF;">' + esc_(r.nextTitle) + '</div>' +
      (r.nextText ? '<div style="font:400 14px/1.6 ' + FONT + ';color:' + C.icy + ';padding-top:6px;">' + esc_(r.nextText) + '</div>' : '') +
      '</td></tr></table></td></tr>'
    : '';

  // If the report text could not be split into sections, show it whole rather than send an empty email.
  const fallback = (!areaItems && !r.insight)
    ? '<tr><td style="padding:0 32px 28px;font:400 15px/1.6 ' + FONT + ';color:' + C.ink + ';">' + esc_(d.report).replace(/\n/g, '<br>') + '</td></tr>'
    : '';

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:' + C.bg + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.bg + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;">' +

    // header
    '<tr><td style="background:' + C.navy + ';padding:22px 32px;font:800 20px/1 ' + FONT + ';color:#FFFFFF;">alx <span style="font-weight:400;color:' + C.icy + ';">Enterprise</span></td></tr>' +

    // greeting
    '<tr><td style="padding:28px 32px 8px;font:400 15px/1.6 ' + FONT + ';color:' + C.ink + ';">' +
    '<div style="font:700 22px/1.3 ' + FONT + ';color:' + C.navy + ';padding-bottom:8px;">Hi ' + esc_(d.name) + ',</div>' +
    'Thanks for completing the AI Maturity Assessment. Here is your report.</td></tr>' +

    // score
    '<tr><td style="padding:16px 32px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td align="center" style="background:' + C.pale + ';border-radius:16px;padding:24px 16px;">' +
    '<div style="font:700 12px/1.2 ' + FONT + ';letter-spacing:1.3px;text-transform:uppercase;color:' + C.grey + ';">Your AI maturity score</div>' +
    '<div style="font:800 56px/1.1 ' + FONT + ';color:' + C.navy + ';padding-top:8px;"><strong>' + d.score + '</strong>' +
    '<span style="font:600 20px/1 ' + FONT + ';color:' + C.grey + ';"> / 60</span></div>' +
    '<div style="padding-top:12px;"><span style="display:inline-block;background:' + C.navy + ';color:#FFFFFF;font:700 14px/1 ' + FONT + ';padding:8px 16px;border-radius:999px;">' + esc_(d.tier) + '</span></div>' +
    (r.phase ? '<div style="font:400 13px/1.5 ' + FONT + ';color:' + C.grey + ';padding-top:10px;">' + esc_(r.phase) + '</div>' : '') +
    '</td></tr></table></td></tr>' +

    areas +
    section_('Insight', r.insight) +
    section_('Context', r.context) +
    section_('Focus', r.focus) +
    fallback +
    next +

    // footer
    '<tr><td style="border-top:1px solid ' + C.line + ';padding:20px 32px 26px;font:400 13px/1.6 ' + FONT + ';color:' + C.grey + ';">' +
    'Questions or want to talk it through? Reply to this email or write to ' + esc_(CONFIG.CONTACT) + '.<br>' +
    'You are receiving this because you completed the ALX Enterprise AI Maturity Assessment.</td></tr>' +

    '</table></td></tr></table></body></html>';
}

/* ---------- Test it without Tally ----------
   Pick `testEmail` in the editor and click Run. It sends a sample report to your own address. */

function testEmail() {
  const to = Session.getActiveUser().getEmail();
  const report = [
    'Overall AI maturity: 29/60, Developing (The "Fragmented Productivity" phase).',
    'By area: People & Skills 8/15; Operational Risks & Data Safety 6/15; Leadership & ROI 8/15; Local Fit & Resilience 7/15.',
    'Insight: Your team is experimenting with AI, but you are wasting money on mismatched tools and trial-and-error prompting that produces low-quality work.',
    "Focus: Standardise what's working, connect isolated pilots that already exist within the team, and start formalising data sharing and basic oversight before further scaling.",
    'Your next step: AI Optimization Workshops. Hands-on masterclasses tailored specifically to your separate units (e.g., AI for HR Specialists, AI for Finance and Bookkeeping, AI for Modern Sales & Marketing Teams).'
  ].join('\n\n');
  sendReport_({ name: 'Test Person', email: to, score: 29, tier: 'Developing', report: report,
                answers: 'B,A,C,B,B,B,A,C,B,A,A,C'.split(',') });
  Logger.log('Sample report sent to ' + to);
}

// Same, but replays a real Tally webhook body through doPost. Paste a payload into SAMPLE to try it.
function testWebhook() {
  const SAMPLE = {
    eventId: 'test', eventType: 'FORM_RESPONSE', createdAt: new Date().toISOString(),
    data: { submissionId: 'test-' + Date.now(), formId: '0Q2da6', fields: [
      { key: 'q1', label: 'name', type: 'HIDDEN_FIELDS', value: 'Test Person' },
      { key: 'q2', label: 'email', type: 'HIDDEN_FIELDS', value: Session.getActiveUser().getEmail() },
      { key: 'q3', label: 'score', type: 'HIDDEN_FIELDS', value: '41' },
      { key: 'q4', label: 'tier', type: 'HIDDEN_FIELDS', value: 'Mature' },
      { key: 'q5', label: 'report', type: 'HIDDEN_FIELDS', value: 'Overall AI maturity: 41/60, Mature (The "Operational Bottleneck" phase).\n\nBy area: People & Skills 10/15; Operational Risks & Data Safety 12/15; Leadership & ROI 11/15; Local Fit & Resilience 8/15.\n\nInsight: Your digital foundation is solid, but you are vulnerable to talent flight (Japa).\n\nFocus: Set-up formal AI governance, enterprise platforms, cross-department AI teams.\n\nYour next step: AI Automation & Leadership Accelerator. Trains department heads in change management, no-code automation and tech resilience.' }
    ] }
  };
  const out = doPost({ parameter: { key: CONFIG.SECRET }, postData: { contents: JSON.stringify(SAMPLE) } });
  Logger.log(out.getContent());
}
