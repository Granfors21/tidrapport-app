'use strict';
const VERSION = '1.0.0';
const KEY = 'tidrapport.v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- Data ---------- */
const DEFAULT = {
  settings: { company: 'Granfors Åkeri AB', name: '', rate: '', otLimit: 8, projects: ['Allmänt'], defaultProject: 'Allmänt' },
  entries: []
};
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.settings && Array.isArray(d.entries)) return { settings: { ...DEFAULT.settings, ...d.settings }, entries: d.entries };
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT));
}
let db = load();
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Datum & ISO-vecka ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return { year: y, week: w };
}
function mondayOf(year, week) {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const mon = new Date(year, 0, 4 - day + 1);
  mon.setDate(mon.getDate() + (week - 1) * 7);
  return mon;
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const nf = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });
const kr = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const h = n => nf.format(n);
const fmtDate = s => { const d = parse(s); return `${DAYS[(d.getDay() + 6) % 7].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sortEntries = a => [...a].sort((x, y) => y.date.localeCompare(x.date) || (y.created || 0) - (x.created || 0));

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }

/* ---------- Header ---------- */
function renderHeader() {
  $('#logo').textContent = db.settings.company || 'Tidrapport';
  $('#topSub').textContent = db.settings.name ? `Tidrapport · ${db.settings.name}` : 'Tidrapport';
  document.title = `Tidrapport – ${db.settings.company || ''}`;
}

/* ---------- Registrera ---------- */
function fillProjects(sel, value, list) {
  const ps = list || db.settings.projects;
  sel.innerHTML = ps.map(p => `<option${p === value ? ' selected' : ''}>${esc(p)}</option>`).join('');
  if (value && !ps.includes(value)) sel.insertAdjacentHTML('beforeend', `<option selected>${esc(value)}</option>`);
}
function resetForm() {
  $('#editId').value = '';
  $('#fDate').value = today();
  setHours(8);
  fillProjects($('#fProject'), db.settings.defaultProject);
  const last = sortEntries(db.entries)[0];
  $('#fPlace').value = last ? last.place || '' : '';
  $('#fNote').value = '';
  $('#regTitle').textContent = 'Ny registrering';
  $('#saveBtn').textContent = 'Spara';
  $('#cancelEdit').classList.add('hidden');
}
function setHours(v) {
  v = Math.max(0, Math.min(24, Math.round(v * 4) / 4));
  $('#fHours').value = v;
  $$('.quick button').forEach(b => b.classList.toggle('sel', Number(b.dataset.h) === v));
}
$('#hMinus').onclick = () => setHours(Number($('#fHours').value || 0) - 0.5);
$('#hPlus').onclick = () => setHours(Number($('#fHours').value || 0) + 0.5);
$('#fHours').oninput = () => setHours(Number($('#fHours').value.replace(',', '.')) || 0);
$$('.quick button').forEach(b => b.onclick = () => setHours(Number(b.dataset.h)));
$('#cancelEdit').onclick = () => { resetForm(); };

$('#regForm').onsubmit = e => {
  e.preventDefault();
  const hours = Number(String($('#fHours').value).replace(',', '.'));
  if (!$('#fDate').value || !(hours >= 0)) return toast('Kontrollera datum och timmar');
  const data = { date: $('#fDate').value, hours, project: $('#fProject').value, place: $('#fPlace').value.trim(), note: $('#fNote').value.trim() };
  const id = $('#editId').value;
  if (id) {
    const e2 = db.entries.find(x => x.id === id);
    Object.assign(e2, data, { updated: Date.now() });
    toast('Ändring sparad ✓');
  } else {
    db.entries.push({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), created: Date.now(), ...data });
    toast(`Sparat: ${h(hours)} h ✓`);
  }
  save(); resetForm(); renderAll();
};

function entryLi(e) {
  const sub = [e.project, e.place, e.note].filter(Boolean).map(esc).join(' · ');
  return `<li data-id="${e.id}"><div class="h">${h(e.hours)}</div><div class="info"><b>${fmtDate(e.date)}</b><small>${sub || '&nbsp;'}</small></div>
  <div class="act"><button class="edit" aria-label="Redigera">✎</button><button class="del" aria-label="Radera">🗑</button></div></li>`;
}
function renderLists() {
  const all = sortEntries(db.entries);
  $('#recentList').innerHTML = all.slice(0, 5).map(entryLi).join('') || '<li class="empty">Inga registreringar än.</li>';
  const q = ($('#listFilter').value || '').toLowerCase();
  const f = q ? all.filter(e => [e.project, e.place, e.note, e.date].join(' ').toLowerCase().includes(q)) : all;
  $('#allList').innerHTML = f.map(entryLi).join('') || '<li class="empty">Inget att visa.</li>';
  $('#placeList').innerHTML = [...new Set(db.entries.map(e => e.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
}
$('#listFilter').oninput = renderLists;
document.addEventListener('click', ev => {
  const li = ev.target.closest('.entries li[data-id]'); if (!li) return;
  const e = db.entries.find(x => x.id === li.dataset.id); if (!e) return;
  if (ev.target.closest('.del')) {
    if (confirm(`Radera ${h(e.hours)} h ${fmtDate(e.date)}?`)) { db.entries = db.entries.filter(x => x !== e); save(); renderAll(); toast('Raderad'); }
  } else if (ev.target.closest('.edit')) {
    show('reg');
    $('#editId').value = e.id; $('#fDate').value = e.date; setHours(e.hours);
    fillProjects($('#fProject'), e.project); $('#fPlace').value = e.place || ''; $('#fNote').value = e.note || '';
    $('#regTitle').textContent = 'Redigera registrering'; $('#saveBtn').textContent = 'Spara ändring';
    $('#cancelEdit').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

/* ---------- Vecka ---------- */
let wk = isoWeek(new Date());
function weekData(year, week) {
  const mon = mondayOf(year, week);
  const days = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const ents = db.entries.filter(e => days.includes(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const lim = Number(db.settings.otLimit) || 8;
  const perDay = days.map((d, i) => { const es = ents.filter(e => e.date === d); const t = es.reduce((s, e) => s + e.hours, 0); return { date: d, name: DAYS[i], entries: es, total: t, ot: Math.max(0, t - lim) }; });
  const perProj = {}; ents.forEach(e => perProj[e.project] = (perProj[e.project] || 0) + e.hours);
  const total = ents.reduce((s, e) => s + e.hours, 0);
  const ot = perDay.reduce((s, d) => s + d.ot, 0);
  return { mon, sun: addDays(mon, 6), days, perDay, perProj, total, ot, lim, ents };
}
function renderWeek() {
  const w = weekData(wk.year, wk.week);
  $('#wLabel').textContent = `Vecka ${wk.week}, ${wk.year}`;
  $('#wRange').textContent = `${w.mon.getDate()} ${MONTHS[w.mon.getMonth()].slice(0, 3)} – ${w.sun.getDate()} ${MONTHS[w.sun.getMonth()].slice(0, 3)}`;
  $('#wPick').value = `${wk.year}-W${pad(wk.week)}`;
  const rows = w.perDay.map(d => `<tr><td>${d.name.slice(0, 3)} ${parse(d.date).getDate()}/${parse(d.date).getMonth() + 1}</td><td>${esc([...new Set(d.entries.map(e => e.project))].join(', '))}</td><td class="n">${d.total ? h(d.total) : '–'}</td><td class="n ${d.ot ? 'ot' : ''}">${d.ot ? h(d.ot) : ''}</td></tr>`).join('');
  const prow = Object.entries(w.perProj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)}</td></tr>`).join('');
  $('#weekBody').innerHTML = `
    <div class="kpis"><div class="kpi"><b id="wTotal">${h(w.total)}</b><span>timmar</span></div><div class="kpi"><b class="${w.ot ? 'ot' : ''}" id="wOt">${h(w.ot)}</b><span>övertid (&gt;${h(w.lim)} h/dag)</span></div><div class="kpi"><b>${w.perDay.filter(d => d.total).length}</b><span>arbetsdagar</span></div></div>
    <table><thead><tr><th>Dag</th><th>Projekt</th><th class="n">Tim</th><th class="n">Öt</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="2">Totalt</td><td class="n">${h(w.total)}</td><td class="n">${w.ot ? h(w.ot) : ''}</td></tr></tbody></table>
    ${prow ? `<table><thead><tr><th>Per projekt</th><th class="n">Timmar</th></tr></thead><tbody>${prow}</tbody></table>` : ''}`;
}
function shiftWeek(n) { const m = addDays(mondayOf(wk.year, wk.week), 7 * n); wk = isoWeek(m); renderWeek(); }
$('#wPrev').onclick = () => shiftWeek(-1);
$('#wNext').onclick = () => shiftWeek(1);
$('#wPick').onchange = () => { const m = /^(\d{4})-W(\d{2})$/.exec($('#wPick').value); if (m) { wk = { year: +m[1], week: +m[2] }; renderWeek(); } };

