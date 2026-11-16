'use strict';
const VERSION = '3.0.0';
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
const DEFAULT_MATERIALS = [['Diesel', 'l'], ['AdBlue', 'l'], ['Grus', 'ton'], ['Makadam', 'ton'], ['Sand', 'ton'], ['Kabel', 'm'], ['Rör', 'm']].map(([name, unit]) => ({ name, unit }));
const DEV_TYPES = [['sakerhet', 'Säkerhet/tillbud', '⛑️'], ['haveri', 'Maskinhaveri', '🔧'], ['vader', 'Väder', '🌧️'], ['vantetid', 'Väntetid', '⏳'], ['material', 'Material saknas', '📦'], ['ovrigt', 'Övrigt', '📝']];
const ATA_STATUS = [['beordrad', 'Beordrad'], ['utford', 'Utförd'], ['godkand', 'Godkänd'], ['fakturerad', 'Fakturerad']];
const UNITS = ['', 'h', 'st', 'km', 'l', 'm', 'ton'];
function defaultSettings() {
  return { company: 'Granfors Åkeri AB', name: '', rate: '', otLimit: 8, defBreak: 30, projects: ['Allmänt'], defaultProject: 'Allmänt', categories: defaultCategories(), materials: clone(DEFAULT_MATERIALS), lastCat: '' };
}

