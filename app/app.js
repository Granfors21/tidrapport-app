'use strict';
const VERSION = '4.0.0';
const KEY = 'tidrapport.v2', KEY1 = 'tidrapport.v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

/* ================= Datum ================= */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (d, n) => { const x = typeof d === 'string' ? parse(d) : new Date(d); x.setDate(x.getDate() + n); return x; };
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(); return { year: y, week: Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) };
}
function mondayOf(year, week) { const j = new Date(year, 0, 4); const m = new Date(year, 0, 4 - (j.getDay() || 7) + 1); m.setDate(m.getDate() + (week - 1) * 7); return m; }
const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const dayName = s => DAYS[(parse(s).getDay() + 6) % 7];
const fmtDate = s => { const d = parse(s); return `${dayName(s).slice(0, 3).toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const nf = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });
const kr = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const h = n => nf.format(n || 0);

/* ================= Standardvärden ================= */
const a = (name, unit = '', price = '') => ({ id: uid(), name, unit, price });
const personAddons = () => [a('OB', 'h'), a('Övertid', 'h'), a('Restid', 'h'), a('Traktamente', 'st'), a('Beredskap', 'h')];
function defaultCategories() {
  return [
    { id: uid(), name: 'Lastbil', icon: '🚚', rate: '', km: true, addons: [a('Kran'), a('Släp'), a('Flak'), a('Tippsläp'), a('Maskinsläp'), a('Väntetid', 'h')] },
    { id: uid(), name: 'Grävmaskin', icon: '🏗️', rate: '', km: false, addons: [a('Rototilt'), a('Sorteringsgrip'), a('Hydraulhammare', 'h'), a('Planeringsskopa'), a('Tjälkrok'), a('Pallgafflar'), a('Maskinstyrning/GPS')] },
    { id: uid(), name: 'Lastmaskin', icon: '🚜', rate: '', km: false, addons: [a('Skopa'), a('Pallgafflar'), a('Snöblad', 'h'), a('Sopvals', 'h')] },
    { id: uid(), name: 'Traktorgrävare', icon: '🛞', rate: '', km: false, addons: [a('Hammare', 'h'), a('Sopvals', 'h'), a('Slåtteraggregat', 'h')] },
    { id: uid(), name: 'Anläggare', icon: '👷', rate: '', km: false, addons: personAddons() },
    { id: uid(), name: 'Maskinist', icon: '🧑‍🔧', rate: '', km: false, addons: personAddons() }
  ];
}
const DEFAULT_ARTICLES = [['Markvibrator', 'h'], ['Padda', 'h'], ['Laser', 'dagar'], ['Rotorlaser', 'dagar'], ['Skopa', 'st'], ['Planeringsskopa', 'st'], ['Kabelskopa', 'st'], ['Sorteringsskopa', 'st'], ['Elverk', 'h'], ['Pump', 'h'], ['Lyftstroppar', 'st']].map(([name, unit]) => ({ name, unit }));
const DEFAULT_MATERIALS = [['Diesel', 'l'], ['AdBlue', 'l'], ['Grus', 'ton'], ['Makadam', 'ton'], ['Sand', 'ton'], ['Kabel', 'm'], ['Rör', 'm']].map(([name, unit]) => ({ name, unit }));
const DEV_TYPES = [['sakerhet', 'Säkerhet/tillbud', '⛑️'], ['haveri', 'Maskinhaveri', '🔧'], ['vader', 'Väder', '🌧️'], ['vantetid', 'Väntetid', '⏳'], ['material', 'Material saknas', '📦'], ['ovrigt', 'Övrigt', '📝']];
const ATA_STATUS = [['begard', 'Begärd'], ['godkand', 'Godkänd'], ['fakturerad', 'Fakturerad']];
const UNITS = ['', 'h', 'st', 'km', 'l', 'm', 'ton'];
function defaultSettings() {
  return { company: '', name: '', rate: '', otLimit: 8, defBreak: 30, projects: ['Allmänt'], defaultProject: 'Allmänt', categories: defaultCategories(), materials: clone(DEFAULT_MATERIALS), articles: clone(DEFAULT_ARTICLES), lastCat: '', lock: false, recipients: '', subprojects: {}, gps: false };
}

/* ================= Lagring ================= */
function emptyDb() { return { v: 2, settings: defaultSettings(), rows: [], days: {}, devs: [], atas: [], extras: [] }; }
function migrateV1(d) {
  const db = emptyDb();
  Object.assign(db.settings, { company: d.settings.company ?? db.settings.company, name: d.settings.name || '', rate: d.settings.rate || '', otLimit: d.settings.otLimit || 8, projects: d.settings.projects?.length ? d.settings.projects : ['Allmänt'], defaultProject: d.settings.defaultProject || 'Allmänt' });
  for (const e of d.entries || []) {
    db.rows.push({ id: e.id || uid(), date: e.date, project: e.project || '', wo: '', categoryId: '', catName: 'Ej angiven', catIcon: '⏱️', hours: num(e.hours), addons: [], km: null, materials: [], note: e.note || '', imageIds: [], created: e.created || Date.now() });
    if (e.place) { db.days[e.date] = db.days[e.date] || {}; db.days[e.date].place = e.place; }
  }
  return db;
}
function normalize(d) {
  const db = { ...emptyDb(), ...d }; db.settings = { ...defaultSettings(), ...d.settings }; if (db.settings.setupDone === undefined) db.settings.setupDone = db.rows.length > 0 || (d.rows || []).length > 0;
  ['rows', 'devs', 'atas', 'extras'].forEach(k => db[k] = Array.isArray(db[k]) ? db[k] : []); db.extras = db.extras.filter(x => x.kind !== 'meal');
  db.atas.forEach(x => { if (x.status === 'beordrad' || x.status === 'utford') x.status = 'begard'; if (!x.type) x.type = 'tillagg'; }); db.days = db.days || {};
  Object.entries(db.days).forEach(([d, v]) => { if (v.imageIds && v.imageIds.length) { db.extras.push({ id: uid(), date: d, kind: 'photo', project: (db.rows.find(r => r.date === d) || {}).project || db.settings.defaultProject, sub: '', imageIds: v.imageIds, note: '', created: Date.now() }); v.imageIds = []; } });
  return ensureTeam(db);
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.settings) return normalize(d); } catch (e) { console.warn('load', e); try { const raw = localStorage.getItem(KEY); if (raw && !localStorage.getItem(KEY + '.bak')) localStorage.setItem(KEY + '.bak', raw); } catch (e2) {} }
  try { const d1 = JSON.parse(localStorage.getItem(KEY1)); if (d1 && d1.settings && Array.isArray(d1.entries)) { const m = migrateV1(d1); localStorage.setItem(KEY, JSON.stringify(m)); setTimeout(() => toast(`Gammal data flyttad (${m.rows.length} rader)`), 600); return m; } } catch (e) {}
  return emptyDb();
}
let db = ensureTeam(load());
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Kunde inte spara – lagringen är full. Ta backup och rensa gamla bilder.'); } }
if (db.settings.setupDone && localStorage.getItem(KEY)) save();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
const S = () => db.settings;
const catById = id => S().categories.find(c => c.id === id);

/* ================= Bilder (IndexedDB) ================= */
const thumbs = new Map();
const IDB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('tidrapport-bilder', 1); r.onupgradeneeded = () => r.result.createObjectStore('img', { keyPath: 'id' }); r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error); }); },
  run(mode, fn) { return new Promise((res, rej) => { const tx = this.db.transaction('img', mode); const st = tx.objectStore('img'); const r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); },
  put(o) { return this.run('readwrite', s => s.put(o)); },
  get(id) { return this.run('readonly', s => s.get(id)); },
  del(id) { return this.run('readwrite', s => s.delete(id)); },
  all() { return this.run('readonly', s => s.getAll()); },
  clear() { return this.run('readwrite', s => s.clear()); }
};
async function loadImgEl(file) {
  const url = URL.createObjectURL(file);
  try { const im = new Image(); im.src = url; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
function scaleTo(im, max, q) {
  const w = im.naturalWidth, hh = im.naturalHeight, r = Math.min(1, max / Math.max(w, hh));
  const c = document.createElement('canvas'); c.width = Math.round(w * r); c.height = Math.round(hh * r);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function addImages(files) {
  const ids = [];
  for (const f of files) {
    try {
      const im = await loadImgEl(f);
      const o = { id: uid(), full: scaleTo(im, 1600, 0.8), thumb: scaleTo(im, 320, 0.7), created: Date.now() };
      await IDB.put(o); thumbs.set(o.id, o.thumb); ids.push(o.id);
    } catch (e) { toast('Kunde inte läsa bilden'); console.warn(e); }
  }
  return ids;
}
function allRefs() { const s = new Set(); [...db.rows, ...db.devs, ...db.atas, ...db.extras, ...Object.values(db.days)].forEach(x => (x.imageIds || []).forEach(i => s.add(i))); [rd, dv, at].forEach(x => x && (x.imageIds || []).forEach(i => s.add(i))); return s; }
async function deleteImage(id) {
  [...db.rows, ...db.devs, ...db.atas, ...db.extras, ...Object.values(db.days), rd, dv, at].forEach(x => { if (x && x.imageIds) x.imageIds = x.imageIds.filter(i => i !== id); });
  save(); thumbs.delete(id); await IDB.del(id);
}
async function deleteImages(ids) { for (const id of ids || []) { thumbs.delete(id); await IDB.del(id); } }
function photoWidget(ctx, ids) {
  return `<div class="lbl">Bilder</div><div class="photobtns">
    <label>📷 Ta foto<input type="file" accept="image/*" capture="environment" data-photo="${ctx}"></label>
    <label>🖼️ Galleri<input type="file" accept="image/*" multiple data-photo="${ctx}"></label></div>
    <div class="photos" id="photos-${ctx}">${thumbsHtml(ids)}</div>`;
}
const thumbsHtml = ids => (ids || []).map(id => `<img src="${thumbs.get(id) || ''}" data-img="${id}" alt="Bild">`).join('');
const draftFor = ctx => ({ row: rd, dev: dv, ata: at }[ctx]);
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset.photo) return;
  const files = [...t.files]; t.value = ''; if (!files.length) return;
  toast('Sparar bild…');
  const ids = await addImages(files);
  if (t.dataset.photo === 'extra') { if (ids.length) { db.extras.push(stamp({ id: uid(), created: Date.now(), ...exBase(), kind: 'photo', imageIds: ids, note: '' })); save(); } renderSheet(); renderToday(); if (ids.length) toast(`${ids.length} foto sparat ✓`); return; }
  const d = draftFor(t.dataset.photo);
  d.imageIds = [...(d.imageIds || []), ...ids];
  const box = $('#photos-' + t.dataset.photo); if (box) box.innerHTML = thumbsHtml(d.imageIds);
  if (ids.length) toast(`${ids.length} bild${ids.length > 1 ? 'er' : ''} tillagd${ids.length > 1 ? 'a' : ''} ✓`);
});
let lbId = null;
async function openLightbox(id) { const o = await IDB.get(id); if (!o) return toast('Bilden finns inte'); lbId = id; $('#lbImg').src = o.full; $('#lightbox').classList.remove('hidden'); }
$('#lbClose').onclick = () => { $('#lightbox').classList.add('hidden'); $('#lbImg').src = ''; };
$('#lbDel').onclick = async () => { if (!confirm('Radera bilden?')) return; await deleteImage(lbId); $('#lbClose').onclick(); renderView(); toast('Bild raderad'); };

/* ================= Hjälp ================= */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1900); }
const projOptions = (val) => { const ps = [...S().projects]; if (val && !ps.includes(val)) ps.push(val); return ps.map(p => `<option${p === val ? ' selected' : ''}>${esc(p)}</option>`).join(''); };
const dayRows = d => db.rows.filter(r => r.date === d && mine(r)).sort((x, y) => (x.created || 0) - (y.created || 0));
const dayTotal = d => dayRows(d).reduce((s, r) => s + num(r.hours), 0);
const getDay = d => db.days[d] || {};
function setDay(d, patch) { db.days[d] = { ...getDay(d), ...patch }; save(); }
const addonText = r => (r.addons || []).map(x => x.unit ? `${x.name} ${h(x.qty)} ${x.unit}` : x.name).join(', ');
const statusLbl = s => (ATA_STATUS.find(x => x[0] === s) || [s, s])[1];
const devType = k => DEV_TYPES.find(x => x[0] === k) || DEV_TYPES[5];

/* ================= Idag ================= */
let cur = today();
let rd = null, dv = null, at = null;
let sheet = null, sheetMore = false, sheetAll = false, undoIds = null;
const longDate = s => { const d = parse(s); return `${dayName(s)} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function lastProjectFor(d) { const r = dayRows(d).slice(-1)[0] || [...db.rows].filter(mine).sort((x, y) => y.date.localeCompare(x.date) || (y.created || 0) - (x.created || 0))[0]; return r ? r.project : S().defaultProject; }
const prevWorkDay = d => [...new Set(db.rows.filter(mine).map(r => r.date))].filter(x => x < d).sort().pop();
function dateLabel(d) { const t = today(); if (d === t) return 'Idag'; if (d === ymd(addDays(t, -1))) return 'Igår'; if (d === ymd(addDays(t, 1))) return 'Imorgon'; return dayName(d); }
function addonOrder(cat) {
  const cnt = {}; db.rows.filter(r => r.categoryId === cat.id).forEach(r => (r.addons || []).forEach(x => cnt[x.id] = (cnt[x.id] || 0) + 1));
  return cat.addons.map((x, i) => ({ x, i, c: cnt[x.id] || 0 })).sort((p, q) => q.c - p.c || p.i - q.i).map(o => o.x);
}
const rowSub = r => [projSub(r), addonText(r), r.km && r.km.km ? r.km.km + ' km' : '', r.note].filter(Boolean).join(' · ');
function renderToday() {
  const rows = dayRows(cur), tot = dayTotal(cur), lim = num(S().otLimit) || 8, day = getDay(cur);
  const prev = prevWorkDay(cur), prevRows = prev ? dayRows(prev) : [];
  const w = isoWeek(parse(cur)), mon = mondayOf(w.year, w.week);
  const devs = db.devs.filter(x => x.date === cur && mine(x)), atas = db.atas.filter(x => x.date === cur && mine(x)), exs = dayExtras(cur);
  const wdays = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const wtot = wdays.reduce((s, d) => s + dayTotal(d), 0);
  $('#view-today').innerHTML = `
  <div class="dhead">
    <button class="nb" data-act="dPrev" aria-label="Föregående dag">‹</button>
    <label class="dl"><b id="dLabel">${dateLabel(cur)}</b><span>${longDate(cur)}</span><input type="date" id="dPick" value="${cur}" aria-label="Välj datum"></label>
    <button class="nb" data-act="dNext" aria-label="Nästa dag">›</button>
  </div>
  ${cur !== today() ? '<button class="link" data-act="dToday">← Till idag</button>' : ''}
  ${myTimer() ? (() => { const t = myTimer(), c = catById(t.categoryId) || { icon: '⏱️', name: 'Klocka' }; return `<div class="timer" id="timerCard"><div><i>${esc(c.icon)}</i><span><b>${esc(c.name)} pågår</b><small>start ${new Date(t.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · ${esc(t.project)}</small></span><em id="timerElapsed">${fmtElapsed(Date.now() - t.start)}</em></div><button class="stop" data-act="timerStop" id="stopBtn">■ Stoppa och spara</button></div>`; })() : ''}
  ${rows.length || devs.length || atas.length || exs.length ? `<div class="daycard">
      ${rows.length ? `<div class="dtot"><b id="dayTotal">${h(tot)} h</b><span>${tot > lim ? `<span class="ot">varav ${h(tot - lim)} h övertid</span>` : 'sparat ✓'}</span></div>` : ''}
      <ul class="rows" id="dayList">${rows.map(r => `<li><button class="rowbtn" data-act="rowEdit" data-v="${r.id}"><i>${r.catIcon || '⏱️'}</i><span><b>${esc(r.catName)}</b><small>${esc(rowSub(r))}${r.imageIds?.length ? ` · 📷${r.imageIds.length}` : ''}</small></span><em>${h(r.hours)}</em></button></li>`).join('')}
      ${exs.length ? `<li><button class="rowbtn" data-act="newExtra" id="exSummary"><i>＋</i><span><b>Tillägg</b><small>${esc(exs.map(x => extraIcon(x) + ' ' + extraLine(x)).join(' · '))}</small></span><em>${exs.length}</em></button></li>` : ''}
      ${devs.map(x => `<li><button class="rowbtn" data-act="devEdit" data-v="${x.id}"><i>⚠️</i><span><b>Avvikelse${x.status === 'fixed' ? ' ✓' : ''}</b><small>${esc(x.desc)}</small></span></button></li>`).join('')}
      ${atas.map(x => `<li><button class="rowbtn" data-act="ataEdit" data-v="${x.id}"><i>➕</i><span><b>${ataNo(x)} · ${ataTypeLbl(x.type)} · ${statusLbl(x.status)}</b><small>${esc(x.desc)}</small></span><em>${x.hours ? h(x.hours) : ''}</em></button></li>`).join('')}</ul>
      ${undoIds ? '<button class="link" data-act="undo" id="undoBtn">↶ Ångra</button>' : ''}
    </div>` : ''}
  ${!rows.length && prevRows.length ? `<button class="same" data-act="copyPrev" id="sameBtn"><b>${prev === ymd(addDays(cur, -1)) ? 'Samma som igår' : 'Samma som ' + fmtDate(prev)}</b><span>${h(dayTotal(prev))} h · ${esc([...new Set(prevRows.map(r => `${r.catIcon} ${r.catName}`))].join(' + '))} · ${esc([...new Set(prevRows.map(r => r.project))].join(', '))}</span></button>` : ''}
  ${!myTimer() && lastCatFor() ? (() => { const c = lastCatFor(), pj = lastProjectFor(cur); return `<button class="quickstart" data-act="timerQuick" id="quickStart">▶ Starta ${esc(c.icon)} ${esc(c.name)}<small>${esc(pj || '')}</small></button>`; })() : ''}
  <form class="quickin" id="quickForm" autocomplete="off"><input type="text" id="qIn" enterkeyhint="done" placeholder="🎤 Säg eller skriv: 8 h grävmaskin rototilt" aria-label="Säg eller skriv"><button type="submit" aria-label="Spara">OK</button></form>
  <div class="sect">${rows.length ? 'Lägg till mer' : prevRows.length ? 'Eller välj' : 'Vad har du kört?'}</div>
  <div class="cats" id="cats">${S().categories.map(c => `<button class="cat" data-act="cat" data-v="${c.id}"><i>${esc(c.icon)}</i>${esc(c.name)}</button>`).join('')}</div>
  <div class="tools">
    <button class="tool" data-act="newExtra" id="exBtn">＋<span>Tillägg</span></button>
    <button class="tool" data-act="newDev" id="devBtn">⚠️<span>Avvikelse</span></button>
    <button class="tool" data-act="newAta" id="ataBtn">➕<span>ÄTA</span></button>
  </div>
  <div class="sect">Vecka ${w.week} · <b>${h(wtot)} h</b></div>
  <ul class="week">${wdays.map(d => { const t = dayTotal(d); return `<li><button data-act="goDate" data-v="${d}" class="${d === cur ? 'on' : ''}"><span>${dayName(d).slice(0, 3)} ${parse(d).getDate()}/${parse(d).getMonth() + 1}</span><small>${esc([...new Set(dayRows(d).map(r => r.catIcon))].join(' '))}</small><b class="${t > lim ? 'ot' : ''}">${t ? h(t) : '–'}</b></button></li>`; }).join('')}</ul>`;
}
function goDate(d) { cur = d; undoIds = null; renderToday(); }
function copyPrev() {
  const prev = prevWorkDay(cur); if (!prev) return;
  const t = Date.now(); undoIds = [];
  dayRows(prev).forEach((r, i) => { const id = uid(); undoIds.push(id); db.rows.push(stamp({ ...clone(r), id, date: cur, imageIds: [], created: t + i, updated: undefined })); });
  const pd = getDay(prev); setDay(cur, { place: getDay(cur).place || pd.place || '', breakMin: getDay(cur).breakMin ?? num(S().defBreak) });
  save(); renderToday(); toast(`Sparat ${h(dayTotal(cur))} h ✓`);
}

/* ================= Bottenark ================= */
function openSheet(kind) {
  sheet = kind; sheetMore = false; sheetAll = false; renderSheet();
  $('#sheet').classList.remove('hidden'); document.body.classList.add('noscroll');
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: 1 }, '');
}
function closeSheet(fromPop) {
  if (!sheet) return; sheet = null; rd = dv = at = null;
  $('#sheet').classList.add('hidden'); document.body.classList.remove('noscroll');
  ex = null;
  if (!fromPop && history.state && history.state.sheet) history.back();
}
addEventListener('popstate', () => closeSheet(true));
function renderSheet() { if (!sheet) return; $('#sheetBody').innerHTML = { row: sheetRow, dev: sheetDev, ata: sheetAta, extra: sheetExtra, team: sheetTeam }[sheet](); if (sheet === 'team') fillQr(); }
const head = (icon, title, sub) => `<div class="sh-head"><i>${icon}</i><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><button class="x" data-act="close" aria-label="Stäng">✕</button></div>`;
function newRowDraft(catId) {
  const rem = (num(S().otLimit) || 8) - dayTotal(cur);
  const pj = lastProjectFor(cur);
  return { id: null, categoryId: catId, hours: rem > 0 ? rem : 2, project: pj, sub: lastSubFor(pj), wo: '', addons: {}, km: { km: '', from: '', to: '' }, materials: [], note: '', imageIds: [] };
}
function rowToDraft(r) {
  const ad = {}; (r.addons || []).forEach(x => ad[x.id] = x.unit ? x.qty : '');
  return { id: r.id, categoryId: r.categoryId, hours: r.hours, project: r.project, sub: r.sub || '', wo: r.wo || '', addons: ad, km: { km: '', from: '', to: '', ...(r.km || {}) }, materials: clone(r.materials || []), note: r.note || '', mh: r.mh || '', imageIds: [...(r.imageIds || [])] };
}
function sheetRow() {
  const cat = catById(rd.categoryId) || { name: (db.rows.find(r => r.id === rd.id) || {}).catName || 'Rad', icon: '⏱️', addons: [], km: false };
  const ordered = addonOrder(cat), top = ordered.slice(0, 4);
  const shown = sheetAll ? ordered : ordered.filter(x => top.includes(x) || x.id in rd.addons);
  const day = getDay(cur);
  return `${head(esc(cat.icon), esc(cat.name), `${esc(projSub(rd))} · ${fmtDate(cur)}`)}
  <div class="bighours"><button class="pm" data-act="hMinus" aria-label="Minska">−</button><div><b id="hOut">${h(rd.hours)}</b><span>timmar</span></div><button class="pm" data-act="hPlus" aria-label="Öka">+</button></div>
  <div class="quick">${[4, 6, 8, 10].map(v => `<button data-act="hSet" data-v="${v}" class="${num(rd.hours) === v ? 'sel' : ''}">${v}</button>`).join('')}</div>
  ${cat.addons.length ? `<div class="chips" id="addonChips">${shown.map(x => `<button class="chip ${x.id in rd.addons ? 'sel' : ''}" data-act="addon" data-v="${x.id}">${esc(x.name)}</button>`).join('')}${!sheetAll && ordered.length > shown.length ? `<button class="chip more" data-act="allAddons">Fler…</button>` : ''}</div>
  <div class="qtys">${cat.addons.filter(x => x.unit && x.id in rd.addons).map(x => `<div class="qty"><span>${esc(x.name)}</span><input type="number" inputmode="decimal" step="0.5" min="0" data-q="${x.id}" value="${rd.addons[x.id]}"><em>${x.unit}</em></div>`).join('')}</div>` : ''}
  <details id="more" ${sheetMore ? 'open' : ''}><summary>Mer${rd.imageIds.length ? ` · 📷${rd.imageIds.length}` : ''}${rd.note ? ' · ✎' : ''}</summary>
    <div class="grid2"><label>Projekt<select id="fProject">${projOptions(rd.project)}</select></label><label>Underprojekt<input type="text" id="fSub" list="subListR" value="${esc(rd.sub)}"></label></div><datalist id="subListR">${subOptions(rd.project).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    ${cat.km ? `<div class="lbl">Körjournal</div><div class="grid2"><input type="text" data-km="from" placeholder="Från" value="${esc(rd.km.from)}"><input type="text" data-km="to" placeholder="Till" value="${esc(rd.km.to)}"></div><div class="qty"><span>Körda km</span><input type="number" inputmode="decimal" data-km="km" value="${esc(rd.km.km)}" placeholder="0"><em>km</em></div>` : ''}
    <label>Maskintimmar <small class="muted">(tom = samma som förartid)</small><input type="number" inputmode="decimal" step="0.25" min="0" id="fMh" value="${esc(rd.mh || '')}" placeholder="${esc(String(rd.hours || ''))}"></label>
    <label>Anteckning<textarea id="fNote" rows="2" placeholder="Vad gjordes? (🎤 på tangentbordet)">${esc(rd.note)}</textarea></label>
    ${photoWidget('row', rd.imageIds)}
    <label>Arbetsorder<input type="text" id="fWo" value="${esc(rd.wo)}" placeholder="AO-nummer"></label>
    <div class="lbl">Material</div>
    <div id="matList">${rd.materials.map((m, i) => `<div class="qty"><span>${esc(m.name)}</span><input type="number" inputmode="decimal" data-mat="${i}" value="${esc(m.qty)}"><em>${esc(m.unit)}</em><button class="mini" data-act="matDel" data-v="${i}" aria-label="Ta bort">✕</button></div>`).join('')}</div>
    <div class="chips">${S().materials.map((m, i) => `<button class="chip" data-act="matAdd" data-v="${i}">+ ${esc(m.name)}</button>`).join('')}</div>
    <div class="lbl">Plats (för hela dagen)</div>
    <div class="row"><input type="text" id="dPlace" placeholder="Plats" value="${esc(day.place || '')}">${S().gps ? '<button class="mini wide" data-act="gps" aria-label="Hämta GPS">📍</button>' : ''}</div>
    ${day.gps ? `<small class="muted">📍 ${day.gps.lat.toFixed(5)}, ${day.gps.lng.toFixed(5)}</small>` : ''}
  </details>
  <button class="primary" data-act="rowSave" id="saveBtn">Spara</button>
  ${!rd.id ? '<button class="startbtn" data-act="timerStart" id="startBtn">▶ Starta klocka</button>' : ''}
  ${rd.id ? '<button class="del" data-act="rowDel" id="rowDel">Ta bort raden</button>' : ''}`;
}
function setHours(v) { rd.hours = Math.max(0, Math.min(24, Math.round(num(v) * 2) / 2)); $('#hOut').textContent = h(rd.hours); $$('#sheetBody .quick button').forEach(b => b.classList.toggle('sel', num(b.dataset.v) === rd.hours)); }
function saveRow() {
  const cat = catById(rd.categoryId), old = rd.id && db.rows.find(r => r.id === rd.id);
  if (!(num(rd.hours) > 0)) return toast('Ange timmar');
  const addons = cat ? cat.addons.filter(x => x.id in rd.addons).map(x => ({ id: x.id, name: x.name, unit: x.unit, qty: x.unit ? num(rd.addons[x.id]) : 1, price: x.price })) : (old ? old.addons : []);
  const km = cat && cat.km && (rd.km.km || rd.km.from || rd.km.to) ? { km: num(rd.km.km), from: rd.km.from.trim(), to: rd.km.to.trim() } : null;
  const data = { date: cur, project: rd.project, sub: (rd.sub || '').trim(), wo: rd.wo.trim(), categoryId: cat ? cat.id : old.categoryId, catName: cat ? cat.name : old.catName, catIcon: cat ? cat.icon : old.catIcon, hours: num(rd.hours), addons, km, materials: rd.materials.filter(m => num(m.qty) > 0).map(m => ({ ...m, qty: num(m.qty) })), note: rd.note.trim(), mh: num(rd.mh) > 0 && num(rd.mh) !== num(rd.hours) ? num(rd.mh) : '', imageIds: rd.imageIds };
  if (old) Object.assign(old, data, { updated: Date.now() }); else db.rows.push(stamp({ id: uid(), created: Date.now(), ...data }));
  if (cat) S().lastCat = cat.id;
  if (getDay(cur).breakMin === undefined) db.days[cur] = { ...getDay(cur), breakMin: num(S().defBreak) };
  save(); undoIds = null; closeSheet(); renderToday(); toast(`Sparat ${h(data.hours)} h ✓`);
}

/* ---- avvikelse / ÄTA ---- */
const newDev = () => ({ id: null, date: cur, project: lastProjectFor(cur), type: 'ovrigt', desc: '', hours: '', status: 'open', imageIds: [] });
function sheetDev() {
  return `${head('⚠️', dv.id ? 'Ändra avvikelse' : 'Avvikelse', fmtDate(dv.date))}
  <textarea id="dvDesc" rows="4" placeholder="Vad hände? Tryck 🎤 på tangentbordet för att prata.">${esc(dv.desc)}</textarea>
  ${photoWidget('dev', dv.imageIds)}
  <details id="more" ${sheetMore ? 'open' : ''}><summary>Mer (typ, timmar, status)</summary>
    <div class="chips">${DEV_TYPES.map(([k, n, i]) => `<button class="chip ${dv.type === k ? 'sel' : ''}" data-act="devType" data-v="${k}">${i} ${n}</button>`).join('')}</div>
    <div class="grid2"><label>Påverkade timmar<input type="number" inputmode="decimal" step="0.5" id="dvHours" value="${esc(dv.hours)}" placeholder="0"></label><label>Datum<input type="date" id="dvDate" value="${dv.date}"></label></div>
    <label>Projekt<select id="dvProject">${projOptions(dv.project)}</select></label>
    <div class="seg"><button data-act="devStatus" data-v="open" class="${dv.status === 'open' ? 'on' : ''}">Öppen</button><button data-act="devStatus" data-v="fixed" class="${dv.status === 'fixed' ? 'on' : ''}">Åtgärdad</button></div>
  </details>
  <button class="primary" data-act="devSave" id="devSave">Spara</button>
  ${dv.id ? '<button class="del" data-act="devDel">Ta bort</button>' : ''}`;
}
function saveDev() {
  if (!dv.desc.trim() && !dv.imageIds.length) return toast('Skriv något eller ta en bild');
  const data = { date: dv.date || cur, project: dv.project, type: dv.type, desc: dv.desc.trim(), hours: num(dv.hours), status: dv.status, imageIds: dv.imageIds };
  if (dv.id) Object.assign(db.devs.find(x => x.id === dv.id), data, { updated: Date.now() }); else db.devs.push(stamp({ id: uid(), created: Date.now(), ...data }));
  save(); closeSheet(); renderView(); toast('Avvikelse sparad ✓');
}
const ATA_TYPES = [['tillagg', 'Tillägg'], ['andring', 'Ändring'], ['avgaende', 'Avgående']];
const ataTypeLbl = k => (ATA_TYPES.find(x => x[0] === k) || ATA_TYPES[0])[1];
const ataNo = x => `ÄTA-${x.nr}`;
const ataArtText = x => (x.articles || []).map(a => `${a.name} ${h(a.qty)} ${a.unit}`).concat(x.material ? [x.material] : []).join(', ');
const newAta = () => { const pj = lastProjectFor(cur); return { id: null, date: cur, project: pj, sub: lastSubFor(pj), type: 'tillagg', desc: '', orderedBy: '', hours: '', categoryId: (dayRows(cur).slice(-1)[0] || {}).categoryId || (catById(S().lastCat) || {}).id || '', articles: {}, material: '', amount: '', status: 'begard', imageIds: [] }; };
const nextStatus = s => ATA_STATUS[(Math.max(0, ATA_STATUS.findIndex(x => x[0] === s)) + 1) % ATA_STATUS.length][0];
function sheetAta() {
  const arts = artOrder();
  return `${head('➕', at.id ? `Ändra ${ataNo(at)}` : 'Ny ÄTA', `${esc(projSub(at))} · ${fmtDate(at.date)}`)}
  <div class="seg" id="ataType">${ATA_TYPES.map(([k, n]) => `<button data-act="ataType" data-v="${k}" class="${at.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  <textarea id="atDesc" rows="3" placeholder="Kort beskrivning – tryck 🎤 på tangentbordet för att prata." style="margin-top:10px">${esc(at.desc)}</textarea>
  <button class="statusbtn st-${at.status}" data-act="ataStatusCycle" id="ataStatusBtn">Status: <b>${statusLbl(at.status)}</b> <span>↻</span></button>
  ${photoWidget('ata', at.imageIds)}
  <details id="more" ${sheetMore ? 'open' : ''}><summary>Mer (beställt av, timmar, artiklar)</summary>
    <label>Beställt av<input type="text" id="atBy" value="${esc(at.orderedBy)}" placeholder="Namn (valfritt)"></label>
    <div class="grid2"><label>Timmar<input type="number" inputmode="decimal" step="0.5" id="atHours" value="${esc(at.hours)}" placeholder="0"></label><label>Maskin<select id="atCat"><option value="">–</option>${S().categories.map(c => `<option value="${c.id}"${c.id === at.categoryId ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="lbl">Artiklar</div>
    <div class="chips">${arts.map(a => `<button class="chip ${a.name in at.articles ? 'sel' : ''}" data-act="ataArt" data-v="${esc(a.name)}">${esc(a.name)}</button>`).join('')}</div>
    <div class="qtys">${arts.filter(a => a.name in at.articles).map(a => `<div class="qty"><span>${esc(a.name)}</span><input type="number" inputmode="decimal" data-ataq="${esc(a.name)}" value="${at.articles[a.name]}"><em>${esc(a.unit)}</em></div>`).join('')}</div>
    <label>Material<input type="text" id="atMat" value="${esc(at.material)}" placeholder="t.ex. 6 ton makadam"></label>
    <div class="grid2"><label>Projekt<select id="atProject">${projOptions(at.project)}</select></label><label>Underprojekt<input type="text" id="atSub" list="subListA" value="${esc(at.sub)}"></label></div>
    <datalist id="subListA">${subOptions(at.project).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="grid2"><label>Datum<input type="date" id="atDate" value="${at.date}"></label><label>Belopp kr<input type="number" inputmode="decimal" id="atAmount" value="${esc(at.amount)}" placeholder="annars timpris"></label></div>
  </details>
  <button class="primary" data-act="ataSave" id="ataSave">Spara</button>
  ${at.id ? '<button class="del" data-act="ataDel">Ta bort</button>' : ''}`;
}
function ataToDraft(x) { const ar = {}; (x.articles || []).forEach(a => ar[a.name] = a.qty); return { ...clone(x), sub: x.sub || '', type: x.type || 'tillagg', hours: x.hours || '', amount: x.amount ?? '', articles: ar, material: x.material || '' }; }
function saveAta() {
  if (!at.desc.trim() && !at.imageIds.length) return toast('Skriv något eller ta en bild');
  const c = catById(at.categoryId);
  const articles = Object.keys(at.articles).map(n => ({ name: n, qty: num(at.articles[n]), unit: (S().articles.find(a => a.name === n) || { unit: 'st' }).unit }));
  const data = { date: at.date || cur, project: at.project, sub: (at.sub || '').trim(), type: at.type, desc: at.desc.trim(), orderedBy: at.orderedBy.trim(), hours: num(at.hours), categoryId: at.categoryId, catName: c ? c.name : '', articles, material: at.material.trim(), amount: at.amount === '' ? '' : num(at.amount), status: at.status, imageIds: at.imageIds };
  if (at.id) Object.assign(db.atas.find(x => x.id === at.id), data, { updated: Date.now() });
  else db.atas.push(stamp({ id: uid(), nr: db.atas.filter(x => x.project === data.project).reduce((m, x) => Math.max(m, x.nr || 0), 0) + 1, created: Date.now(), ...data }));
  save(); closeSheet(); renderView(); toast('ÄTA sparad ✓');
}

/* ================= Tillägg: foto och artiklar ================= */
let ex = null;
const dayExtras = d => db.extras.filter(x => x.date === d && mine(x)).sort((a, b) => (a.created || 0) - (b.created || 0));
const extraIcon = x => ({ article: '🧰', photo: '📷' }[x.kind] || '＋');
const extraLine = x => x.kind === 'article' ? `${x.name} ${h(x.qty)} ${x.unit}${x.note ? ` · ${x.note}` : ''}` : `${(x.imageIds || []).length} foto${x.note ? ` · ${x.note}` : ''}`;
const projSub = x => (x.project || '') + (x.sub ? ' / ' + x.sub : '');
function lastSubFor(p) { const x = [...db.extras, ...db.rows].filter(y => y.project === p && y.sub).sort((a, b) => (b.created || 0) - (a.created || 0))[0]; return x ? x.sub : ''; }
const subOptions = p => [...new Set([...((S().subprojects || {})[p] || []), ...[...db.rows, ...db.extras, ...db.atas].filter(y => y.project === p && y.sub).map(y => y.sub)])];
function newEx(mode = 'photo', project, sub) { const p = project ?? lastProjectFor(cur); return { mode, project: p, sub: sub ?? lastSubFor(p), editId: null, arts: {}, artNote: '' }; }
function artOrder() { const cnt = {}; db.extras.filter(x => x.kind === 'article').forEach(x => cnt[x.name] = (cnt[x.name] || 0) + 1); return S().articles.map((a, i) => ({ a, i, c: cnt[a.name] || 0 })).sort((p, q) => q.c - p.c || p.i - q.i).map(o => o.a); }
const artDefault = a => a.unit === 'h' ? (dayTotal(cur) || 8) : 1;
function sheetExtra() {
  const items = dayExtras(cur);
  const mb = (k, i, n) => `<button data-act="exMode" data-v="${k}" class="${ex.mode === k ? 'on' : ''}">${i} ${n}</button>`;
  let body = '';
  if (ex.mode === 'photo') body = `<div class="photobtns"><label>📷 Ta foto<input type="file" accept="image/*" capture="environment" data-photo="extra"></label><label>🖼️ Galleri<input type="file" accept="image/*" multiple data-photo="extra"></label></div><p class="muted small">Sparas direkt på ${esc(projSub(ex))}.</p>`;
  if (ex.mode === 'article') {
    const arts = artOrder();
    body = `<div class="chips" id="artChips">${arts.map(a => `<button class="chip ${a.name in ex.arts ? 'sel' : ''}" data-act="exArt" data-v="${esc(a.name)}">${esc(a.name)}</button>`).join('')}<button class="chip more" data-act="exArtNew" id="artNew">+ Ny</button></div>
    <div class="qtys">${arts.filter(a => a.name in ex.arts).map(a => `<div class="qty"><span>${esc(a.name)}</span><button class="mini" data-act="exArtQ" data-v="${esc(a.name)}" data-d="-1" aria-label="Minska">−</button><input type="number" inputmode="decimal" style="width:80px" data-artq="${esc(a.name)}" value="${ex.arts[a.name]}"><em>${esc(a.unit)}</em><button class="mini" data-act="exArtQ" data-v="${esc(a.name)}" data-d="1" aria-label="Öka">+</button></div>`).join('')}</div>
    <input type="text" id="exArtNote" value="${esc(ex.artNote)}" placeholder="Notering (valfritt)" style="margin-top:8px">
    <button class="primary" data-act="exSaveArt" id="exSaveArt">${ex.editId ? 'Spara ändring' : 'Spara artiklar'}</button>`;
  }
  return `${head('＋', 'Tillägg', `${fmtDate(cur)} · foto och artiklar`)}
  <div class="grid2"><select id="exProject" aria-label="Projekt">${projOptions(ex.project)}</select><input type="text" id="exSub" list="subList" value="${esc(ex.sub)}" placeholder="Underprojekt" aria-label="Underprojekt"></div>
  <datalist id="subList">${subOptions(ex.project).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
  <div class="seg" style="margin-top:10px">${mb('photo', '📷', 'Foto')}${mb('article', '🧰', 'Artiklar')}</div>
  <div class="exbody">${body}</div>
  ${ex.editId ? '<button class="del" data-act="exDel" id="exDel">Ta bort</button><button class="ghost" data-act="exCancel">Avbryt ändring</button>' : ''}
  ${items.length ? `<div class="sect">Tillagt ${fmtDate(cur)}</div><ul class="rows" id="exList">${items.map(x => `<li><button class="rowbtn" data-act="exEdit" data-v="${x.id}"><i>${extraIcon(x)}</i><span><b>${esc(extraLine(x))}</b><small>${esc(projSub(x))}</small></span></button>${x.kind === 'photo' ? `<div class="photos" style="margin:0 0 8px 46px">${thumbsHtml(x.imageIds)}</div>` : ''}</li>`).join('')}</ul>` : ''}`;
}
function resetEx() { ex = newEx(ex.mode, ex.project, ex.sub); renderSheet(); renderToday(); }
const exBase = () => ({ date: cur, project: ex.project, sub: ex.sub.trim() });
function saveArts() {
  const names = Object.keys(ex.arts); if (!names.length) return toast('Välj en artikel');
  const t = Date.now();
  names.forEach((n, i) => {
    const a = S().articles.find(x => x.name === n) || { unit: 'st' };
    const data = { ...exBase(), kind: 'article', name: n, qty: num(ex.arts[n]), unit: a.unit, note: ex.artNote.trim() };
    if (i === 0 && ex.editId) Object.assign(db.extras.find(x => x.id === ex.editId), data, { updated: t }); else db.extras.push(stamp({ id: uid(), created: t + i, ...data }));
  });
  save(); resetEx(); toast(`${names.length} ${names.length > 1 ? 'artiklar' : 'artikel'} sparad${names.length > 1 ? 'e' : ''} ✓`);
}
function editExtra(id) {
  const x = db.extras.find(y => y.id === id); if (!x) return;
  ex = newEx(x.kind, x.project, x.sub || ''); ex.editId = id;
  if (x.kind === 'article') { ex.arts = { [x.name]: x.qty }; ex.artNote = x.note || ''; }
  renderSheet();
}

/* ================= Vecka ================= */
function renderWeek() {
  const r = range(), R = report(r.from, r.to), lim = R.lim;
  const dates = []; for (let d = r.from; d <= r.to; d = ymd(addDays(d, 1))) dates.push(d);
  const dTot = d => R.rows.filter(x => x.date === d).reduce((s2, x) => s2 + num(x.hours), 0);
  const shownDates = repMode === 'week' ? dates : dates.filter(d => dTot(d) > 0);
  const ppl = people(), owner = !db.company || db.company.role === 'owner';
  $('#view-week').innerHTML = `
  <div class="seg small"><button data-act="repMode" data-v="week" class="${repMode === 'week' ? 'on' : ''}">Vecka</button><button data-act="repMode" data-v="month" class="${repMode === 'month' ? 'on' : ''}">Månad</button></div>
  <div class="dhead"><button class="nb" data-act="repPrev" aria-label="Föregående">‹</button><div class="dl"><b id="repLabel">${r.label}</b><span>${r.sub}</span></div><button class="nb" data-act="repNext" aria-label="Nästa">›</button></div>
  <div class="bigtot"><b id="repTotal">${h(R.total)}</b><span>timmar</span>${R.ot ? `<em class="ot" id="repOt">varav ${h(R.ot)} h övertid</em>` : '<em id="repOt"></em>'}</div>
  ${ppl.length > 1 ? `<select id="personSel" class="personsel" aria-label="Person"><option value="all">👥 Alla (${ppl.length})</option>${ppl.map(p => `<option value="${p.id}"${p.id === personFilter ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
  <ul class="week">${shownDates.map(d => { const t = dTot(d); return `<li><button data-act="openDay" data-v="${d}"><span>${dayName(d).slice(0, 3)} ${parse(d).getDate()}/${parse(d).getMonth() + 1}</span><small>${esc([...new Set(R.rows.filter(x => x.date === d).map(r => r.catIcon + ' ' + r.catName))].join(', '))}</small><b class="${(R.perDay.find(x => x.date === d) || {}).ot > 0 ? 'ot' : ''}">${t ? h(t) : '–'}</b></button></li>`; }).join('') || '<li class="empty">Inga timmar.</li>'}</ul>
  <button class="primary" data-act="sendWeek" id="sendBtn">📧 Skicka ${repMode === 'week' ? 'veckorapport' : 'månadsrapport'}</button>
  ${S().recipients ? `<p class="muted small center" id="recips">Till: ${esc(S().recipients)}</p>` : '<p class="muted small center">Tips: ange mottagare under ⚙ → E-post.</p>'}
  <div class="grid2"><button class="secondary" data-act="pdfDownload" id="pdfBtn">⬇ Spara PDF</button><button class="secondary" data-act="print" id="printBtn">🖨 Skriv ut</button></div>
  ${!owner ? '<button class="secondary" data-act="sendOwner" id="sendOwnerW">📤 Skicka mina poster till ägaren</button>' : ''}
  ${R.devs.length || R.atas.length ? `<div class="sect">Avvikelser och ÄTA</div><ul class="rows">${R.devs.map(x => `<li><button class="rowbtn" data-act="devEdit" data-v="${x.id}"><i>⚠️</i><span><b>${fmtDate(x.date)} · ${x.status === 'open' ? 'Öppen' : 'Åtgärdad'}</b><small>${esc(x.desc)}</small></span></button></li>`).join('')}${R.atas.map(x => `<li><button class="rowbtn" data-act="ataEdit" data-v="${x.id}"><i>➕</i><span><b>${ataNo(x)} · ${ataTypeLbl(x.type)} · ${statusLbl(x.status)}</b><small>${esc(x.desc)}</small></span><em>${x.hours ? h(x.hours) : ''}</em></button></li>`).join('')}</ul>` : ''}
  ${R.arts.length || R.photosEx.length ? `<div class="sect">Tillägg</div><ul class="week" id="weekExtras">${R.artSum.map(a => `<li><div class="wl"><span>🧰 ${esc(a.name)}</span><b>${h(a.qty)} ${esc(a.unit)}</b></div></li>`).join('')}${R.photosEx.length ? `<li><div class="wl"><span>📷 Foton</span><b>${R.photosEx.reduce((s, x) => s + x.imageIds.length, 0)}</b></div></li>` : ''}</ul>` : ''}
  ${R.cats.length ? `<details><summary>Detaljer per maskin och tillägg</summary>${catTable(R, R.amount > 0 || R.ataSum > 0)}${R.km ? `<p>Körda km: <b>${h(R.km)}</b></p>` : ''}${R.mats.length ? `<table><tbody>${R.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${h(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}</details>` : ''}`;
}
function shareText(r, R) {
  return `${r.title}\n${S().name ? S().name + ', ' : ''}${S().company}\nTotalt ${h(R.total)} h${R.ot ? ` (varav övertid ${h(R.ot)} h)` : ''}\n\n` +
    R.perDay.map(d => `${dayName(d.date).slice(0, 3)} ${d.date}: ${h(d.total)} h – ${[...new Set(R.rows.filter(x => x.date === d.date).map(x => x.catName + (x.addons.length ? ` (${addonText(x)})` : '')))].join(', ')}`).join('\n') +
    (R.artSum.length ? `\n\nArtiklar: ${R.artSum.map(a => `${a.name} ${h(a.qty)} ${a.unit}`).join(', ')}` : '') +
    (R.devs.length ? `\n\nAvvikelser: ${R.devs.length}` : '') + (R.atas.length ? `\n\nÄTA:\n${R.atas.map(x => `${ataNo(x)} ${ataTypeLbl(x.type)}, ${statusLbl(x.status)}, ${h(x.hours)} h${x.catName ? ' ' + x.catName : ''} – ${x.desc}`).join('\n')}` : '');
}
async function share() {
  const r = range(), R = report(r.from, r.to), text = shareText(r, R);
  try {
    const file = new File([toCSV(r.from, r.to)], `tidrapport-${r.from}.csv`, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title: r.title, text, files: [file] });
    else if (navigator.share) await navigator.share({ title: r.title, text });
    else { await navigator.clipboard.writeText(text); toast('Kopierat – klistra in i sms/mejl'); }
  } catch (e) { if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); toast('Kopierat – klistra in i sms/mejl'); } catch (e2) { toast('Kunde inte dela'); } } }
}

/* ================= Rapporter ================= */
let repMode = 'week', wk = isoWeek(new Date()), mo = { y: new Date().getFullYear(), m: new Date().getMonth() };
function range() {
  if (repMode === 'week') { const m = mondayOf(wk.year, wk.week); return { from: ymd(m), to: ymd(addDays(m, 6)), title: `Veckorapport vecka ${wk.week}, ${wk.year}`, label: `Vecka ${wk.week}, ${wk.year}`, sub: `${fmtDate(ymd(m))} – ${fmtDate(ymd(addDays(m, 6)))}` }; }
  const f = new Date(mo.y, mo.m, 1), t = new Date(mo.y, mo.m + 1, 0);
  return { from: ymd(f), to: ymd(t), title: `Månadsrapport ${MONTHS[mo.m]} ${mo.y}`, label: `${MONTHS[mo.m][0].toUpperCase()}${MONTHS[mo.m].slice(1)} ${mo.y}`, sub: `${ymd(f)} – ${ymd(t)}` };
}
function rateFor(catId) { const c = catById(catId); return num(c && c.rate) || num(S().rate); }
function addonAmount(x) { return num(x.price) * (x.unit ? num(x.qty) : 1); }
const mhOf = r => num(r.mh) > 0 ? num(r.mh) : num(r.hours);
function rowAmount(r) { return mhOf(r) * rateFor(r.categoryId) + (r.addons || []).reduce((s, x) => s + addonAmount(x), 0); }
function ataAmount(x) { const v = x.amount !== '' && x.amount != null ? num(x.amount) : num(x.hours) * rateFor(x.categoryId); return x.type === 'avgaende' ? -Math.abs(v) : v; }
function report(from, to) {
  const inR = d => d >= from && d <= to;
  const rows = db.rows.filter(r => inR(r.date) && pf(r)).sort((x, y) => x.date.localeCompare(y.date) || (x.created || 0) - (y.created || 0));
  const lim = num(S().otLimit) || 8;
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const perDay = dates.map(d => { const dr = rows.filter(r => r.date === d), t = dr.reduce((s, r) => s + num(r.hours), 0), bp = {}; dr.forEach(r => bp[r.by || ''] = (bp[r.by || ''] || 0) + num(r.hours)); return { date: d, total: t, ot: Object.values(bp).reduce((s, v) => s + Math.max(0, v - lim), 0), day: getDay(d) }; });
  const cats = {};
  rows.forEach(r => {
    const k = r.catName; const c = cats[k] = cats[k] || { name: r.catName, icon: r.catIcon, hours: 0, amount: 0, addons: {} };
    c.hours += mhOf(r); c.amount += mhOf(r) * rateFor(r.categoryId);
    (r.addons || []).forEach(x => { const ak = x.name + '|' + x.unit; const A = c.addons[ak] = c.addons[ak] || { name: x.name, unit: x.unit, count: 0, qty: 0, amount: 0 }; A.count++; A.qty += num(x.qty); A.amount += addonAmount(x); c.amount += addonAmount(x); });
  });
  const proj = {}; rows.forEach(r => proj[r.project || '–'] = (proj[r.project || '–'] || 0) + num(r.hours));
  const mats = {}; rows.forEach(r => (r.materials || []).forEach(m => { const k = m.name + '|' + m.unit; mats[k] = mats[k] || { name: m.name, unit: m.unit, qty: 0 }; mats[k].qty += num(m.qty); }));
  const trips = rows.filter(r => r.km && (r.km.km || r.km.from)); const km = trips.reduce((s, r) => s + num(r.km.km), 0);
  const devs = db.devs.filter(x => inR(x.date) && pf(x)).sort((x, y) => x.date.localeCompare(y.date));
  const atas = db.atas.filter(x => inR(x.date) && pf(x)).sort((x, y) => x.date.localeCompare(y.date));
  const total = rows.reduce((s, r) => s + num(r.hours), 0), ot = perDay.reduce((s, d) => s + d.ot, 0);
  const amount = rows.reduce((s, r) => s + rowAmount(r), 0), ataSum = atas.reduce((s, x) => s + ataAmount(x), 0);
  const exs = db.extras.filter(x => inR(x.date) && pf(x)).sort((x, y) => x.date.localeCompare(y.date) || (x.created || 0) - (y.created || 0));
  const arts = exs.filter(x => x.kind === 'article'), photosEx = exs.filter(x => x.kind === 'photo');
  const artSum = {}; arts.forEach(x => { const k = x.name + '|' + x.unit; artSum[k] = artSum[k] || { name: x.name, unit: x.unit, qty: 0, n: 0 }; artSum[k].qty += num(x.qty); artSum[k].n++; });
  return { arts, photosEx, artSum: Object.values(artSum), rows, perDay, cats: Object.values(cats), proj, mats: Object.values(mats), trips, km, devs, atas, total, ot, lim, amount, ataSum, breakMin: perDay.reduce((s, d) => s + num(d.day.breakMin), 0) };
}
function catTable(R, money) {
  return `<table><thead><tr><th>Resurs / tillägg</th><th class="n">Antal</th><th class="n">Maskintimmar</th>${money ? '<th class="n">Belopp</th>' : ''}</tr></thead><tbody>${R.cats.map(c => `<tr><td><b>${esc(c.icon || '')} ${esc(c.name)}</b></td><td></td><td class="n"><b>${h(c.hours)}</b></td>${money ? `<td class="n"><b>${kr.format(c.amount)}</b></td>` : ''}</tr>${Object.values(c.addons).map(A => `<tr><td style="padding-left:22px">${esc(A.name)}</td><td class="n">${A.count} ggr</td><td class="n">${A.unit ? `${h(A.qty)} ${A.unit}` : ''}</td>${money ? `<td class="n">${A.amount ? kr.format(A.amount) : ''}</td>` : ''}</tr>`).join('')}`).join('')}<tr class="tot"><td>Totalt</td><td></td><td class="n">${h(R.total)}</td>${money ? `<td class="n">${kr.format(R.amount)}</td>` : ''}</tr></tbody></table>`;
}
function printHtml(r, R) {
  const s = S(), money = R.amount > 0 || R.ataSum > 0;
  const th = ids => ids && ids.length ? `<div class="thumbs">${ids.map(id => `<img src="${thumbs.get(id) || ''}" alt="">`).join('')}</div>` : '';
  const sigs = R.perDay.filter(d => d.day.signature);
  return `<div class="rep">
  <div class="rep-head"><div class="rep-logo">${esc(s.company || 'Tidrapport')}</div><div class="rep-meta">${s.name ? esc(s.name) + '<br>' : ''}Utskriven ${today()}</div></div>
  <h1>${esc(r.title)}</h1><div style="color:#555">${r.sub} · ${h(R.total)} h totalt${R.ot ? ` · varav övertid ${h(R.ot)} h` : ''}</div>
  <h2>Dagbok</h2>
  <table><thead><tr><th>Datum</th><th>Projekt</th><th>Resurs</th><th>Tillägg / utrustning</th><th>Notering</th><th class="n">Tim</th></tr></thead><tbody>
  ${R.rows.map((x, i) => `<tr><td>${i && R.rows[i - 1].date === x.date ? '' : `${dayName(x.date).slice(0, 3)} ${parse(x.date).getDate()}/${parse(x.date).getMonth() + 1}`}</td><td>${esc(projSub(x))}${x.wo ? `<br><small>${esc(x.wo)}</small>` : ''}</td><td>${esc(x.catName)}</td><td>${esc(addonText(x))}</td><td>${esc(x.note)}${x.imageIds?.length ? ` 📷${x.imageIds.length}` : ''}</td><td class="n">${h(x.hours)}</td></tr>`).join('') || '<tr><td colspan="6">Inga registreringar.</td></tr>'}
  <tr class="tot"><td colspan="5">Totalt</td><td class="n">${h(R.total)}</td></tr></tbody></table>
  <h2>Per dag</h2>
  <table><thead><tr><th>Datum</th><th>Plats</th><th class="n">Rast</th><th class="n">Timmar</th><th class="n">Övertid</th><th>Signerad</th></tr></thead><tbody>${R.perDay.map(d => `<tr><td>${dayName(d.date)} ${d.date}</td><td>${esc(d.day.place || '')}${d.day.gps ? ` <small>(${d.day.gps.lat.toFixed(4)}, ${d.day.gps.lng.toFixed(4)})</small>` : ''}</td><td class="n">${d.day.breakMin ? d.day.breakMin + ' min' : ''}</td><td class="n">${h(d.total)}</td><td class="n ot">${d.ot ? h(d.ot) : ''}</td><td>${d.day.signature ? '✓' : ''}</td></tr>`).join('')}</tbody></table>
  <h2>Per resurs med tillägg</h2>${catTable(R, money)}
  ${Object.keys(R.proj).length > 1 ? `<h2>Per projekt</h2><table><tbody>${Object.entries(R.proj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)} h</td></tr>`).join('')}</tbody></table>` : ''}
  ${R.trips.length ? `<h2>Körjournal</h2><table><thead><tr><th>Datum</th><th>Från</th><th>Till</th><th>Projekt</th><th class="n">Km</th></tr></thead><tbody>${R.trips.map(x => `<tr><td>${x.date}</td><td>${esc(x.km.from)}</td><td>${esc(x.km.to)}</td><td>${esc(x.project)}</td><td class="n">${h(x.km.km)}</td></tr>`).join('')}<tr class="tot"><td colspan="4">Totalt</td><td class="n">${h(R.km)} km</td></tr></tbody></table>` : ''}
  ${R.mats.length ? `<h2>Material / förbrukning</h2><table><tbody>${R.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${h(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${R.arts.length || R.photosEx.length ? `<h2>Tillägg: artiklar och foton</h2>
  ${R.arts.length ? `<h3>Artiklar / utrustning</h3><table><thead><tr><th>Datum</th><th>Projekt / underprojekt</th><th>Artikel</th><th>Notering</th><th class="n">Antal</th></tr></thead><tbody>${R.arts.map(x => `<tr><td>${x.date}</td><td>${esc(projSub(x))}</td><td>${esc(x.name)}</td><td>${esc(x.note)}</td><td class="n">${h(x.qty)} ${esc(x.unit)}</td></tr>`).join('')}</tbody></table><table><thead><tr><th>Summa per artikel</th><th class="n">Tillfällen</th><th class="n">Totalt</th></tr></thead><tbody>${R.artSum.map(a => `<tr><td>${esc(a.name)}</td><td class="n">${a.n}</td><td class="n">${h(a.qty)} ${esc(a.unit)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${R.photosEx.length ? `<h3>Foton</h3>${R.photosEx.map(x => `<div class="item">${x.date} · ${esc(projSub(x))}${x.note ? ' · ' + esc(x.note) : ''}${th(x.imageIds)}</div>`).join('')}` : ''}` : ''}
  <h2>Avvikelser (${R.devs.length})</h2>${R.devs.map(x => { const t = devType(x.type); return `<div class="item"><b>${t[1]}</b> · ${x.date} · ${esc(x.project)} · ${x.status === 'open' ? 'Öppen' : 'Åtgärdad'}${x.hours ? ` · påverkade ${h(x.hours)} h` : ''}<div>${esc(x.desc)}</div>${th(x.imageIds)}</div>`; }).join('') || '<p>Inga avvikelser.</p>'}
  <h2>ÄTA-sammanställning (${R.atas.length})</h2>${R.atas.length ? `<table><thead><tr><th>Nr</th><th>Datum</th><th>Projekt / underprojekt</th><th>Typ</th><th>Status</th><th class="n">Tim</th>${money ? '<th class="n">Belopp</th>' : ''}</tr></thead><tbody>${R.atas.map(x => `<tr><td><b>${ataNo(x)}</b></td><td>${x.date}</td><td>${esc(projSub(x))}</td><td>${ataTypeLbl(x.type)}</td><td>${statusLbl(x.status)}</td><td class="n">${x.hours ? h(x.hours) : ''}</td>${money ? `<td class="n">${kr.format(ataAmount(x))}</td>` : ''}</tr>`).join('')}<tr class="tot"><td colspan="5">Summa ÄTA</td><td class="n">${h(R.atas.reduce((s2, x) => s2 + num(x.hours), 0))}</td>${money ? `<td class="n">${kr.format(R.ataSum)}</td>` : ''}</tr></tbody></table>
  ${R.atas.map(x => `<div class="item"><b>${ataNo(x)} · ${ataTypeLbl(x.type)} · ${statusLbl(x.status)}</b> · ${x.date} · ${esc(projSub(x))}${x.orderedBy ? ` · beställt av ${esc(x.orderedBy)}` : ''}${x.hours ? ` · ${h(x.hours)} h ${esc(x.catName || '')}` : ''}<div>${esc(x.desc)}</div>${ataArtText(x) ? `<div><i>Artiklar/material:</i> ${esc(ataArtText(x))}</div>` : ''}${th(x.imageIds)}</div>`).join('')}` : '<p>Inga ÄTA.</p>'}
  ${R.rows.some(x => x.imageIds?.length) || R.perDay.some(d => d.day.imageIds?.length) ? `<h2>Bilder från arbetet</h2>${R.perDay.filter(d => d.day.imageIds?.length).map(d => `<div class="item">${d.date} · dagens bilder${th(d.day.imageIds)}</div>`).join('')}${R.rows.filter(x => x.imageIds?.length).map(x => `<div class="item">${x.date} · ${esc(x.catName)} · ${esc(x.project)}${th(x.imageIds)}</div>`).join('')}` : ''}
  ${money ? `<h2>Fakturaunderlag</h2><table><tbody><tr><td>Timmar och tillägg</td><td class="n">${kr.format(R.amount)}</td></tr>${R.ataSum ? `<tr><td>ÄTA-arbeten</td><td class="n">${kr.format(R.ataSum)}</td></tr>` : ''}<tr class="tot"><td>Summa exkl. moms</td><td class="n">${kr.format(R.amount + R.ataSum)}</td></tr></tbody></table>` : ''}
  ${sigs.length ? `<h2>Dagsignaturer</h2><div class="sigs">${sigs.map(d => `<div><img src="${d.day.signature}" alt="">${d.date}${d.day.sigName ? ' – ' + esc(d.day.sigName) : ''}</div>`).join('')}</div>` : ''}
  <div class="rep-foot"><div>Signatur förare / arbetsledare</div><div>Attest beställare – namn och datum</div></div>
  <div class="rep-small">Övertid räknas på tid över ${h(R.lim)} h per dag. Total rast ${R.breakMin} min. Skapad med Tidrapport v${VERSION}.</div></div>`;
}
async function doPrint() {
  const r = range(); $('#print').innerHTML = printHtml(r, report(r.from, r.to));
  await Promise.all([...$$('#print img')].map(i => i.decode().catch(() => {})));
  window.print();
}

/* ================= Inställningar ================= */
let st = null;
function renderSet() {
  if (!st) st = clone(S());
  $('#view-set').innerHTML = `${teamCards()}
  <div class="card"><h2>Företag</h2>
    <label>Företagsnamn<input type="text" data-s="company" value="${esc(st.company)}"></label>
    <label>Ditt namn (visas på rapporten)<input type="text" data-s="name" value="${esc(st.name)}"></label>
    <div class="grid2"><label>Timpris (kr)<input type="number" inputmode="decimal" data-s="rate" value="${esc(st.rate)}" placeholder="valfritt"></label><label>Övertid över (h/dag)<input type="number" inputmode="decimal" step="0.5" data-s="otLimit" value="${esc(st.otLimit)}"></label></div>
    <label>Standardrast (min)<input type="number" inputmode="numeric" data-s="defBreak" value="${esc(st.defBreak)}"></label>
  </div>
  <div class="card"><h2>Projekt</h2>
    <ul class="list">${st.projects.map((p, i) => `<li><div class="info"><b>${esc(p)}</b></div><div class="act"><button data-act="projDel" data-v="${i}" aria-label="Ta bort">✕</button></div></li>`).join('')}</ul>
    <div class="row"><input type="text" id="newProj" placeholder="Nytt projekt / arbetsorder"><button class="secondary" data-act="projAdd" style="flex:0 0 auto;width:auto">Lägg till</button></div>
    <label>Standardprojekt<select data-s="defaultProject">${st.projects.map(p => `<option${p === st.defaultProject ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
  </div>
  <div class="card"><h2>Resurser, tillägg och utrustning</h2>
    <p class="muted small">Enhet tom = bara bock. Med enhet (h, st, km …) fylls antal i. Pris är per enhet, eller per gång om enhet saknas.</p>
    ${st.categories.map((c, ci) => `<div class="catedit">
      <div class="hd"><input type="text" class="icon" data-c="${ci}.icon" value="${esc(c.icon)}" aria-label="Ikon"><input type="text" data-c="${ci}.name" value="${esc(c.name)}" aria-label="Namn"></div>
      <div class="grid2"><label>Timpris (kr)<input type="number" inputmode="decimal" data-c="${ci}.rate" value="${esc(c.rate)}" placeholder="standard"></label><label style="display:flex;align-items:center;gap:8px;margin-top:34px"><input type="checkbox" data-c="${ci}.km" ${c.km ? 'checked' : ''} style="width:26px;height:26px"> Körjournal</label></div>
      <div class="lbl">Tillägg</div>
      ${c.addons.map((x, ai) => `<div class="addrow"><input type="text" data-a="${ci}.${ai}.name" value="${esc(x.name)}" aria-label="Tillägg"><select data-a="${ci}.${ai}.unit" aria-label="Enhet">${UNITS.map(u => `<option value="${u}"${u === x.unit ? ' selected' : ''}>${u || '–'}</option>`).join('')}</select><input type="number" inputmode="decimal" data-a="${ci}.${ai}.price" value="${esc(x.price)}" placeholder="kr" aria-label="Pris"><button data-act="addonDel" data-v="${ci}.${ai}" aria-label="Ta bort">✕</button></div>`).join('')}
      <div class="row"><button class="secondary" data-act="addonAdd" data-v="${ci}">+ Tillägg</button><button class="ghost" data-act="catDel" data-v="${ci}">Ta bort resurs</button></div>
    </div>`).join('')}
    <button class="secondary" data-act="catAdd">+ Ny resurs/kategori</button>
  </div>
  <div class="card"><h2>Artiklar (Tillägg)</h2><p class="muted small">Snabbval under ＋ Tillägg → Artiklar.</p>
    ${st.articles.map((m, i) => `<div class="addrow" style="grid-template-columns:1fr 96px 46px"><input type="text" data-ar="${i}.name" value="${esc(m.name)}" aria-label="Artikel"><select data-ar="${i}.unit">${['st', 'h', 'dagar', 'm', 'ton'].map(u => `<option${u === m.unit ? ' selected' : ''}>${u}</option>`).join('')}</select><button data-act="artDefDel" data-v="${i}" aria-label="Ta bort">✕</button></div>`).join('')}
    <button class="secondary" data-act="artDefAdd">+ Artikel</button>
  </div>
  <div class="card"><h2>Material</h2>
    ${st.materials.map((m, i) => `<div class="addrow" style="grid-template-columns:1fr 86px 46px"><input type="text" data-m="${i}.name" value="${esc(m.name)}"><select data-m="${i}.unit">${UNITS.map(u => `<option value="${u}"${u === m.unit ? ' selected' : ''}>${u || '–'}</option>`).join('')}</select><button data-act="matDefDel" data-v="${i}" aria-label="Ta bort">✕</button></div>`).join('')}
    <button class="secondary" data-act="matDefAdd">+ Material</button>
  </div>
  <button class="primary" data-act="setSave" id="setSave">Spara inställningar</button>
  <div class="card" style="margin-top:12px"><h2>Export och backup</h2>
    <button class="secondary" data-act="csv" id="csvBtn">Exportera allt som CSV</button>
    <button class="secondary" data-act="backup" id="backupBtn">Spara backup (inkl. bilder)</button>
    <label class="filebtn secondary">Återställ från backup<input type="file" id="restoreFile" accept="application/json,.json"></label>
    <p class="muted small" id="storageInfo">All data finns bara i den här telefonen. Ta backup ibland.</p>
  </div>
  <p class="muted small center">Tidrapport v${VERSION} · fungerar offline</p>`;
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const el = $('#storageInfo'); if (el) el.textContent = `All data finns bara i den här telefonen (${thumbs.size} bilder, ${(e.usage / 1048576).toFixed(1)} MB använt av ca ${Math.round(e.quota / 1048576)} MB). Ta backup ibland.`; });
}
function saveSettings() {
  st.otLimit = num(st.otLimit) || 8; st.defBreak = num(st.defBreak);
  st.categories = st.categories.filter(c => c.name.trim()); st.categories.forEach(c => c.addons = c.addons.filter(x => x.name.trim()));
  st.materials = st.materials.filter(m => m.name.trim()); st.articles = st.articles.filter(m => m.name.trim());
  if (!st.projects.length) st.projects = ['Allmänt'];
  if (!st.projects.includes(st.defaultProject)) st.defaultProject = st.projects[0];
  db.settings = st; const pr = db.profiles.find(x => x.id === ME().id); if (pr && st.name) { pr.name = st.name; } if (db.company && db.company.role === 'owner' && st.company) db.company.name = st.company; save(); st = null; renderHeader(); renderSet(); toast('Inställningar sparade ✓');
}

/* ================= Export ================= */
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function toCSV(from = '0000', to = '9999') {
  const inR = d => d >= from && d <= to;
  const keep = x => inR(x.date) && pf(x);
  const opush = (x, arr) => { while (arr.length < 19) arr.push(''); arr.push(x.byName || '', arr[0] === 'Tid' ? dn(mhOf(x)) : ''); out.push(arr); };
  const q = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const dn = v => String(v ?? '').replace('.', ',');
  const out = [['Typ', 'Datum', 'Vecka', 'Projekt', 'Arbetsorder', 'Plats', 'Resurs', 'Timmar', 'Tillägg', 'Km', 'Från', 'Till', 'Material', 'Notering/Beskrivning', 'Status', 'Beordrad av', 'Belopp', 'Bilder', 'Underprojekt', 'Person', 'Maskintimmar']];
  const wkOf = d => { const w = isoWeek(parse(d)); return `${w.year}-V${pad(w.week)}`; };
  [...db.rows].filter(keep).sort((x, y) => x.date.localeCompare(y.date)).forEach(r => opush(r, ['Tid', r.date, wkOf(r.date), r.project, r.wo, getDay(r.date).place, r.catName, dn(r.hours), addonText(r), r.km ? dn(r.km.km) : '', r.km?.from, r.km?.to, (r.materials || []).map(m => `${m.name} ${dn(m.qty)} ${m.unit}`).join(', '), r.note, '', '', dn(Math.round(rowAmount(r))), (r.imageIds || []).length, r.sub || '']));
  db.extras.filter(keep).sort((x, y) => x.date.localeCompare(y.date)).forEach(x => opush(x, x.kind === 'article' ? ['Artikel', x.date, wkOf(x.date), x.project, '', getDay(x.date).place, x.name, x.unit === 'h' ? dn(x.qty) : '', `${x.name} ${dn(x.qty)} ${x.unit}`, '', '', '', '', x.note, '', '', '', 0, x.sub || ''] : ['Foto', x.date, wkOf(x.date), x.project, '', getDay(x.date).place, '', '', '', '', '', '', '', x.note, '', '', '', (x.imageIds || []).length, x.sub || '']));
  db.devs.filter(keep).forEach(x => opush(x, ['Avvikelse', x.date, wkOf(x.date), x.project, '', '', devType(x.type)[1], dn(x.hours), '', '', '', '', '', x.desc, x.status === 'open' ? 'Öppen' : 'Åtgärdad', '', '', (x.imageIds || []).length]));
  db.atas.filter(keep).sort((x, y) => x.date.localeCompare(y.date)).forEach(x => opush(x, [ataNo(x), x.date, wkOf(x.date), x.project, '', '', x.catName, dn(x.hours), ataTypeLbl(x.type), '', '', '', ataArtText(x), x.desc, statusLbl(x.status), x.orderedBy, dn(Math.round(ataAmount(x))), (x.imageIds || []).length, x.sub || '']));
  return '\uFEFF' + out.map(r => r.map(q).join(';')).join('\r\n');
}
async function backup() {
  toast('Skapar backup…');
  const images = await IDB.all();
  download(`tidrapport-backup-${today()}.json`, JSON.stringify({ app: 'tidrapport', format: 2, version: VERSION, exported: new Date().toISOString(), data: db, images }), 'application/json');
  toast(`Backup sparad (${images.length} bilder)`);
}
async function restore(file) {
  try {
    const d = JSON.parse(await file.text()); let nd, imgs = [];
    if (d.format === 2 && d.data) { nd = normalize(d.data); imgs = d.images || []; }
    else if (d.settings && Array.isArray(d.entries)) nd = migrateV1(d);
    else throw new Error('fel format');
    if (!confirm(`Återställ ${nd.rows.length} rader, ${nd.devs.length} avvikelser, ${nd.atas.length} ÄTA och ${imgs.length} bilder? Nuvarande data ersätts.`)) return;
    await IDB.clear(); thumbs.clear(); for (const o of imgs) { await IDB.put(o); thumbs.set(o.id, o.thumb); }
    closeSheet(); db = nd; save(); st = null; renderHeader(); renderView(); toast('Backup återställd ✓');
  } catch (e) { toast('Ogiltig backupfil'); }
}

/* ================= Profiler, lås och företag (helt lokalt) ================= */
const ME_KEY = 'tidrapport.me', SENT_KEY = 'tidrapport.sentImgs';
const meId = () => { const id = localStorage.getItem(ME_KEY); return db.profiles.some(p => p.id === id) ? id : (db.profiles[0] || {}).id || ''; };
const ME = () => db.profiles.find(p => p.id === meId()) || { id: '', name: S().name || '' };
const stamp = o => ({ ...o, by: ME().id, byName: ME().name });
const mine = x => !x.by || x.by === meId();
let personFilter = 'all';
const pf = x => personFilter === 'all' || x.by === personFilter;
function people() { const m = new Map(); db.profiles.forEach(p => m.set(p.id, p.name)); ['rows', 'devs', 'atas', 'extras'].forEach(k => db[k].forEach(x => { if (x.by && !m.has(x.by)) m.set(x.by, x.byName || 'Okänd'); })); return [...m].map(([id, name]) => ({ id, name })); }
function newCompanyId() { return 'F-' + [...crypto.getRandomValues(new Uint8Array(5))].map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); }
function slug(s) { return String(s || 'x').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'; }
function ensureTeam(d) {
  d.profiles = Array.isArray(d.profiles) ? d.profiles : []; d.company = d.company || null; d.team = d.team || {}; d.timers = d.timers || {};
  d.settings.subprojects = d.settings.subprojects || {};
  if (!d.profiles.length && d.settings.setupDone) d.profiles.push({ id: uid(), name: d.settings.name || 'Ägare', role: 'owner', created: Date.now() });
  if (!d.company && d.settings.setupDone) d.company = { id: newCompanyId(), name: d.settings.company || 'Mitt företag', role: 'owner' };
  const first = d.profiles[0];
  if (first) ['rows', 'devs', 'atas', 'extras'].forEach(k => d[k].forEach(x => { if (!x.by) { x.by = first.id; x.byName = first.name; } }));
  return d;
}
/* ---- PIN (SHA-256 + salt, WebCrypto). Ett lås – ingen riktig säkerhet. ---- */
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hashPin(pin, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin))); }
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
let pinMode = null, pinBuf = '', pinFirst = '', pinProfile = null, hiddenAt = 0;
const lockActive = () => S().lock && db.profiles.some(p => p.pinHash);
function showLock(mode = 'unlock') {
  pinMode = mode; pinBuf = ''; pinFirst = ''; pinProfile = mode === 'unlock' ? (db.profiles.find(p => p.id === meId() && p.pinHash) || db.profiles.find(p => p.pinHash) || ME()) : ME();
  renderLock(); $('#lock').classList.remove('hidden');
}
function renderLock(msg = '') {
  const withPin = db.profiles.filter(p => p.pinHash);
  const title = { unlock: `Hej ${esc(pinProfile.name || '')}!`, set1: 'Välj en PIN (4 siffror)', set2: 'Skriv PIN igen' }[pinMode];
  $('#lock').innerHTML = `<div class="lockbox">
    <div class="logo big">${esc(S().company || 'Tidrapport')}</div>
    <h2 id="lockTitle">${title}</h2>
    ${pinMode === 'unlock' && withPin.length > 1 ? `<div class="chips center-chips">${withPin.map(p => `<button class="chip ${p.id === pinProfile.id ? 'sel' : ''}" data-act="pinWho" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="dots" id="pinDots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
    <p class="pinmsg" id="pinMsg">${msg}</p>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pinKey" data-v="${n}">${n}</button>`).join('')}<button data-act="pinBack" aria-label="Sudda">⌫</button><button data-act="pinKey" data-v="0">0</button>${pinMode === 'unlock' ? '<button data-act="pinForgot" class="small-t">Glömt?</button>' : '<button data-act="pinCancel" class="small-t">Avbryt</button>'}</div>
    <p class="muted small center">Låset hindrar bara nyfikna. Datan ligger okrypterad i telefonen – det är ingen riktig säkerhet.</p></div>`;
}
async function pinDigit(n) {
  if (pinBuf.length >= 4) return; pinBuf += n; $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
  if (pinBuf.length < 4) return;
  const pin = pinBuf; pinBuf = '';
  if (pinMode === 'unlock') {
    if (await hashPin(pin, pinProfile.salt) === pinProfile.pinHash) { localStorage.setItem(ME_KEY, pinProfile.id); $('#lock').classList.add('hidden'); pinMode = null; renderHeader(); renderView(); }
    else { renderLock('Fel PIN – försök igen'); $('#pinDots').classList.add('shake'); }
  } else if (pinMode === 'set1') { pinFirst = pin; pinMode = 'set2'; renderLock(); }
  else if (pinMode === 'set2') {
    if (pin !== pinFirst) { pinMode = 'set1'; return renderLock('PIN matchade inte – börja om'); }
    const p = db.profiles.find(x => x.id === ME().id); p.salt = newSalt(); p.pinHash = await hashPin(pin, p.salt); save();
    $('#lock').classList.add('hidden'); pinMode = null; toast('PIN sparad ✓'); if (view === 'set') renderSet();
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (lockActive() && !pinMode && hiddenAt && Date.now() - hiddenAt > 5 * 60e3) showLock(); });

/* ---- Första start ---- */
let setupStage = 'choose', pendingInvite = null;
function renderSetup() {
  const box = (inner) => `<div class="setupbox"><div class="logo big">${esc(pendingInvite ? pendingInvite.n : (S().company || 'Tidrapport'))}</div>${inner}</div>`;
  let html;
  if (setupStage === 'choose') html = box(`<h1>Välkommen!</h1><p>Hur ska du använda appen?</p>
    <button class="primary" data-act="suOwner" id="suOwner">🏢 Skapa företag (ägare)</button>
    <button class="secondary big2" data-act="suMember" id="suMember">👷 Anslut till företag (anställd)</button>
    <p class="muted small">Allt sparas bara i den här telefonen. Ingen server, inget konto.</p>`);
  else if (setupStage === 'owner') html = box(`<h1>Nytt företag</h1>
    <label>Företagsnamn<input type="text" id="suCompany" value="${esc(S().company)}" placeholder="t.ex. Exempel Åkeri AB"></label>
    <label>Ditt namn<input type="text" id="suName" value="${esc(S().name)}" autocomplete="name"></label>
    <label>Projekt du jobbar på<input type="text" id="suProj" placeholder="t.ex. Ledningsbygge"></label>
    <label>PIN (valfri, 4 siffror)<input type="password" inputmode="numeric" maxlength="4" id="suPin" placeholder="Hoppa över = inget lås" autocomplete="new-password"></label>
    <button class="primary" data-act="setupDone" id="setupBtn">Kom igång</button><button class="ghost" data-act="suBack">← Tillbaka</button>`);
  else html = box(pendingInvite ? `<h1>Anslut</h1><p>Du ansluter till <b>${esc(pendingInvite.n)}</b>${pendingInvite.o ? ` (ägare: ${esc(pendingInvite.o)})` : ''}.</p>
    <label>Ditt namn<input type="text" id="suName" autocomplete="name"></label>
    <label>PIN (valfri, 4 siffror)<input type="password" inputmode="numeric" maxlength="4" id="suPin" placeholder="Hoppa över = inget lås" autocomplete="new-password"></label>
    <button class="primary" data-act="joinDone" id="joinBtn">Anslut</button><button class="ghost" data-act="suBack">← Tillbaka</button>`
    : `<h1>Anslut till företag</h1><p>Be ägaren visa QR-koden under ⚙ → Team.</p>
    <button class="primary" data-act="scanQr" id="scanBtn">📷 Skanna QR-kod</button>
    <label class="secondary filebtn big2">📂 Öppna inbjudningsfil<input type="file" id="inviteFile" accept=".txt,.json,.tidrapport,text/plain,application/json"></label>
    <label>…eller klistra in länken/koden<input type="text" id="inviteCode" placeholder="https://…#join=…"></label>
    <button class="secondary" data-act="inviteFromText" id="inviteGo">Fortsätt</button><button class="ghost" data-act="suBack">← Tillbaka</button>`);
  $('#setup').innerHTML = html; $('#setup').classList.remove('hidden');
}
async function finishSetup() {
  const c = $('#suCompany').value.trim() || 'Mitt företag', n = $('#suName').value.trim() || 'Ägare', p = $('#suProj').value.trim(), pin = $('#suPin').value.trim();
  if (pin && !/^\d{4}$/.test(pin)) return toast('PIN ska vara 4 siffror');
  S().company = c; S().name = n; if (p) { if (!S().projects.includes(p)) S().projects.unshift(p); S().defaultProject = p; }
  const prof = { id: uid(), name: n, role: 'owner', created: Date.now() };
  if (pin) { prof.salt = newSalt(); prof.pinHash = await hashPin(pin, prof.salt); S().lock = true; }
  db.profiles = [prof]; db.company = { id: newCompanyId(), name: c, role: 'owner' }; localStorage.setItem(ME_KEY, prof.id);
  S().setupDone = true; save(); $('#setup').classList.add('hidden'); renderHeader(); renderView(); toast('Klart – företaget är skapat ✓');
}
async function finishJoin() {
  const n = $('#suName').value.trim(), pin = $('#suPin').value.trim();
  if (!n) return toast('Skriv ditt namn'); if (pin && !/^\d{4}$/.test(pin)) return toast('PIN ska vara 4 siffror');
  applyInvite(pendingInvite);
  const prof = { id: uid(), name: n, role: 'employee', created: Date.now() };
  if (pin) { prof.salt = newSalt(); prof.pinHash = await hashPin(pin, prof.salt); S().lock = true; }
  db.profiles = [prof]; S().name = n; localStorage.setItem(ME_KEY, prof.id); S().setupDone = true; pendingInvite = null;
  save(); $('#setup').classList.add('hidden'); renderHeader(); renderView(); toast(`Ansluten till ${db.company.name} ✓`);
}

/* ---- Inbjudan: komprimerad länk + QR (inbyggt bibliotek) + fil ---- */
const b64url = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function packJson(o) { const st = new Blob([JSON.stringify(o)]).stream().pipeThrough(new CompressionStream('deflate-raw')); return b64url(new Uint8Array(await new Response(st).arrayBuffer())); }
async function unpackJson(code) { const st = new Blob([unb64url(code)]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return JSON.parse(await new Response(st).text()); }
function invitePayload() {
  return { t: 'tr-inv', v: 1, c: db.company.id, n: db.company.name, o: ME().name, ts: Date.now(), d: S().defaultProject, p: S().projects, s: Object.fromEntries(S().projects.map(p => [p, subOptions(p)]).filter(([, l]) => l.length)),
    k: S().categories.map(c => [c.name, c.icon, c.km ? 1 : 0, c.rate || '', c.addons.map(x => [x.name, x.unit, x.price || ''])]), a: S().articles.map(x => [x.name, x.unit]) };
}
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const inviteUrl = code => appUrl() + '#join=' + code;
function applyInvite(inv) {
  const s = S();
  s.projects = [...new Set([...(inv.p || []), ...s.projects.filter(p => p !== 'Allmänt' || (inv.p || []).includes('Allmänt'))])]; if (!s.projects.length) s.projects = ['Allmänt'];
  if (inv.d && s.projects.includes(inv.d)) s.defaultProject = inv.d; else if (!s.projects.includes(s.defaultProject)) s.defaultProject = s.projects[0];
  s.subprojects = { ...(s.subprojects || {}) }; Object.entries(inv.s || {}).forEach(([p, l]) => s.subprojects[p] = [...new Set([...(s.subprojects[p] || []), ...l])]);
  (inv.k || []).forEach(([name, icon, km, rate, addons]) => {
    let c = s.categories.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!c) { c = { id: 'k-' + slug(name), name, icon, km: !!km, rate: rate || '', addons: [] }; s.categories.push(c); }
    Object.assign(c, { name, icon, km: !!km, rate: rate || c.rate || '' });
    addons.forEach(([an, au, ap]) => { const x = c.addons.find(y => y.name.toLowerCase() === an.toLowerCase()); if (x) Object.assign(x, { unit: au, price: ap }); else c.addons.push({ id: 'a-' + slug(name) + '-' + slug(an), name: an, unit: au, price: ap }); });
  });
  (inv.a || []).forEach(([an, au]) => { const x = s.articles.find(y => y.name.toLowerCase() === an.toLowerCase()); if (x) x.unit = au; else s.articles.push({ name: an, unit: au }); });
  s.company = inv.n; db.company = { id: inv.c, name: inv.n, role: 'member', owner: inv.o || '', updated: inv.ts };
}
function qrCanvas(text, px = 6) {
  const q = qrcode(0, 'L'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4, c = document.createElement('canvas'); c.width = c.height = (n + 2 * m) * px;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + m) * px, (r + m) * px, px, px);
  return c;
}
async function handleInviteObj(inv) {
  if (!inv || inv.t !== 'tr-inv') return toast('Ingen inbjudan hittades');
  if (!S().setupDone) { pendingInvite = inv; setupStage = 'member'; renderSetup(); return; }
  if (db.company && db.company.role === 'owner' && db.company.id === inv.c) return toast('Det här är din egen inbjudan');
  if (db.company && db.company.id !== inv.c && !confirm(`Byta till företaget ${inv.n}? Dina egna poster behålls.`)) return;
  applyInvite(inv); save(); renderHeader(); renderView(); toast(`Uppdaterat från ${inv.n}: projekt, maskiner och artiklar ✓`);
}
async function handleJoinText(txt) {
  const m = String(txt || '').match(/#join=([A-Za-z0-9_-]+)/) || String(txt || '').trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) return toast('Hittade ingen kod');
  try { await handleInviteObj(await unpackJson(m[1])); } catch (e) { toast('Koden gick inte att läsa'); }
}
/* ---- Skanna QR (BarcodeDetector + kamera) ---- */
let scanStream = null, scanTimer = null;
async function startScan() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('Skanning stöds inte här – öppna filen eller använd kamerappen');
  try {
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    $('#scan').classList.remove('hidden'); const v = $('#scanVideo'); v.srcObject = scanStream; await v.play();
    scanTimer = setInterval(async () => { try { const r = await det.detect(v); if (r[0]) { const raw = r[0].rawValue; stopScan(); handleJoinText(raw); } } catch (e) {} }, 350);
  } catch (e) { stopScan(); toast('Kameran kunde inte startas'); }
}
function stopScan() { clearInterval(scanTimer); if (scanStream) scanStream.getTracks().forEach(t => t.stop()); scanStream = null; $('#scan').classList.add('hidden'); }

/* ---- Dela/ladda ner fil ---- */
async function shareFile(file, title, text) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text }); return 'shared'; } }
  catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  download(file.name, file, file.type); return 'downloaded';
}
/* ---- Anställd → ägare ---- */
async function exportMine(all) {
  const sent = new Set(all ? [] : JSON.parse(localStorage.getItem(SENT_KEY) || '[]'));
  const recs = { rows: db.rows.filter(mine), devs: db.devs.filter(mine), atas: db.atas.filter(mine), extras: db.extras.filter(mine) };
  const ids = new Set(); Object.values(recs).flat().forEach(x => (x.imageIds || []).forEach(i => ids.add(i)));
  const images = (await IDB.all()).filter(o => ids.has(o.id) && !sent.has(o.id));
  const bundle = { t: 'tr-export', v: 1, company: db.company ? db.company.id : '', companyName: db.company ? db.company.name : '', from: { id: ME().id, name: ME().name }, ts: Date.now(), ...recs, images };
  const file = new File([JSON.stringify(bundle)], `tidrapport-${slug(ME().name)}-${today()}.txt`, { type: 'text/plain' });
  const n = recs.rows.length + recs.devs.length + recs.atas.length + recs.extras.length;
  const r = await shareFile(file, `Tidrapport från ${ME().name}`, `Tidrapport från ${ME().name}: ${n} poster, ${images.length} nya bilder. Öppna filen i appen: ⚙ → Team → Läs in.`);
  if (r !== 'aborted') { images.forEach(o => sent.add(o.id)); localStorage.setItem(SENT_KEY, JSON.stringify([...sent])); toast(r === 'shared' ? 'Skickat ✓' : 'Filen sparad i Hämtade filer – skicka den till ägaren'); }
  return bundle;
}
async function importAny(file) {
  const txt = await file.text(); let o = null;
  try { o = JSON.parse(txt); } catch (e) { return handleJoinText(txt); }
  if (o.t === 'tr-export') return mergeBundle(o);
  if (o.t === 'tr-inv') return handleInviteObj(o);
  if (o.format === 2 && o.data) return restore(file);
  toast('Okänd fil');
}
async function mergeBundle(b) {
  if (db.company && b.company && b.company !== db.company.id && !confirm(`Filen kommer från ${b.companyName || 'ett annat företag'}. Läsa in ändå?`)) return;
  const from = b.from || {}; let add = 0, upd = 0, same = 0;
  for (const k of ['rows', 'devs', 'atas', 'extras']) for (const x of b[k] || []) {
    const y = { ...x, by: x.by || from.id, byName: x.byName || from.name };
    if (k === 'rows') { const c = S().categories.find(c2 => c2.name.toLowerCase() === String(y.catName || '').toLowerCase()); if (c) y.categoryId = c.id; }
    const i = db[k].findIndex(z => z.id === y.id);
    if (i < 0) {
      if (k === 'atas' && db.atas.some(z => z.project === y.project && z.nr === y.nr)) { y.origNr = y.nr; y.nr = db.atas.filter(z => z.project === y.project).reduce((m, z) => Math.max(m, z.nr || 0), 0) + 1; }
      db[k].push(y); add++;
    } else {
      const ex = db[k][i];
      if ((y.updated || y.created || 0) > (ex.updated || ex.created || 0)) { if (k === 'atas') { y.nr = ex.nr; if (ex.origNr) y.origNr = ex.origNr; } db[k][i] = y; upd++; } else same++;
    }
    if (y.sub && y.project) { const sp = S().subprojects; sp[y.project] = [...new Set([...(sp[y.project] || []), y.sub])]; }
  }
  let ni = 0; for (const im of b.images || []) if (!thumbs.has(im.id)) { await IDB.put(im); thumbs.set(im.id, im.thumb); ni++; }
  db.team[from.id] = { name: from.name, last: Date.now() };
  save(); renderView(); toast(`${from.name || 'Fil'}: ${add} nya, ${upd} uppdaterade, ${same} fanns redan${ni ? `, ${ni} bilder` : ''}`);
  return { add, upd, same, images: ni };
}

/* ---- Team-ark ---- */
let inviteCode = '';
function sheetTeam() {
  const owner = !db.company || db.company.role === 'owner';
  const ppl = people().filter(p => p.id !== ME().id);
  if (owner) return `${head('👥', 'Team', esc(db.company ? `${db.company.name} · ${db.company.id}` : ''))}
    <p class="muted small">Anställda skannar koden med appen (⚙ → Anslut) eller telefonens kamera. Koden innehåller företags-ID, projekt, underprojekt, maskiner och artiklar – inga tider.</p>
    <div class="qrbox"><img id="qrImg" alt="QR-kod för inbjudan"></div>
    <button class="primary" data-act="shareInvite" id="shareInvite">📤 Skicka inbjudan / uppdatering</button>
    <button class="secondary" data-act="copyInvite">🔗 Kopiera länk</button>
    <label class="secondary filebtn">📥 Läs in fil från anställd<input type="file" id="importFile" accept=".txt,.json,.tidrapport,text/plain,application/json"></label>
    ${ppl.length ? `<div class="sect">Personer</div><ul class="rows">${ppl.map(p => `<li><div class="rowbtn"><i>👷</i><span><b>${esc(p.name)}</b><small>${db.rows.filter(r => r.by === p.id).length} rader${db.team[p.id] ? ` · senast inläst ${new Date(db.team[p.id].last).toLocaleString('sv-SE')}` : ''}</small></span></div></li>`).join('')}</ul>` : ''}`;
  return `${head('👥', 'Team', esc(`${db.company.name} · ${db.company.id}`))}
    <p class="muted small">Du är ansluten som anställd. Skicka dina poster till ägaren som fil (Gmail, sms, WhatsApp …).</p>
    <button class="primary" data-act="sendOwner" id="sendOwner">📤 Skicka till ägaren</button>
    <button class="ghost" data-act="sendOwnerAll">Skicka allt igen (även gamla bilder)</button>
    <div class="sect">Uppdatering från ägaren</div>
    <button class="secondary" data-act="scanQr">📷 Skanna ny QR-kod</button>
    <label class="secondary filebtn">📥 Läs in fil från ägaren<input type="file" id="importFile" accept=".txt,.json,.tidrapport,text/plain,application/json"></label>`;
}
async function fillQr() {
  const img = $('#qrImg'); if (!img || !db.company) return;
  inviteCode = await packJson(invitePayload());
  try { img.src = qrCanvas(inviteUrl(inviteCode), 6).toDataURL('image/png'); img.dataset.url = inviteUrl(inviteCode); }
  catch (e) { img.replaceWith(Object.assign(document.createElement('p'), { className: 'notice', textContent: 'För mycket data för en QR-kod – skicka inbjudan som fil i stället.' })); }
}
async function shareInvite() {
  if (!inviteCode) inviteCode = await packJson(invitePayload());
  const url = inviteUrl(inviteCode), inv = invitePayload();
  const file = new File([JSON.stringify(inv)], `tidrapport-inbjudan-${slug(db.company.name)}.txt`, { type: 'text/plain' });
  const r = await shareFile(file, `Inbjudan till ${db.company.name}`, `Gå med i ${db.company.name} i Tidrapport: ${url}`);
  if (r === 'downloaded') toast('Inbjudningsfilen sparad i Hämtade filer');
}

/* ---- Start/stopp ---- */
const myTimer = () => db.timers[meId()];
function startTimer() {
  const cat = catById(rd.categoryId); if (!cat) return;
  if (myTimer() && !confirm('En klocka går redan. Stoppa och spara den först?')) return; if (myTimer()) stopTimer(true);
  db.timers[meId()] = { categoryId: cat.id, project: rd.project, sub: rd.sub || '', addons: { ...rd.addons }, start: Date.now(), date: cur };
  save(); closeSheet(); renderToday(); toast(`▶ ${cat.name} startad`);
}
function stopTimer(quiet) {
  const t = myTimer(); if (!t) return; const cat = catById(t.categoryId) || { name: 'Rad', icon: '⏱️', addons: [] };
  const hrs = Math.max(0.25, Math.round((Date.now() - t.start) / 36e5 * 4) / 4);
  const addons = cat.addons.filter(x => x.id in t.addons).map(x => ({ id: x.id, name: x.name, unit: x.unit, qty: x.unit === 'h' ? hrs : x.unit ? num(t.addons[x.id]) || 1 : 1, price: x.price }));
  db.rows.push(stamp({ id: uid(), created: Date.now(), date: t.date, project: t.project, sub: t.sub, wo: '', categoryId: cat.id, catName: cat.name, catIcon: cat.icon, hours: hrs, addons, km: null, materials: [], note: `Klocka ${new Date(t.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}–${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`, imageIds: [] }));
  delete db.timers[meId()]; save(); if (!quiet) { cur = t.date; renderToday(); toast(`Sparat ${h(hrs)} h ${cat.name.toLowerCase()} ✓`); }
}
const fmtElapsed = ms => { const m = Math.floor(ms / 60e3); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
setInterval(() => { const el = $('#timerElapsed'), t = myTimer && db && db.timers && myTimer(); if (el && t) el.textContent = fmtElapsed(Date.now() - t.start); }, 15000);

/* ---- Röst/tangentbord: snabbtolk ---- */
const NUMW = { en: 1, ett: 1, två: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, nio: 9, tio: 10, elva: 11, tolv: 12 };
const CAT_ALIAS = { grävare: 'grävmaskin', grävis: 'grävmaskin', bandare: 'grävmaskin', bil: 'lastbil', hjullastare: 'lastmaskin', lastare: 'lastmaskin', traktor: 'traktorgrävare', jcb: 'traktorgrävare' };
function parseQuick(text) {
  const s = ' ' + text.toLowerCase().replace(/(\d),(\d)/g, '$1.$2') + ' ';
  let hours = null; const m = s.match(/(\d+(?:\.\d+)?)\s*(?:h|tim|timmar|timme)?\b/); if (m) hours = num(m[1]);
  else { const w = Object.keys(NUMW).find(k => new RegExp(`\\s${k}\\s+(h|tim|timmar|timme)`).test(s)); if (w) hours = NUMW[w]; if (/halv/.test(s) && hours) hours += 0.5; }
  const cats = [...S().categories].sort((a, b) => b.name.length - a.name.length);
  let cat = cats.find(c => s.includes(c.name.toLowerCase()));
  if (!cat) { const al = Object.keys(CAT_ALIAS).find(k => new RegExp(`[\\s]${k}[\\s.,]`).test(s)); if (al) cat = cats.find(c => c.name.toLowerCase() === CAT_ALIAS[al]); }
  const addons = cat ? cat.addons.filter(x => s.includes(x.name.toLowerCase())) : [];
  const arts = S().articles.filter(x => s.includes(x.name.toLowerCase()) && !addons.some(y => y.name.toLowerCase() === x.name.toLowerCase()));
  const project = S().projects.find(p => s.includes(p.toLowerCase()));
  return { hours, cat, addons, arts, project };
}
function quickSave(text) {
  const q = parseQuick(text); if (!q.cat && !q.arts.length) return toast('Förstod inte – säg t.ex. "8 timmar grävmaskin rototilt"');
  const project = q.project || lastProjectFor(cur), sub = lastSubFor(project), t = Date.now(); undoIds = [];
  let msg = [];
  if (q.cat) {
    const hrs = q.hours || Math.max(0.5, (num(S().otLimit) || 8) - dayTotal(cur)) || 8;
    const r = stamp({ id: uid(), created: t, date: cur, project, sub, wo: '', categoryId: q.cat.id, catName: q.cat.name, catIcon: q.cat.icon, hours: hrs, addons: q.addons.map(x => ({ id: x.id, name: x.name, unit: x.unit, qty: x.unit === 'h' ? hrs : x.unit ? 1 : 1, price: x.price })), km: null, materials: [], note: '', imageIds: [] });
    db.rows.push(r); undoIds.push(r.id); msg.push(`${h(hrs)} h ${q.cat.name.toLowerCase()}${q.addons.length ? ' + ' + q.addons.map(x => x.name).join(', ') : ''}`);
    if (getDay(cur).breakMin === undefined) db.days[cur] = { ...getDay(cur), breakMin: num(S().defBreak) };
  }
  q.arts.forEach((a, i) => { const qty = a.unit === 'h' ? (q.hours || dayTotal(cur) || 8) : 1; const x = stamp({ id: uid(), created: t + 1 + i, date: cur, project, sub, kind: 'article', name: a.name, qty, unit: a.unit, note: '' }); db.extras.push(x); undoIds.push(x.id); msg.push(`${a.name} ${h(qty)} ${a.unit}`); });
  S().lastCat = q.cat ? q.cat.id : S().lastCat; save(); renderToday(); toast('Sparat: ' + msg.join(' · '));
}

/* ---- PDF-veckorapport + e-post ---- */
async function buildPdf(r, R) {
  try { await document.fonts.load('60px Logo'); } catch (e) {}
  const P = new CanvasPdf(), s = S(), multi = new Set(R.rows.map(x => x.by)).size > 1 || personFilter === 'all' && people().length > 1;
  const pname = personFilter === 'all' ? (people().length > 1 ? 'Alla' : (ME().name || '')) : (people().find(p => p.id === personFilter) || {}).name;
  P.font(64, 400, 'Logo, cursive'); P.g.fillStyle = '#7B1E2B'; P.g.fillText(s.company || 'Tidrapport', P.M, P.y);
  P.font(20); P.g.fillStyle = '#555'; P.g.textAlign = 'right'; P.g.fillText(`${pname || ''}  ·  utskriven ${today()}`, P.W - P.M, P.y + 30); P.g.textAlign = 'left';
  P.y += 86; P.g.fillStyle = '#7B1E2B'; P.g.fillRect(P.M, P.y, P.W - 2 * P.M, 5); P.y += 20;
  P.text(r.title, { size: 40, weight: 800, gap: 2 }); P.text(`${r.sub} · ${h(R.total)} h totalt${R.ot ? ` · varav övertid ${h(R.ot)} h` : ''}`, { size: 24, color: '#444', gap: 10 });
  P.heading('Dagbok');
  const cols = multi ? [{ t: 'Datum', w: .13 }, { t: 'Person', w: .13 }, { t: 'Projekt', w: .18 }, { t: 'Maskin', w: .15 }, { t: 'Tillägg / notering', w: .33 }, { t: 'Förar-h', w: .08, right: true }] : [{ t: 'Datum', w: .14 }, { t: 'Projekt', w: .22 }, { t: 'Maskin', w: .17 }, { t: 'Tillägg / notering', w: .39 }, { t: 'Förar-h', w: .08, right: true }];
  P.table(cols, R.rows.map(x => { const d = `${dayName(x.date).slice(0, 3)} ${parse(x.date).getDate()}/${parse(x.date).getMonth() + 1}`; const t = [num(x.mh) > 0 ? `maskintid ${h(x.mh)} h` : '', addonText(x), x.km && x.km.km ? x.km.km + ' km' : '', x.note].filter(Boolean).join(' · '); return multi ? [d, x.byName || '', projSub(x), x.catName, t, h(x.hours)] : [d, projSub(x), x.catName, t, h(x.hours)]; }), { total: multi ? ['Totalt', '', '', '', '', h(R.total)] : ['Totalt', '', '', '', h(R.total)] });
  if (R.cats.length) { P.heading('Per maskin med tillägg'); const rows = []; R.cats.forEach(c => { rows.push([`${c.icon || ''} ${c.name}`, '', h(c.hours)]); Object.values(c.addons).forEach(A => rows.push([`    ${A.name}`, `${A.count} ggr`, A.unit ? `${h(A.qty)} ${A.unit}` : ''])); }); P.table([{ t: 'Maskin / tillägg', w: .6 }, { t: 'Antal', w: .2, right: true }, { t: 'Maskintimmar', w: .2, right: true }], rows); }
  if (R.trips.length) { P.heading('Körjournal'); P.table([{ t: 'Datum', w: .18 }, { t: 'Från', w: .27 }, { t: 'Till', w: .27 }, { t: 'Projekt', w: .16 }, { t: 'Km', w: .12, right: true }], R.trips.map(x => [x.date, x.km.from, x.km.to, x.project, h(x.km.km)]), { total: ['Totalt', '', '', '', h(R.km)] }); }
  if (R.arts.length) { P.heading('Artiklar / utrustning'); P.table([{ t: 'Datum', w: .16 }, { t: 'Projekt / underprojekt', w: .3 }, { t: 'Artikel', w: .24 }, { t: 'Notering', w: .16 }, { t: 'Antal', w: .14, right: true }], R.arts.map(x => [x.date, projSub(x), x.name, x.note || '', `${h(x.qty)} ${x.unit}`])); P.table([{ t: 'Summa per artikel', w: .6 }, { t: 'Tillfällen', w: .2, right: true }, { t: 'Totalt', w: .2, right: true }], R.artSum.map(a => [a.name, String(a.n), `${h(a.qty)} ${a.unit}`])); }
  P.heading(`ÄTA-sammanställning (${R.atas.length})`);
  if (R.atas.length) { P.table([{ t: 'Nr', w: .1 }, { t: 'Datum', w: .14 }, { t: 'Projekt', w: .2 }, { t: 'Typ', w: .13 }, { t: 'Status', w: .14 }, { t: 'Beskrivning', w: .21 }, { t: 'Tim', w: .08, right: true }], R.atas.map(x => [ataNo(x), x.date, projSub(x), ataTypeLbl(x.type), statusLbl(x.status), x.desc + (x.orderedBy ? ` (beställt av ${x.orderedBy})` : '') + (ataArtText(x) ? ` – ${ataArtText(x)}` : ''), x.hours ? h(x.hours) : '']), { total: ['Summa', '', '', '', '', '', h(R.atas.reduce((s2, x) => s2 + num(x.hours), 0))] }); } else P.text('Inga ÄTA.', { size: 22, color: '#666' });
  P.heading(`Avvikelser (${R.devs.length})`);
  if (R.devs.length) P.table([{ t: 'Datum', w: .15 }, { t: 'Typ', w: .2 }, { t: 'Status', w: .14 }, { t: 'Beskrivning', w: .43 }, { t: 'Tim', w: .08, right: true }], R.devs.map(x => [x.date, devType(x.type)[1], x.status === 'open' ? 'Öppen' : 'Åtgärdad', x.desc, x.hours ? h(x.hours) : ''])); else P.text('Inga avvikelser.', { size: 22, color: '#666' });
  const pics = []; const addPics = (x, cap) => (x.imageIds || []).forEach(id => thumbs.get(id) && pics.push({ src: thumbs.get(id), cap }));
  R.rows.forEach(x => addPics(x, `${x.date} ${x.catName}`)); R.photosEx.forEach(x => addPics(x, `${x.date} ${projSub(x)}`)); R.atas.forEach(x => addPics(x, `${ataNo(x)}`)); R.devs.forEach(x => addPics(x, `Avvikelse ${x.date}`));
  if (pics.length) { P.heading(`Foton (${pics.length})`); await P.images(pics.slice(0, 40)); }
  P.ensure(140); P.y += 70; P.g.fillStyle = '#111'; P.g.fillRect(P.M, P.y, 440, 2); P.g.fillRect(P.W - P.M - 440, P.y, 440, 2); P.font(20); P.g.fillText('Signatur förare / arbetsledare', P.M, P.y + 8); P.g.fillText('Attest beställare – namn och datum', P.W - P.M - 440, P.y + 8);
  P.footer(`${s.company || 'Tidrapport'} – ${r.title}`);
  return P.toBlob();
}
async function weekPdfFile() { const r = range(), R = report(r.from, r.to); const blob = await buildPdf(r, R); const w = repMode === 'week' ? `v${wk.week}-${wk.year}` : `${mo.y}-${pad(mo.m + 1)}`; return { file: new File([blob], `Tidrapport-${w}${personFilter !== 'all' ? '-' + slug((people().find(p => p.id === personFilter) || {}).name) : ''}.pdf`, { type: 'application/pdf' }), r, R }; }
let openMail = u => { location.href = u; };
async function sendWeek() {
  toast('Skapar PDF…');
  const { file, r, R } = await weekPdfFile();
  const subject = repMode === 'week' ? `Tidrapport vecka ${wk.week}` : `Tidrapport ${MONTHS[mo.m]} ${mo.y}`;
  const body = shareText(r, R) + '\n\nPDF bifogad.';
  const to = (S().recipients || '').split(/[,;\s]+/).filter(x => x.includes('@')).join(',');
  if (to) { try { await navigator.clipboard.writeText(to); } catch (e) {} }
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: subject, text: body }); if (to) toast('Mottagarna är kopierade – klistra in i Till'); return 'shared'; } }
  catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  download(file.name, file, 'application/pdf');
  openMail(`mailto:${encodeURIComponent(to).replace(/%2C/g, ',').replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace('PDF bifogad.', `Bifoga PDF:en ${file.name} från Hämtade filer.`))}`);
  toast('PDF sparad – bifoga den i mejlet'); return 'mailto';
}

function teamCards() {
  const me = ME(), c = db.company, owner = !c || c.role === 'owner';
  return `<div class="card" id="profileCard"><h2>Profil och lås</h2>
    <p>Inloggad som <b>${esc(me.name || '–')}</b>${db.profiles.length > 1 ? ` · ${db.profiles.length} personer på telefonen` : ''}</p>
    ${me.pinHash ? `<label style="display:flex;align-items:center;gap:10px;min-height:56px"><input type="checkbox" id="lockOn" ${S().lock ? 'checked' : ''} style="width:28px;height:28px"> Lås appen med PIN</label>
      <div class="grid2"><button class="secondary" data-act="pinSet">Byt PIN</button><button class="secondary" data-act="pinRemove">Ta bort PIN</button></div>` : '<button class="secondary" data-act="pinSet" id="pinSetBtn">🔒 Sätt PIN (4 siffror)</button>'}
    <div class="grid2"><button class="secondary" data-act="addPerson">+ Person</button>${db.profiles.length > 1 ? '<button class="secondary" data-act="switchPerson">Byt person</button>' : '<span></span>'}</div>
    <label style="display:flex;align-items:center;gap:10px;min-height:56px"><input type="checkbox" data-s="gps" id="gpsOn" ${st.gps ? 'checked' : ''} style="width:28px;height:28px"> Visa GPS-knapp för plats (av som standard)</label>
    <p class="muted small">PIN-låset är ett enkelt lås mot nyfikna, ingen riktig säkerhet. PIN sparas aldrig i klartext (SHA-256 + salt), men datan i telefonen är inte krypterad.</p></div>
  <div class="card" id="teamCard"><h2>Företag och team</h2>
    <p>${c ? `<b>${esc(c.name)}</b> · ID ${esc(c.id)} · ${owner ? 'du är ägare' : `anställd${c.owner ? ` (ägare ${esc(c.owner)})` : ''}`}` : 'Inget företag'}</p>
    <button class="primary" data-act="openTeam" id="teamBtn">👥 ${owner ? 'Bjud in / läs in från anställda' : 'Skicka till ägaren / uppdatera'}</button></div>
  <div class="card" id="mailCard"><h2>E-post</h2>
    <label>Standardmottagare för veckorapporten<input type="text" data-s="recipients" id="recipIn" inputmode="email" value="${esc(st.recipients || '')}" placeholder="namn@exempel.se, annan@exempel.se"></label>
    <p class="muted small">”Skicka veckorapport” skapar en PDF och öppnar delningsmenyn (välj Gmail). Mottagarna kopieras så att du kan klistra in dem. Spara med knappen längst ner.</p></div>`;
}
const lastCatFor = () => { const r = dayRows(cur).slice(-1)[0] || [...db.rows].filter(mine).sort((x, y) => (y.created || 0) - (x.created || 0))[0]; return catById((r && r.categoryId) || S().lastCat) || null; };
/* ================= Navigering & händelser ================= */
let view = 'today';
const RENDER = { today: renderToday, week: renderWeek, set: renderSet };
function renderView() { RENDER[view](); if (sheet) renderSheet(); }
function show(v) {
  view = v; $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'set') st = null;
  if (v === 'week') { wk = isoWeek(parse(cur)); mo = { y: parse(cur).getFullYear(), m: parse(cur).getMonth() }; }
  RENDER[v](); window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.onclick = () => { closeSheet(); show(b.dataset.v); });
$('#profBtn').onclick = () => { closeSheet(); if (lockActive() && ME().pinHash) showLock(); else show('set'); };
function renderHeader() { $('#logo').textContent = S().company || 'Tidrapport'; $('#topSub').textContent = ME().name || S().name || ''; const b = $('#profBtn'); b.textContent = ME().pinHash && S().lock ? '🔒' : '👤'; b.title = ME().pinHash && S().lock ? 'Lås nu' : 'Profil'; }
const byId = (arr, el) => arr.find(x => x.id === el.dataset.v);
const ACT = {
  dPrev: () => goDate(ymd(addDays(cur, -1))), dNext: () => goDate(ymd(addDays(cur, 1))), dToday: () => goDate(today()),
  goDate: el => goDate(el.dataset.v),
  openDay: el => { cur = el.dataset.v; undoIds = null; show('today'); },
  copyPrev, undo: () => { db.rows = db.rows.filter(r => !undoIds.includes(r.id)); db.extras = db.extras.filter(x => !undoIds.includes(x.id)); undoIds = null; save(); renderToday(); toast('Ångrat'); },
  cat: el => { rd = newRowDraft(el.dataset.v); openSheet('row'); },
  rowEdit: el => { rd = rowToDraft(byId(db.rows, el)); openSheet('row'); sheetMore = !!(rd.note || rd.materials.length || rd.imageIds.length || rd.wo || rd.km.km); renderSheet(); },
  rowDel: async () => { const r = db.rows.find(x => x.id === rd.id); if (!confirm(`Ta bort ${h(r.hours)} h ${r.catName}?`)) return; db.rows = db.rows.filter(x => x !== r); save(); await deleteImages(r.imageIds); closeSheet(); renderView(); toast('Borttagen'); },
  hMinus: () => setHours(num(rd.hours) - 0.5), hPlus: () => setHours(num(rd.hours) + 0.5), hSet: el => setHours(el.dataset.v),
  addon: el => { const id = el.dataset.v, x = catById(rd.categoryId).addons.find(a => a.id === id); if (id in rd.addons) delete rd.addons[id]; else rd.addons[id] = x.unit === 'h' ? rd.hours : x.unit ? 1 : ''; renderSheet(); },
  allAddons: () => { sheetAll = true; renderSheet(); },
  matAdd: el => { const m = S().materials[el.dataset.v]; rd.materials.push({ name: m.name, unit: m.unit, qty: '' }); sheetMore = true; renderSheet(); const ins = $$('[data-mat]'); ins[ins.length - 1]?.focus(); },
  matDel: el => { rd.materials.splice(+el.dataset.v, 1); renderSheet(); },
  rowSave: saveRow, close: () => closeSheet(),
  gps: () => {
    if (!navigator.geolocation) return toast('GPS saknas');
    toast('Hämtar position…');
    navigator.geolocation.getCurrentPosition(p => { const g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; setDay(cur, { gps: g, place: getDay(cur).place || `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` }); renderSheet(); toast('Position sparad ✓'); }, () => toast('Kunde inte hämta position'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  },
  newExtra: () => { ex = newEx(); openSheet('extra'); },
  exMode: el => { ex.mode = el.dataset.v; ex.editId = null; renderSheet(); },
  exArt: el => { const n = el.dataset.v, a = S().articles.find(x => x.name === n); if (n in ex.arts) delete ex.arts[n]; else ex.arts[n] = artDefault(a || { unit: 'st' }); renderSheet(); },
  exArtQ: el => { const n = el.dataset.v; ex.arts[n] = Math.max(0, num(ex.arts[n]) + num(el.dataset.d)); const i = [...$$('[data-artq]')].find(x => x.dataset.artq === n); if (i) i.value = ex.arts[n]; },
  exArtNew: () => { const n = (prompt('Ny artikel (t.ex. Kabelvagn)') || '').trim(); if (!n) return; if (!S().articles.some(x => x.name === n)) { S().articles.push({ name: n, unit: 'st' }); save(); } ex.arts[n] = 1; renderSheet(); },
  exSaveArt: saveArts, exEdit: el => editExtra(el.dataset.v), exCancel: resetEx,
  exDel: async () => { const x = db.extras.find(y => y.id === ex.editId); if (!x || !confirm('Ta bort?')) return; db.extras = db.extras.filter(y => y !== x); save(); await deleteImages(x.imageIds); resetEx(); toast('Borttagen'); },
  artDefAdd: () => { st.articles.push({ name: '', unit: 'st' }); renderSet(); },
  artDefDel: el => { st.articles.splice(+el.dataset.v, 1); renderSet(); },
  newDev: () => { dv = newDev(); openSheet('dev'); },
  devEdit: el => { const x = byId(db.devs, el); dv = { ...clone(x), hours: x.hours || '' }; openSheet('dev'); },
  devType: el => { dv.type = el.dataset.v; $$('[data-act=devType]').forEach(b => b.classList.toggle('sel', b === el)); },
  devStatus: el => { dv.status = el.dataset.v; $$('[data-act=devStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  devSave: saveDev,
  devDel: async () => { const x = db.devs.find(d => d.id === dv.id); if (!confirm('Ta bort avvikelsen?')) return; db.devs = db.devs.filter(d => d !== x); save(); await deleteImages(x.imageIds); closeSheet(); renderView(); toast('Borttagen'); },
  newAta: () => { at = newAta(); openSheet('ata'); },
  ataEdit: el => { at = ataToDraft(byId(db.atas, el)); openSheet('ata'); },
  ataType: el => { at.type = el.dataset.v; $$('[data-act=ataType]').forEach(b => b.classList.toggle('on', b === el)); },
  ataStatusCycle: el => { at.status = nextStatus(at.status); el.className = 'statusbtn st-' + at.status; el.querySelector('b').textContent = statusLbl(at.status); },
  ataArt: el => { const n = el.dataset.v, a = S().articles.find(x => x.name === n); if (n in at.articles) delete at.articles[n]; else at.articles[n] = artDefault(a || { unit: 'st' }); sheetMore = true; renderSheet(); },
  ataStatus: el => { at.status = el.dataset.v; $$('[data-act=ataStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  ataSave: saveAta,
  ataDel: async () => { const x = db.atas.find(d => d.id === at.id); if (!confirm(`Ta bort ${ataNo(x)}?`)) return; db.atas = db.atas.filter(d => d !== x); save(); await deleteImages(x.imageIds); closeSheet(); renderView(); toast('Borttagen'); },
  repMode: el => { repMode = el.dataset.v; renderWeek(); },
  repPrev: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), -7)); else { mo.m--; if (mo.m < 0) { mo.m = 11; mo.y--; } } renderWeek(); },
  repNext: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), 7)); else { mo.m++; if (mo.m > 11) { mo.m = 0; mo.y++; } } renderWeek(); },
  print: doPrint, share,
  setupDone: finishSetup, joinDone: finishJoin,
  suOwner: () => { setupStage = 'owner'; renderSetup(); }, suMember: () => { setupStage = 'member'; renderSetup(); }, suBack: () => { setupStage = 'choose'; pendingInvite = null; renderSetup(); },
  scanQr: startScan, scanClose: stopScan, inviteFromText: () => handleJoinText($('#inviteCode').value),
  pinKey: el => pinDigit(el.dataset.v), pinBack: () => { pinBuf = pinBuf.slice(0, -1); $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length)); },
  pinWho: el => { pinProfile = db.profiles.find(p => p.id === el.dataset.v); pinBuf = ''; renderLock(); },
  pinCancel: () => { $('#lock').classList.add('hidden'); pinMode = null; },
  pinForgot: () => { const n = prompt(`Glömt PIN? Skriv namnet "${pinProfile.name}" för att ta bort PIN-koden. (Låset är ingen riktig säkerhet.)`); if (n && n.trim().toLowerCase() === String(pinProfile.name).toLowerCase()) { delete pinProfile.pinHash; delete pinProfile.salt; save(); localStorage.setItem(ME_KEY, pinProfile.id); $('#lock').classList.add('hidden'); pinMode = null; renderHeader(); renderView(); toast('PIN borttagen'); } },
  pinSet: () => showLock('set1'),
  pinRemove: () => { if (!confirm('Ta bort PIN?')) return; const p = db.profiles.find(x => x.id === ME().id); delete p.pinHash; delete p.salt; if (!db.profiles.some(x => x.pinHash)) S().lock = false; save(); renderHeader(); renderSet(); },
  addPerson: () => { const n = (prompt('Namn på personen som ska använda telefonen') || '').trim(); if (!n) return; const p = { id: uid(), name: n, role: db.company && db.company.role === 'member' ? 'employee' : 'employee', created: Date.now() }; db.profiles.push(p); localStorage.setItem(ME_KEY, p.id); save(); renderHeader(); st = null; renderSet(); toast(`Bytt till ${n}`); },
  switchPerson: () => { if (db.profiles.some(p => p.pinHash) && S().lock) return showLock(); const names = db.profiles.map((p, i) => `${i + 1}. ${p.name}`).join('\n'); const i = num(prompt('Byt till:\n' + names)) - 1; if (db.profiles[i]) { localStorage.setItem(ME_KEY, db.profiles[i].id); save(); renderHeader(); st = null; renderSet(); } },
  openTeam: () => openSheet('team'), shareInvite, copyInvite: async () => { if (!inviteCode) inviteCode = await packJson(invitePayload()); try { await navigator.clipboard.writeText(inviteUrl(inviteCode)); toast('Länken kopierad'); } catch (e) { prompt('Kopiera länken:', inviteUrl(inviteCode)); } },
  sendOwner: () => exportMine(false), sendOwnerAll: () => exportMine(true),
  timerQuick: () => { const c = lastCatFor(); if (!c) return; const pj = lastProjectFor(cur) || S().defaultProject, lr = [...db.rows].filter(r => mine(r) && r.categoryId === c.id).sort((x, y) => (y.created || 0) - (x.created || 0))[0], ad = {}; ((lr && lr.addons) || []).forEach(x => ad[x.id] = x.unit ? x.qty : ''); rd = { categoryId: c.id, project: pj, sub: lastSubFor(pj) || '', addons: ad }; startTimer(); },
  timerStart: startTimer, timerStop: () => stopTimer(false),
  sendWeek, pdfDownload: async () => { toast('Skapar PDF…'); const { file } = await weekPdfFile(); download(file.name, file, 'application/pdf'); toast('PDF sparad ✓'); },
  projAdd: () => { const v = $('#newProj').value.trim(); if (v && !st.projects.includes(v)) st.projects.push(v); renderSet(); },
  projDel: el => { if (st.projects.length <= 1) return toast('Minst ett projekt behövs'); st.projects.splice(+el.dataset.v, 1); renderSet(); },
  addonAdd: el => { st.categories[+el.dataset.v].addons.push(a('')); renderSet(); const ins = $$(`[data-a^="${el.dataset.v}."][data-a$=".name"]`); ins[ins.length - 1]?.focus(); },
  addonDel: el => { const [ci, ai] = el.dataset.v.split('.').map(Number); st.categories[ci].addons.splice(ai, 1); renderSet(); },
  catAdd: () => { st.categories.push({ id: uid(), name: 'Ny resurs', icon: '🔧', rate: '', km: false, addons: [] }); renderSet(); },
  catDel: el => { const c = st.categories[+el.dataset.v]; if (confirm(`Ta bort ${c.name}? Gamla rader behålls.`)) { st.categories.splice(+el.dataset.v, 1); renderSet(); } },
  matDefAdd: () => { st.materials.push({ name: '', unit: 'st' }); renderSet(); },
  matDefDel: el => { st.materials.splice(+el.dataset.v, 1); renderSet(); },
  setSave: saveSettings,
  csv: () => { download(`tidrapport-${today()}.csv`, toCSV(), 'text/csv;charset=utf-8'); toast('CSV exporterad'); },
  backup
};
document.addEventListener('click', e => {
  const img = e.target.closest('img[data-img]'); if (img) return openLightbox(img.dataset.img);
  if (e.target.id === 'sheetBg') return closeSheet();
  const el = e.target.closest('[data-act]'); if (!el || !ACT[el.dataset.act]) return;
  e.preventDefault(); ACT[el.dataset.act](el);
});
document.addEventListener('input', e => {
  const t = e.target, val = t.type === 'checkbox' ? t.checked : t.value;
  switch (t.id) {
    case 'lockOn': S().lock = !!val; save(); renderHeader(); return;
    case 'personSel': personFilter = val; renderWeek(); return;
    case 'fProject': rd.project = val; return; case 'fSub': rd.sub = val; return; case 'fMh': rd.mh = val; return;
    case 'exProject': if (ex.project !== val) { ex.project = val; ex.sub = lastSubFor(val); renderSheet(); } return; case 'exSub': ex.sub = val; return; case 'exArtNote': ex.artNote = val; return; case 'fWo': rd.wo = val; return; case 'fNote': rd.note = val; return;
    case 'dPlace': return setDay(cur, { place: val });
    case 'dvDesc': dv.desc = val; return; case 'dvDate': dv.date = val; return; case 'dvHours': dv.hours = val; return; case 'dvProject': dv.project = val; return;
    case 'atDesc': at.desc = val; return; case 'atBy': at.orderedBy = val; return; case 'atDate': at.date = val; return; case 'atHours': at.hours = val; return; case 'atProject': at.project = val; return; case 'atSub': at.sub = val; return; case 'atMat': at.material = val; return; case 'atAmount': at.amount = val; return; case 'atCat': at.categoryId = val; return;
  }
  if (t.dataset.q) rd.addons[t.dataset.q] = val;
  else if (t.dataset.km) rd.km[t.dataset.km] = val;
  else if (t.dataset.mat) rd.materials[+t.dataset.mat].qty = val;
  else if (t.dataset.s) st[t.dataset.s] = val;
  else if (t.dataset.c) { const [ci, k] = t.dataset.c.split('.'); st.categories[+ci][k] = val; }
  else if (t.dataset.a) { const [ci, ai, k] = t.dataset.a.split('.'); st.categories[+ci].addons[+ai][k] = val; }
  else if (t.dataset.artq) ex.arts[t.dataset.artq] = val;
  else if (t.dataset.ataq) at.articles[t.dataset.ataq] = val;
  else if (t.dataset.ar) { const [i, k] = t.dataset.ar.split('.'); st.articles[+i][k] = val; }
  else if (t.dataset.m) { const [i, k] = t.dataset.m.split('.'); st.materials[+i][k] = val; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dPick' && t.value) goDate(t.value);
  if (t.id === 'restoreFile' && t.files[0]) { restore(t.files[0]); t.value = ''; }
  if ((t.id === 'importFile' || t.id === 'inviteFile') && t.files[0]) { importAny(t.files[0]); t.value = ''; }
  if (t.matches('select,input[type=checkbox]')) t.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('submit', e => { if (e.target.id === 'quickForm') { e.preventDefault(); const i = $('#qIn'); if (i.value.trim()) quickSave(i.value.trim()); } });
document.addEventListener('toggle', e => { if (e.target.id === 'more') sheetMore = e.target.open; }, true);
document.addEventListener('click', e => { const l = e.target.closest('label.dl'); if (l && !e.target.matches('input')) { const i = $('#dPick'); try { i.showPicker(); } catch (er) { i.focus(); } } });

/* ================= Start ================= */
(async () => {
  renderHeader();
  try {
    await IDB.open();
    const all = await IDB.all(); const refs = allRefs();
    for (const o of all) { if (refs.has(o.id) || Date.now() - o.created < 864e5) thumbs.set(o.id, o.thumb); else await IDB.del(o.id); }
  } catch (e) { console.warn('IndexedDB', e); }
  renderView();
  const jm = location.hash.match(/#join=([A-Za-z0-9_-]+)/);
  if (jm) { history.replaceState(null, '', location.pathname); await handleJoinText('#join=' + jm[1]); }
  if (!S().setupDone && !pendingInvite) renderSetup();
  else if (lockActive()) showLock();
})();
window.addEventListener('hashchange', () => { const m = location.hash.match(/#join=([A-Za-z0-9_-]+)/); if (m) { history.replaceState(null, '', location.pathname); handleJoinText('#join=' + m[1]); } });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
