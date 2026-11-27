// Random Sober Life — UI + native bridge + sync loop
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- native bridge (Tauri on Windows, window.RSL on Android, localStorage in a plain browser) ----------
const TAURI = window.__TAURI__ && window.__TAURI__.core;
const AND = window.RSL;
const httpWait = {};
window.__rslHttp = (id, status, body) => { const f = httpWait[id]; delete httpWait[id]; if (f) f({ status, body }); };
const Native = {
  platform: TAURI ? 'win' : AND ? 'android' : 'web',
  async load() {
    if (TAURI) return TAURI.invoke('load_state');
    if (AND) return AND.load();
    try { return localStorage.getItem('rsl'); } catch (e) { return null; }
  },
  save(s) {
    if (TAURI) return TAURI.invoke('save_state', { data: s }).catch(() => {});
    if (AND) return AND.save(s);
    try { localStorage.setItem('rsl', s); } catch (e) {}
  },
  http(method, url, body) {
    if (TAURI) return TAURI.invoke('http_req', { method, url, body: body || '' });
    if (AND) return new Promise((res) => { const id = rid(); httpWait[id] = res; AND.http(id, method, url, body || ''); });
    return fetch(url, { method, body: body || undefined }).then(async (r) => ({ status: r.status, body: await r.text() }))
      .catch((e) => ({ status: 0, body: String(e) }));
  },
  open(url) {
    if (TAURI) return TAURI.invoke('open_url', { url });
    if (AND) return AND.openUrl(url);
    window.open(url, '_blank');
  },
  notify(cfg) {
    const s = JSON.stringify(cfg);
    if (TAURI) return TAURI.invoke('set_notify', { cfg: s }).catch(() => {});
    if (AND) return AND.setNotify(s);
  },
  async version() {
    if (TAURI) return TAURI.invoke('app_version');
    if (AND) return AND.version();
    return 'dev';
  },
  async getAutostart() { return TAURI ? TAURI.invoke('get_autostart').catch(() => false) : false; },
  setAutostart(on) { if (TAURI) return TAURI.invoke('set_autostart', { on }).catch(() => {}); },
  // backups: automatic copy after every change + "Backup now" / "Restore from file"
  backupAuto(text) {
    if (TAURI) return TAURI.invoke('backup_auto', { data: text }).catch(() => {});
    if (AND) return AND.backupAuto(text);
  },
  backupSave(text, name) {
    if (TAURI) return TAURI.invoke('backup_save', { data: text, name }).then((r) => (r === 'ok' ? true : r === 'cancel' ? null : r)).catch((e) => String(e));
    if (AND) return fileCall((id) => AND.backupSave(id, name, text)).then((r) => (r.ok ? true : r.text || null));
    return Promise.resolve('Not available here.');
  },
  backupOpen() {
    if (TAURI) return TAURI.invoke('backup_open').catch(() => null);
    if (AND) return fileCall((id) => AND.backupOpen(id)).then((r) => (r.ok ? r.text : null));
    return Promise.resolve(null);
  },
  async findBackup() { return TAURI ? TAURI.invoke('backup_find').catch(() => null) : null; },
  notifyAllowed() { return AND && AND.notifyAllowed ? AND.notifyAllowed() : true; },
  askNotify() { if (AND) AND.askNotify(); },
  openNotifySettings() { if (AND) AND.openNotifySettings(); },
  setBars(bg, light) { if (AND && AND.setBars) AND.setBars(bg, !!light); },
  widget(data) { if (AND && AND.widget) AND.widget(JSON.stringify(data)); },
  close() { if (AND && AND.close) AND.close(); },
};
// quick-log popup (Android widget "+"): only the Log drinks sheet, floating over the home screen
const QUICK = /[?&]quick=1/.test(location.search);
if (QUICK) document.documentElement.classList.add('quick');
const fileWait = {};
window.__rslFile = (id, ok, text) => { const f = fileWait[id]; delete fileWait[id]; if (f) f({ ok, text }); };
function fileCall(start) { return new Promise((res) => { const id = rid(); fileWait[id] = res; start(id); }); }

// ---------- app state ----------
let ST = null;            // synced: { snap, events, dead, set }
let LOC = { dev: rid(), key: '', last: '', joining: false, pub: '', pubAt: 0, auto: true, devs: {} };   // this device only
let VIEW = { qOff: 0, qDay: 0, rOff: 0, rDay: 0, modal: null, version: '' };

function persist() {
  Native.save(JSON.stringify({ st: ST, loc: LOC }));
  // automatic backup file (outside the app's own data, so it survives a reinstall)
  clearTimeout(persist.bk);
  if (ST && ST.snap.gen) persist.bk = setTimeout(() => Native.backupAuto(makeBackup(ST, LOC.key, VIEW.version)), 2500);
  pushWidget();
}
// home-screen widgets (Android): the journey numbers + the saved theme's colours; the widget counts on from these
function pushWidget(now_) {
  if (Native.platform !== 'android' || !ST || !ST.snap.gen) return;
  clearTimeout(pushWidget.h);
  const go = () => {
    const s = ST.set, sn = derive(ST, now()).s;
    const probe = document.createElement('div'); probe.dataset.theme = s.theme || 'forest'; probe.style.display = 'none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe), v = (n) => cs.getPropertyValue('--' + n).trim();
    const th = THEMES.find((x) => x[0] === s.theme) || THEMES[0];
    const col = { bg: v('card'), text: v('text'), muted: v('muted'), money: v('money'), quote: v('quote'), stat: v('stat'), fab: v('fab'), line: v('line'), light: !!th[3] };
    probe.remove();
    Native.widget({
      start: sn.start, erased: sn.erased, streakStart: sn.streakStart, sLong: sn.sLong, sr: sn.sr, jr: sn.jr, maxTotal: sn.maxTotal,
      rates: rates(s), fmt: curFmt(s.cur), miles: MILESTONES.map((m) => [m[0], m[1]]), medals: MEDAL_COLS,
      top: s.top, style: s.wstyle || 'app', col, dpd: Math.max(0, +s.dpd || 0), unit: drinkInfo(s).unit, tree: TREE.map((x) => [x[0], x[1]]),
      oDay: dayNo(now()), qOff: VIEW.qDay === dayNo(now()) ? VIEW.qOff : 0, rOff: VIEW.rDay === dayNo(now()) ? VIEW.rOff : 0,
    });
  };
  if (now_) go(); else pushWidget.h = setTimeout(go, 300);
}
function changed(settings) {
  if (QUICK) VIEW.qChanged = true;
  if (settings) ST.set.ts = now();
  ST.edit = now();                     // last input on this device: the newest input wins when syncing
  normalize(ST);
  persist();
  render();
  pushNotify();
  schedulePublish();
}
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms || 2600);
}

