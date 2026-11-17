// Random Sober Life — journey maths, data model, sync helpers (shared by Windows + Android)
'use strict';
const DAY = 864e5, HOUR = 36e5, MIN = 6e4;
const MAX_EVENTS = 5;          // only the last 5 drink entries are kept; older ones are folded into the snapshot
const MAX_FIDS = 20, MAX_DEAD = 30;

// ---------- reference lists ----------
// USD first, the rest in alphabetical order by name
const CURRENCIES = [
  ['USD', 'US Dollar', 'en-US'],
  ['AUD', 'Australian Dollar', 'en-AU'],
  ['BRL', 'Brazilian Real', 'pt-BR'],
  ['GBP', 'British Pound', 'en-GB'],
  ['CAD', 'Canadian Dollar', 'en-CA'],
  ['CNY', 'Chinese Yuan', 'zh-CN'],
  ['DKK', 'Danish Krone', 'da-DK'],
  ['EUR', 'Euro', 'de-DE'],
  ['HKD', 'Hong Kong Dollar', 'zh-HK'],
  ['INR', 'Indian Rupee', 'en-IN'],
  ['IDR', 'Indonesian Rupiah', 'id-ID'],
  ['JPY', 'Japanese Yen', 'ja-JP'],
  ['MYR', 'Malaysian Ringgit', 'ms-MY'],
  ['MXN', 'Mexican Peso', 'es-MX'],
  ['TWD', 'New Taiwan Dollar', 'zh-TW'],
  ['NZD', 'New Zealand Dollar', 'en-NZ'],
  ['NOK', 'Norwegian Krone', 'nb-NO'],
  ['PHP', 'Philippine Peso', 'en-PH'],
  ['PLN', 'Polish Zloty', 'pl-PL'],
  ['RUB', 'Russian Ruble', 'ru-RU'],
  ['SAR', 'Saudi Riyal', 'en-SA'],
  ['SGD', 'Singapore Dollar', 'en-SG'],
  ['ZAR', 'South African Rand', 'en-ZA'],
  ['KRW', 'South Korean Won', 'ko-KR'],
  ['SEK', 'Swedish Krona', 'sv-SE'],
  ['CHF', 'Swiss Franc', 'de-CH'],
  ['THB', 'Thai Baht', 'th-TH'],
  ['TRY', 'Turkish Lira', 'tr-TR'],
  ['AED', 'UAE Dirham', 'en-AE'],
  ['VND', 'Vietnamese Dong', 'vi-VN'],
];
const DRINKS = [
  ['beer330', 'A beer (330 ml)', 330, 5, 'A regular can or small bottle of beer at about 5% alcohol.'],
  ['beer500', 'A large beer (500 ml)', 500, 5, 'A tall can, large bottle or half-litre glass of beer at about 5%.'],
  ['pint', 'A pint of beer (568 ml)', 568, 5, 'A UK pint of beer or cider at about 5%.'],
  ['wine', 'A glass of wine (150 ml)', 150, 12, 'A standard restaurant glass of red, white or sparkling wine at about 12%.'],
  ['shot', 'A shot of spirits (40 ml)', 40, 40, 'One shot of vodka, whisky, rum, gin or tequila at about 40%.'],
  ['cocktail', 'A cocktail', 60, 40, 'A mixed drink with about 1.5 shots of spirits (60 ml at 40%).'],
  ['std', 'A standard drink (10 g)', 0, 0, 'One WHO / international standard drink: exactly 10 g of pure alcohol.'],
];
const MILESTONES = [
  [1, '1 day', 'Your body is clearing the last alcohol and starting to rebalance.'],
  [3, '3 days', 'The strongest physical cravings usually begin to ease.'],
  [7, '1 week', 'Sleep is often deeper and you wake up more rested.'],
  [14, '2 weeks', 'The stomach lining recovers; less reflux and better digestion.'],
  [30, '1 month', 'Liver fat can start to drop; skin looks more hydrated.'],
  [60, '2 months', 'Blood pressure often improves and energy is steadier.'],
  [90, '3 months', 'Mood and focus are more stable; new habits are taking root.'],
  [182, '6 months', 'Liver function can show strong improvement.'],
  [273, '9 months', 'Immune system is stronger; fewer colds and infections.'],
  [365, '1 year', 'Risk of many alcohol-related diseases keeps falling.'],
  [547, '18 months', 'Sobriety feels more like who you are than what you do.'],
  [730, '2 years', 'Heart health and blood pressure risk are much lower.'],
  [1095, '3 years', 'Brain volume and memory continue to recover.'],
  [1826, '5 years', 'Risk of mouth, throat and liver cancers is falling sharply.'],
  [3652, '10 years', 'A decade of freedom. You rebuilt your life.'],
];
// medal colours, one per milestone [ribbon A, ribbon B, metal light, metal dark, star]
const MEDAL_COLS = [
  ['#e85d75', '#f7b0bd', '#f3c08a', '#b06b2e', '#fff3e0'], ['#f08a24', '#ffd29b', '#f3c08a', '#a8612a', '#fff3e0'],
  ['#2fb8ff', '#a6e1ff', '#eef2f6', '#8a97a6', '#ffffff'], ['#7b61ff', '#c4b8ff', '#eef2f6', '#8a97a6', '#ffffff'],
  ['#e5383b', '#ffb3b4', '#ffe27a', '#c48a00', '#fffbe6'], ['#20c997', '#a7f3d9', '#ffe27a', '#c48a00', '#fffbe6'],
  ['#ff6b9d', '#ffc2d6', '#ffe27a', '#c48a00', '#ffffff'], ['#00b4d8', '#9be7f5', '#6ff0b5', '#119a5e', '#ffffff'],
  ['#ffb703', '#ffe29a', '#7cc4ff', '#1f6fd1', '#ffffff'], ['#ef476f', '#ffd166', '#ff7a8a', '#c21d3a', '#fff6c2'],
  ['#8338ec', '#ffbe0b', '#d39bff', '#7b2cbf', '#ffffff'], ['#06d6a0', '#118ab2', '#e6f0ff', '#9aa9c2', '#ffd166'],
  ['#3a86ff', '#ff006e', '#c6f6ff', '#58b4d1', '#ffffff'], ['#ff006e', '#fb5607', '#fff1a8', '#ffbe0b', '#ffffff'],
  ['#ff006e', '#3a86ff', '#ffffff', '#c77dff', '#ffd60a'],
];