/* ================= Lagring ================= */
function emptyDb() { return { v: 2, settings: defaultSettings(), rows: [], days: {}, devs: [], atas: [] }; }
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
  ['rows', 'devs', 'atas'].forEach(k => db[k] = Array.isArray(db[k]) ? db[k] : []); db.days = db.days || {}; return db;
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.settings) return normalize(d); } catch (e) {}
  try { const d1 = JSON.parse(localStorage.getItem(KEY1)); if (d1 && d1.settings && Array.isArray(d1.entries)) { const m = migrateV1(d1); localStorage.setItem(KEY, JSON.stringify(m)); setTimeout(() => toast(`Gammal data flyttad (${m.rows.length} rader)`), 600); return m; } } catch (e) {}
  return emptyDb();
}
let db = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Kunde inte spara – lagringen är full. Ta backup och rensa gamla bilder.'); } }
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
function allRefs() { const s = new Set(); [...db.rows, ...db.devs, ...db.atas, ...Object.values(db.days)].forEach(x => (x.imageIds || []).forEach(i => s.add(i))); [rd, dv, at].forEach(x => x && (x.imageIds || []).forEach(i => s.add(i))); return s; }
async function deleteImage(id) {
  [...db.rows, ...db.devs, ...db.atas, ...Object.values(db.days), rd, dv, at].forEach(x => { if (x && x.imageIds) x.imageIds = x.imageIds.filter(i => i !== id); });
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
  if (t.dataset.photo === 'day') { setDay(cur, { imageIds: [...(getDay(cur).imageIds || []), ...ids] }); renderToday(); if (ids.length) toast('Bild sparad på dagen ✓'); return; }
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
const dayRows = d => db.rows.filter(r => r.date === d).sort((x, y) => (x.created || 0) - (y.created || 0));
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
function lastProjectFor(d) { const r = dayRows(d).slice(-1)[0] || [...db.rows].sort((x, y) => y.date.localeCompare(x.date) || (y.created || 0) - (x.created || 0))[0]; return r ? r.project : S().defaultProject; }
const prevWorkDay = d => [...new Set(db.rows.map(r => r.date))].filter(x => x < d).sort().pop();
function dateLabel(d) { const t = today(); if (d === t) return 'Idag'; if (d === ymd(addDays(t, -1))) return 'Igår'; if (d === ymd(addDays(t, 1))) return 'Imorgon'; return dayName(d); }
function addonOrder(cat) {
  const cnt = {}; db.rows.filter(r => r.categoryId === cat.id).forEach(r => (r.addons || []).forEach(x => cnt[x.id] = (cnt[x.id] || 0) + 1));
  return cat.addons.map((x, i) => ({ x, i, c: cnt[x.id] || 0 })).sort((p, q) => q.c - p.c || p.i - q.i).map(o => o.x);
}
const rowSub = r => [r.project, addonText(r), r.km && r.km.km ? r.km.km + ' km' : '', r.note].filter(Boolean).join(' · ');
function renderToday() {
  const rows = dayRows(cur), tot = dayTotal(cur), lim = num(S().otLimit) || 8, day = getDay(cur);
  const prev = prevWorkDay(cur), prevRows = prev ? dayRows(prev) : [];
  const w = isoWeek(parse(cur)), mon = mondayOf(w.year, w.week);
  const devs = db.devs.filter(x => x.date === cur), atas = db.atas.filter(x => x.date === cur);
  const wdays = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const wtot = wdays.reduce((s, d) => s + dayTotal(d), 0);
  $('#view-today').innerHTML = `
  <div class="dhead">
    <button class="nb" data-act="dPrev" aria-label="Föregående dag">‹</button>
    <label class="dl"><b id="dLabel">${dateLabel(cur)}</b><span>${longDate(cur)}</span><input type="date" id="dPick" value="${cur}" aria-label="Välj datum"></label>
    <button class="nb" data-act="dNext" aria-label="Nästa dag">›</button>
  </div>
  ${cur !== today() ? '<button class="link" data-act="dToday">← Till idag</button>' : ''}
  ${rows.length || devs.length || atas.length ? `<div class="daycard">
      ${rows.length ? `<div class="dtot"><b id="dayTotal">${h(tot)} h</b><span>${tot > lim ? `<span class="ot">varav ${h(tot - lim)} h övertid</span>` : 'sparat ✓'}</span></div>` : ''}
      <ul class="rows" id="dayList">${rows.map(r => `<li><button class="rowbtn" data-act="rowEdit" data-v="${r.id}"><i>${r.catIcon || '⏱️'}</i><span><b>${esc(r.catName)}</b><small>${esc(rowSub(r))}${r.imageIds?.length ? ` · 📷${r.imageIds.length}` : ''}</small></span><em>${h(r.hours)}</em></button></li>`).join('')}
      ${devs.map(x => `<li><button class="rowbtn" data-act="devEdit" data-v="${x.id}"><i>⚠️</i><span><b>Avvikelse${x.status === 'fixed' ? ' ✓' : ''}</b><small>${esc(x.desc)}</small></span></button></li>`).join('')}
      ${atas.map(x => `<li><button class="rowbtn" data-act="ataEdit" data-v="${x.id}"><i>➕</i><span><b>ÄTA ${x.nr}</b><small>${esc(x.desc)}</small></span><em>${x.hours ? h(x.hours) : ''}</em></button></li>`).join('')}</ul>
      ${undoIds ? '<button class="link" data-act="undo" id="undoBtn">↶ Ångra</button>' : ''}
    </div>` : ''}
  ${!rows.length && prevRows.length ? `<button class="same" data-act="copyPrev" id="sameBtn"><b>${prev === ymd(addDays(cur, -1)) ? 'Samma som igår' : 'Samma som ' + fmtDate(prev)}</b><span>${h(dayTotal(prev))} h · ${esc([...new Set(prevRows.map(r => `${r.catIcon} ${r.catName}`))].join(' + '))} · ${esc([...new Set(prevRows.map(r => r.project))].join(', '))}</span></button>` : ''}
  <div class="sect">${rows.length ? 'Lägg till mer' : prevRows.length ? 'Eller välj' : 'Vad har du kört?'}</div>
  <div class="cats" id="cats">${S().categories.map(c => `<button class="cat" data-act="cat" data-v="${c.id}"><i>${esc(c.icon)}</i>${esc(c.name)}</button>`).join('')}</div>
  <div class="tools">
    <label class="tool" aria-label="Ta foto">📷<span>Foto</span><input type="file" accept="image/*" capture="environment" data-photo="day"></label>
    <button class="tool" data-act="newDev" id="devBtn">⚠️<span>Avvikelse</span></button>
    <button class="tool" data-act="newAta" id="ataBtn">➕<span>ÄTA</span></button>
  </div>
  ${day.imageIds?.length ? `<div class="photos" id="dayPhotos">${thumbsHtml(day.imageIds)}</div>` : ''}
  <div class="sect">Vecka ${w.week} · <b>${h(wtot)} h</b></div>
  <ul class="week">${wdays.map(d => { const t = dayTotal(d); return `<li><button data-act="goDate" data-v="${d}" class="${d === cur ? 'on' : ''}"><span>${dayName(d).slice(0, 3)} ${parse(d).getDate()}/${parse(d).getMonth() + 1}</span><small>${esc([...new Set(dayRows(d).map(r => r.catIcon))].join(' '))}</small><b class="${t > lim ? 'ot' : ''}">${t ? h(t) : '–'}</b></button></li>`; }).join('')}</ul>`;
}
function goDate(d) { cur = d; undoIds = null; renderToday(); }
function copyPrev() {
  const prev = prevWorkDay(cur); if (!prev) return;
  const t = Date.now(); undoIds = [];
  dayRows(prev).forEach((r, i) => { const id = uid(); undoIds.push(id); db.rows.push({ ...clone(r), id, date: cur, imageIds: [], created: t + i }); });
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
  if (!fromPop && history.state && history.state.sheet) history.back();
}
addEventListener('popstate', () => closeSheet(true));
function renderSheet() { if (!sheet) return; $('#sheetBody').innerHTML = { row: sheetRow, dev: sheetDev, ata: sheetAta }[sheet](); }
const head = (icon, title, sub) => `<div class="sh-head"><i>${icon}</i><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><button class="x" data-act="close" aria-label="Stäng">✕</button></div>`;
function newRowDraft(catId) {
  const rem = (num(S().otLimit) || 8) - dayTotal(cur);
  return { id: null, categoryId: catId, hours: rem > 0 ? rem : 2, project: lastProjectFor(cur), wo: '', addons: {}, km: { km: '', from: '', to: '' }, materials: [], note: '', imageIds: [] };
}
function rowToDraft(r) {
  const ad = {}; (r.addons || []).forEach(x => ad[x.id] = x.unit ? x.qty : '');
  return { id: r.id, categoryId: r.categoryId, hours: r.hours, project: r.project, wo: r.wo || '', addons: ad, km: { km: '', from: '', to: '', ...(r.km || {}) }, materials: clone(r.materials || []), note: r.note || '', imageIds: [...(r.imageIds || [])] };
}
function sheetRow() {
  const cat = catById(rd.categoryId) || { name: (db.rows.find(r => r.id === rd.id) || {}).catName || 'Rad', icon: '⏱️', addons: [], km: false };
  const ordered = addonOrder(cat), top = ordered.slice(0, 4);
  const shown = sheetAll ? ordered : ordered.filter(x => top.includes(x) || x.id in rd.addons);
  const day = getDay(cur);
  return `${head(esc(cat.icon), esc(cat.name), `${esc(rd.project)} · ${fmtDate(cur)}`)}
  <div class="bighours"><button class="pm" data-act="hMinus" aria-label="Minska">−</button><div><b id="hOut">${h(rd.hours)}</b><span>timmar</span></div><button class="pm" data-act="hPlus" aria-label="Öka">+</button></div>
  <div class="quick">${[4, 6, 8, 10].map(v => `<button data-act="hSet" data-v="${v}" class="${num(rd.hours) === v ? 'sel' : ''}">${v}</button>`).join('')}</div>
  ${cat.addons.length ? `<div class="chips" id="addonChips">${shown.map(x => `<button class="chip ${x.id in rd.addons ? 'sel' : ''}" data-act="addon" data-v="${x.id}">${esc(x.name)}</button>`).join('')}${!sheetAll && ordered.length > shown.length ? `<button class="chip more" data-act="allAddons">Fler…</button>` : ''}</div>
  <div class="qtys">${cat.addons.filter(x => x.unit && x.id in rd.addons).map(x => `<div class="qty"><span>${esc(x.name)}</span><input type="number" inputmode="decimal" step="0.5" min="0" data-q="${x.id}" value="${rd.addons[x.id]}"><em>${x.unit}</em></div>`).join('')}</div>` : ''}
  <details id="more" ${sheetMore ? 'open' : ''}><summary>Mer${rd.imageIds.length ? ` · 📷${rd.imageIds.length}` : ''}${rd.note ? ' · ✎' : ''}</summary>
    <label>Projekt<select id="fProject">${projOptions(rd.project)}</select></label>
    ${cat.km ? `<div class="lbl">Körjournal</div><div class="grid2"><input type="text" data-km="from" placeholder="Från" value="${esc(rd.km.from)}"><input type="text" data-km="to" placeholder="Till" value="${esc(rd.km.to)}"></div><div class="qty"><span>Körda km</span><input type="number" inputmode="decimal" data-km="km" value="${esc(rd.km.km)}" placeholder="0"><em>km</em></div>` : ''}
    <label>Anteckning<textarea id="fNote" rows="2" placeholder="Vad gjordes? (🎤 på tangentbordet)">${esc(rd.note)}</textarea></label>
    ${photoWidget('row', rd.imageIds)}
    <label>Arbetsorder<input type="text" id="fWo" value="${esc(rd.wo)}" placeholder="AO-nummer"></label>
    <div class="lbl">Material</div>
    <div id="matList">${rd.materials.map((m, i) => `<div class="qty"><span>${esc(m.name)}</span><input type="number" inputmode="decimal" data-mat="${i}" value="${esc(m.qty)}"><em>${esc(m.unit)}</em><button class="mini" data-act="matDel" data-v="${i}" aria-label="Ta bort">✕</button></div>`).join('')}</div>
    <div class="chips">${S().materials.map((m, i) => `<button class="chip" data-act="matAdd" data-v="${i}">+ ${esc(m.name)}</button>`).join('')}</div>
    <div class="lbl">Plats (för hela dagen)</div>
    <div class="row"><input type="text" id="dPlace" placeholder="Plats" value="${esc(day.place || '')}"><button class="mini wide" data-act="gps" aria-label="Hämta GPS">📍</button></div>
    ${day.gps ? `<small class="muted">📍 ${day.gps.lat.toFixed(5)}, ${day.gps.lng.toFixed(5)}</small>` : ''}
  </details>
  <button class="primary" data-act="rowSave" id="saveBtn">Spara</button>
  ${rd.id ? '<button class="del" data-act="rowDel" id="rowDel">Ta bort raden</button>' : ''}`;
}
function setHours(v) { rd.hours = Math.max(0, Math.min(24, Math.round(num(v) * 2) / 2)); $('#hOut').textContent = h(rd.hours); $$('#sheetBody .quick button').forEach(b => b.classList.toggle('sel', num(b.dataset.v) === rd.hours)); }
function saveRow() {
  const cat = catById(rd.categoryId), old = rd.id && db.rows.find(r => r.id === rd.id);
  if (!(num(rd.hours) > 0)) return toast('Ange timmar');
  const addons = cat ? cat.addons.filter(x => x.id in rd.addons).map(x => ({ id: x.id, name: x.name, unit: x.unit, qty: x.unit ? num(rd.addons[x.id]) : 1, price: x.price })) : (old ? old.addons : []);
  const km = cat && cat.km && (rd.km.km || rd.km.from || rd.km.to) ? { km: num(rd.km.km), from: rd.km.from.trim(), to: rd.km.to.trim() } : null;
  const data = { date: cur, project: rd.project, wo: rd.wo.trim(), categoryId: cat ? cat.id : old.categoryId, catName: cat ? cat.name : old.catName, catIcon: cat ? cat.icon : old.catIcon, hours: num(rd.hours), addons, km, materials: rd.materials.filter(m => num(m.qty) > 0).map(m => ({ ...m, qty: num(m.qty) })), note: rd.note.trim(), imageIds: rd.imageIds };
  if (old) Object.assign(old, data, { updated: Date.now() }); else db.rows.push({ id: uid(), created: Date.now(), ...data });
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
  if (dv.id) Object.assign(db.devs.find(x => x.id === dv.id), data, { updated: Date.now() }); else db.devs.push({ id: uid(), created: Date.now(), ...data });
  save(); closeSheet(); renderView(); toast('Avvikelse sparad ✓');
}
const newAta = () => ({ id: null, date: cur, project: lastProjectFor(cur), desc: '', orderedBy: '', hours: '', categoryId: (dayRows(cur).slice(-1)[0] || {}).categoryId || (catById(S().lastCat) || {}).id || '', material: '', amount: '', status: 'beordrad', imageIds: [] });
function sheetAta() {
  return `${head('➕', at.id ? `Ändra ÄTA ${at.nr || ''}` : 'ÄTA – extra arbete', fmtDate(at.date))}
  <textarea id="atDesc" rows="4" placeholder="Vad ska göras / gjordes? Tryck 🎤 för att prata.">${esc(at.desc)}</textarea>
  <input type="text" id="atBy" value="${esc(at.orderedBy)}" placeholder="Vem beställde? (valfritt)">
  ${photoWidget('ata', at.imageIds)}
  <details id="more" ${sheetMore ? 'open' : ''}><summary>Mer (timmar, status, belopp)</summary>
    <div class="grid2"><label>Timmar<input type="number" inputmode="decimal" step="0.5" id="atHours" value="${esc(at.hours)}" placeholder="0"></label><label>Datum<input type="date" id="atDate" value="${at.date}"></label></div>
    <label>Resurs<select id="atCat"><option value="">–</option>${S().categories.map(c => `<option value="${c.id}"${c.id === at.categoryId ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
    <label>Projekt<select id="atProject">${projOptions(at.project)}</select></label>
    <label>Material<input type="text" id="atMat" value="${esc(at.material)}" placeholder="t.ex. 6 ton makadam"></label>
    <label>Belopp kr<input type="number" inputmode="decimal" id="atAmount" value="${esc(at.amount)}" placeholder="annars timpris"></label>
    <div class="seg">${ATA_STATUS.map(([k, n]) => `<button data-act="ataStatus" data-v="${k}" class="${at.status === k ? 'on' : ''}">${n}</button>`).join('')}</div>
  </details>
  <button class="primary" data-act="ataSave" id="ataSave">Spara</button>
  ${at.id ? '<button class="del" data-act="ataDel">Ta bort</button>' : ''}`;
}
function saveAta() {
  if (!at.desc.trim() && !at.imageIds.length) return toast('Skriv något eller ta en bild');
  const c = catById(at.categoryId);
  const data = { date: at.date || cur, project: at.project, desc: at.desc.trim(), orderedBy: at.orderedBy.trim(), hours: num(at.hours), categoryId: at.categoryId, catName: c ? c.name : '', material: at.material.trim(), amount: at.amount === '' ? '' : num(at.amount), status: at.status, imageIds: at.imageIds };
  if (at.id) Object.assign(db.atas.find(x => x.id === at.id), data, { updated: Date.now() });
  else db.atas.push({ id: uid(), nr: db.atas.reduce((m, x) => Math.max(m, x.nr || 0), 0) + 1, created: Date.now(), ...data });
  save(); closeSheet(); renderView(); toast('ÄTA sparad ✓');
}

/* ================= Vecka ================= */
function renderWeek() {
  const r = range(), R = report(r.from, r.to), lim = R.lim;
  const dates = []; for (let d = r.from; d <= r.to; d = ymd(addDays(d, 1))) dates.push(d);
  const shownDates = repMode === 'week' ? dates : dates.filter(d => dayTotal(d) > 0);
  $('#view-week').innerHTML = `
  <div class="seg small"><button data-act="repMode" data-v="week" class="${repMode === 'week' ? 'on' : ''}">Vecka</button><button data-act="repMode" data-v="month" class="${repMode === 'month' ? 'on' : ''}">Månad</button></div>
  <div class="dhead"><button class="nb" data-act="repPrev" aria-label="Föregående">‹</button><div class="dl"><b id="repLabel">${r.label}</b><span>${r.sub}</span></div><button class="nb" data-act="repNext" aria-label="Nästa">›</button></div>
  <div class="bigtot"><b id="repTotal">${h(R.total)}</b><span>timmar</span>${R.ot ? `<em class="ot" id="repOt">varav ${h(R.ot)} h övertid</em>` : '<em id="repOt"></em>'}</div>
  <ul class="week">${shownDates.map(d => { const t = dayTotal(d); return `<li><button data-act="openDay" data-v="${d}"><span>${dayName(d).slice(0, 3)} ${parse(d).getDate()}/${parse(d).getMonth() + 1}</span><small>${esc([...new Set(dayRows(d).map(r => r.catIcon + ' ' + r.catName))].join(', '))}</small><b class="${t > lim ? 'ot' : ''}">${t ? h(t) : '–'}</b></button></li>`; }).join('') || '<li class="empty">Inga timmar.</li>'}</ul>
  <button class="primary" data-act="print" id="printBtn">📄 Spara PDF</button>
  <button class="secondary" data-act="share" id="shareBtn">📤 Dela</button>
  ${R.devs.length || R.atas.length ? `<div class="sect">Avvikelser och ÄTA</div><ul class="rows">${R.devs.map(x => `<li><button class="rowbtn" data-act="devEdit" data-v="${x.id}"><i>⚠️</i><span><b>${fmtDate(x.date)} · ${x.status === 'open' ? 'Öppen' : 'Åtgärdad'}</b><small>${esc(x.desc)}</small></span></button></li>`).join('')}${R.atas.map(x => `<li><button class="rowbtn" data-act="ataEdit" data-v="${x.id}"><i>➕</i><span><b>ÄTA ${x.nr} · ${statusLbl(x.status)}</b><small>${esc(x.desc)}</small></span><em>${x.hours ? h(x.hours) : ''}</em></button></li>`).join('')}</ul>` : ''}
  ${R.cats.length ? `<details><summary>Detaljer per maskin och tillägg</summary>${catTable(R, R.amount > 0 || R.ataSum > 0)}${R.km ? `<p>Körda km: <b>${h(R.km)}</b></p>` : ''}${R.mats.length ? `<table><tbody>${R.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${h(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}</details>` : ''}`;
}
function shareText(r, R) {
  return `${r.title}\n${S().name ? S().name + ', ' : ''}${S().company}\nTotalt ${h(R.total)} h${R.ot ? ` (varav övertid ${h(R.ot)} h)` : ''}\n\n` +
    R.perDay.map(d => `${dayName(d.date).slice(0, 3)} ${d.date}: ${h(d.total)} h – ${[...new Set(R.rows.filter(x => x.date === d.date).map(x => x.catName + (x.addons.length ? ` (${addonText(x)})` : '')))].join(', ')}`).join('\n') +
    (R.devs.length ? `\n\nAvvikelser: ${R.devs.length}` : '') + (R.atas.length ? `\nÄTA: ${R.atas.map(x => `ÄTA ${x.nr} ${x.desc}`).join('; ')}` : '');
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

/* ================= Första start ================= */
function renderSetup() {
  $('#setup').innerHTML = `<div class="setupbox"><div class="logo big">${esc(S().company || 'Tidrapport')}</div><h1>Välkommen!</h1><p>Två saker, sen är du igång.</p>
  <label>Ditt namn<input type="text" id="suName" value="${esc(S().name)}" autocomplete="name"></label>
  <label>Projekt du jobbar på<input type="text" id="suProj" value="${esc(S().defaultProject === 'Allmänt' ? '' : S().defaultProject)}" placeholder="t.ex. Ledningsbygge"></label>
  <button class="primary" data-act="setupDone" id="setupBtn">Kom igång</button></div>`;
  $('#setup').classList.remove('hidden');
}
function finishSetup() {
  const n = $('#suName').value.trim(), p = $('#suProj').value.trim();
  S().name = n; if (p) { if (!S().projects.includes(p)) S().projects.unshift(p); S().defaultProject = p; }
  S().setupDone = true; save(); $('#setup').classList.add('hidden'); renderHeader(); renderView();
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
function rowAmount(r) { return num(r.hours) * rateFor(r.categoryId) + (r.addons || []).reduce((s, x) => s + addonAmount(x), 0); }
function ataAmount(x) { return x.amount !== '' && x.amount != null ? num(x.amount) : num(x.hours) * rateFor(x.categoryId); }
function report(from, to) {
  const inR = d => d >= from && d <= to;
  const rows = db.rows.filter(r => inR(r.date)).sort((x, y) => x.date.localeCompare(y.date) || (x.created || 0) - (y.created || 0));
  const lim = num(S().otLimit) || 8;
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const perDay = dates.map(d => { const t = rows.filter(r => r.date === d).reduce((s, r) => s + num(r.hours), 0); return { date: d, total: t, ot: Math.max(0, t - lim), day: getDay(d) }; });
  const cats = {};
  rows.forEach(r => {
    const k = r.categoryId || r.catName; const c = cats[k] = cats[k] || { name: r.catName, icon: r.catIcon, hours: 0, amount: 0, addons: {} };
    c.hours += num(r.hours); c.amount += num(r.hours) * rateFor(r.categoryId);
    (r.addons || []).forEach(x => { const ak = x.name + '|' + x.unit; const A = c.addons[ak] = c.addons[ak] || { name: x.name, unit: x.unit, count: 0, qty: 0, amount: 0 }; A.count++; A.qty += num(x.qty); A.amount += addonAmount(x); c.amount += addonAmount(x); });
  });
  const proj = {}; rows.forEach(r => proj[r.project || '–'] = (proj[r.project || '–'] || 0) + num(r.hours));
  const mats = {}; rows.forEach(r => (r.materials || []).forEach(m => { const k = m.name + '|' + m.unit; mats[k] = mats[k] || { name: m.name, unit: m.unit, qty: 0 }; mats[k].qty += num(m.qty); }));
  const trips = rows.filter(r => r.km && (r.km.km || r.km.from)); const km = trips.reduce((s, r) => s + num(r.km.km), 0);
  const devs = db.devs.filter(x => inR(x.date)).sort((x, y) => x.date.localeCompare(y.date));
  const atas = db.atas.filter(x => inR(x.date)).sort((x, y) => x.date.localeCompare(y.date));
  const total = rows.reduce((s, r) => s + num(r.hours), 0), ot = perDay.reduce((s, d) => s + d.ot, 0);
  const amount = rows.reduce((s, r) => s + rowAmount(r), 0), ataSum = atas.reduce((s, x) => s + ataAmount(x), 0);
  return { rows, perDay, cats: Object.values(cats), proj, mats: Object.values(mats), trips, km, devs, atas, total, ot, lim, amount, ataSum, breakMin: perDay.reduce((s, d) => s + num(d.day.breakMin), 0) };
}
function catTable(R, money) {
  return `<table><thead><tr><th>Resurs / tillägg</th><th class="n">Antal</th><th class="n">Timmar</th>${money ? '<th class="n">Belopp</th>' : ''}</tr></thead><tbody>${R.cats.map(c => `<tr><td><b>${esc(c.icon || '')} ${esc(c.name)}</b></td><td></td><td class="n"><b>${h(c.hours)}</b></td>${money ? `<td class="n"><b>${kr.format(c.amount)}</b></td>` : ''}</tr>${Object.values(c.addons).map(A => `<tr><td style="padding-left:22px">${esc(A.name)}</td><td class="n">${A.count} ggr</td><td class="n">${A.unit ? `${h(A.qty)} ${A.unit}` : ''}</td>${money ? `<td class="n">${A.amount ? kr.format(A.amount) : ''}</td>` : ''}</tr>`).join('')}`).join('')}<tr class="tot"><td>Totalt</td><td></td><td class="n">${h(R.total)}</td>${money ? `<td class="n">${kr.format(R.amount)}</td>` : ''}</tr></tbody></table>`;
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
  ${R.rows.map((x, i) => `<tr><td>${i && R.rows[i - 1].date === x.date ? '' : `${dayName(x.date).slice(0, 3)} ${parse(x.date).getDate()}/${parse(x.date).getMonth() + 1}`}</td><td>${esc(x.project)}${x.wo ? `<br><small>${esc(x.wo)}</small>` : ''}</td><td>${esc(x.catName)}</td><td>${esc(addonText(x))}</td><td>${esc(x.note)}${x.imageIds?.length ? ` 📷${x.imageIds.length}` : ''}</td><td class="n">${h(x.hours)}</td></tr>`).join('') || '<tr><td colspan="6">Inga registreringar.</td></tr>'}
  <tr class="tot"><td colspan="5">Totalt</td><td class="n">${h(R.total)}</td></tr></tbody></table>
  <h2>Per dag</h2>
  <table><thead><tr><th>Datum</th><th>Plats</th><th class="n">Rast</th><th class="n">Timmar</th><th class="n">Övertid</th><th>Signerad</th></tr></thead><tbody>${R.perDay.map(d => `<tr><td>${dayName(d.date)} ${d.date}</td><td>${esc(d.day.place || '')}${d.day.gps ? ` <small>(${d.day.gps.lat.toFixed(4)}, ${d.day.gps.lng.toFixed(4)})</small>` : ''}</td><td class="n">${d.day.breakMin ? d.day.breakMin + ' min' : ''}</td><td class="n">${h(d.total)}</td><td class="n ot">${d.ot ? h(d.ot) : ''}</td><td>${d.day.signature ? '✓' : ''}</td></tr>`).join('')}</tbody></table>
  <h2>Per resurs med tillägg</h2>${catTable(R, money)}
  ${Object.keys(R.proj).length > 1 ? `<h2>Per projekt</h2><table><tbody>${Object.entries(R.proj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)} h</td></tr>`).join('')}</tbody></table>` : ''}
  ${R.trips.length ? `<h2>Körjournal</h2><table><thead><tr><th>Datum</th><th>Från</th><th>Till</th><th>Projekt</th><th class="n">Km</th></tr></thead><tbody>${R.trips.map(x => `<tr><td>${x.date}</td><td>${esc(x.km.from)}</td><td>${esc(x.km.to)}</td><td>${esc(x.project)}</td><td class="n">${h(x.km.km)}</td></tr>`).join('')}<tr class="tot"><td colspan="4">Totalt</td><td class="n">${h(R.km)} km</td></tr></tbody></table>` : ''}
  ${R.mats.length ? `<h2>Material / förbrukning</h2><table><tbody>${R.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${h(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}
  <h2>Avvikelser (${R.devs.length})</h2>${R.devs.map(x => { const t = devType(x.type); return `<div class="item"><b>${t[1]}</b> · ${x.date} · ${esc(x.project)} · ${x.status === 'open' ? 'Öppen' : 'Åtgärdad'}${x.hours ? ` · påverkade ${h(x.hours)} h` : ''}<div>${esc(x.desc)}</div>${th(x.imageIds)}</div>`; }).join('') || '<p>Inga avvikelser.</p>'}
  <h2>ÄTA-arbeten (${R.atas.length})</h2>${R.atas.map(x => `<div class="item"><b>ÄTA ${x.nr}</b> · ${x.date} · ${esc(x.project)} · <b>${statusLbl(x.status)}</b>${x.orderedBy ? ` · beordrad av ${esc(x.orderedBy)}` : ''}${x.hours ? ` · ${h(x.hours)} h ${esc(x.catName || '')}` : ''}${money ? ` · ${kr.format(ataAmount(x))}` : ''}<div>${esc(x.desc)}</div>${x.material ? `<div><i>Material:</i> ${esc(x.material)}</div>` : ''}${th(x.imageIds)}</div>`).join('') || '<p>Inga ÄTA-arbeten.</p>'}
  ${R.rows.some(x => x.imageIds?.length) || R.perDay.some(d => d.day.imageIds?.length) ? `<h2>Bilder från arbetet</h2>${R.perDay.filter(d => d.day.imageIds?.length).map(d => `<div class="item">${d.date} · dagens bilder${th(d.day.imageIds)}</div>`).join('')}${R.rows.filter(x => x.imageIds?.length).map(x => `<div class="item">${x.date} · ${esc(x.catName)} · ${esc(x.project)}${th(x.imageIds)}</div>`).join('')}` : ''}
  ${money ? `<h2>Fakturaunderlag</h2><table><tbody><tr><td>Timmar och tillägg</td><td class="n">${kr.format(R.amount)}</td></tr>${R.ataSum ? `<tr><td>ÄTA-arbeten</td><td class="n">${kr.format(R.ataSum)}</td></tr>` : ''}<tr class="tot"><td>Summa exkl. moms</td><td class="n">${kr.format(R.amount + R.ataSum)}</td></tr></tbody></table>` : ''}
  ${sigs.length ? `<h2>Dagsignaturer</h2><div class="sigs">${sigs.map(d => `<div><img src="${d.day.signature}" alt="">${d.date}${d.day.sigName ? ' – ' + esc(d.day.sigName) : ''}</div>`).join('')}</div>` : ''}
  <div class="rep-foot"><div>Signatur</div><div>Godkänd av beställare</div></div>
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
  $('#view-set').innerHTML = `
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
  st.materials = st.materials.filter(m => m.name.trim());
  if (!st.projects.length) st.projects = ['Allmänt'];
  if (!st.projects.includes(st.defaultProject)) st.defaultProject = st.projects[0];
  db.settings = st; save(); st = null; renderHeader(); renderSet(); toast('Inställningar sparade ✓');
}

/* ================= Export ================= */
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function toCSV(from = '0000', to = '9999') {
  const inR = d => d >= from && d <= to;
  const q = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const dn = v => String(v ?? '').replace('.', ',');
  const out = [['Typ', 'Datum', 'Vecka', 'Projekt', 'Arbetsorder', 'Plats', 'Resurs', 'Timmar', 'Tillägg', 'Km', 'Från', 'Till', 'Material', 'Notering/Beskrivning', 'Status', 'Beordrad av', 'Belopp', 'Bilder']];
  const wkOf = d => { const w = isoWeek(parse(d)); return `${w.year}-V${pad(w.week)}`; };
  [...db.rows].filter(r => inR(r.date)).sort((x, y) => x.date.localeCompare(y.date)).forEach(r => out.push(['Tid', r.date, wkOf(r.date), r.project, r.wo, getDay(r.date).place, r.catName, dn(r.hours), addonText(r), r.km ? dn(r.km.km) : '', r.km?.from, r.km?.to, (r.materials || []).map(m => `${m.name} ${dn(m.qty)} ${m.unit}`).join(', '), r.note, '', '', dn(Math.round(rowAmount(r))), (r.imageIds || []).length]));
  db.devs.filter(x => inR(x.date)).forEach(x => out.push(['Avvikelse', x.date, wkOf(x.date), x.project, '', '', devType(x.type)[1], dn(x.hours), '', '', '', '', '', x.desc, x.status === 'open' ? 'Öppen' : 'Åtgärdad', '', '', (x.imageIds || []).length]));
  db.atas.filter(x => inR(x.date)).forEach(x => out.push([`ÄTA ${x.nr}`, x.date, wkOf(x.date), x.project, '', '', x.catName, dn(x.hours), '', '', '', '', x.material, x.desc, statusLbl(x.status), x.orderedBy, dn(Math.round(ataAmount(x))), (x.imageIds || []).length]));
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
function renderHeader() { $('#logo').textContent = S().company || 'Tidrapport'; $('#topSub').textContent = S().name || ''; }
const byId = (arr, el) => arr.find(x => x.id === el.dataset.v);
const ACT = {
  dPrev: () => goDate(ymd(addDays(cur, -1))), dNext: () => goDate(ymd(addDays(cur, 1))), dToday: () => goDate(today()),
  goDate: el => goDate(el.dataset.v),
  openDay: el => { cur = el.dataset.v; undoIds = null; show('today'); },
  copyPrev, undo: () => { db.rows = db.rows.filter(r => !undoIds.includes(r.id)); undoIds = null; save(); renderToday(); toast('Ångrat'); },
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
  newDev: () => { dv = newDev(); openSheet('dev'); },
  devEdit: el => { const x = byId(db.devs, el); dv = { ...clone(x), hours: x.hours || '' }; openSheet('dev'); },
  devType: el => { dv.type = el.dataset.v; $$('[data-act=devType]').forEach(b => b.classList.toggle('sel', b === el)); },
  devStatus: el => { dv.status = el.dataset.v; $$('[data-act=devStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  devSave: saveDev,
  devDel: async () => { const x = db.devs.find(d => d.id === dv.id); if (!confirm('Ta bort avvikelsen?')) return; db.devs = db.devs.filter(d => d !== x); save(); await deleteImages(x.imageIds); closeSheet(); renderView(); toast('Borttagen'); },
  newAta: () => { at = newAta(); openSheet('ata'); },
  ataEdit: el => { const x = byId(db.atas, el); at = { ...clone(x), hours: x.hours || '', amount: x.amount ?? '' }; openSheet('ata'); },
  ataStatus: el => { at.status = el.dataset.v; $$('[data-act=ataStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  ataSave: saveAta,
  ataDel: async () => { const x = db.atas.find(d => d.id === at.id); if (!confirm(`Ta bort ÄTA ${x.nr}?`)) return; db.atas = db.atas.filter(d => d !== x); save(); await deleteImages(x.imageIds); closeSheet(); renderView(); toast('Borttagen'); },
  repMode: el => { repMode = el.dataset.v; renderWeek(); },
  repPrev: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), -7)); else { mo.m--; if (mo.m < 0) { mo.m = 11; mo.y--; } } renderWeek(); },
  repNext: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), 7)); else { mo.m++; if (mo.m > 11) { mo.m = 0; mo.y++; } } renderWeek(); },
  print: doPrint, share,
  setupDone: finishSetup,
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
    case 'fProject': rd.project = val; return; case 'fWo': rd.wo = val; return; case 'fNote': rd.note = val; return;
    case 'dPlace': return setDay(cur, { place: val });
    case 'dvDesc': dv.desc = val; return; case 'dvDate': dv.date = val; return; case 'dvHours': dv.hours = val; return; case 'dvProject': dv.project = val; return;
    case 'atDesc': at.desc = val; return; case 'atBy': at.orderedBy = val; return; case 'atDate': at.date = val; return; case 'atHours': at.hours = val; return; case 'atProject': at.project = val; return; case 'atMat': at.material = val; return; case 'atAmount': at.amount = val; return; case 'atCat': at.categoryId = val; return;
  }
  if (t.dataset.q) rd.addons[t.dataset.q] = val;
  else if (t.dataset.km) rd.km[t.dataset.km] = val;
  else if (t.dataset.mat) rd.materials[+t.dataset.mat].qty = val;
  else if (t.dataset.s) st[t.dataset.s] = val;
  else if (t.dataset.c) { const [ci, k] = t.dataset.c.split('.'); st.categories[+ci][k] = val; }
  else if (t.dataset.a) { const [ci, ai, k] = t.dataset.a.split('.'); st.categories[+ci].addons[+ai][k] = val; }
  else if (t.dataset.m) { const [i, k] = t.dataset.m.split('.'); st.materials[+i][k] = val; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dPick' && t.value) goDate(t.value);
  if (t.id === 'restoreFile' && t.files[0]) { restore(t.files[0]); t.value = ''; }
  if (t.matches('select,input[type=checkbox]')) t.dispatchEvent(new Event('input', { bubbles: true }));
});
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
  if (!S().setupDone) renderSetup();
})();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