// ---------- main screen ----------
function dayNo(T) { const d = new Date(T); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY + 0.5); }
function renderTop() {
  const card = $('topCard'), mode = ST.set.top;
  card.classList.toggle('hidden', mode === 'off');
  if (mode === 'off') return;
  const body = $('topBody'), info = $('topInfo');
  if (mode === 'quotes') {
    const today = dayNo(now());
    if (VIEW.qDay !== today) { VIEW.qDay = today; VIEW.qOff = 0; }
    const N = QUOTES.length, i = (((today + VIEW.qOff) % N) + N) % N, q = QUOTES[i];
    body.innerHTML = `<div class="quote">&ldquo;${esc(q[0])}&rdquo;</div><div class="quote-a">&mdash; ${esc(q[1])}</div>`;
    info.textContent = VIEW.qOff === 0 ? 'Quote of the day' : (VIEW.qOff > 0 ? '+' : '') + VIEW.qOff + ' from today';
    return;
  }
  // daily recovery reflection (one per day, arrows browse, back to today's on the next day)
  const today = dayNo(now());
  if (VIEW.rDay !== today) { VIEW.rDay = today; VIEW.rOff = 0; }
  const N = REFLECTIONS.length, i = (((today + VIEW.rOff) % N) + N) % N, r = REFLECTIONS[i];
  body.innerHTML = `<div class="rf-title">${esc(r[0])}</div><div class="rf-text">${esc(r[1])}</div>`;
  info.textContent = VIEW.rOff === 0 ? 'Reflection of the day' : (VIEW.rOff > 0 ? '+' : '') + VIEW.rOff + ' from today';
}
// browsing is remembered for the day (and shown on the Android widget too)
function saveBrowse() { LOC.qOff = VIEW.qOff; LOC.rOff = VIEW.rOff; LOC.oDay = dayNo(now()); persist(); }
$('topPrev').onclick = () => { if (ST.set.top === 'quotes') VIEW.qOff--; else VIEW.rOff--; renderTop(); saveBrowse(); };
$('topNext').onclick = () => { if (ST.set.top === 'quotes') VIEW.qOff++; else VIEW.rOff++; renderTop(); saveBrowse(); };

function mileIndex(ms) { let k = -1; MILESTONES.forEach((m, i) => { if (ms >= m[0] * DAY) k = i; }); return k; }
function render() {
  if (!ST) return;
  const T = now(), D = derive(ST, T);
  const t = ymdh(D.total, T);
  $('bigTime').innerHTML = [[t.y, 'Years'], [t.m, 'Months'], [t.d, 'Days'], [t.h, 'Hours']]
    .map(([v, l]) => `<div class="tu"><b>${v}</b><span>${l}</span></div>`).join('');
  const [m1, m2] = fmtMoney(D.money, ST.set.cur, D.avgRate / 86400);
  $('moneyMain').textContent = m1; $('moneyFrac').textContent = m2;
  const u = drinkInfo(ST.set).unit, dpd = +ST.set.dpd || 0;
  $('skipLine').classList.toggle('hidden', !(dpd > 0));
  if (dpd > 0) $('skipLine').textContent = `${Math.floor(D.skipped).toLocaleString()} ${Math.floor(D.skipped) === 1 ? u : plural(u)} skipped`;
  const k = mileIndex(D.total), kr = mileIndex(D.reached);
  const mk = k >= 0 ? 'c' + k : kr >= 0 ? 'g' + kr : 'l';
  if (render.mk !== mk) { render.mk = mk; $('medalArt').innerHTML = k >= 0 ? medalSvg(k) : kr >= 0 ? medalSvg(kr, 'grey') : medalSvg(0, 'locked'); $('medalLbl').textContent = k >= 0 ? MILESTONES[k][1] : 'No medal yet'; }
  const ti = treeIndex(D.cur);
  if (render.ti !== ti) { render.ti = ti; $('treeArt').innerHTML = treeSvg(ti); $('treeLbl').textContent = TREE[ti][1]; }
  const nx = MILESTONES[k + 1];
  $('nextMile').textContent = nx ? `Next medal: ${nx[1]} in ${fmtDur(nx[0] * DAY - D.total)}` : 'Every medal earned. Keep going.';
  $('stCur').textContent = fmtDur(D.cur);
  $('stLong').textContent = fmtDur(D.longest);
  $('stAvg').textContent = fmtDur(D.average);
  $('stSR').textContent = D.s.sr;
  $('stJR').textContent = D.s.jr;
  const set = ST.set;
  $('stDn').textContent = (D.s.dn || 0).toLocaleString(); $('stDnL').textContent = cap(plural(drinkInfo(set).unit)) + ' logged';
  renderTop();
}
function yLabel(y) { return y === 'all' ? 'All' : y === 'streak' ? 'One streak' : y; }
function ruleShort(set) { return `${set.x || 'Any'} → ${set.y === 'all' ? 'All' : set.y === 'streak' ? 'Streak' : set.y + 'd'}`; }
function ruleText(set) {
  const u = drinkInfo(set).unit;
  const x = set.x ? units(set.x, u) : 'Any ' + u;
  const y = set.y === 'all' ? 'resets the whole journey' : set.y === 'streak' ? 'erases the current streak' : `erases ${set.y} day${set.y > 1 ? 's' : ''}`;
  return `${x} ${y}.`;
}