// ---------- helpers ----------
const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function defaultSettings() {
  return {
    ts: 0, top: 'quotes', cur: 'USD', theme: 'forest', mode: 'avg', daily: 0, week: [0, 0, 0, 0, 0, 0, 0], // week = Sun..Sat (Date.getDay order)
    drink: 'beer330', custom: { name: 'My drink', ml: 250, abv: 5 },
    x: 0, y: 'streak', acc: false, accEp: 0, notify: true, nh: 8, nm: 0,
  };
}
function newSnap(start) {
  return { gen: now(), start, lastT: start, erased: 0, streakStart: start, sCount: 0, sSum: 0, sLong: 0,
    sr: 0, jr: 0, accum: 0, accEp: 0, maxTotal: 0, folded: 0, fids: [] };
}
function newState(start, set) { return { snap: newSnap(start), events: [], dead: [], set: set || defaultSettings() }; }

// ---------- the journey maths ----------
// apply one drink entry to a snapshot (mutates s); returns what it did
function applyEv(s, e) {
  const t = Math.max(e.t, s.start);
  s.maxTotal = Math.max(s.maxTotal, Math.max(0, t - s.start - s.erased));
  let trig = 0;
  if (!e.x) trig = 1;                                   // X = Any
  else if (e.acc) {
    if (e.ep !== s.accEp) { s.accum = 0; s.accEp = e.ep; }   // accumulative restarted (unticked + ticked again)
    s.accum += e.n;
    while (s.accum >= e.x) { s.accum -= e.x; trig++; }
  } else if (e.n >= e.x) trig = 1;
  let erased = 0, all = false;
  for (let i = 0; i < trig; i++) {
    const L = Math.max(0, t - s.streakStart);
    if (i === 0) { s.sCount++; s.sSum += L; s.sLong = Math.max(s.sLong, L); }
    const before = s.erased;
    if (e.y === 'all') { s.start = t; s.erased = 0; s.jr++; all = true; }
    else {
      s.erased += e.y === 'streak' ? L : e.y * DAY;
      s.erased = Math.min(s.erased, Math.max(0, t - s.start));
      s.sr++;
      erased += s.erased - before;
    }
    s.streakStart = t;
  }
  s.lastT = Math.max(s.lastT || 0, t);
  return { trig, erased, all };
}
function sortEvents(ev) { ev.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1)); }
// drop deleted entries, sort, fold everything beyond the newest 5 into the snapshot
function normalize(st) {
  const dead = new Set(st.dead), fids = new Set(st.snap.fids);
  const seen = new Set();
  st.events = st.events.filter((e) => !dead.has(e.id) && !fids.has(e.id) && !seen.has(e.id) && seen.add(e.id));
  sortEvents(st.events);
  while (st.events.length > MAX_EVENTS) {
    const e = st.events.shift();
    applyEv(st.snap, e);
    st.snap.folded++;
    st.snap.fids.push(e.id);
  }
  st.snap.fids = st.snap.fids.slice(-MAX_FIDS);
  st.dead = st.dead.slice(-MAX_DEAD);
  return st;
}

