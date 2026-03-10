const https = require('https');
const USERNAME = 'stephanie.koutsoukis@gmail.com';
const PASSWORD = 'vwtg-yhfx-lkhz-ylzv';
const BASE_URL = 'p39-caldav.icloud.com';
const USER_ID = '272728789';
const CALENDARS = [
  { id: 'F8F80826-5862-4004-8C04-EE943E67B918' },
  { id: 'home' },
];
const AUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
const SKIP = [];

function fetchCalendar(calId, startStr, endStr) {
  return new Promise((resolve, reject) => {
    const body = `<?xml version="1.0" encoding="utf-8"?><C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${startStr}" end="${endStr}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`;
    const buf = Buffer.from(body);
    const req = https.request({ hostname: BASE_URL, path: `/${USER_ID}/calendars/${calId}/`, method: 'REPORT', headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/xml; charset=utf-8', Depth: '1', 'Content-Length': buf.length } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject); req.write(buf); req.end();
  });
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function addWeeks(d, n) { return addDays(d, n*7); }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }
function addYears(d, n) { const r = new Date(d); r.setFullYear(r.getFullYear()+n); return r; }
function ds(d) { return d.toISOString().substring(0,10); }

function parseTime(raw) {
  if (!raw || raw.length <= 8) return 'All day';
  let h = parseInt(raw.substring(9,11)); const m = raw.substring(11,13);
  if (isNaN(h)) return 'All day';
  if (raw.endsWith('Z')) h = (h-8+24)%24;
  return `${h%12||12}:${m} ${h>=12?'PM':'AM'}`;
}

function expand(baseDate, timeStr, rrule, today, end) {
  const results = [];
  if (!rrule) {
    const d = ds(baseDate); if (d >= today && d <= end) results.push({ date: d, time: timeStr }); return results;
  }
  const p = {}; rrule.split(';').forEach(x => { const [k,v]=x.split('='); p[k]=v; });
  const freq = p.FREQ || ''; const interval = parseInt(p.INTERVAL||'1'); let count = parseInt(p.COUNT||'9999');
  let until = end;
  if (p.UNTIL) {
    const u = p.UNTIL;
    const untilParsed = `${u.substring(0,4)}-${u.substring(4,6)}-${u.substring(6,8)}`;
    if (untilParsed < today) {
      const d = ds(baseDate);
      if (d >= today && d <= end) results.push({ date: d, time: timeStr });
      return results;
    }
    until = untilParsed > end ? end : untilParsed;
  }

  let cur = new Date(baseDate);
  const todayD = new Date(today+'T12:00:00');

  if (freq==='WEEKLY' && cur < todayD) {
    const skip = Math.max(0, Math.floor((todayD-cur)/604800000/interval)-1);
    cur = addWeeks(cur, skip*interval);
  } else if (freq==='YEARLY' && cur < todayD) {
    const dy = todayD.getFullYear()-cur.getFullYear()-1;
    if (dy > 0) cur = addYears(cur, dy);
  } else if (freq==='MONTHLY' && cur < todayD) {
    const dm = (todayD.getFullYear()-cur.getFullYear())*12+(todayD.getMonth()-cur.getMonth())-2;
    if (dm > 0) cur = addMonths(cur, dm);
  } else if (freq==='DAILY' && cur < todayD) {
    const skip = Math.max(0, Math.floor((todayD-cur)/86400000/interval)-1);
    cur = addDays(cur, skip*interval);
  }

  let iters=0;
  while (iters++<200) {
    const d = ds(cur);
    if (d > until || d > end) break;
    if (d >= today) results.push({ date: d, time: timeStr });
    if (freq==='WEEKLY') cur=addWeeks(cur,interval);
    else if (freq==='DAILY') cur=addDays(cur,interval);
    else if (freq==='MONTHLY') cur=addMonths(cur,interval);
    else if (freq==='YEARLY') cur=addYears(cur,interval);
    else break;
    if (--count <= 0) break;
  }
  return results;
}

function parseIcal(xml, today, end) {
  const events = [];
  const blocks = xml.split('BEGIN:VEVENT');
  for (let i=1; i<blocks.length; i++) {
    const block = blocks[i].replace(/\r?\n[ \t]/g,'');
    const get = k => { const m = block.match(new RegExp(k+'[^:]*:(.+)')); return m ? m[1].trim() : ''; };
    const summary = get('SUMMARY'); const dtstart = get('DTSTART'); const rrule = get('RRULE');
    if (!summary || !dtstart) continue;
    const raw = dtstart.trim();
    const y=parseInt(raw.substring(0,4)), mo=parseInt(raw.substring(4,6))-1, d=parseInt(raw.substring(6,8));
    if (isNaN(y)||isNaN(mo)||isNaN(d)) continue;
    const baseDate = new Date(y, mo, d);
    const timeStr = parseTime(raw);
    expand(baseDate, timeStr, rrule, today, end).forEach(o => events.push({ title: summary, date: o.date, time: o.time }));
  }
  return events;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const key = req.query.key || req.headers['x-lumen-key'];
  if (key !== 'lumen-steph-2026') return res.status(401).json({ error: 'unauthorized' });

  const now = new Date(); const end = new Date(now); end.setDate(end.getDate()+60);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
  const toCD = d => d.toISOString().replace(/[-:.]/g,'').substring(0,15)+'Z';
  const today = now.toISOString().substring(0,10);
  const endStr = end.toISOString().substring(0,10);

  let all = [];
  for (const cal of CALENDARS) {
    try { all = all.concat(parseIcal(await fetchCalendar(cal.id, toCD(yesterday), toCD(end)), today, endStr)); } catch(e) {}
  }

  const seen = new Set();
  const events = all.filter(e => { const k=e.date+'|'+e.title; if(seen.has(k))return false; seen.add(k); return true; })
    .sort((a,b) => a.date.localeCompare(b.date));

  res.status(200).json({ ok: true, events });
};