// ---------- spinner (up/down arrows + wheel + swipe) ----------
function spinner(values, idx, onChange, fmt) {
  const el = document.createElement('div'); el.className = 'spin';
  el.innerHTML = `<button type="button" aria-label="Up">▲</button><div class="sv"></div><button type="button" aria-label="Down">▼</button>`;
  const sv = el.querySelector('.sv');
  const show = () => { const v = values[idx]; const s = fmt ? fmt(v) : String(v); sv.textContent = s; sv.classList.toggle('txt', s.length > 3); };
  const set = (i) => { i = clamp(i, 0, values.length - 1); if (i !== idx) { idx = i; show(); onChange(values[idx]); } };
  const [up, dn] = el.querySelectorAll('button');
  const hold = (btn, d) => {
    let t1, t2;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.onpointerdown = (e) => { e.preventDefault(); set(idx + d); t1 = setTimeout(() => (t2 = setInterval(() => set(idx + d), 80)), 400); };
    btn.onpointerup = btn.onpointerleave = btn.onpointercancel = stop;
  };
  hold(up, 1); hold(dn, -1);
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(idx + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  let y0 = null, i0 = 0;
  sv.onpointerdown = (e) => { y0 = e.clientY; i0 = idx; sv.setPointerCapture(e.pointerId); };
  sv.onpointermove = (e) => { if (y0 !== null) set(i0 + Math.round((y0 - e.clientY) / 22)); };
  sv.onpointerup = sv.onpointercancel = () => (y0 = null);
  show();
  return el;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- modal ----------
function openModal(name, html, wire) {
  VIEW.modal = name;
  $('sheet').innerHTML = html;
  $('modal').classList.remove('hidden');
  $('sheet').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
  if (wire) wire($('sheet'));
}
function closeModal() {
  if (QUICK) { $('modal').classList.add('hidden'); finishQuick(); return; }
  VIEW.modal = null; $('modal').classList.add('hidden'); $('sheet').innerHTML = ''; if (ST) applyTheme(ST.set.theme); render(); }
$('modal').onclick = (e) => { if (e.target === $('modal') && VIEW.modal !== 'setup' && VIEW.modal !== 'choose') closeModal(); };
window.__rslBack = () => { if (VIEW.modal && VIEW.modal !== 'setup' && VIEW.modal !== 'choose') { closeModal(); return true; } return false; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__rslBack(); });
const head = (t, closable = true) => `<div class="sh-head"><h2>${t}</h2>${closable ? '<button class="x-btn" data-close>&times;</button>' : ''}</div>`;
const toLocalInput = (T) => { const d = new Date(T - new Date(T).getTimezoneOffset() * MIN); return d.toISOString().slice(0, 16); };
const fromLocalInput = (s) => new Date(s).getTime();
const pad2 = (v) => String(v).padStart(2, '0');
const dayStart = (T) => { const d = new Date(T); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
// Day list for the drink time: Today, Yesterday, then older dates back to the earliest allowed day (at most 60 days)
function dayOptions(T, minT) {
  const out = [], first = dayStart(Math.max(minT || 0, T - 59 * DAY));
  for (let i = 0; i < 60; i++) {
    const d = new Date(T); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    if (d.getTime() < first) break;
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    out.push(`<option value="${d.getTime()}">${esc(lbl)}</option>`);
  }
  return out.join('');
}
const fmtWhen = (T) => new Date(T).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// quick-log popup done: save the backup, tell the widget and the other devices, then close the popup
async function finishQuick() {
  if (finishQuick.busy) return; finishQuick.busy = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (VIEW.qChanged && ST) {
    clearTimeout(persist.bk); Native.backupAuto(makeBackup(ST, LOC.key, VIEW.version));
    pushWidget(true);
    clearTimeout(SY.pubTimer);
    await Promise.all([wait(1300), LOC.key && LOC.auto ? Promise.race([publish(), wait(6000)]) : null]);
  }
  Native.close();
}
// the main window comes back after a quick log: pick up the newer saved journey
window.__rslReload = async () => {
  if (QUICK || !ST) return;
  let j = null; try { j = JSON.parse(await Native.load()); } catch (e) { return; }
  if (!j || !j.st || !j.st.snap || (j.st.edit || 0) <= (ST.edit || 0)) return;
  ST = j.st; ST.set = Object.assign(defaultSettings(), ST.set || {}); ST.events = ST.events || []; ST.dead = ST.dead || []; normalize(ST);
  if (j.loc && (j.loc.pubAt || 0) > (LOC.pubAt || 0)) { LOC.pub = j.loc.pub; LOC.pubAt = j.loc.pubAt; }
  if (!VIEW.modal) { applyTheme(ST.set.theme); render(); }
  pushNotify();
};

// ---------- log drinks ----------
function openDrinks() {
  let n = 1;
  const T = now(), D = derive(ST, T), di = drinkInfo(ST.set), u = di.unit;
  const rows = ST.events.slice().reverse().map((e) => {
    const ef = D.effects[e.id] || {};
    const what = ef.all ? 'reset the journey' : ef.trig ? (ef.zero ? 'relapse, back to 0' : ef.erased ? `relapse, erased ${fmtDur(ef.erased)}` : 'relapse') : 'no erase';
    return `<div class="hrow"><div class="ht">${esc(fmtWhen(e.t))}<div class="he">${units(e.n, u)} · ${what}</div></div>
      <button class="del" data-del="${e.id}" title="Delete and undo">&times;</button></div>`;
  }).join('') || `<div class="hint">No ${plural(u)} logged.</div>`;
  openModal('drinks', `${head('Log ' + plural(u))}
    <div class="sec">
      <div class="drink-in"><div id="spN"></div>
        <div class="when"><label>When</label><div class="when-row">
          <select id="dD">${dayOptions(T, D.minT)}</select>
          <select id="dH">${range(0, 23).map((h) => `<option value="${h}">${pad2(h)}</option>`).join('')}</select><b>:</b>
          <select id="dM">${range(0, 59).map((m) => `<option value="${m}">${pad2(m)}</option>`).join('')}</select>
          <button type="button" class="btn small ghost" id="dNow">Now</button></div></div></div>
      <div class="hint">1 ${esc(u)} = ${esc(di.name)} (about ${di.g.toFixed(0)} g of alcohol).<br>Rule: ${esc(ruleText(ST.set))}</div>
      <div class="row" style="margin-top:12px"><button class="btn red wide" id="dGo">Log ${esc(plural(u))}</button></div>
    </div>
    <div class="sec"><h3>Last 5 entries</h3><div class="hist">${rows}</div>
      <div class="hint">Deleting an entry fully undoes what it did.</div></div>`, (sh) => {
    sh.querySelector('#spN').appendChild(spinner(range(1, 99), 0, (v) => (n = v)));
    const dD = sh.querySelector('#dD'), dH = sh.querySelector('#dH'), dM = sh.querySelector('#dM');
    const setNow = () => { const d = new Date(); dD.value = String(dayStart(d.getTime())); dH.value = String(d.getHours()); dM.value = String(d.getMinutes()); };
    setNow();
    sh.querySelector('#dNow').onclick = setNow;
    sh.querySelector('#dGo').onclick = () => {
      const d0 = new Date(+dD.value);
      let t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), +dH.value, +dM.value, 0).getTime();
      if (!isFinite(t)) t = now();
      const isNow = Math.abs(t - now()) < MIN;     // "now" keeps the exact current time
      const T2 = now(), D2 = derive(ST, T2);
      if (t > T2 || isNow) t = T2;
      if (t < D2.minT) { toast('The time can’t be before your last entry or the journey start.'); return; }
      const s = ST.set;
      ST.events.push({ id: rid(), t, n, x: s.x, y: s.y, acc: false, ep: s.accEp || 0, dev: LOC.dev });
      changed();
      const ef = derive(ST, now()).effects; const last = ST.events.find((e) => e.t === t && e.n === n);
      const r = last && ef[last.id];
      closeModal();
      toast(r && r.trig ? (r.all ? 'Journey reset. A new start begins now.' : (r.zero ? 'Logged. Back to day one — keep going.' : 'Logged. Relapse counted — keep going.')) : `Logged ${units(n, u)}.`);
    };
    sh.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      if (!confirm('Delete this entry and undo its effect?')) return;
      ST.events = ST.events.filter((e) => e.id !== b.dataset.del);
      ST.dead.push(b.dataset.del);
      changed();
      openDrinks();
    }));
  });
}
$('fab').onclick = openDrinks;

