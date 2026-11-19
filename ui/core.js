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
  ['beer330', '330ml beer bottle', 330, 5, 'A regular can or small bottle of beer at about 5% alcohol.', 'bottle'],
  ['beer500', '500ml beer bottle', 500, 5, 'A tall can, large bottle or half-litre glass of beer at about 5%.', 'bottle'],
  ['pint', '568ml pint of beer', 568, 5, 'A UK pint of beer or cider at about 5%.', 'pint'],
  ['wine', '150ml glass of wine', 150, 12, 'A standard restaurant glass of red, white or sparkling wine at about 12%.', 'glass'],
  ['shot', '40ml shot of spirits', 40, 40, 'One shot of vodka, whisky, rum, gin or tequila at about 40%.', 'shot'],
  ['cocktail', '60ml cocktail', 60, 40, 'A mixed drink with about 1.5 shots of spirits (60 ml at 40%).', 'cocktail'],
  ['std', 'Standard drink (10 g)', 0, 0, 'One WHO / international standard drink: exactly 10 g of pure alcohol.', 'drink'],
];
// unit words for "My own drink"
const UNITS = ['bottle', 'can', 'glass', 'cup', 'shot', 'pint', 'drink'];
const plural = (u) => (u === 'glass' ? 'glasses' : u + 's');
// "3 bottles", "1 glass"
const units = (n, u) => `${n} ${n === 1 ? u : plural(u)}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const MILESTONES = [
  [1, '1 day', 'Every journey begins with a single day. You started.'],
  [3, '3 days', 'The hardest days are behind you. Keep showing up.'],
  [7, '1 week', 'One week strong. Small steps, real change.'],
  [14, '2 weeks', 'Two weeks of choosing yourself, again and again.'],
  [30, '1 month', 'A whole month. You are proving what is possible.'],
  [60, '2 months', 'Your new life is quietly taking shape.'],
  [90, '3 months', 'Three months of courage, one day at a time.'],
  [182, '6 months', 'Half a year free. Be proud of how far you have come.'],
  [273, '9 months', 'Your strength grows a little more every day.'],
  [365, '1 year', 'One whole year. You did something truly brave.'],
  [547, '18 months', 'This is not something you do any more. It is who you are.'],
  [730, '2 years', 'Two years of freedom, built one day at a time.'],
  [1095, '3 years', 'Your story has become one of hope.'],
  [1826, '5 years', 'Five years. A life rebuilt with patience and heart.'],
  [3652, '10 years', 'A decade of freedom. You rebuilt your life.'],
];
// health tree: 10 steps driven only by the current streak (0 = dead tree, 90 days = full tree with fruits)
const TREE = [
  [0, 'Worn out', 'Your body is under strain and running down. Every sober hour from now helps it heal.'],
  [1, 'First breath', 'The alcohol has left your blood. Your body starts to rebalance.'],
  [3, 'Waking up', 'Cravings ease and your body rehydrates. Sleep begins to return.'],
  [7, 'Sprouting', 'Deeper sleep, clearer mornings and a steadier mood.'],
  [14, 'Budding', 'Your stomach calms and digestion recovers.'],
  [21, 'Leafing out', 'Energy rises. Skin and eyes look brighter.'],
  [30, 'Growing strong', 'Liver fat starts to fall and blood pressure eases.'],
  [45, 'Flourishing', 'Focus and memory sharpen. Your immune system grows stronger.'],
  [60, 'Blossoming', 'Heart and liver keep repairing. You feel renewed.'],
  [90, 'Fully alive', 'Your body is healing at its strongest. Every cell is living fully.'],
];
const treeIndex = (streakMs) => { let k = 0; TREE.forEach((t, i) => { if (streakMs >= t[0] * DAY) k = i; }); return k; };
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
    drink: 'beer330', custom: { name: 'My drink', ml: 250, abv: 5, unit: 'drink' }, dpd: 0,
    x: 0, y: 'streak', acc: false, accEp: 0, notify: true, nh: 8, nm: 0, wstyle: 'app',
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
  let erased = 0, all = false, zero = false;
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
      // the relapse took the sober time down to 0: that is also a journey reset
      if (t - s.start - before > 0 && t - s.start - s.erased <= 0) { s.jr++; zero = true; }
    }
    s.streakStart = t;
  }
  s.lastT = Math.max(s.lastT || 0, t);
  return { trig, erased, all, zero };
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
  if (st.set && st.set.top === 'reddit') st.set.top = 'reflection';   // 1.3: Reddit replaced by daily reflections
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
    s, effects, total, cur, money, avgRate: avg, skipped: total / DAY * Math.max(0, +st.set.dpd || 0),
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
    return { name: c.name || 'My drink', desc: `${+c.ml || 0} ml at ${+c.abv || 0}% alcohol`, g, unit: UNITS.includes(c.unit) ? c.unit : 'drink' };
  }
  const d = DRINKS.find((x) => x[0] === set.drink) || DRINKS[0];
  const g = d[0] === 'std' ? 10 : d[2] * d[3] / 100 * 0.789;
  return { name: d[1], desc: d[4], g, unit: d[5] };
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

// ---------- health tree artwork ----------
// one fixed tree (seeded), leaves appear branch by branch and deepen in colour; Widgets.kt tree() is a port of this
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hexMix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
const TREE_COV = [0, .1, .22, .36, .5, .64, .77, .88, .96, 1];
const TREE_SK = (() => {
  const R = mulberry(7), segs = [], pts = [];
  (function br(x, y, a, len, w, d) {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; segs.push([x, y, x2, y2, w]);
    if (d <= 2) pts.push([x2, y2, d]);
    if (d === 0) return;
    const n = 2 + (R() < 0.35 ? 1 : 0);
    for (let k = 0; k < n; k++) br(x2, y2, a + (k - (n - 1) / 2) * (0.48 + R() * 0.22) + (R() - 0.5) * 0.22, len * (0.7 + R() * 0.1), w * 0.64, d - 1);
  })(50, 102, -Math.PI / 2, 23, 6.5, 5);
  const R2 = mulberry(99), leaves = [];
  pts.forEach((p) => {
    const u = R2(), n = p[2] === 0 ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const a = R2() * Math.PI * 2, d = 1 + R2() * 5.5;
      leaves.push({ u, x: p[0] + Math.cos(a) * d, y: p[1] + Math.sin(a) * d * 0.85, rot: a * 180 / Math.PI + (R2() - 0.5) * 60, s: 0.8 + R2() * 0.45, sh: Math.floor(R2() * 4), z: R2() });
    }
  });
  leaves.sort((a, b) => a.sh - b.sh || a.z - b.z);
  const R3 = mulberry(5), grass = [];
  for (let k = 0; k < 18; k++) grass.push([12 + R3() * 76, 0.6 + R3() * 0.8, (R3() - 0.5) * 3]);
  return { segs, leaves, grass };
})();
function treeSvg(i, cls) {
  i = clamp(i, 0, 9); const t = i / 9, f = (v) => v.toFixed(1);
  let s = `<svg viewBox="-8 2 116 108" class="${cls || ''}"><ellipse cx="50" cy="103" rx="38" ry="5" fill="${hexMix('#8b7b5f', '#3f7f34', t)}"/>`;
  TREE_SK.grass.slice(0, Math.round(t * 18)).forEach((g) => (s += `<path d="M${f(g[0])} 104q${f(g[2] / 2)} -4 ${f(g[2])} -${f(5 * g[1])}" stroke="${hexMix('#7a8a40', '#5fb04a', t)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`));
  const bark = i === 0 ? '#7d756a' : hexMix('#6e5a46', '#4e3726', t);
  TREE_SK.segs.forEach((g) => (s += `<line x1="${f(g[0])}" y1="${f(g[1])}" x2="${f(g[2])}" y2="${f(g[3])}" stroke="${bark}" stroke-width="${(g[4] * (i === 0 ? 0.85 : 1)).toFixed(2)}" stroke-linecap="round"/>`));
  const sh = [hexMix('#8f9a4c', '#1f5a24', t), hexMix('#a8b35c', '#2f7d2c', t), hexMix('#bcc56e', '#45a03a', t), hexMix('#d0d68a', '#74c653', t)];
  const vein = hexMix('#6f7a38', '#174419', t), sc = 0.5 + 0.5 * t;
  const vis = TREE_SK.leaves.filter((l) => l.u < TREE_COV[i]);
  vis.forEach((l) => (s += `<g transform="translate(${f(l.x)} ${f(l.y)}) rotate(${l.rot.toFixed(0)}) scale(${(l.s * sc).toFixed(2)})"><path d="M0 0C2 -2.7 5.6 -2.9 8.4 0C5.6 2.9 2 2.7 0 0Z" fill="${sh[l.sh]}" stroke="${vein}" stroke-width=".35"/><path d="M.6 0L7.4 0" stroke="${vein}" stroke-width=".4" opacity=".8"/></g>`));
  if (i === 8) vis.filter((l, k) => k % 9 === 4).forEach((l) => (s += `<circle cx="${f(l.x + 2)}" cy="${f(l.y)}" r="1.5" fill="#fbe1ea" stroke="#e9a9bc" stroke-width=".3"/><circle cx="${f(l.x + 2)}" cy="${f(l.y)}" r=".5" fill="#f0c04a"/>`));
  if (i === 9) vis.filter((l, k) => k % 11 === 5).forEach((l) => (s += `<circle cx="${f(l.x + 1.5)}" cy="${f(l.y + 1.5)}" r="2.5" fill="#d6402f" stroke="#9e2a1e" stroke-width=".3"/><circle cx="${f(l.x + .8)}" cy="${f(l.y + .7)}" r=".75" fill="#ff9d86"/>`));
  return s + '</svg>';
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
// [id, name, bar colour, light?, hero, money, fab]
const THEMES = [
  ['forest', 'Forest cabin', '#1a2420', false, '#2c4034', '#9fd3a8', '#d4705b'],
  ['ocean', 'Ocean dusk', '#17212b', false, '#263b4c', '#8fd0d3', '#e07a6b'],
  ['sunset', 'Sunset ember', '#241a1e', false, '#46302f', '#f2b27a', '#d9614f'],
  ['midnight', 'Midnight lavender', '#1b1a26', false, '#322f47', '#c3b1f0', '#d96d8a'],
  ['daylight', 'Daylight meadow', '#f5f1e8', true, '#e4eedb', '#3e8e5e', '#d0624e'],
  ['autumn', 'Autumn tea', '#221c17', false, '#3d3026', '#e3b26a', '#c8553d'],
  ['sakura', 'Sakura night', '#22191f', false, '#3d2b36', '#f2a7c0', '#e0607e'],
  ['cafe', 'Rainy cafe', '#1e1f22', false, '#3a3632', '#d6b48c', '#c86b5a'],
  ['aurora', 'Northern lights', '#121c22', false, '#1d3a3d', '#7ee0b5', '#e2706b'],
  ['lavender', 'Lavender field', '#f4f1f8', true, '#e8e1f3', '#6f5bb5', '#d0607a'],
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