function rates(set) {
  if (set.mode === 'week') return set.week.map((v) => +v || 0);
  const d = +set.daily || 0; return [d, d, d, d, d, d, d];
}
// money between t0 and t1 using the weekday of each local day
function moneyBetween(r, t0, t1) {
  if (t1 <= t0) return 0;
  if (r.every((v) => v === r[0])) return (t1 - t0) / DAY * r[0];
  let sum = 0, cur = t0, guard = 0;
  while (cur < t1 && guard++ < 50000) {
    const d = new Date(cur);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const end = Math.min(next, t1);
    sum += (end - cur) / DAY * r[d.getDay()];
    cur = end;
  }
  return sum;
}
// everything the main screen shows, at time T
function derive(st, T) {
  const s = clone(st.snap);
  const effects = {};
  for (const e of st.events) effects[e.id] = applyEv(s, e);
  const total = Math.max(0, T - s.start - s.erased);
  const cur = Math.max(0, T - s.streakStart);
  const r = rates(st.set), avg = r.reduce((a, b) => a + b, 0) / 7;
  const money = Math.max(0, moneyBetween(r, s.start, T) - s.erased / DAY * avg);
  return {
    s, effects, total, cur, money, avgRate: avg,
    longest: Math.max(s.sLong, cur), average: (s.sSum + cur) / (s.sCount + 1),
    reached: Math.max(s.maxTotal, total),
    minT: Math.max(s.start, s.lastT || 0, ...st.events.map((e) => e.t)),
  };
}