// ---------- milestones ----------
function openMedals() {
  const T = now(), D = derive(ST, T);
  const rows = MILESTONES.map((m, i) => {
    const ms = m[0] * DAY, got = D.total >= ms, lost = !got && D.reached >= ms;
    const st = got ? 'Reached' : lost ? 'Lost — earn it back<br>in ' + fmtDur(ms - D.total) : 'in ' + fmtDur(ms - D.total);
    return `<div class="mrow ${got ? 'got' : lost ? 'lost' : ''}">${medalSvg(i, got ? '' : lost ? 'grey' : 'locked')}
      <div><div class="mt">${m[1]}</div><div class="mf">${esc(m[2])}</div></div><div class="ms">${st}</div></div>`;
  }).join('');
  openModal('medals', `${head('Milestones')}<div class="sec">${rows}</div>
    <div class="hint">Medals follow your total sober time. A medal you drop below stays, in black and white, until you reach it again.</div>`);
}
$('btnMedal').onclick = openMedals;

// ---------- health tree ----------
function openTree() {
  const D = derive(ST, now()), cur = treeIndex(D.cur);
  const rows = TREE.map((x, i) => {
    const got = i <= cur, st = i === cur ? 'Now' : got ? 'Reached' : 'in ' + fmtDur(x[0] * DAY - D.cur);
    return `<div class="mrow tree ${got ? 'got' : ''} ${i === cur ? 'now' : ''}">${treeSvg(i)}
      <div><div class="mt">${i + 1}. ${esc(x[1])}</div><div class="mf">${x[0] ? 'Streak of ' + x[0] + ' day' + (x[0] > 1 ? 's' : '') : 'Streak under 1 day'} · ${esc(x[2])}</div></div><div class="ms">${st}</div></div>`;
  }).join('');
  openModal('tree', `${head('Health tree')}<div class="sec">${rows}</div>
    <div class="hint">The tree follows your current streak only. It grows back from the start after a relapse, and is fully healthy at 90 days.</div>`);
}
$('btnTree').onclick = openTree;

// ---------- number inputs with "," thousands separators ----------
function fmtIn(v) {
  if (v === '' || v === null || v === undefined || !isFinite(+v)) return '';
  const [i, f] = String(+v).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '');
}
const parseIn = (s) => +String(s || '').replace(/,/g, '') || 0;
const moneyField = (attrs, v) => `<span class="mfield"><span class="mpre"></span>${numField(attrs, v, true)}<span class="msuf"></span></span>`;
function paintCur(root, code) {
  const f = curFmt(code);
  root.querySelectorAll('.mpre').forEach((e) => (e.textContent = f.pre.trim()));
  root.querySelectorAll('.msuf').forEach((e) => (e.textContent = f.suf.trim()));
}
const numField = (attrs, v, dec) => `<input type="text" inputmode="${dec ? 'decimal' : 'numeric'}" data-num="${dec ? 1 : 0}" ${attrs} value="${fmtIn(v)}">`;
function wireNums(root) {
  root.querySelectorAll('input[data-num]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const dec = inp.dataset.num === '1';
      const re = dec ? /[^\d.]/g : /[^\d]/g;
      const caret = inp.selectionStart || 0;
      const keep = inp.value.slice(0, caret).replace(re, '').length;   // characters before the caret
      let raw = inp.value.replace(re, '');
      if (dec) { const k = raw.indexOf('.'); if (k >= 0) raw = raw.slice(0, k + 1) + raw.slice(k + 1).replace(/\./g, '').slice(0, 2); }
      let [i, f] = raw.split('.');
      i = (i || '').replace(/^0+(?=\d)/, '');
      const out = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '');
      inp.value = out;
      let pos = 0, n = 0;
      while (pos < out.length && n < keep) { if (out[pos] !== ',') n++; pos++; }
      try { inp.setSelectionRange(pos, pos); } catch (e) {}
    });
  });
}

// ---------- colour packs ----------
function applyTheme(name) {
  const t = THEMES.find((x) => x[0] === name) || THEMES[0];
  document.documentElement.dataset.theme = t[0];
  Native.setBars(t[2], t[3]);
}

