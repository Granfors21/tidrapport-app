'use strict';
const VERSION = '2.0.0';
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
  const db = { ...emptyDb(), ...d }; db.settings = { ...defaultSettings(), ...d.settings };
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
function allRefs() { const s = new Set(); [...db.rows, ...db.devs, ...db.atas].forEach(x => (x.imageIds || []).forEach(i => s.add(i))); [rd, dv, at].forEach(x => x && (x.imageIds || []).forEach(i => s.add(i))); return s; }
async function deleteImage(id) {
  [...db.rows, ...db.devs, ...db.atas, rd, dv, at].forEach(x => { if (x && x.imageIds) x.imageIds = x.imageIds.filter(i => i !== id); });
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
  const ids = await addImages(files); const d = draftFor(t.dataset.photo);
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

/* ================= Registrera ================= */
let cur = today();
let rd = null, moreOpen = false;
function lastProjectFor(d) { const r = dayRows(d).slice(-1)[0] || [...db.rows].sort((x, y) => y.date.localeCompare(x.date) || (y.created || 0) - (x.created || 0))[0]; return r ? r.project : S().defaultProject; }
function newRowDraft() {
  const rem = num(S().otLimit || 8) - dayTotal(cur);
  const catId = catById(S().lastCat) ? S().lastCat : (S().categories[0] || {}).id;
  return { id: null, categoryId: catId, hours: rem > 0 ? rem : 1, project: lastProjectFor(cur), wo: '', addons: {}, km: { km: '', from: '', to: '' }, materials: [], note: '', imageIds: [] };
}
function rowToDraft(r) {
  const ad = {}; (r.addons || []).forEach(x => ad[x.id] = x.unit ? x.qty : '');
  return { id: r.id, categoryId: r.categoryId, hours: r.hours, project: r.project, wo: r.wo || '', addons: ad, km: { km: '', from: '', to: '', ...(r.km || {}) }, materials: clone(r.materials || []), note: r.note || '', imageIds: [...(r.imageIds || [])] };
}
function dateLabel(d) { const t = today(); if (d === t) return 'Idag'; if (d === ymd(addDays(t, -1))) return 'Igår'; if (d === ymd(addDays(t, 1))) return 'Imorgon'; return dayName(d); }
function renderReg() {
  if (!rd) rd = newRowDraft();
  const day = getDay(cur), rows = dayRows(cur), tot = dayTotal(cur), lim = num(S().otLimit) || 8;
  const brk = day.breakMin ?? S().defBreak;
  const cat = catById(rd.categoryId);
  const w = isoWeek(parse(cur));
  const gps = day.gps ? `<a class="small" href="https://maps.google.com/?q=${day.gps.lat},${day.gps.lng}" target="_blank" rel="noopener">📍 ${day.gps.lat.toFixed(5)}, ${day.gps.lng.toFixed(5)} (±${Math.round(day.gps.acc)} m)</a>` : '';
  $('#view-reg').innerHTML = `
  <div class="card">
    <div class="datebar">
      <button class="big" data-act="dPrev" aria-label="Föregående dag">‹</button>
      <label class="dl" style="margin:0;color:var(--fg)"><b id="dLabel">${dateLabel(cur)}</b><span class="muted">${fmtDate(cur)} · v ${w.week}</span><input type="date" id="dPick" value="${cur}"></label>
      <button class="big" data-act="dNext" aria-label="Nästa dag">›</button>
    </div>
    ${cur !== today() ? '<button class="ghost" data-act="dToday">Gå till idag</button>' : ''}
    <div class="row"><input type="text" id="dPlace" placeholder="Plats / arbetsplats" value="${esc(day.place || '')}" list="placeList" style="margin-top:10px"><button class="secondary" data-act="gps" style="flex:0 0 64px;margin-top:10px" aria-label="Hämta GPS-position">📍</button></div>
    <datalist id="placeList">${[...new Set(Object.values(db.days).map(x => x.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    ${gps}
    <div class="lbl">Rast</div>
    <div class="quick">${[0, 30, 45, 60].map(m => `<button data-act="brk" data-v="${m}" class="${num(brk) === m ? 'sel' : ''}">${m ? m + ' min' : 'Ingen'}</button>`).join('')}</div>
    <h3>Dagens rader</h3>
    <ul class="list" id="dayList">${rows.map(r => `<li data-id="${r.id}"><div class="ic">${r.catIcon || '⏱️'}</div><div class="info"><b>${esc(r.catName)}</b><small>${esc([r.project, addonText(r), r.km && r.km.km ? r.km.km + ' km' : '', r.note].filter(Boolean).join(' · '))}${r.imageIds?.length ? ` · 📷${r.imageIds.length}` : ''}</small></div><div class="h">${h(r.hours)}</div><div class="act"><button data-act="rowEdit" aria-label="Redigera">✎</button><button data-act="rowDel" aria-label="Radera">🗑</button></div></li>`).join('') || '<li class="empty">Inget registrerat än.</li>'}</ul>
    <div class="daytot"><span>Totalt ${tot > lim ? `<span class="ot">(övertid ${h(tot - lim)} h)</span>` : ''}</span><span class="num" id="dayTotal">${h(tot)} h</span></div>
    ${rows.length ? '' : '<button class="secondary" data-act="copyPrev">⟲ Kopiera gårdagen</button>'}
    ${day.signature ? `<div class="small muted" style="margin-top:8px">Signerad${day.sigName ? ' av ' + esc(day.sigName) : ''}<img class="sigimg" src="${day.signature}" alt="Signatur"></div><button class="ghost" data-act="sigDel">Ta bort signatur</button>` : (rows.length ? '<button class="ghost" data-act="sign">✍️ Signera dagen (valfritt)</button>' : '')}
  </div>
  <div class="card" id="rowForm">
    <h2>${rd.id ? 'Redigera rad' : 'Lägg till rad'}</h2>
    <div class="cats">${S().categories.map(c => `<button class="cat ${c.id === rd.categoryId ? 'sel' : ''}" data-act="cat" data-v="${c.id}"><i>${esc(c.icon)}</i>${esc(c.name)}</button>`).join('')}</div>
    <div class="lbl">Timmar</div>
    <div class="hours"><button class="big" data-act="hMinus" aria-label="Minska">−</button><input type="number" id="fHours" inputmode="decimal" step="0.5" min="0" max="24" value="${rd.hours}" aria-label="Timmar"><button class="big" data-act="hPlus" aria-label="Öka">+</button></div>
    <div class="quick">${[2, 4, 6, 8, 10].map(v => `<button data-act="hSet" data-v="${v}" class="${num(rd.hours) === v ? 'sel' : ''}">${v}</button>`).join('')}</div>
    ${cat && cat.addons.length ? `<div class="lbl">Tillägg och utrustning</div><div class="chips" id="addonChips">${cat.addons.map(x => `<button class="chip ${x.id in rd.addons ? 'sel' : ''}" data-act="addon" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <div class="qtys">${cat.addons.filter(x => x.unit && x.id in rd.addons).map(x => `<div class="qty"><span>${esc(x.name)}</span><input type="number" inputmode="decimal" step="0.5" min="0" data-q="${x.id}" value="${rd.addons[x.id]}"><em>${x.unit}</em></div>`).join('')}</div>` : ''}
    ${cat && cat.km ? `<div class="lbl">Körjournal</div><div class="grid2"><input type="text" data-km="from" placeholder="Från" value="${esc(rd.km.from)}"><input type="text" data-km="to" placeholder="Till" value="${esc(rd.km.to)}"></div><div class="qty"><span>Körda km</span><input type="number" inputmode="decimal" data-km="km" value="${esc(rd.km.km)}" placeholder="0"><em>km</em></div>` : ''}
    <label>Projekt<select id="fProject">${projOptions(rd.project)}</select></label>
    <details id="more" ${moreOpen ? 'open' : ''}><summary>Mer: arbetsorder, material, anteckning, bilder${rd.imageIds.length ? ` (📷${rd.imageIds.length})` : ''}</summary>
      <label>Arbetsorder / märkning<input type="text" id="fWo" value="${esc(rd.wo)}" placeholder="t.ex. AO-nummer"></label>
      <div class="lbl">Material / förbrukning</div>
      <div id="matList">${rd.materials.map((m, i) => `<div class="qty"><span>${esc(m.name)}</span><input type="number" inputmode="decimal" data-mat="${i}" value="${esc(m.qty)}"><em>${esc(m.unit)}</em><button class="secondary" style="margin:0;min-width:46px;min-height:46px;width:auto" data-act="matDel" data-v="${i}" aria-label="Ta bort">✕</button></div>`).join('')}</div>
      <div class="chips" style="margin-top:8px">${S().materials.map((m, i) => `<button class="chip" data-act="matAdd" data-v="${i}">+ ${esc(m.name)}</button>`).join('')}</div>
      <label>Anteckning<textarea id="fNote" rows="2" placeholder="Vad gjordes?">${esc(rd.note)}</textarea></label>
      ${photoWidget('row', rd.imageIds)}
    </details>
    <button class="primary" data-act="rowSave" id="saveBtn">${rd.id ? 'Spara ändring' : `Spara ${h(rd.hours)} h ${cat ? esc(cat.name.toLowerCase()) : ''}`}</button>
    ${rd.id ? '<button class="ghost" data-act="rowCancel">Avbryt</button>' : ''}
  </div>`;
}
function updateSaveLabel() { const c = catById(rd.categoryId); if (!rd.id && $('#saveBtn')) $('#saveBtn').textContent = `Spara ${h(rd.hours)} h ${c ? c.name.toLowerCase() : ''}`; $$('#rowForm .quick button').forEach(b => b.classList.toggle('sel', num(b.dataset.v) === num(rd.hours))); }
function setHours(v) { rd.hours = Math.max(0, Math.min(24, Math.round(num(v) * 2) / 2)); const i = $('#fHours'); if (i) i.value = rd.hours; updateSaveLabel(); }
function goDate(d) { cur = d; rd = null; renderReg(); }
function saveRow() {
  const cat = catById(rd.categoryId);
  if (!cat) return toast('Välj resurs');
  if (!(num(rd.hours) > 0)) return toast('Ange timmar');
  const addons = cat.addons.filter(x => x.id in rd.addons).map(x => ({ id: x.id, name: x.name, unit: x.unit, qty: x.unit ? num(rd.addons[x.id]) : 1, price: x.price }));
  const km = cat.km && (rd.km.km || rd.km.from || rd.km.to) ? { km: num(rd.km.km), from: rd.km.from.trim(), to: rd.km.to.trim() } : null;
  const data = { date: cur, project: rd.project, wo: rd.wo.trim(), categoryId: cat.id, catName: cat.name, catIcon: cat.icon, hours: num(rd.hours), addons, km, materials: rd.materials.filter(m => num(m.qty) > 0).map(m => ({ ...m, qty: num(m.qty) })), note: rd.note.trim(), imageIds: rd.imageIds };
  if (rd.id) { Object.assign(db.rows.find(r => r.id === rd.id), data, { updated: Date.now() }); toast('Ändring sparad ✓'); }
  else { db.rows.push({ id: uid(), created: Date.now(), ...data }); toast(`Sparat: ${h(data.hours)} h ${cat.name.toLowerCase()} ✓`); }
  S().lastCat = cat.id;
  if (getDay(cur).breakMin === undefined) setDay(cur, { breakMin: num(S().defBreak) });
  save(); rd = null; moreOpen = false; renderReg();
}
function copyPrev() {
  const prev = [...new Set(db.rows.map(r => r.date))].filter(d => d < cur).sort().pop();
  if (!prev) return toast('Hittar ingen tidigare dag att kopiera');
  const t = Date.now();
  dayRows(prev).forEach((r, i) => db.rows.push({ ...clone(r), id: uid(), date: cur, imageIds: [], created: t + i }));
  const pd = getDay(prev); setDay(cur, { place: pd.place || '', breakMin: pd.breakMin ?? S().defBreak, gps: pd.gps || null });
  save(); rd = null; renderReg(); toast(`Kopierade ${dayRows(cur).length} rader från ${fmtDate(prev)}`);
}

/* ================= Signatur ================= */
let sigCtx = null, sigDrawn = false;
function openSig() {
  $('#sigDate').textContent = `${dayName(cur)} ${cur}`; $('#sigName').value = getDay(cur).sigName || S().name || '';
  const c = $('#sigCanvas'); sigCtx = c.getContext('2d'); sigCtx.clearRect(0, 0, c.width, c.height); sigCtx.lineWidth = 5; sigCtx.lineCap = 'round'; sigCtx.lineJoin = 'round'; sigCtx.strokeStyle = '#111'; sigDrawn = false;
  $('#sigModal').classList.remove('hidden');
}
(() => {
  const c = $('#sigCanvas'); let drawing = false;
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pt(e); sigCtx.beginPath(); sigCtx.moveTo(x, y); sigCtx.lineTo(x + .1, y); sigCtx.stroke(); sigDrawn = true; });
  c.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pt(e); sigCtx.lineTo(x, y); sigCtx.stroke(); });
  ['pointerup', 'pointercancel'].forEach(ev => c.addEventListener(ev, () => drawing = false));
  $('#sigClear').onclick = () => { sigCtx.clearRect(0, 0, c.width, c.height); sigDrawn = false; };
  $('#sigCancel').onclick = () => $('#sigModal').classList.add('hidden');
  $('#sigSave').onclick = () => { if (!sigDrawn) return toast('Skriv din signatur först'); setDay(cur, { signature: c.toDataURL('image/png'), sigName: $('#sigName').value.trim(), signedAt: Date.now() }); $('#sigModal').classList.add('hidden'); renderReg(); toast('Dagen signerad ✓'); };
})();

/* ================= Avvikelser ================= */
let dv = null, devFilter = 'all';
const newDev = () => ({ id: null, date: today(), project: lastProjectFor(today()), type: 'sakerhet', desc: '', hours: '', status: 'open', imageIds: [] });
function renderDev() {
  if (!dv) dv = newDev();
  const list = db.devs.filter(x => devFilter === 'all' || x.status === devFilter).sort((x, y) => y.date.localeCompare(x.date) || y.created - x.created);
  $('#view-dev').innerHTML = `
  <div class="card" id="devForm">
    <h2>${dv.id ? 'Redigera avvikelse' : 'Ny avvikelse'}</h2>
    <div class="cats">${DEV_TYPES.map(([k, n, i]) => `<button class="cat ${dv.type === k ? 'sel' : ''}" data-act="devType" data-v="${k}"><i>${i}</i>${n}</button>`).join('')}</div>
    <label>Beskrivning<textarea id="dvDesc" rows="3" placeholder="Vad hände?">${esc(dv.desc)}</textarea></label>
    <div class="grid2"><label>Datum<input type="date" id="dvDate" value="${dv.date}"></label><label>Påverkade timmar<input type="number" inputmode="decimal" step="0.5" id="dvHours" value="${esc(dv.hours)}" placeholder="0"></label></div>
    <label>Projekt<select id="dvProject">${projOptions(dv.project)}</select></label>
    <div class="lbl">Status</div>
    <div class="seg"><button data-act="devStatus" data-v="open" class="${dv.status === 'open' ? 'on' : ''}">Öppen</button><button data-act="devStatus" data-v="fixed" class="${dv.status === 'fixed' ? 'on' : ''}">Åtgärdad</button></div>
    ${photoWidget('dev', dv.imageIds)}
    <button class="primary" data-act="devSave" id="devSave">${dv.id ? 'Spara ändring' : 'Spara avvikelse'}</button>
    ${dv.id ? '<button class="ghost" data-act="devCancel">Avbryt</button>' : ''}
  </div>
  <div class="card"><h2>Avvikelser</h2>
    <div class="seg">${[['all', 'Alla'], ['open', 'Öppna'], ['fixed', 'Åtgärdade']].map(([k, n]) => `<button data-act="devFilter" data-v="${k}" class="${devFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <ul class="list" id="devList">${list.map(x => { const t = devType(x.type); return `<li data-id="${x.id}"><div class="ic">${t[2]}</div><div class="info"><b>${t[1]} <span class="badge ${x.status}">${x.status === 'open' ? 'Öppen' : 'Åtgärdad'}</span></b><small>${fmtDate(x.date)} · ${esc(x.project)}${x.hours ? ` · ${h(x.hours)} h` : ''}${x.imageIds?.length ? ` · 📷${x.imageIds.length}` : ''}</small><small>${esc(x.desc)}</small>${x.imageIds?.length ? `<div class="photos">${thumbsHtml(x.imageIds)}</div>` : ''}</div><div class="act" style="flex-direction:column"><button data-act="devToggle" aria-label="Växla status">${x.status === 'open' ? '✓' : '↺'}</button><button data-act="devEdit" aria-label="Redigera">✎</button><button data-act="devDel" aria-label="Radera">🗑</button></div></li>`; }).join('') || '<li class="empty">Inga avvikelser.</li>'}</ul>
  </div>`;
}
function saveDev() {
  if (!dv.desc.trim()) return toast('Skriv en beskrivning');
  const data = { date: dv.date || today(), project: dv.project, type: dv.type, desc: dv.desc.trim(), hours: num(dv.hours), status: dv.status, imageIds: dv.imageIds };
  if (dv.id) Object.assign(db.devs.find(x => x.id === dv.id), data, { updated: Date.now() }); else db.devs.push({ id: uid(), created: Date.now(), ...data });
  save(); dv = null; renderDev(); toast('Avvikelse sparad ✓');
}

/* ================= ÄTA ================= */
let at = null;
const newAta = () => ({ id: null, date: today(), project: lastProjectFor(today()), desc: '', orderedBy: '', hours: '', categoryId: (catById(S().lastCat) || S().categories[0] || {}).id || '', material: '', amount: '', status: 'beordrad', imageIds: [] });
function renderAta() {
  if (!at) at = newAta();
  const list = [...db.atas].sort((x, y) => y.date.localeCompare(x.date) || y.created - x.created);
  $('#view-ata').innerHTML = `
  <div class="card" id="ataForm">
    <h2>${at.id ? `Redigera ÄTA ${at.nr || ''}` : 'Nytt ÄTA-arbete'}</h2>
    <p class="muted small" style="margin:-6px 0 4px">Ändrings- och tilläggsarbete utöver avtalet.</p>
    <label>Beskrivning<textarea id="atDesc" rows="3" placeholder="Vad ska göras / gjordes?">${esc(at.desc)}</textarea></label>
    <label>Beordrad av<input type="text" id="atBy" value="${esc(at.orderedBy)}" placeholder="Namn / roll hos beställaren"></label>
    <div class="grid2"><label>Datum<input type="date" id="atDate" value="${at.date}"></label><label>Timmar<input type="number" inputmode="decimal" step="0.5" id="atHours" value="${esc(at.hours)}" placeholder="0"></label></div>
    <div class="lbl">Resurs</div>
    <div class="cats">${S().categories.map(c => `<button class="cat ${c.id === at.categoryId ? 'sel' : ''}" data-act="ataCat" data-v="${c.id}"><i>${esc(c.icon)}</i>${esc(c.name)}</button>`).join('')}</div>
    <label>Projekt<select id="atProject">${projOptions(at.project)}</select></label>
    <label>Material<textarea id="atMat" rows="2" placeholder="t.ex. 12 ton makadam, 40 m kabel">${esc(at.material)}</textarea></label>
    <label>Belopp (kr, valfritt)<input type="number" inputmode="decimal" id="atAmount" value="${esc(at.amount)}" placeholder="Räknas annars på timpris"></label>
    <div class="lbl">Status</div>
    <div class="seg">${ATA_STATUS.map(([k, n]) => `<button data-act="ataStatus" data-v="${k}" class="${at.status === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${photoWidget('ata', at.imageIds)}
    <button class="primary" data-act="ataSave" id="ataSave">${at.id ? 'Spara ändring' : 'Spara ÄTA'}</button>
    ${at.id ? '<button class="ghost" data-act="ataCancel">Avbryt</button>' : ''}
  </div>
  <div class="card"><h2>ÄTA-lista</h2>
    <ul class="list" id="ataList">${list.map(x => { const c = catById(x.categoryId); return `<li data-id="${x.id}"><div class="ic">${c ? esc(c.icon) : '✚'}</div><div class="info"><b>ÄTA ${x.nr} <span class="badge ${x.status}">${statusLbl(x.status)}</span></b><small>${fmtDate(x.date)} · ${esc(x.project)}${x.hours ? ` · ${h(x.hours)} h` : ''}${x.orderedBy ? ` · beordrad av ${esc(x.orderedBy)}` : ''}</small><small>${esc(x.desc)}</small>${x.imageIds?.length ? `<div class="photos">${thumbsHtml(x.imageIds)}</div>` : ''}</div><div class="act" style="flex-direction:column"><button data-act="ataNext" aria-label="Nästa status">➜</button><button data-act="ataEdit" aria-label="Redigera">✎</button><button data-act="ataDel" aria-label="Radera">🗑</button></div></li>`; }).join('') || '<li class="empty">Inga ÄTA-arbeten.</li>'}</ul>
  </div>`;
}
function saveAta() {
  if (!at.desc.trim()) return toast('Skriv en beskrivning');
  const c = catById(at.categoryId);
  const data = { date: at.date || today(), project: at.project, desc: at.desc.trim(), orderedBy: at.orderedBy.trim(), hours: num(at.hours), categoryId: at.categoryId, catName: c ? c.name : '', material: at.material.trim(), amount: at.amount === '' ? '' : num(at.amount), status: at.status, imageIds: at.imageIds };
  if (at.id) Object.assign(db.atas.find(x => x.id === at.id), data, { updated: Date.now() });
  else db.atas.push({ id: uid(), nr: db.atas.reduce((m, x) => Math.max(m, x.nr || 0), 0) + 1, created: Date.now(), ...data });
  save(); at = null; renderAta(); toast('ÄTA sparad ✓');
}

/* ================= Dagar ================= */
let daysQ = '';
function renderDays() {
  const dates = [...new Set([...db.rows.map(r => r.date), ...Object.keys(db.days).filter(d => db.days[d].signature)])].sort().reverse();
  const q = daysQ.toLowerCase();
  const items = dates.filter(d => !q || [d, fmtDate(d), getDay(d).place, ...dayRows(d).map(r => [r.project, r.catName, r.note, addonText(r)].join(' '))].join(' ').toLowerCase().includes(q));
  const lim = num(S().otLimit) || 8;
  $('#view-days').innerHTML = `<div class="card"><h2>Registrerade dagar</h2><input type="search" id="daysQ" placeholder="Sök projekt, plats, resurs…" value="${esc(daysQ)}">
  <ul class="list">${items.map(d => { const rs = dayRows(d), t = dayTotal(d), nd = db.devs.filter(x => x.date === d).length, na = db.atas.filter(x => x.date === d).length; return `<li data-date="${d}" data-act="openDay" style="cursor:pointer"><div class="info"><b>${fmtDate(d)} <span class="muted small">v ${isoWeek(parse(d)).week}</span>${getDay(d).signature ? ' ✍️' : ''}</b><small>${[...new Set(rs.map(r => r.catIcon))].join(' ')} ${esc([...new Set(rs.map(r => r.project))].join(', '))}${getDay(d).place ? ' · ' + esc(getDay(d).place) : ''}${nd ? ` · ⚠${nd}` : ''}${na ? ` · ÄTA ${na}` : ''}</small></div><div class="h ${t > lim ? 'ot' : ''}">${h(t)}</div></li>`; }).join('') || '<li class="empty">Inget registrerat än.</li>'}</ul></div>`;
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
function renderRep() {
  const r = range(), R = report(r.from, r.to), money = R.amount > 0 || R.ataSum > 0;
  $('#view-rep').innerHTML = `<div class="card">
    <div class="seg"><button data-act="repMode" data-v="week" class="${repMode === 'week' ? 'on' : ''}">Vecka</button><button data-act="repMode" data-v="month" class="${repMode === 'month' ? 'on' : ''}">Månad</button></div>
    <div class="nav"><button class="big" data-act="repPrev" aria-label="Föregående">‹</button><div class="navlbl"><div id="repLabel">${r.label}</div><div class="muted">${r.sub}</div></div><button class="big" data-act="repNext" aria-label="Nästa">›</button></div>
    <div class="kpis"><div class="kpi"><b id="repTotal">${h(R.total)}</b><span>timmar</span></div><div class="kpi"><b id="repOt" class="${R.ot ? 'ot' : ''}">${h(R.ot)}</b><span>övertid</span></div><div class="kpi"><b>${money ? kr.format(R.amount + R.ataSum) : R.perDay.length}</b><span>${money ? 'att fakturera' : 'arbetsdagar'}</span></div></div>
    <div class="kpis"><div class="kpi"><b>${h(R.km)}</b><span>km</span></div><div class="kpi"><b id="repDev">${R.devs.length}</b><span>avvikelser</span></div><div class="kpi"><b id="repAta">${R.atas.length}</b><span>ÄTA</span></div></div>
    <h3>Per resurs med tillägg</h3>${R.cats.length ? catTable(R, money) : '<p class="empty">Inga timmar i perioden.</p>'}
    ${Object.keys(R.proj).length ? `<h3>Per projekt</h3><table><tbody>${Object.entries(R.proj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)} h</td></tr>`).join('')}</tbody></table>` : ''}
    ${R.mats.length ? `<h3>Material / förbrukning</h3><table><tbody>${R.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${h(m.qty)} ${esc(m.unit)}</td></tr>`).join('')}</tbody></table>` : ''}
    <button class="primary" data-act="print" id="printBtn">${repMode === 'week' ? 'Veckorapport' : 'Månadsrapport'} (skriv ut / PDF)</button>
    <p class="muted small center">Välj ”Spara som PDF” i utskriftsdialogen.</p>
  </div>`;
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
  ${R.rows.some(x => x.imageIds?.length) ? `<h2>Bilder från arbetet</h2>${R.rows.filter(x => x.imageIds?.length).map(x => `<div class="item">${x.date} · ${esc(x.catName)} · ${esc(x.project)}${th(x.imageIds)}</div>`).join('')}` : ''}
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
  db.settings = st; save(); st = null; rd = null; at = null; renderHeader(); renderSet(); toast('Inställningar sparade ✓');
}

/* ================= Export ================= */
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function toCSV() {
  const q = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const dn = v => String(v ?? '').replace('.', ',');
  const out = [['Typ', 'Datum', 'Vecka', 'Projekt', 'Arbetsorder', 'Plats', 'Resurs', 'Timmar', 'Tillägg', 'Km', 'Från', 'Till', 'Material', 'Notering/Beskrivning', 'Status', 'Beordrad av', 'Belopp', 'Bilder']];
  const wkOf = d => { const w = isoWeek(parse(d)); return `${w.year}-V${pad(w.week)}`; };
  [...db.rows].sort((x, y) => x.date.localeCompare(y.date)).forEach(r => out.push(['Tid', r.date, wkOf(r.date), r.project, r.wo, getDay(r.date).place, r.catName, dn(r.hours), addonText(r), r.km ? dn(r.km.km) : '', r.km?.from, r.km?.to, (r.materials || []).map(m => `${m.name} ${dn(m.qty)} ${m.unit}`).join(', '), r.note, '', '', dn(Math.round(rowAmount(r))), (r.imageIds || []).length]));
  db.devs.forEach(x => out.push(['Avvikelse', x.date, wkOf(x.date), x.project, '', '', devType(x.type)[1], dn(x.hours), '', '', '', '', '', x.desc, x.status === 'open' ? 'Öppen' : 'Åtgärdad', '', '', (x.imageIds || []).length]));
  db.atas.forEach(x => out.push([`ÄTA ${x.nr}`, x.date, wkOf(x.date), x.project, '', '', x.catName, dn(x.hours), '', '', '', '', x.material, x.desc, statusLbl(x.status), x.orderedBy, dn(Math.round(ataAmount(x))), (x.imageIds || []).length]));
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
    db = nd; save(); rd = dv = at = st = null; renderHeader(); renderView(); toast('Backup återställd ✓');
  } catch (e) { toast('Ogiltig backupfil'); }
}

/* ================= Navigering & händelser ================= */
let view = 'reg';
const RENDER = { reg: renderReg, days: renderDays, dev: renderDev, ata: renderAta, rep: renderRep, set: renderSet };
function renderView() { RENDER[view](); }
function show(v) {
  view = v; $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'set') st = null;
  renderView(); window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
$('#gearBtn').onclick = () => show('set');
function renderHeader() { $('#logo').textContent = S().company || 'Tidrapport'; $('#topSub').textContent = S().name ? `Tidrapport · ${S().name}` : 'Tidrapport'; document.title = 'Tidrapport'; }

const ACT = {
  dPrev: () => goDate(ymd(addDays(cur, -1))), dNext: () => goDate(ymd(addDays(cur, 1))), dToday: () => goDate(today()),
  brk: el => { setDay(cur, { breakMin: num(el.dataset.v) }); $$('[data-act=brk]').forEach(b => b.classList.toggle('sel', b === el)); },
  gps: () => {
    if (!navigator.geolocation) return toast('GPS saknas');
    toast('Hämtar position…');
    navigator.geolocation.getCurrentPosition(p => { const g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; setDay(cur, { gps: g, place: getDay(cur).place || `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` }); renderReg(); toast('Position sparad ✓'); }, () => toast('Kunde inte hämta position'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  },
  cat: el => { if (rd.categoryId !== el.dataset.v) { rd.categoryId = el.dataset.v; rd.addons = {}; } renderReg(); },
  hMinus: () => setHours(num(rd.hours) - 0.5), hPlus: () => setHours(num(rd.hours) + 0.5), hSet: el => setHours(el.dataset.v),
  addon: el => { const id = el.dataset.v, x = catById(rd.categoryId).addons.find(a => a.id === id); if (id in rd.addons) delete rd.addons[id]; else rd.addons[id] = x.unit === 'h' ? rd.hours : x.unit ? 1 : ''; renderReg(); },
  matAdd: el => { const m = S().materials[el.dataset.v]; rd.materials.push({ name: m.name, unit: m.unit, qty: '' }); moreOpen = true; renderReg(); const ins = $$('[data-mat]'); ins[ins.length - 1]?.focus(); },
  matDel: el => { rd.materials.splice(+el.dataset.v, 1); renderReg(); },
  rowSave: saveRow, rowCancel: () => { rd = null; renderReg(); },
  rowEdit: el => { const r = db.rows.find(x => x.id === el.closest('li').dataset.id); rd = rowToDraft(r); moreOpen = !!(r.note || r.materials?.length || r.imageIds?.length || r.wo); renderReg(); $('#rowForm').scrollIntoView({ behavior: 'smooth' }); },
  rowDel: async el => { const r = db.rows.find(x => x.id === el.closest('li').dataset.id); if (!confirm(`Radera ${h(r.hours)} h ${r.catName}?`)) return; db.rows = db.rows.filter(x => x !== r); save(); await deleteImages(r.imageIds); if (rd && rd.id === r.id) rd = null; renderReg(); toast('Raderad'); },
  copyPrev, sign: openSig, sigDel: () => { if (confirm('Ta bort signaturen?')) { setDay(cur, { signature: null, sigName: '' }); renderReg(); } },
  devType: el => { dv.type = el.dataset.v; $$('[data-act=devType]').forEach(b => b.classList.toggle('sel', b === el)); },
  devStatus: el => { dv.status = el.dataset.v; $$('[data-act=devStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  devSave: saveDev, devCancel: () => { dv = null; renderDev(); }, devFilter: el => { devFilter = el.dataset.v; renderDev(); },
  devToggle: el => { const x = db.devs.find(d => d.id === el.closest('li').dataset.id); x.status = x.status === 'open' ? 'fixed' : 'open'; save(); renderDev(); },
  devEdit: el => { const x = db.devs.find(d => d.id === el.closest('li').dataset.id); dv = { ...clone(x), hours: x.hours || '' }; renderDev(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  devDel: async el => { const x = db.devs.find(d => d.id === el.closest('li').dataset.id); if (!confirm('Radera avvikelsen?')) return; db.devs = db.devs.filter(d => d !== x); save(); await deleteImages(x.imageIds); renderDev(); toast('Raderad'); },
  ataCat: el => { at.categoryId = el.dataset.v; $$('[data-act=ataCat]').forEach(b => b.classList.toggle('sel', b === el)); },
  ataStatus: el => { at.status = el.dataset.v; $$('[data-act=ataStatus]').forEach(b => b.classList.toggle('on', b === el)); },
  ataSave: saveAta, ataCancel: () => { at = null; renderAta(); },
  ataNext: el => { const x = db.atas.find(d => d.id === el.closest('li').dataset.id); const i = ATA_STATUS.findIndex(s => s[0] === x.status); x.status = ATA_STATUS[(i + 1) % ATA_STATUS.length][0]; save(); renderAta(); toast(`ÄTA ${x.nr}: ${statusLbl(x.status)}`); },
  ataEdit: el => { const x = db.atas.find(d => d.id === el.closest('li').dataset.id); at = { ...clone(x), hours: x.hours || '', amount: x.amount ?? '' }; renderAta(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  ataDel: async el => { const x = db.atas.find(d => d.id === el.closest('li').dataset.id); if (!confirm(`Radera ÄTA ${x.nr}?`)) return; db.atas = db.atas.filter(d => d !== x); save(); await deleteImages(x.imageIds); renderAta(); toast('Raderad'); },
  openDay: el => { cur = el.dataset.date; rd = null; show('reg'); },
  repMode: el => { repMode = el.dataset.v; renderRep(); },
  repPrev: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), -7)); else { mo.m--; if (mo.m < 0) { mo.m = 11; mo.y--; } } renderRep(); },
  repNext: () => { if (repMode === 'week') wk = isoWeek(addDays(mondayOf(wk.year, wk.week), 7)); else { mo.m++; if (mo.m > 11) { mo.m = 0; mo.y++; } } renderRep(); },
  print: doPrint,
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
  const el = e.target.closest('[data-act]'); if (!el || !ACT[el.dataset.act]) return;
  if (el.tagName === 'LI' && e.target.closest('button')) return;
  e.preventDefault(); ACT[el.dataset.act](el);
});
document.addEventListener('input', e => {
  const t = e.target, val = t.type === 'checkbox' ? t.checked : t.value;
  switch (t.id) {
    case 'fHours': rd.hours = num(val); return updateSaveLabel();
    case 'fProject': rd.project = val; return; case 'fWo': rd.wo = val; return; case 'fNote': rd.note = val; return;
    case 'dPlace': return setDay(cur, { place: val });
    case 'dvDesc': dv.desc = val; return; case 'dvDate': dv.date = val; return; case 'dvHours': dv.hours = val; return; case 'dvProject': dv.project = val; return;
    case 'atDesc': at.desc = val; return; case 'atBy': at.orderedBy = val; return; case 'atDate': at.date = val; return; case 'atHours': at.hours = val; return; case 'atProject': at.project = val; return; case 'atMat': at.material = val; return; case 'atAmount': at.amount = val; return;
    case 'daysQ': { daysQ = val; const p = t.selectionStart; renderDays(); const n = $('#daysQ'); n.focus(); n.setSelectionRange(p, p); return; }
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
document.addEventListener('toggle', e => { if (e.target.id === 'more') moreOpen = e.target.open; }, true);
document.addEventListener('click', e => { const l = e.target.closest('label.dl'); if (l) { const i = $('#dPick'); try { i.showPicker(); } catch (er) { i.focus(); } } });

/* ================= Start ================= */
(async () => {
  renderHeader();
  try {
    await IDB.open();
    const all = await IDB.all(); const refs = allRefs();
    for (const o of all) { if (refs.has(o.id) || Date.now() - o.created < 864e5) thumbs.set(o.id, o.thumb); else await IDB.del(o.id); }
  } catch (e) { console.warn('IndexedDB', e); }
  renderView();
})();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