/* ---------- Månad ---------- */
let mo = { y: new Date().getFullYear(), m: new Date().getMonth() };
function monthData(y, m) {
  const pre = `${y}-${pad(m + 1)}-`;
  const ents = db.entries.filter(e => e.date.startsWith(pre)).sort((a, b) => a.date.localeCompare(b.date));
  const lim = Number(db.settings.otLimit) || 8;
  const byDay = {}; ents.forEach(e => byDay[e.date] = (byDay[e.date] || 0) + e.hours);
  const ot = Object.values(byDay).reduce((s, t) => s + Math.max(0, t - lim), 0);
  const perProj = {}; ents.forEach(e => perProj[e.project] = (perProj[e.project] || 0) + e.hours);
  const total = ents.reduce((s, e) => s + e.hours, 0);
  const rate = Number(db.settings.rate) || 0;
  return { ents, perProj, total, ot, rate, days: Object.keys(byDay).length };
}
function renderMonth() {
  const d = monthData(mo.y, mo.m);
  $('#mLabel').textContent = `${MONTHS[mo.m][0].toUpperCase() + MONTHS[mo.m].slice(1)} ${mo.y}`;
  const prow = Object.entries(d.perProj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)}</td>${d.rate ? `<td class="n">${kr.format(t * d.rate)}</td>` : ''}</tr>`).join('');
  $('#monthBody').innerHTML = `
    <div class="kpis"><div class="kpi"><b>${h(d.total)}</b><span>timmar</span></div><div class="kpi"><b class="${d.ot ? 'ot' : ''}">${h(d.ot)}</b><span>övertid</span></div><div class="kpi"><b>${d.rate ? kr.format(d.total * d.rate) : d.days}</b><span>${d.rate ? 'att fakturera' : 'arbetsdagar'}</span></div></div>
    <table><thead><tr><th>Projekt</th><th class="n">Timmar</th>${d.rate ? '<th class="n">Belopp</th>' : ''}</tr></thead><tbody>${prow || `<tr><td colspan="3" class="empty">Inga timmar denna månad.</td></tr>`}
    ${prow ? `<tr class="tot"><td>Totalt</td><td class="n">${h(d.total)}</td>${d.rate ? `<td class="n">${kr.format(d.total * d.rate)}</td>` : ''}</tr>` : ''}</tbody></table>
    ${d.rate ? `<p class="muted small">Timpris ${kr.format(d.rate)}/h, exkl. moms.</p>` : '<p class="muted small">Ange timpris under Inställningar för att få belopp.</p>'}`;
}
$('#mPrev').onclick = () => { mo.m--; if (mo.m < 0) { mo.m = 11; mo.y--; } renderMonth(); };
$('#mNext').onclick = () => { mo.m++; if (mo.m > 11) { mo.m = 0; mo.y++; } renderMonth(); };

/* ---------- Utskrift ---------- */
function repHead(title, sub) {
  const s = db.settings;
  return `<div class="rep-head"><div class="rep-logo">${esc(s.company || 'Tidrapport')}</div><div class="rep-meta">${s.name ? `${esc(s.name)}<br>` : ''}Utskriven ${today()}</div></div><h1>${esc(title)}</h1><div style="color:#555">${esc(sub)}</div>`;
}
function printWeek() {
  const w = weekData(wk.year, wk.week);
  const rows = w.perDay.map(d => d.entries.length ? d.entries.map((e, i) => `<tr><td>${i ? '' : `${d.name} ${parse(d.date).getDate()}/${parse(d.date).getMonth() + 1}`}</td><td>${esc(e.project)}</td><td>${esc(e.place)}</td><td>${esc(e.note)}</td><td class="n">${h(e.hours)}</td><td class="n ot">${i === d.entries.length - 1 && d.ot ? h(d.ot) : ''}</td></tr>`).join('') : `<tr><td>${d.name} ${parse(d.date).getDate()}/${parse(d.date).getMonth() + 1}</td><td colspan="3" style="color:#999">–</td><td class="n"></td><td></td></tr>`).join('');
  const prow = Object.entries(w.perProj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)}</td></tr>`).join('');
  $('#print').innerHTML = `<div class="rep">${repHead(`Veckorapport vecka ${wk.week}, ${wk.year}`, `${ymd(w.mon)} – ${ymd(w.sun)}`)}
  <table><thead><tr><th>Dag</th><th>Projekt</th><th>Plats</th><th>Notering</th><th class="n">Timmar</th><th class="n">Övertid</th></tr></thead><tbody>${rows}
  <tr class="tot"><td colspan="4">Totalt</td><td class="n">${h(w.total)}</td><td class="n">${w.ot ? h(w.ot) : ''}</td></tr></tbody></table>
  ${prow ? `<h3>Summa per projekt</h3><table><tbody>${prow}</tbody></table>` : ''}
  <div class="rep-foot"><div>Signatur</div><div>Godkänd av beställare</div></div>
  <div class="rep-small">Övertid räknas på tid över ${h(w.lim)} h per dag.</div></div>`;
  window.print();
}
function printMonth() {
  const d = monthData(mo.y, mo.m);
  const rows = d.ents.map(e => `<tr><td>${e.date}</td><td>${esc(e.project)}</td><td>${esc(e.place)}</td><td>${esc(e.note)}</td><td class="n">${h(e.hours)}</td>${d.rate ? `<td class="n">${kr.format(e.hours * d.rate)}</td>` : ''}</tr>`).join('');
  const prow = Object.entries(d.perProj).map(([p, t]) => `<tr><td>${esc(p)}</td><td class="n">${h(t)} h</td>${d.rate ? `<td class="n">${kr.format(t * d.rate)}</td>` : ''}</tr>`).join('');
  $('#print').innerHTML = `<div class="rep">${repHead(`Fakturaunderlag ${MONTHS[mo.m]} ${mo.y}`, d.rate ? `Timpris ${kr.format(d.rate)}/h exkl. moms` : '')}
  <h3>Summering per projekt</h3><table><tbody>${prow}<tr class="tot"><td>Totalt</td><td class="n">${h(d.total)} h</td>${d.rate ? `<td class="n">${kr.format(d.total * d.rate)}</td>` : ''}</tr></tbody></table>
  <h3>Specifikation</h3><table><thead><tr><th>Datum</th><th>Projekt</th><th>Plats</th><th>Notering</th><th class="n">Tim</th>${d.rate ? '<th class="n">Belopp</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
  <div class="rep-small">Varav övertid: ${h(d.ot)} h.</div></div>`;
  window.print();
}
$('#printWeek').onclick = printWeek;
$('#printMonth').onclick = printMonth;