// ---------- settings (edited as a draft; "SAVE and Close" applies it, × / Back discards) ----------
function openSettings() {
  const s = clone(ST.set);
  let autoWanted = null;
  const curOpts = CURRENCIES.map((c) => `<option value="${c[0]}" ${c[0] === s.cur ? 'selected' : ''}>${c[0]} — ${c[1]}</option>`).join('');
  const drOpts = DRINKS.map((d) => `<option value="${d[0]}" ${d[0] === s.drink ? 'selected' : ''}>${d[1]}</option>`).join('')
    + `<option value="custom" ${s.drink === 'custom' ? 'selected' : ''}>My own drink…</option>`;
  const wk = [1, 2, 3, 4, 5, 6, 0].map((d) => `<div class="wrow"><span>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}</span>${moneyField(`data-wd="${d}"`, s.week[d] || 0)}</div>`).join('');
  const nt = String(s.nh).padStart(2, '0') + ':' + String(s.nm).padStart(2, '0');
  const D = derive(ST, now());
  const canEditStart = !ST.events.length && !ST.snap.folded;
  const themeBtns = THEMES.map((t) => `<button data-th="${t[0]}"><i style="background:linear-gradient(90deg,${t[4]} 0 34%,${t[5]} 34% 67%,${t[6]} 67%)"></i>${t[1]}</button>`).join('');
  const bkWhere = Native.platform === 'win' ? 'Documents\\Random Sober Life' : 'Download/Random Sober Life';
  openModal('settings', `${head('Settings')}
    <div class="sec"><h3>Top section</h3>
      <div class="seg" id="segTop"><button data-v="quotes">Quotes</button><button data-v="reflection">Daily reflection</button><button data-v="off">Off</button></div></div>

    <div class="sec"><h3>Colours</h3><div class="themes" id="themes">${themeBtns}</div></div>
${Native.platform === 'android' ? `
    <div class="sec"><h3>Home-screen widgets</h3>
      <div class="seg" id="segW"><button data-v="app">Follow app</button><button data-v="wall">Wallpaper colours</button><button data-v="clear">See-through</button></div>
      <div class="hint">Add one: long-press the home screen → Widgets → Random Sober Life. Wallpaper colours need Android 12 or newer.</div></div>
` : ''}
    <div class="sec"><h3>Money</h3>
      <div class="row"><label>Currency</label><select id="sCur" class="grow">${curOpts}</select></div>
      <div class="row"><label>Money spent per day before quitting</label></div>
      <div class="seg" id="segMode"><button data-v="avg">Average per day</button><button data-v="week">Each day of the week</button></div>
      <div id="mAvg" class="row">${moneyField('id="sDaily"', s.daily || 0)}</div>
      <div id="mWeek" class="week" style="margin-top:10px">${wk}</div>
      <div class="row" style="margin-top:12px"><label class="grow" id="dpdL">Average drinks per day before quitting</label>${numField('id="sDpd" style="width:90px"', s.dpd || 0, true)}</div>
      <div class="hint">Money saved grows every second with your sober time; erased days take their money with them.
        The average per day also counts the drinks you have skipped (0 = don't show it).</div></div>

    <div class="sec"><h3>What is one drink</h3>
      <select id="sDrink" style="width:100%">${drOpts}</select>
      <div id="cust" class="row"><input id="cName" class="grow" placeholder="Name" value="${esc(s.custom.name)}">
        ${numField('id="cMl" style="width:90px"', s.custom.ml)}<label>ml</label>
        <input id="cAbv" type="text" inputmode="decimal" style="width:80px" value="${s.custom.abv}"><label>%</label></div>
      <div id="custU" class="row"><label>Counted as</label><select id="cUnit" class="grow">${UNITS.map((x) => `<option value="${x}" ${(s.custom.unit || 'drink') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="hint" id="drDesc"></div></div>

    <div class="sec"><h3>Drink rule</h3>
      <div class="rule"><span id="spX"></span><span id="ruleU">drinks will erase</span><span id="spY"></span><span>days in stats.</span></div>
      <div class="hint" id="ruleHint"></div></div>

    <div class="sec"><h3>Daily summary</h3>
      <div class="row"><label class="chk grow"><input type="checkbox" id="sNot" ${s.notify ? 'checked' : ''}> Notification every day at</label>
        <input type="time" id="sNt" value="${nt}"></div>
      ${Native.platform === 'win' ? `<div class="row"><label class="chk"><input type="checkbox" id="sAuto"> Start with Windows (needed for the daily summary)</label></div>` : ''}
      ${Native.platform === 'android' ? `<div class="row"><button class="btn ghost small" id="sNotSet">Open notification settings</button></div>` : ''}
    </div>

    <div class="sec"><h3>Backup</h3>
      <div class="hint">Your journey is also backed up automatically after every change to <b>${esc(bkWhere)}</b>.
        A backup holds the whole journey, every setting and the sync key.</div>
      <div class="row"><button class="btn small" id="bkSave">Backup now…</button><button class="btn small ghost" id="bkLoad">Restore from file…</button></div></div>

    <div class="sec"><h3>Sync</h3><div id="syncBox"></div></div>

    <div class="sec"><h3>Journey</h3>
      <div class="row"><label>Started</label><input type="datetime-local" id="sStart" value="${toLocalInput(ST.snap.start)}" ${canEditStart ? '' : 'disabled'} class="grow"></div>
      <div class="hint">${canEditStart ? 'You can change the start until you log your first drink.' : 'Journey start: ' + esc(fmtWhen(D.s.start))}</div>
      <div class="row"><button class="btn ghost small" id="sWipe">Start over (erase everything)</button></div></div>
    <div class="hint" style="text-align:center">Random Sober Life ${esc(VIEW.version)} · ${QUOTES.length} quotes · ${REFLECTIONS.length} reflections</div>
    <div class="done-bar"><button class="btn wide" id="sDone">SAVE and Close</button></div>`, (sh) => {
    wireNums(sh);
    const seg = (id, val, cb) => {
      const el = sh.querySelector(id);
      const paint = (v) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      paint(val);
      el.querySelectorAll('button').forEach((b) => (b.onclick = () => { paint(b.dataset.v); cb(b.dataset.v); }));
    };
    seg('#segTop', s.top, (v) => (s.top = v));
    if (sh.querySelector('#segW')) seg('#segW', s.wstyle || 'app', (v) => (s.wstyle = v));
    const paintTh = () => sh.querySelectorAll('[data-th]').forEach((b) => b.classList.toggle('on', b.dataset.th === s.theme));
    sh.querySelectorAll('[data-th]').forEach((b) => (b.onclick = () => { s.theme = b.dataset.th; paintTh(); applyTheme(s.theme); }));
    paintTh();
    const modeUi = () => { sh.querySelector('#mAvg').classList.toggle('hidden', s.mode !== 'avg'); sh.querySelector('#mWeek').classList.toggle('hidden', s.mode !== 'week'); };
    seg('#segMode', s.mode, (v) => { s.mode = v; modeUi(); }); modeUi();
    const money = (v) => clamp(Math.round(parseIn(v) * 100) / 100, 0, 1000000);
    sh.querySelector('#sCur').onchange = (e) => { s.cur = e.target.value; paintCur(sh, s.cur); };
    paintCur(sh, s.cur);
    const drUi = () => {
      sh.querySelector('#cust').classList.toggle('hidden', s.drink !== 'custom');
      sh.querySelector('#custU').classList.toggle('hidden', s.drink !== 'custom');
      const d = DRINKS.find((x) => x[0] === s.drink), di = drinkInfo(s), pu = plural(di.unit);
      sh.querySelector('#dpdL').textContent = `Average ${pu} per day before quitting`;
      sh.querySelector('#ruleU').textContent = `${pu} will erase`;
      if (sh.querySelector('#ruleHint').innerHTML) ruleUi();
      sh.querySelector('#drDesc').textContent = (d ? d[4] + ' ' : di.desc + '. ') + `About ${di.g.toFixed(1)} g of pure alcohol (${(di.g / 10).toFixed(1)} standard drinks).`;
    };
    const cust = () => {
      s.custom = { name: sh.querySelector('#cName').value.slice(0, 40) || 'My drink', ml: clamp(parseIn(sh.querySelector('#cMl').value), 1, 5000), abv: clamp(+sh.querySelector('#cAbv').value || 0, 0.1, 96), unit: sh.querySelector('#cUnit').value };
      drUi();
    };
    sh.querySelector('#sDrink').onchange = (e) => { s.drink = e.target.value; drUi(); };
    ['#cName', '#cMl', '#cAbv', '#cUnit'].forEach((q) => (sh.querySelector(q).onchange = cust));
    function ruleUi() {
      sh.querySelector('#ruleHint').innerHTML = esc(ruleText(s)) + ' Each entry counts as a whole: reaching the limit is one relapse and the streak starts again.' +
        `<br>X = Any: any amount triggers it. Y = All: the whole journey resets. One streak: the current streak is taken off.` +
        ``;
    }
    drUi();
    sh.querySelector('#spX').appendChild(spinner([0, ...range(1, 30)], s.x, (v) => { s.x = v; ruleUi(); }, (v) => (v ? v : 'Any')));
    const yv = ['all', 'streak', ...range(1, 30)];
    sh.querySelector('#spY').appendChild(spinner(yv, Math.max(0, yv.indexOf(s.y)), (v) => { s.y = v; ruleUi(); }, yLabel));
    // unticking clears the counted drinks (new epoch); ticking back inside the same draft keeps the saved epoch
    ruleUi();
    sh.querySelector('#sNot').onchange = (e) => (s.notify = e.target.checked);
    sh.querySelector('#sNt').onchange = (e) => { const [h, m] = (e.target.value || '08:00').split(':'); s.nh = clamp(+h || 0, 0, 23); s.nm = clamp(+m || 0, 0, 59); };
    const au = sh.querySelector('#sAuto');
    if (au) { Native.getAutostart().then((v) => (au.checked = !!v)); au.onchange = () => (autoWanted = au.checked); }
    const ns = sh.querySelector('#sNotSet'); if (ns) ns.onclick = () => Native.openNotifySettings();
    sh.querySelector('#bkSave').onclick = async () => {
      const r = await Native.backupSave(makeBackup(ST, LOC.key, VIEW.version), backupName());
      if (r) toast(r === true ? 'Backup saved.' : String(r), 3500);
    };
    sh.querySelector('#bkLoad').onclick = async () => { const text = await Native.backupOpen(); if (text) restoreFrom(text, true); };
    const st = sh.querySelector('#sStart');
    st.onchange = () => {
      const t = fromLocalInput(st.value);
      if (!isFinite(t) || t > now()) { toast('Pick a time in the past.'); return; }
      ST.snap.start = ST.snap.streakStart = ST.snap.lastT = t; ST.snap.gen = now(); changed();
    };
    sh.querySelector('#sWipe').onclick = () => {
      if (!confirm('Erase the whole journey, all stats and medals, and start again now? This also replaces the journey on synced devices.')) return;
      ST = newState(now(), ST.set); changed(); closeModal(); toast('A fresh start. Day one begins now.');
    };
    sh.querySelector('#sDone').onclick = () => {
      s.daily = money(sh.querySelector('#sDaily').value);
      s.dpd = clamp(Math.round(parseIn(sh.querySelector('#sDpd').value) * 100) / 100, 0, 100);
      s.acc = false;                     // 1.7: accumulative drinks removed
      sh.querySelectorAll('[data-wd]').forEach((inp) => (s.week[+inp.dataset.wd] = money(inp.value)));
      cust();
      const askN = s.notify && !ST.set.notify;
      ST.set = s;
      if (autoWanted !== null) Native.setAutostart(autoWanted);
      VIEW.savedSettings = true;
      changed(true);
      closeModal();
      if (askN) Native.askNotify();
      toast('Settings saved.');
    };
    renderSync(sh.querySelector('#syncBox'));
  });
}
$('btnSettings').onclick = openSettings;

function backupName() { const d = new Date(); return `Random Sober Life backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`; }
function restoreFrom(text, ask) {
  let b;
  try { b = readBackup(text); } catch (e) { toast(e.message || 'That file could not be read.', 4000); return false; }
  if (ask && ST && !confirm(`Replace the journey on this device with the backup from ${b.saved ? new Date(b.saved).toLocaleString() : 'that file'}?`)) return false;
  ST = b.st; ST.edit = now();
  if (b.key) { LOC.key = b.key; LOC.last = ''; LOC.pub = ''; }
  VIEW.modal = null; $('modal').classList.add('hidden'); $('sheet').innerHTML = '';
  applyTheme(ST.set.theme); persist(); render(); pushNotify(); schedulePublish(); updDot();
  toast('Journey restored from backup.', 3000);
  return true;
}

function renderSync(box) {
  if (!box) return;
  if (LOC.key) {
    const devs = Object.entries(LOC.devs || {}).filter(([id]) => id !== LOC.dev).sort((a, b) => b[1].seen - a[1].seen);
    const t = (T) => (T ? new Date(T).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
    const list = `<div class="dev-row"><b>This device (${esc(devName())})</b><span>last input ${esc(t(ST.edit))}</span></div>` +
      (devs.length ? devs.map(([, d]) => `<div class="dev-row"><b>${esc(d.name || 'Other device')}</b><span>last input ${esc(t(d.edit))} · seen ${esc(t(d.seen))}</span></div>`).join('')
        : '<div class="hint">No other device found on this key yet. Open the app on the other device, check that it shows exactly the same key, and tap Sync devices there.</div>');
    box.innerHTML = `<div class="row"><span class="key grow">${esc(LOC.key)}</span></div>
      <div class="hint">Enter this key on your other device (Settings → Sync → Join).</div>
      <div class="devs">${list}</div>
      <div class="hint" id="syncSt">${esc(syncStatus())}</div>
      <div class="row"><button class="btn small ghost" id="syNow">Sync devices</button>
        <button class="btn small toggle ${LOC.auto ? 'on' : ''}" id="syAuto">auto-sync</button>
        <button class="btn small ghost" id="syLeave" style="margin-left:auto">Remove key</button></div>
      <div class="hint">The device with the latest input wins.</div>`;
    box.querySelector('#syNow').onclick = async (e) => { e.target.disabled = true; await syncOnce(true); renderSync(box); };
    box.querySelector('#syAuto').onclick = () => { LOC.auto = !LOC.auto; persist(); if (LOC.auto) syncOnce(); renderSync(box); updDot(); };
    box.querySelector('#syLeave').onclick = () => { if (!confirm('Remove the sync key from this device? Your journey stays here.')) return; LOC.key = ''; LOC.last = ''; LOC.devs = {}; persist(); updDot(); renderSync(box); };
  } else {
    box.innerHTML = `<div class="hint">Keep Windows and Android in step. Create a key on one device and join with it on the other.</div>
      <div class="row"><button class="btn small" id="syNew">Create sync key</button></div>
      <div class="row"><input id="syKey" class="grow" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn small ghost" id="syJoin">Join</button></div>`;
    box.querySelector('#syNew').onclick = async () => { LOC.key = newSyncKey(); LOC.joining = false; LOC.last = ''; LOC.pub = ''; LOC.devs = {}; LOC.auto = true; persist(); await syncOnce(true); renderSync(box); };
    box.querySelector('#syJoin').onclick = async () => {
      const k = normKey(box.querySelector('#syKey').value);
      if (k.length !== 16) { toast('A sync key has 16 letters and numbers.'); return; }
      LOC.key = k.match(/.{4}/g).join('-'); LOC.joining = true; LOC.last = ''; LOC.pub = ''; LOC.devs = {}; LOC.auto = true; persist();
      await syncOnce(true); renderSync(box);
    };
  }
}

// ---------- sync: the device with the newest input wins ----------
let SY = { keys: null, keyFor: '', busy: false, err: '', at: 0, pubTimer: null };
const devName = () => (Native.platform === 'win' ? 'Windows' : Native.platform === 'android' ? 'Android' : 'Browser');
function syncStatus() { return 'Auto-sync: ' + (LOC.auto ? 'on' : 'off') + (SY.err ? ' · last sync failed' : SY.at ? ' · last checked ' + new Date(SY.at).toLocaleTimeString() : ''); }
function updDot() {
  const d = $('syncDot');
  d.className = 'sync-dot' + (LOC.key && LOC.auto ? (SY.err ? ' err' : ' on') : '');
  d.title = LOC.key ? syncStatus() : 'Sync off';
}
async function keys() { if (SY.keyFor !== LOC.key) { SY.keys = await syncKeys(LOC.key); SY.keyFor = LOC.key; } return SY.keys; }
function payload() { return { v: 2, dev: LOC.dev, name: devName(), edit: ST.edit || 0, st: ST }; }
function schedulePublish() { if (!LOC.key || !LOC.auto) return; clearTimeout(SY.pubTimer); SY.pubTimer = setTimeout(() => publish(), 1500); }
async function publish(force) {
  if (!LOC.key || !ST || !ST.snap.gen) return;
  const body = JSON.stringify(ST);
  if (!force && body === LOC.pub && now() - LOC.pubAt < 6 * HOUR) return;
  try {
    const k = await keys();
    let msg = await seal(k.aes, payload());
    if (msg.length > 3900) { ST.dead = ST.dead.slice(-8); ST.snap.fids = ST.snap.fids.slice(-8); msg = await seal(k.aes, payload()); }
    const r = await Native.http('POST', RELAY + k.topic, msg);
    if (r.status < 200 || r.status >= 300) throw new Error(r.status ? 'error ' + r.status : 'no connection');
    LOC.pub = body; LOC.pubAt = now(); persist(); SY.err = ''; SY.at = now();
  } catch (e) { SY.err = /no connection|^error \d+$/.test(String(e.message)) ? e.message : 'error'; }
  updDot();
}
// manual = "Sync devices": read everything the relay still holds, take the newest input, then send ours
async function syncOnce(manual) {
  if (!LOC.key || SY.busy || !ST) { updDot(); return; }
  if (!manual && !LOC.auto) { updDot(); return; }
  SY.busy = true;
  let took = null;
  try {
    const k = await keys();
    const r = await Native.http('GET', RELAY + k.topic + '/json?poll=1&since=' + (manual ? 'all' : LOC.last || 'all'));
    if (r.status !== 200) throw new Error(r.status ? 'error ' + r.status : 'no connection');
    let newest = null;
    LOC.devs = LOC.devs || {};
    for (const line of r.body.split('\n')) {
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.event !== 'message' || !m.message) continue;
      LOC.last = m.id;
      let p; try { p = await unseal(k.aes, m.message); } catch (e) { continue; }
      if (!p || !p.st || !p.st.snap || p.dev === LOC.dev) continue;
      const edit = p.edit || (p.st && p.st.edit) || (p.st.set && p.st.set.ts) || 0;
      const d = LOC.devs[p.dev] || {};
      LOC.devs[p.dev] = { name: p.name || d.name || 'Other device', seen: Math.max(d.seen || 0, m.time * 1000), edit: Math.max(d.edit || 0, edit) };
      if (!newest || edit >= newest.edit) newest = { edit, st: p.st, name: p.name || 'other device' };
    }
    if (newest) took = await takeRemote(newest);
    SY.err = ''; SY.at = now(); persist();
    if (!took) await publish(manual);
  } catch (e) { SY.err = /no connection|^error \d+$/.test(String(e.message)) ? e.message : 'error'; }
  SY.busy = false;
  updDot();
  if (manual) {
    const others = Object.keys(LOC.devs || {}).filter((d) => d !== LOC.dev).length;
    toast(SY.err ? 'Sync failed (' + SY.err + '). Check the internet connection.' : took ? 'Updated with the newer data from ' + took + '.' : others ? 'This device has the newest data. Sent it to your other devices.' : 'Sent. No other device has used this key yet.', 3500);
  }
}
// returns the source device name when the remote data replaced ours
async function takeRemote(nw) {
  const rs = nw.st;
  rs.set = Object.assign(defaultSettings(), rs.set || {});
  rs.events = rs.events || []; rs.dead = rs.dead || [];
  rs.edit = nw.edit;
  if (LOC.joining && ST.snap.gen && rs.snap.gen !== ST.snap.gen && (ST.events.length || ST.snap.folded || now() - ST.snap.start > DAY)) {
    // joining with a journey of our own: ask which one both devices keep
    const keepRemote = await chooseJourney(rs);
    LOC.joining = false;
    if (!keepRemote) { ST.edit = now(); persist(); await publish(true); return null; }
    ST = normalize(rs); persist(); applyTheme(ST.set.theme); render(); pushNotify();
    return nw.name;
  }
  LOC.joining = false;
  if ((rs.edit || 0) <= (ST.edit || 0) && ST.snap.gen) return null;   // ours is newer (or the same)
  ST = normalize(rs);
  persist(); applyTheme(ST.set.theme); render(); pushNotify();
  return nw.name;
}
function chooseJourney(rs) {
  return new Promise((done) => {
    const dl = derive(ST, now()), dr = derive(normalize(clone(rs)), now());
    openModal('choose', `${head('Two journeys found', false)}
      <div class="sec"><div class="hint">This device and the other device each have their own journey. Which one should both devices keep?</div>
      <div class="row"><button class="btn wide" id="chR">Other device: ${esc(fmtDur(dr.total))} sober</button></div>
      <div class="row"><button class="btn ghost wide" id="chL">This device: ${esc(fmtDur(dl.total))} sober</button></div></div>`, (sh) => {
      sh.querySelector('#chR').onclick = () => { closeModal(); done(true); };
      sh.querySelector('#chL').onclick = () => { closeModal(); done(false); };
    });
  });
}