// ---------- formatting ----------
// calendar difference (years, months, days, hours) of a duration ending now
function ymdh(ms, T) {
  const end = new Date(T), from = new Date(T - ms);
  let y = end.getFullYear() - from.getFullYear(), m = end.getMonth() - from.getMonth();
  let probe = new Date(from); probe.setFullYear(from.getFullYear() + y, from.getMonth() + m);
  if (probe > end) { m--; probe = new Date(from); probe.setFullYear(from.getFullYear() + y, from.getMonth() + m); }
  while (m < 0) { m += 12; y--; }
  let rest = T - probe.getTime();
  if (rest < 0) rest = 0;
  const d = Math.floor(rest / DAY); rest -= d * DAY;
  return { y, m, d, h: Math.floor(rest / HOUR) };
}
function fmtDur(ms) {
  if (ms < HOUR) return Math.floor(ms / MIN) + 'm';
  if (ms < DAY) return Math.floor(ms / HOUR) + 'h ' + Math.floor(ms % HOUR / MIN) + 'm';
  const days = ms / DAY;
  if (days < 30) return Math.floor(days) + 'd ' + Math.floor(ms % DAY / HOUR) + 'h';
  const y = Math.floor(days / 365.2425), mo = Math.floor((days - y * 365.2425) / 30.436875);
  const d = Math.floor(days - y * 365.2425 - mo * 30.436875);
  return (y ? y + 'y ' : '') + mo + 'mo ' + (y ? '' : d + 'd');
}
const fmtCache = {};
function curFmt(code) {
  if (fmtCache[code]) return fmtCache[code];
  const c = CURRENCIES.find((x) => x[0] === code) || CURRENCIES[1];
  let nf;
  try { nf = new Intl.NumberFormat(c[2], { style: 'currency', currency: c[0] }); }
  catch (e) { nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }); }
  const parts = nf.formatToParts(1234567.891);
  const firstNum = parts.findIndex((p) => p.type === 'integer');
  let lastNum = -1; parts.forEach((p, i) => { if (['integer', 'group', 'decimal', 'fraction'].includes(p.type)) lastNum = i; });
  const spec = {
    code: c[0], pre: parts.slice(0, firstNum).map((p) => p.value).join(''),
    suf: parts.slice(lastNum + 1).map((p) => p.value).join(''),
    grp: (parts.find((p) => p.type === 'group') || { value: ',' }).value,
    dec: (parts.find((p) => p.type === 'decimal') || { value: '.' }).value,
    d: nf.resolvedOptions().maximumFractionDigits,
  };
  return (fmtCache[code] = spec);
}
function fmtNum(v, spec, digits) {
  const neg = v < 0; v = Math.abs(v);
  const f = Math.pow(10, digits); const r = Math.floor(v * f + 1e-9) / f;
  let [i, fr] = r.toFixed(digits).split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, spec.grp);
  return (neg ? '-' : '') + i + (digits ? spec.dec + fr : '');
}
// main money: returns [formatted with currency decimals, extra ticking digits]
function fmtMoney(v, code, perSec) {
  const s = curFmt(code);
  let extra = 0;
  if (perSec > 0) extra = clamp(Math.ceil(-Math.log10(perSec)) - s.d, 0, 4);
  const full = fmtNum(v, s, s.d + extra);
  if (!extra) return [s.pre + full + s.suf, ''];
  return [s.pre + full.slice(0, full.length - extra) , full.slice(-extra) + s.suf];
}
const fmtMoneyPlain = (v, code) => { const s = curFmt(code); return s.pre + fmtNum(v, s, s.d) + s.suf; };

function drinkInfo(set) {
  if (set.drink === 'custom') {
    const c = set.custom || {}; const g = (+c.ml || 0) * (+c.abv || 0) / 100 * 0.789;
    return { name: c.name || 'My drink', desc: `${+c.ml || 0} ml at ${+c.abv || 0}% alcohol`, g };
  }
  const d = DRINKS.find((x) => x[0] === set.drink) || DRINKS[0];
  const g = d[0] === 'std' ? 10 : d[2] * d[3] / 100 * 0.789;
  return { name: d[1], desc: d[4], g };
}