/* ---------- Export ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function toCSV() {
  const q = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = [['Datum', 'Vecka', 'Veckodag', 'Timmar', 'Projekt', 'Plats', 'Notering']];
  [...db.entries].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => { const d = parse(e.date); const w = isoWeek(d); rows.push([e.date, `${w.year}-V${pad(w.week)}`, DAYS[(d.getDay() + 6) % 7], String(e.hours).replace('.', ','), e.project, e.place, e.note]); });
  return '\uFEFF' + rows.map(r => r.map(q).join(';')).join('\r\n');
}
$('#csvBtn').onclick = () => { download(`tidrapport-${today()}.csv`, toCSV(), 'text/csv;charset=utf-8'); toast('CSV exporterad'); };
$('#backupBtn').onclick = () => { download(`tidrapport-backup-${today()}.json`, JSON.stringify({ app: 'tidrapport', version: VERSION, exported: new Date().toISOString(), ...db }, null, 2), 'application/json'); toast('Backup sparad'); };
$('#restoreFile').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.settings || !Array.isArray(d.entries)) throw new Error();
    if (!confirm(`Återställ ${d.entries.length} registreringar? Nuvarande data ersätts.`)) return;
    db = { settings: { ...DEFAULT.settings, ...d.settings }, entries: d.entries }; save(); renderAll(); resetForm(); toast('Backup återställd ✓');
  } catch (e) { toast('Ogiltig backupfil'); }
  ev.target.value = '';
};

/* ---------- Inställningar ---------- */
let tmpProjects = [];
function renderSettings() {
  const s = db.settings;
  $('#sCompany').value = s.company; $('#sName').value = s.name; $('#sRate').value = s.rate; $('#sOt').value = s.otLimit;
  tmpProjects = [...s.projects]; renderProj(s.defaultProject);
}
function renderProj(def) {
  $('#projList').innerHTML = tmpProjects.map((p, i) => `<li><span>${esc(p)}</span><button type="button" data-i="${i}" aria-label="Ta bort ${esc(p)}">✕</button></li>`).join('');
  fillProjects($('#sDefault'), tmpProjects.includes(def) ? def : tmpProjects[0], tmpProjects);
}
$('#projList').onclick = ev => { const b = ev.target.closest('button[data-i]'); if (!b) return; if (tmpProjects.length <= 1) return toast('Minst ett projekt behövs'); tmpProjects.splice(+b.dataset.i, 1); renderProj($('#sDefault').value); };
$('#addProj').onclick = () => { const v = $('#newProj').value.trim(); if (v && !tmpProjects.includes(v)) { tmpProjects.push(v); renderProj($('#sDefault').value); } $('#newProj').value = ''; };
$('#newProj').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#addProj').click(); } };
$('#setForm').onsubmit = e => {
  e.preventDefault();
  db.settings = { company: $('#sCompany').value.trim(), name: $('#sName').value.trim(), rate: $('#sRate').value, otLimit: Number($('#sOt').value) || 8, projects: tmpProjects, defaultProject: $('#sDefault').value };
  save(); renderAll(); resetForm(); toast('Inställningar sparade ✓');
};

/* ---------- Navigering ---------- */
function show(v) {
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'set') renderSettings();
  window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
function renderAll() { renderHeader(); renderLists(); renderWeek(); renderMonth(); }

renderAll(); resetForm();
$('#ver').textContent = `Tidrapport v${VERSION} · fungerar offline`;
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