// ---------- daily summary notification (native side schedules it) ----------
function pushNotify() {
  if (!ST) return;
  const s = ST.set, sn = derive(ST, now()).s;
  Native.notify({
    on: !!s.notify, h: s.nh, m: s.nm,
    start: sn.start, erased: sn.erased, streakStart: sn.streakStart, rates: rates(s), fmt: curFmt(s.cur),
    miles: MILESTONES.map((m) => [m[0], m[1]]),
  });
}

function notifBar() { $('notifBar').classList.toggle('hidden', !(ST && ST.set.notify && !Native.notifyAllowed())); }
window.__rslNotifChanged = () => notifBar();

// ---------- first run ----------
function openSetup() {
  const set = defaultSettings();
  const curOpts = CURRENCIES.map((c) => `<option value="${c[0]}" ${c[0] === set.cur ? 'selected' : ''}>${c[0]} — ${c[1]}</option>`).join('');
  openModal('setup', `${head('Welcome to your sober journey', false)}
    <div class="sec"><h3>When was your last drink?</h3>
      <input type="datetime-local" id="wT" value="${toLocalInput(now())}" max="${toLocalInput(now())}" style="width:100%">
      <div class="row"><label>Currency</label><select id="wCur" class="grow">${curOpts}</select></div>
      <div class="row"><label>Money spent on drinking per day</label>${moneyField('id="wMoney"', 0)}</div>
      <div class="row"><button class="btn wide" id="wGo">Start my journey</button></div></div>
    <div class="sec"><h3>Already using it on another device?</h3>
      <div class="row"><input id="wKey" class="grow" placeholder="Sync key XXXX-XXXX-XXXX-XXXX"><button class="btn ghost small" id="wJoin">Join</button></div></div>
    <div class="sec"><h3>Have a backup file?</h3>
      <div class="hint">${Native.platform === 'android' ? 'Your automatic backup is in Download/Random Sober Life.' : 'Pick a Random Sober Life backup (.json).'}</div>
      <div class="row"><button class="btn ghost small" id="wRestore">Restore from backup…</button></div></div>`, (sh) => {
    wireNums(sh);
    paintCur(sh, set.cur);
    sh.querySelector('#wCur').onchange = (e) => paintCur(sh, e.target.value);
    sh.querySelector('#wRestore').onclick = async () => { const text = await Native.backupOpen(); if (text) restoreFrom(text, false); };
    sh.querySelector('#wGo').onclick = () => {
      let t = fromLocalInput(sh.querySelector('#wT').value); if (!isFinite(t) || t > now()) t = now();
      set.cur = sh.querySelector('#wCur').value; set.daily = clamp(parseIn(sh.querySelector('#wMoney').value), 0, 1000000); set.ts = now();
      ST = newState(t, set); closeModal(); changed();
    };
    sh.querySelector('#wJoin').onclick = async () => {
      const k = normKey(sh.querySelector('#wKey').value);
      if (k.length !== 16) { toast('A sync key has 16 letters and numbers.'); return; }
      LOC.key = k.match(/.{4}/g).join('-'); LOC.last = ''; LOC.pub = ''; LOC.auto = true; LOC.devs = {};
      const tmp = newState(now(), set); tmp.snap.gen = 0; ST = tmp;   // placeholder that any remote journey replaces
      LOC.joining = false;
      await syncOnce();
      if (ST.snap.gen === 0) { ST = null; LOC.key = ''; toast(SY.err ? 'Sync failed: ' + SY.err : 'Nothing found for that key yet. Open the app on the other device and try again.', 4000); return; }
      closeModal(); persist(); render(); pushNotify(); toast('Joined. Your journey is here.');
    };
  });
}