// ---------- medal artwork ----------
function medalSvg(i, cls) {
  const c = MEDAL_COLS[clamp(i, 0, MEDAL_COLS.length - 1)];
  const pts = 5 + (i >= 9 ? 3 : i >= 4 ? 1 : 0);   // more star points for later medals
  const R = 9.5, r = R * (pts > 5 ? .5 : .42), cx = 24, cy = 36;
  let star = '';
  for (let k = 0; k < pts * 2; k++) {
    const a = -Math.PI / 2 + k * Math.PI / pts, rr = k % 2 ? r : R;
    star += (k ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
  }
  const id = 'm' + i + Math.random().toString(36).slice(2, 6);
  const rays = i >= 12 ? `<circle cx="24" cy="36" r="17.5" fill="none" stroke="${c[4]}" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>` : '';
  return `<svg viewBox="0 0 48 56" class="${cls || ''}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient></defs>
<path d="M12 0h9l7 18h-9z" fill="${c[0]}"/><path d="M36 0h-9l-7 18h9z" fill="${c[1]}"/>
<circle cx="24" cy="36" r="16" fill="url(#${id})" stroke="${c[3]}" stroke-width="1.5"/>
<circle cx="24" cy="36" r="12.5" fill="none" stroke="${c[4]}" stroke-opacity=".55" stroke-width="1"/>
${rays}<path d="${star}Z" fill="${c[4]}"/></svg>`;
}

// ---------- sync (encrypted relay through ntfy.sh, like Random Push) ----------
const RELAY = 'https://ntfy.sh/';
const normKey = (k) => (k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function newSyncKey() {
  const a = 'ACDEFGHJKLMNPQRTUVWXY34679'; /* no lookalikes (0 O 1 I 5 S 2 Z 8 B) */ const b = new Uint8Array(16); crypto.getRandomValues(b);
  let s = ''; b.forEach((v, i) => { s += a[v % a.length]; if (i % 4 === 3 && i < 15) s += '-'; }); return s;
}
async function sha256(str) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
async function syncKeys(key) {
  const k = normKey(key);
  const topic = 'rsl_' + hex(await sha256('rsl-topic|' + k)).slice(0, 28);
  const aes = await crypto.subtle.importKey('raw', await sha256('rsl-enc|' + k), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { topic, aes };
}
const b64e = (u) => { let s = ''; u.forEach((c) => (s += String.fromCharCode(c))); return btoa(s); };
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function seal(aes, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64e(out);
}
async function unseal(aes, text) {
  const u = b64d(text.trim());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, aes, u.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
// merge a remote state into the local one (same journey generation)
function mergeStates(a, b) {
  const win = b.snap.folded > a.snap.folded ? b : a;
  const out = { snap: clone(win.snap), events: [], dead: [], set: (b.set.ts || 0) > (a.set.ts || 0) ? clone(b.set) : clone(a.set) };
  out.snap.maxTotal = Math.max(a.snap.maxTotal, b.snap.maxTotal);
  out.dead = [...new Set([...a.dead, ...b.dead])];
  const byId = {};
  for (const e of [...a.events, ...b.events]) if (!byId[e.id]) byId[e.id] = e;
  out.events = Object.values(byId).map(clone);
  return normalize(out);
}

// ---------- colour packs ----------
// [id, name, background (system bars), light?, preview swatch: card, accent, money, stat, alert] — values mirror style.css
const THEMES = [
  ['forest', 'Forest', '#161c18', false, ['#212b25', '#8fbf8a', '#d9b26a', '#7fb0b0', '#c8645a']],
  ['ocean', 'Ocean', '#141b20', false, ['#1f2a32', '#7fb8c4', '#e6c07b', '#9ab89a', '#c96a64']],
  ['sunset', 'Sunset', '#1d1619', false, ['#2b2025', '#e39a6f', '#eab676', '#d58f9f', '#c9566a']],
  ['midnight', 'Midnight', '#15151f', false, ['#202031', '#a99bd6', '#e2c37f', '#8fb4d1', '#c96680']],
  ['cocoa', 'Cocoa', '#1c1714', false, ['#2a231e', '#d4a373', '#e2b86f', '#b5c08a', '#c25e50']],
  ['ember', 'Ember', '#181716', false, ['#252321', '#e08a5a', '#e6b04f', '#c9c08f', '#cf5a4c']],
  ['daylight', 'Daylight', '#eef0e8', true, ['#f9f8f2', '#4f7a52', '#a3732b', '#3f7c80', '#c0564b']],
  ['lavender', 'Lavender', '#efedf3', true, ['#faf8fb', '#7a64a8', '#a0703c', '#4f8090', '#c25a72']],
  ['clay', 'Clay', '#f2ebe1', true, ['#fbf7f1', '#b5653f', '#94701f', '#5a7f6c', '#b34a3f']],
  ['oat', 'Oat', '#f3efe6', true, ['#fcfaf4', '#8a6a4a', '#8f7a2e', '#6a8a72', '#b85a4e']],
];

// ---------- backup file (format 1; every later version must keep reading it) ----------
const BACKUP_APP = 'random-sober-life';
function makeBackup(st, key, version) {
  return JSON.stringify({ app: BACKUP_APP, format: 1, saved: new Date().toISOString(), version: version || '', key: key || '', st }, null, 1);
}
function readBackup(text) {
  const j = JSON.parse(text);
  if (!j || j.app !== BACKUP_APP || !j.st || !j.st.snap) throw new Error('This is not a Random Sober Life backup.');
  const st = j.st;
  st.set = Object.assign(defaultSettings(), st.set || {});
  st.events = st.events || []; st.dead = st.dead || [];
  return { st: normalize(st), key: j.key || '', saved: j.saved || '' };
}