// ---------- start ----------
(async function start() {
  VIEW.version = await Native.version().catch(() => '');
  $('appVer').textContent = VIEW.version ? VIEW.version.replace(/\.0$/, '') : '';
  let raw = null; try { raw = await Native.load(); } catch (e) {}
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j.loc) LOC = Object.assign(LOC, j.loc);
      if (j.st && j.st.snap) { ST = j.st; if (!ST.edit) ST.edit = (ST.set && ST.set.ts) || ST.snap.gen; ST.set = Object.assign(defaultSettings(), ST.set || {}); ST.events = ST.events || []; ST.dead = ST.dead || []; normalize(ST); }
    } catch (e) {}
  }
  { const td = dayNo(now()); if (LOC.oDay === td) { VIEW.qDay = VIEW.rDay = td; VIEW.qOff = LOC.qOff || 0; VIEW.rOff = LOC.rOff || 0; } }
  if (!ST) {
    const bk = await Native.findBackup();          // Windows: a reinstall finds its automatic backup
    if (bk) restoreFrom(bk, false);
  }
  if (QUICK) {
    if (!ST) { toast('Open Random Sober Life first to start your journey.', 3000); setTimeout(() => Native.close(), 3000); return; }
    applyTheme(ST.set.theme); render(); openDrinks();
    return;
  }
  if (!ST) openSetup(); else { applyTheme(ST.set.theme); render(); pushNotify(); }
  persist();
  // ask for notification permission only once the screen is up (asking at launch left the Allow button dead)
  setTimeout(() => { if (ST && ST.set.notify && !Native.notifyAllowed()) Native.askNotify(); notifBar(); }, 1500);
  $('notifOn').onclick = () => Native.openNotifySettings();
  setInterval(() => { if (!document.hidden && VIEW.modal !== 'settings') render(); }, 1000);
  updDot();
  syncOnce();
  setInterval(() => syncOnce(), 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); notifBar(); syncOnce(); } });
})();
