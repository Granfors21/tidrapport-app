'use strict';
/* Faktura – typografisk A4-PDF (lokal, ingen server). Mått i typografiska punkter. */
const INV = {
  W: 595.28, H: 841.89, S: 4,
  ML: 52, MR: 52, MT: 42, FOOT: 76,
  VAT: 0.25,
  ink: '#1C1917', muted: '#6B6560', faint: '#9A948E',
  rule: '#D5CFC8', rule2: '#C1BAB2', burgundy: '#7B1E2B',
  paper: '#FFFFFF', soft: '#F6F3F0',
  inter: 'Inter, system-ui, sans-serif',
  serif: '"Source Serif 4", "Times New Roman", serif',
  logo: 'Logo, Yellowtail, cursive'
};
INV.CW = INV.W - INV.ML - INV.MR;

function invR2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function invSEK(n, withKr) {
  if (n == null || n === '' || !isFinite(Number(n))) return '—';
  const s = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(invR2(n));
  return withKr ? s + ' kr' : s;
}
function invQty(n) {
  if (n == null || n === '' || !isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}
function invLongDate(s) {
  if (!s) return '';
  const d = parse(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
const INV_DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
function invDayTitle(s) {
  const d = parse(s);
  const name = (typeof dayName === 'function') ? dayName(s) : INV_DAYS[(d.getDay() + 6) % 7];
  return `${name} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function hasInvPrice(p) {
  return p !== '' && p != null && isFinite(Number(String(p).replace(',', '.'))) && String(p).trim() !== '';
}
function compileDaySpec(inR) {
  if (typeof db === 'undefined' || !db) return [];
  const rows = (db.rows || []).filter(inR).sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  const arts = (db.extras || []).filter(x => x.kind === 'article' && inR(x)).sort((a, b) => a.date.localeCompare(b.date));
  const atas = (db.atas || []).filter(x => inR(x) && x.status === 'godkand').sort((a, b) => a.date.localeCompare(b.date) || String(a.nr).localeCompare(String(b.nr), 'sv'));
  const dates = [...new Set([...rows, ...arts, ...atas].map(x => x.date))].sort();
  return dates.map(date => {
    const items = [];
    rows.filter(r => r.date === date).forEach(r => {
      const addons = (typeof addonText === 'function') ? addonText(r) : (r.addons || []).map(x => x.name).join(', ');
      const proj = (typeof projSub === 'function') ? projSub(r) : (r.project || '');
      const time = (r.time && r.time.from) ? `${r.time.from}–${r.time.to}` : '';
      const rast = (r.time && num(r.time.brk)) ? `rast ${num(r.time.brk)} min` : '';
      const hours = num(r.hours);
      let missing = typeof rateFor === 'function' ? !hasInvPrice(rateFor(r.categoryId)) && hours > 0 : false;
      (r.addons || []).forEach(x => { if (!hasInvPrice(x.price) && (x.unit ? num(x.qty) : 1)) missing = true; });
      const amount = missing ? null : (typeof rowAmount === 'function' ? invR2(rowAmount(r)) : null);
      items.push({ kind: 'tid', title: r.catName || 'Tid', detail: [proj, addons, rast].filter(Boolean).join('  ·  '), time, hours, qtyLabel: hours ? invQty(hours) + ' h' : '', note: (r.note || '').trim(), amount, missing });
    });
    arts.filter(x => x.date === date).forEach(x => {
      const proj = (typeof projSub === 'function') ? projSub(x) : (x.project || '');
      const def = (typeof S === 'function' ? (S().articles || []) : []).find(a => a.name.toLowerCase() === String(x.name).toLowerCase());
      const price = def && hasInvPrice(def.price) ? num(def.price) : (hasInvPrice(x.price) ? num(x.price) : null);
      const missing = price == null;
      const hours = x.unit === 'h' ? num(x.qty) : 0;
      items.push({ kind: 'artikel', title: x.name, detail: [proj, x.unit && x.unit !== 'h' ? '' : ''].filter(Boolean).join('  ·  ') || proj, time: '', hours, qtyLabel: `${invQty(x.qty)} ${x.unit || ''}`.trim(), note: (x.note || '').trim(), amount: missing ? null : invR2(price * num(x.qty)), missing });
    });
    atas.filter(x => x.date === date).forEach(x => {
      const typ = (typeof ataTypeLbl === 'function' ? ataTypeLbl(x.type) : x.type) || 'ÄTA';
      const title = `${typeof ataNo === 'function' ? ataNo(x) : 'ÄTA'}  ·  ${typ}`;
      const desc = [x.desc, x.catName, x.orderedBy ? `beställt av ${x.orderedBy}` : ''].filter(Boolean).join('  ·  ');
      const proj = (typeof projSub === 'function') ? projSub(x) : (x.project || '');
      const hours = num(x.hours);
      let amount = null, missing = false;
      if (x.amount !== '' && x.amount != null) amount = (typeof ataAmount === 'function' ? invR2(ataAmount(x)) : invR2(num(x.amount)));
      else if (hours && typeof rateFor === 'function' && hasInvPrice(rateFor(x.categoryId))) amount = invR2(hours * num(rateFor(x.categoryId)));
      else if (hours) missing = true;
      items.push({ kind: 'ata', title, detail: [desc, proj].filter(Boolean).join('  ·  '), time: '', hours, qtyLabel: hours ? invQty(hours) + ' h' : '', note: '', amount, missing });
    });
    const hours = invR2(items.reduce((s, it) => s + num(it.hours), 0));
    const amount = invR2(items.reduce((s, it) => s + (it.amount != null && !it.missing ? it.amount : 0), 0));
    return { date, title: invDayTitle(date), items, hours, amount, missing: items.some(it => it.missing) };
  });
}
function invShortSpan(from, to) {
  const a = parse(from), b = parse(to);
  if (from === to) return invLongDate(from);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${invLongDate(from)} – ${invLongDate(to)}`;
}
function invWeekLabel(from, to) {
  const weeks = [];
  for (let d = from; d <= to; d = ymd(addDays(d, 1))) {
    const w = isoWeek(parse(d)), k = `${w.year}-${w.week}`;
    if (!weeks.length || weeks[weeks.length - 1].k !== k) weeks.push({ k, ...w });
  }
  if (!weeks.length) return invShortSpan(from, to);
  const y = weeks[0].year, sameY = weeks.every(w => w.year === y);
  const nums = weeks.map(w => w.week);
  let wtxt;
  if (weeks.length === 1) wtxt = `Vecka ${nums[0]}${sameY ? `, ${y}` : ` ${weeks[0].year}`}`;
  else if (nums.every((n, i) => i === 0 || n === nums[i - 1] + 1) && sameY) wtxt = `Vecka ${nums[0]}–${nums[nums.length - 1]}, ${y}`;
  else wtxt = `Vecka ${weeks.map(w => (w.year === y && sameY ? w.week : `${w.week} ${w.year}`)).join(', ')}${sameY ? `, ${y}` : ''}`;
  return `${wtxt}  ·  ${invShortSpan(from, to)}`;
}
function invVatFromOrg(org) {
  const d = String(org || '').replace(/\D/g, '');
  return d.length === 10 ? `SE${d}01` : '';
}
function defaultInvoiceSettings() {
  return { addr: '', zip: '', city: '', phone: '', email: '', orgNr: '', vatNr: '', bankgiro: '', plusgiro: '', iban: '', bank: '', fskatt: true, dueDays: 30, seq: 1, ourRef: '', note: '' };
}
function ensureInvoiceSettings(s) {
  s.invoice = { ...defaultInvoiceSettings(), ...(s.invoice || {}) };
  if (!Array.isArray(s.customers)) s.customers = [];
  if (s.articles) s.articles.forEach(a => { if (a.price == null) a.price = ''; });
  return s;
}
function nextInvoiceNo(s, date) {
  const y = (date && parse(date) || new Date()).getFullYear();
  const n = Math.max(1, num((s.invoice || {}).seq) || 1);
  return { text: `F-${y}-${String(n).padStart(3, '0')}`, seq: n };
}

function compileInvoice({ from, to, weeks, projects, customer, date, due, ourRef, theirRef, note, no, example, daySpec, seller: sellerOver }) {
  const s = (typeof S === 'function' ? S() : {}), invs = s.invoice || defaultInvoiceSettings();
  const projFilter = projects && projects.length ? new Set(projects) : null;
  const weekSet = weeks && weeks.length ? new Set(weeks) : null;
  const inR = x => {
    if (!x || !x.date) return false;
    if (weekSet) { const w = isoWeek(parse(x.date)); if (!weekSet.has(`${w.year}-${w.week}`) && !weekSet.has(`${w.year}-W${w.week}`)) return false; }
    else if (x.date < from || x.date > to) return false;
    return !projFilter || projFilter.has(x.project) || (!x.project && projFilter.has('Allmänt'));
  };
  const rows = ((typeof db !== 'undefined' && db.rows) || []).filter(inR).sort((a, b) => a.date.localeCompare(b.date));
  const arts = ((typeof db !== 'undefined' && db.extras) || []).filter(x => x.kind === 'article' && inR(x));
  const atas = ((typeof db !== 'undefined' && db.atas) || []).filter(x => inR(x) && x.status === 'godkand');

  const machines = {};
  const addons = {};
  rows.forEach(r => {
    const proj = r.project || 'Allmänt', sub = r.sub || '';
    const mk = `${proj}\x1f${sub}\x1f${r.catName}`;
    const m = machines[mk] = machines[mk] || { project: proj, sub, name: r.catName, hours: 0, rate: rateFor(r.categoryId), dates: [], catId: r.categoryId };
    m.hours += mhOf(r);
    m.dates.push(r.date);
    if (!m.rate) m.rate = rateFor(r.categoryId);
    (r.addons || []).forEach(x => {
      const ak = `${mk}\x1f${x.name}`;
      const A = addons[ak] = addons[ak] || { project: proj, sub, machine: r.catName, name: x.name, qty: 0, unit: x.unit || 'st', price: x.price, dates: [] };
      A.qty += x.unit ? num(x.qty) : 1;
      A.dates.push(r.date);
      if (A.price === '' || A.price == null || A.price === undefined) A.price = x.price;
      if ((A.price === '' || A.price == null) && r.categoryId) {
        const cat = typeof catById === 'function' ? catById(r.categoryId) : null;
        const def = cat && (cat.addons || []).find(y => y.name.toLowerCase() === String(x.name).toLowerCase());
        if (def && def.price !== '' && def.price != null) A.price = def.price;
      }
    });
  });

  const artMap = {};
  arts.forEach(x => {
    const proj = x.project || 'Allmänt', sub = x.sub || '';
    const k = `${proj}\x1f${sub}\x1f${x.name}\x1f${x.unit}`;
    const A = artMap[k] = artMap[k] || { project: proj, sub, name: x.name, qty: 0, unit: x.unit || 'st', price: '', dates: [] };
    A.qty += num(x.qty);
    A.dates.push(x.date);
    if (!A.price && s.articles) {
      const def = s.articles.find(a => a.name.toLowerCase() === String(x.name).toLowerCase());
      if (def && def.price !== '' && def.price != null) A.price = def.price;
    }
  });

  const periodOf = dates => {
    if (!dates || !dates.length) return invShortSpan(from, to);
    const a = dates.slice().sort();
    return invShortSpan(a[0], a[a.length - 1]);
  };
  const detailOf = (project, sub, dates) => [project, sub, periodOf(dates)].filter(Boolean).join('  ·  ');
  const hasPrice = p => p !== '' && p != null && isFinite(Number(String(p).replace(',', '.'))) && String(p).trim() !== '';
  const lines = [];
  const missing = [];

  const pushItem = (o) => {
    const priced = hasPrice(o.price);
    const price = priced ? num(o.price) : null;
    const amount = priced ? invR2(price * Number(o.qty)) : null;
    if (!priced) missing.push(o.missingName || o.title);
    lines.push({ kind: 'item', ...o, price, amount, missing: !priced });
  };

  const byProj = {};
  Object.values(machines).forEach(m => {
    (byProj[m.project] = byProj[m.project] || { items: [], addons: [], arts: [], atas: [] }).items.push(m);
  });
  Object.values(addons).forEach(a => {
    (byProj[a.project] = byProj[a.project] || { items: [], addons: [], arts: [], atas: [] }).addons.push(a);
  });
  Object.values(artMap).forEach(a => {
    (byProj[a.project] = byProj[a.project] || { items: [], addons: [], arts: [], atas: [] }).arts.push(a);
  });
  atas.forEach(x => {
    const p = x.project || 'Allmänt';
    (byProj[p] = byProj[p] || { items: [], addons: [], arts: [], atas: [] }).atas.push(x);
  });

  const projNames = Object.keys(byProj).sort((a, b) => a.localeCompare(b, 'sv'));
  const multi = projNames.length > 1;
  projNames.forEach(pn => {
    const g = byProj[pn];
    if (multi) lines.push({ kind: 'section', title: pn });
    g.items.sort((a, b) => a.name.localeCompare(b.name, 'sv') || (a.sub || '').localeCompare(b.sub || '', 'sv'));
    g.items.forEach(m => pushItem({
      title: m.name, detail: detailOf(m.project, m.sub, m.dates), qty: invR2(m.hours), unit: 'h', price: m.rate,
      project: m.project, missingName: m.name, type: 'maskin'
    }));
    g.addons.sort((a, b) => a.machine.localeCompare(b.machine, 'sv') || a.name.localeCompare(b.name, 'sv'));
    g.addons.forEach(a => pushItem({
      title: `${a.machine}, ${a.name}`, detail: detailOf(a.project, a.sub, a.dates), qty: invR2(a.qty), unit: a.unit || 'st', price: a.price,
      project: a.project, missingName: `${a.machine} / ${a.name}`, type: 'tillagg'
    }));
    g.arts.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    g.arts.forEach(a => pushItem({
      title: a.name, detail: detailOf(a.project, a.sub, a.dates), qty: invR2(a.qty), unit: a.unit || 'st', price: a.price,
      project: a.project, missingName: a.name, type: 'artikel'
    }));
    g.atas.sort((a, b) => String(a.nr).localeCompare(String(b.nr), 'sv') || a.date.localeCompare(b.date));
    g.atas.forEach(x => {
      const typ = (typeof ataTypeLbl === 'function' ? ataTypeLbl(x.type) : x.type) || 'ÄTA';
      const title = `${typeof ataNo === 'function' ? ataNo(x) : 'ÄTA'}  ·  ${typ}`;
      const desc = [x.desc, x.catName, x.orderedBy ? `beställt av ${x.orderedBy}` : ''].filter(Boolean).join('  ·  ');
      let qty, unit, price;
      if (x.amount !== '' && x.amount != null && num(x.hours) > 0) { qty = invR2(num(x.hours)); unit = 'h'; price = invR2(num(x.amount) / num(x.hours)); }
      else if (x.amount !== '' && x.amount != null) { qty = 1; unit = 'st'; price = num(x.amount); }
      else if (num(x.hours) > 0) { qty = invR2(num(x.hours)); unit = 'h'; price = rateFor(x.categoryId); }
      else { qty = 1; unit = 'st'; price = ''; }
      if (x.type === 'avgaende' && price !== '' && price != null) price = -Math.abs(num(price));
      pushItem({ title, detail: [desc, detailOf(x.project, x.sub, [x.date])].filter(Boolean).join('  ·  '), qty, unit, price, project: x.project, missingName: title, type: 'ata', ataId: x.id });
    });
  });

  const subtotal = invR2(lines.reduce((s2, l) => s2 + (l.kind === 'item' && l.amount != null ? l.amount : 0), 0));
  const vat = invR2(subtotal * INV.VAT);
  const total = invR2(subtotal + vat);
  const used = projFilter ? [...projFilter] : [...new Set([...rows, ...arts, ...atas].map(x => x.project || 'Allmänt'))];

  const seller = sellerOver || {
    name: s.company || (typeof BRAND !== 'undefined' ? BRAND : 'Granfors Åkeri AB'),
    addr: invs.addr, zip: invs.zip, city: invs.city, phone: invs.phone, email: invs.email,
    orgNr: invs.orgNr, vatNr: invs.vatNr || invVatFromOrg(invs.orgNr),
    bankgiro: invs.bankgiro, plusgiro: invs.plusgiro, iban: invs.iban, bank: invs.bank,
    fskatt: invs.fskatt !== false
  };
  const buyer = customer || { name: '', addr: '', zip: '', city: '', orgNr: '', vatNr: '', ref: '', email: '' };

  return {
    no: no || nextInvoiceNo(s, date).text,
    date: date || today(), due: due || ymd(addDays(date || today(), num(invs.dueDays) || 30)),
    from, to, periodLabel: invWeekLabel(from, to),
    projects: used, projectLabel: used.length ? used.join(', ') : 'Alla projekt',
    ourRef: ourRef || invs.ourRef || s.name || '', theirRef: theirRef || buyer.ref || '',
    seller, buyer, lines, missing, subtotal, vat, vatRate: INV.VAT, total,
    incomplete: missing.length > 0, note: note || '', example: !!example,
    daySpec: daySpec !== false, days: compileDaySpec(inR)
  };
}

function exampleInvoice() {
  const seller = {
    name: 'Granfors Åkeri AB',
    addr: 'Exempelgatan 1',
    zip: '100 00', city: 'Exempelstad',
    phone: '010-000 00 00', email: 'faktura@exempel.se',
    orgNr: '556000-0000', vatNr: 'SE556000000001',
    bankgiro: '000-0000', plusgiro: '000000-0',
    iban: 'SE00 0000 0000 0000 0000 0000', bank: 'Exempelbanken',
    fskatt: true, example: true
  };
  const buyer = {
    name: 'Exempelkund AB',
    addr: 'Industrivägen 2',
    zip: '123 45', city: 'Exempelköping',
    orgNr: '556111-2222', vatNr: 'SE556111222201',
    ref: 'Anna Andersson', email: 'anna@exempelkund.se', example: true
  };
  const lines = [
    { kind: 'section', title: 'Exempelprojekt' },
    { kind: 'item', title: 'Lastbil', detail: 'Exempelprojekt  ·  9–22 november 2026', qty: 32, unit: 'h', price: 850, amount: 27200, missing: false, type: 'maskin' },
    { kind: 'item', title: 'Lastbil, Kran', detail: 'Exempelprojekt  ·  9–22 november 2026', qty: 12, unit: 'h', price: 250, amount: 3000, missing: false, type: 'tillagg' },
    { kind: 'item', title: 'Grävmaskin', detail: 'Exempelprojekt  ·  schakt  ·  9–15 november 2026', qty: 24, unit: 'h', price: 950, amount: 22800, missing: false, type: 'maskin' },
    { kind: 'item', title: 'Grävmaskin, Rototilt', detail: 'Exempelprojekt  ·  schakt  ·  9–15 november 2026', qty: 24, unit: 'st', price: 50, amount: 1200, missing: false, type: 'tillagg' },
    { kind: 'item', title: 'Markvibrator', detail: 'Exempelprojekt  ·  12–14 november 2026', qty: 8, unit: 'h', price: 75, amount: 600, missing: false, type: 'artikel' },
    { kind: 'item', title: 'ÄTA-3  ·  Tilläggsarbete', detail: 'Extra schakt vid vägtrumma, beställt av Anna Andersson  ·  Exempelprojekt  ·  13 november 2026', qty: 6, unit: 'h', price: 950, amount: 5700, missing: false, type: 'ata' }
  ];

  const days = [
    { date: '2026-11-09', title: 'Måndag 9 november', hours: 8, amount: 7800, missing: false, items: [
      { kind: 'tid', title: 'Lastbil', detail: 'Exempelprojekt  ·  Kran 4 h  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 7800, missing: false }
    ] },
    { date: '2026-11-10', title: 'Tisdag 10 november', hours: 8, amount: 7800, missing: false, items: [
      { kind: 'tid', title: 'Lastbil', detail: 'Exempelprojekt  ·  Kran 4 h  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 7800, missing: false }
    ] },
    { date: '2026-11-11', title: 'Onsdag 11 november', hours: 8, amount: 7800, missing: false, items: [
      { kind: 'tid', title: 'Lastbil', detail: 'Exempelprojekt  ·  Kran 4 h  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: 'Transport av massor', amount: 7800, missing: false }
    ] },
    { date: '2026-11-12', title: 'Torsdag 12 november', hours: 12, amount: 8300, missing: false, items: [
      { kind: 'tid', title: 'Grävmaskin', detail: 'Exempelprojekt  ·  schakt  ·  Rototilt  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 8000, missing: false },
      { kind: 'artikel', title: 'Markvibrator', detail: 'Exempelprojekt  ·  schakt', time: '', hours: 4, qtyLabel: '4,00 h', note: '', amount: 300, missing: false }
    ] },
    { date: '2026-11-13', title: 'Fredag 13 november', hours: 18, amount: 14000, missing: false, items: [
      { kind: 'tid', title: 'Grävmaskin', detail: 'Exempelprojekt  ·  schakt  ·  Rototilt  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 8000, missing: false },
      { kind: 'artikel', title: 'Markvibrator', detail: 'Exempelprojekt  ·  schakt', time: '', hours: 4, qtyLabel: '4,00 h', note: '', amount: 300, missing: false },
      { kind: 'ata', title: 'ÄTA-3  ·  Tilläggsarbete', detail: 'Extra schakt vid vägtrumma, beställt av Anna Andersson  ·  Exempelprojekt', time: '', hours: 6, qtyLabel: '6,00 h', note: '', amount: 5700, missing: false }
    ] },
    { date: '2026-11-16', title: 'Måndag 16 november', hours: 8, amount: 6800, missing: false, items: [
      { kind: 'tid', title: 'Lastbil', detail: 'Exempelprojekt  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 6800, missing: false }
    ] },
    { date: '2026-11-17', title: 'Tisdag 17 november', hours: 8, amount: 8000, missing: false, items: [
      { kind: 'tid', title: 'Grävmaskin', detail: 'Exempelprojekt  ·  schakt  ·  Rototilt  ·  rast 30 min', time: '07:00–16:00', hours: 8, qtyLabel: '8,00 h', note: '', amount: 8000, missing: false }
    ] }
  ];
  const subtotal = 60500, vat = 15125, total = 75625;
  return {
    no: 'F-2026-001', date: '2026-11-17', due: '2026-12-17',
    from: '2026-11-09', to: '2026-11-22',
    periodLabel: 'Vecka 46–47, 2026  ·  9–22 november 2026',
    projects: ['Exempelprojekt'], projectLabel: 'Exempelprojekt',
    ourRef: 'Robin Granfors', theirRef: 'Anna Andersson',
    seller, buyer, lines, missing: [], subtotal, vat, vatRate: 0.25, total,
    incomplete: false, note: '', example: true, daySpec: true, days
  };
}

async function loadInvoiceFonts() {
  if (window.__invFonts) return;
  const base = (document.querySelector('script[src*="invoice.js"]') || {}).src || '';
  const root = base ? base.replace(/invoice\.js(\?.*)?$/, '') : '';
  const D = window.INV_FONT_DATA || {};
  const src = (data, path) => data ? `url(data:font/woff2;base64,${data})` : `url(${root}${path})`;
  const faces = [
    ['Inter', '400', src(D.inter400, 'fonts/Inter-400.woff2')],
    ['Inter', '500', src(D.inter500, 'fonts/Inter-500.woff2')],
    ['Inter', '600', src(D.inter600, 'fonts/Inter-600.woff2')],
    ['Source Serif 4', '400', src(D.serif400, 'fonts/SourceSerif4-400.woff2')],
    ['Source Serif 4', '600', src(D.serif600, 'fonts/SourceSerif4-600.woff2')],
    ['Logo', '400', `url(${root}fonts/Yellowtail-Regular.ttf)`]
  ];
  await Promise.all(faces.map(([fam, w, source]) => {
    const f = new FontFace(fam, source, { weight: w, style: 'normal', display: 'swap' });
    return f.load().then(ff => document.fonts.add(ff));
  }));
  await document.fonts.ready;
  window.__invFonts = true;
}

/* ---------- typografisk ritmotor ---------- */
function invPx(pt) { return pt * INV.S; }
function invFont(g, size, weight, fam) {
  g.font = `${weight || 400} ${invPx(size)}px ${fam || INV.inter}`;
}
function invColor(g, c) { g.fillStyle = c; g.strokeStyle = c; }
function invRule(g, x, y, w, t, c) {
  g.fillStyle = c || INV.rule;
  const h = Math.max(1, invPx(t || 0.5));
  g.fillRect(invPx(x), Math.round(invPx(y) - h / 2), invPx(w), h);
}
function invMeasure(g, t) { return g.measureText(String(t ?? '')).width / INV.S; }
function invWrap(g, text, maxW, maxLines) {
  const words = String(text ?? '').split(/\s+/);
  let lines = [];
  let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (invMeasure(g, t) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) {
    let last = lines[maxLines - 1];
    while (invMeasure(g, last + '…') > maxW && last.length > 1) last = last.slice(0, -1);
    lines.length = maxLines;
    lines[maxLines - 1] = last.replace(/[.,;:·\s]+$/, '') + '…';
  }
  lines = lines.map((l, i) => (i < lines.length - 1 ? l.replace(/\s*[·,;:]\s*$/, '') : l));
  return lines;
}
function invFillText(g, text, x, y, align) {
  g.textAlign = 'left';
  const t = String(text ?? '');
  const w = invMeasure(g, t);
  let px = invPx(x);
  if (align === 'right') px -= invPx(w);
  if (align === 'center') px -= invPx(w) / 2;
  g.fillText(t, px, invPx(y));
  return w;
}
function invTracked(g, text, x, y, tracking, align) {
  const chars = [...String(text ?? '')];
  const widths = chars.map(ch => g.measureText(ch).width);
  const tr = invPx(tracking || 0);
  const total = widths.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
  let cx = invPx(x);
  if (align === 'right') cx -= total;
  if (align === 'center') cx -= total / 2;
  const by = invPx(y);
  g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, cx, by); cx += widths[i] + tr; });
  return total / INV.S;
}
function invMoney(g, n, xRight, y, { withKr = false, size = 9.2, weight = 400, color = INV.ink } = {}) {
  invFont(g, size, weight, INV.inter);
  invColor(g, color);
  const num = invSEK(n, false);
  const krGap = 3.5;
  invTabular(g, num, xRight, y, 'right');
  if (withKr) {
    const nw = invTabularWidth(g, num);
    invFont(g, Math.max(7.5, size * 0.62), 500, INV.inter);
    invColor(g, color === INV.burgundy ? INV.burgundy : INV.muted);
    invFillText(g, 'kr', xRight + krGap, y);
  }
}
function invTabularWidth(g, text) {
  const chars = [...String(text ?? '')];
  const zero = g.measureText('0').width;
  const space = zero * 0.42;
  return chars.reduce((a, ch) => a + (/\d/.test(ch) ? zero : (ch === ' ' || ch === '\u00A0' || ch === '\u202F' ? space : g.measureText(ch).width)), 0) / INV.S;
}
function invTabular(g, text, x, y, align) {
  const chars = [...String(text ?? '')];
  const zero = g.measureText('0').width;
  const space = zero * 0.42;
  const widths = chars.map(ch => {
    if (/\d/.test(ch)) return zero;
    if (ch === ' ' || ch === '\u00A0' || ch === '\u202F') return space;
    return g.measureText(ch).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'right' ? invPx(x) - total : invPx(x);
  const by = invPx(y);
  chars.forEach((ch, i) => {
    if (/\d/.test(ch)) {
      const w = g.measureText(ch).width;
      g.fillText(ch, cx + (zero - w) / 2, by);
    } else g.fillText(ch, cx, by);
    cx += widths[i];
  });
  return total / INV.S;
}

function invAddrLines(p) {
  const out = [];
  if (p.addr) out.push(p.addr);
  const zc = [p.zip, p.city].filter(Boolean).join('  ');
  if (zc) out.push(zc);
  if (p.orgNr) out.push(`Org.nr  ${p.orgNr}`);
  if (p.vatNr) out.push(`Momsreg.nr  ${p.vatNr}`);
  if (p.fskatt) out.push('Godkänd för F-skatt');
  return out;
}

function drawWatermark(g) {
  /* Endast i högermarginalen: ett fint stolpmotiv, inga ledningar över texten. */
  g.save();
  g.globalAlpha = 0.09;
  g.strokeStyle = INV.burgundy;
  g.fillStyle = INV.burgundy;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const S = INV.S;
  const poleX = (INV.W - 20) * S;
  const top = 52 * S, bot = (INV.H - INV.FOOT - 6) * S;
  const gutterLeft = (INV.W - INV.MR + 8) * S; /* stanna till höger om innehållet */
  g.lineWidth = 1.1 * S;
  g.beginPath(); g.moveTo(poleX, top); g.lineTo(poleX, bot); g.stroke();
  g.lineWidth = 0.9 * S;
  g.beginPath(); g.moveTo(poleX - 5.5 * S, bot); g.lineTo(poleX + 5.5 * S, bot); g.stroke();
  const arms = [top + 28 * S, top + 50 * S, top + 72 * S];
  arms.forEach((ay, i) => {
    const left = Math.max(poleX - (14 - i) * S, gutterLeft);
    const right = poleX + 8 * S;
    g.lineWidth = 0.95 * S;
    g.beginPath(); g.moveTo(left, ay); g.lineTo(right, ay); g.stroke();
    const ins = [left + 3 * S, (left + right) / 2, right - 3 * S];
    ins.forEach(ix => {
      if (ix < gutterLeft - 0.5 * S) return;
      g.lineWidth = 0.7 * S;
      g.beginPath(); g.moveTo(ix, ay); g.lineTo(ix, ay + 4.2 * S); g.stroke();
      g.beginPath(); g.arc(ix, ay + 5.3 * S, 0.95 * S, 0, Math.PI * 2); g.stroke();
    });
  });
  g.restore();
}


function colLayout() {
  /* Beskrivning | Antal | Enhet | À-pris | Belopp */
  const w = INV.CW;
  const belopp = 78, apris = 74, antal = 52, enhet = 36, gap = 10;
  const desc = w - (belopp + apris + antal + enhet + gap * 4);
  const x0 = INV.ML;
  const xDesc = x0;
  const xAntal = x0 + desc + gap + antal; // right edge of Antal
  const xEnhet = xAntal + gap;            // left of Enhet
  const xEnhetR = xEnhet + enhet;
  const xApris = xEnhetR + gap + apris;
  const xBelopp = xApris + gap + belopp;
  return { w, desc, antal, enhet, apris, belopp, gap, xDesc, xAntal, xEnhet, xEnhetR, xApris, xBelopp };
}

async function rgbFlate(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h).data;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    rgb[j] = src[i]; rgb[j + 1] = src[i + 1]; rgb[j + 2] = src[i + 2];
  }
  if (typeof CompressionStream === 'function') {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(rgb);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  }
  // Fallback: JPEG in caller
  return null;
}

async function canvasesToPdf(pages) {
  const pw = INV.W, ph = INV.H;
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  push(new Uint8Array([37, 226, 227, 207, 211, 10]));
  const n = pages.length;
  const kids = [...Array(n)].map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  for (let i = 0; i < n; i++) {
    const c = pages[i];
    let flate = await rgbFlate(c);
    let useJpg = !flate;
    let imgBytes, dict;
    if (!useJpg) {
      imgBytes = flate;
      dict = `/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imgBytes.length}`;
    } else {
      const b64 = c.toDataURL('image/jpeg', 0.95).split(',')[1];
      const bin = atob(b64);
      imgBytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) imgBytes[k] = bin.charCodeAt(k);
      dict = `/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length}`;
    }
    const p = 3 + i * 3, cs = p + 1, im = p + 2;
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${cs} 0 R >>`));
    obj(cs, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
    obj(im, () => { push(`<< ${dict} >>\nstream\n`); push(imgBytes); push('\nendstream'); });
  }
  const total = 3 + n * 3, xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info << /Title (Faktura) /Creator (Tidrapport) /Producer (Granfors Akeri AB Tidrapport) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function newInvPage() {
  const c = document.createElement('canvas');
  c.width = Math.round(INV.W * INV.S);
  c.height = Math.round(INV.H * INV.S);
  const g = c.getContext('2d');
  g.fillStyle = INV.paper;
  g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  drawWatermark(g, c.width, c.height);
  return { c, g };
}

function drawPageFooter(g, inv, page, pages, isLast) {
  const y0 = INV.H - INV.FOOT + 5;
  invRule(g, INV.ML, y0, INV.CW, 0.45, INV.rule2);
  const s = inv.seller;
  const colW = (INV.CW - 20) / 3;
  const y = y0 + 15;
  const col = (x, title, lines) => {
    if (!lines.length) return;
    invFont(g, 6.8, 500, INV.inter);
    invColor(g, INV.muted);
    invTracked(g, title, x, y, 0.7);
    invFont(g, 7.4, 400, INV.inter);
    invColor(g, '#4F4A46');
    lines.forEach((ln, i) => invFillText(g, ln, x, y + 11 + i * 10.5));
  };
  if (isLast) {
    const pay = [];
    if (s.bankgiro) pay.push(`Bankgiro  ${s.bankgiro}`);
    if (s.plusgiro) pay.push(`Plusgiro  ${s.plusgiro}`);
    if (s.iban) pay.push(`IBAN  ${s.iban}`);
    else if (s.bank) pay.push(s.bank);
    const bolag = [];
    if (s.orgNr) bolag.push(`Org.nr  ${s.orgNr}`);
    if (s.vatNr) bolag.push(`Momsreg.nr  ${s.vatNr}`);
    if (s.fskatt) bolag.push('Godkänd för F-skatt');
    col(INV.ML, 'BETALNING', pay);
    col(INV.ML + colW + 10, 'BOLAGSUPPGIFTER', bolag);
  } else {
    invFont(g, 7.4, 400, INV.inter);
    invColor(g, '#4F4A46');
    invFillText(g, `${inv.seller.name}  ·  Faktura ${inv.no}`, INV.ML, y);
  }
  invFont(g, 7.4, 500, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, `Sida ${page} av ${pages}`, INV.W - INV.MR, y, 'right');
  if (inv.example) {
    invFont(g, 6.8, 400, INV.inter);
    invColor(g, INV.muted);
    invFillText(g, 'Exempelfaktura med fingerade uppgifter — inte verkligt org.nr, bankgiro eller kund.', INV.ML, INV.H - 14);
  }
}

function drawCompactHeader(g, inv, label) {
  invFont(g, 18, 400, INV.logo);
  invColor(g, INV.burgundy);
  invFillText(g, inv.seller.name || 'Granfors Åkeri AB', INV.ML, INV.MT + 10);
  invFont(g, 9, 500, INV.inter);
  invColor(g, INV.ink);
  invFillText(g, `Faktura ${inv.no}  ·  ${label || 'fortsättning'}`, INV.W - INV.MR, INV.MT + 8, 'right');
  invRule(g, INV.ML, INV.MT + 18, INV.CW, 0.5, INV.burgundy);
  return INV.MT + 30;
}

function drawTableHead(g, cols, y) {
  invFont(g, 6.9, 500, INV.inter);
  invColor(g, INV.muted);
  invTracked(g, 'BESKRIVNING', cols.xDesc, y, 0.55);
  invTracked(g, 'ANTAL', cols.xAntal, y, 0.55, 'right');
  invTracked(g, 'ENHET', cols.xEnhet, y, 0.55);
  invTracked(g, 'À-PRIS', cols.xApris, y, 0.55, 'right');
  invTracked(g, 'BELOPP', cols.xBelopp, y, 0.55, 'right');
  invRule(g, INV.ML, y + 7, INV.CW, 0.6, INV.burgundy);
  return y + 16;
}

function measureRow(g, cols, line) {
  if (line.kind === 'section') return 20;
  invFont(g, 9.2, 500, INV.inter);
  const title = invWrap(g, line.title, cols.desc, 2);
  invFont(g, 7.6, 400, INV.inter);
  const detail = line.detail ? invWrap(g, line.detail, cols.desc, 2) : [];
  let cy = 13 + title.length * 11.5;
  if (detail.length) cy += 2 + detail.length * 9.5;
  return Math.max(cy, 21) + 6;
}

function drawRow(g, cols, line, y) {
  if (line.kind === 'section') {
    invFont(g, 8, 600, INV.inter);
    invColor(g, INV.burgundy);
    invTracked(g, line.title.toUpperCase(), cols.xDesc, y + 13, 0.4);
    return y + 20;
  }
  let cy = y + 13;
  invFont(g, 9.2, 500, INV.inter);
  invColor(g, INV.ink);
  const title = invWrap(g, line.title, cols.desc, 2);
  title.forEach((tn, i) => { invFillText(g, tn, cols.xDesc, cy + i * 11.5); });
  cy += title.length * 11.5;
  if (line.detail) {
    invFont(g, 7.6, 400, INV.inter);
    invColor(g, INV.muted);
    const detail = invWrap(g, line.detail, cols.desc, 2);
    detail.forEach((tn, i) => { invFillText(g, tn, cols.xDesc, cy + 2 + i * 9.5); });
    cy += 2 + detail.length * 9.5;
  }
  const mid = y + 13;
  invFont(g, 9.2, 400, INV.inter);
  invColor(g, INV.ink);
  invTabular(g, invQty(line.qty), cols.xAntal, mid, 'right');
  invFont(g, 8.2, 400, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, line.unit || '', cols.xEnhet, mid);
  if (line.missing) {
    invFont(g, 7.4, 500, INV.inter);
    invColor(g, INV.burgundy);
    invFillText(g, 'pris saknas', cols.xApris, mid, 'right');
    invFillText(g, '—', cols.xBelopp, mid, 'right');
  } else {
    invFont(g, 9.2, 400, INV.inter);
    invColor(g, INV.ink);
    invTabular(g, invSEK(line.price, false), cols.xApris, mid, 'right');
    invTabular(g, invSEK(line.amount, false), cols.xBelopp, mid, 'right');
  }
  const bottom = Math.max(cy, mid + 8) + 6;
  if (!line._last) invRule(g, INV.ML, bottom, INV.CW, 0.35, INV.rule);
  return bottom;
}

function drawFirstHeader(g, inv) {
  const s = inv.seller, b = inv.buyer;
  invFont(g, 31, 400, INV.logo);
  invColor(g, INV.burgundy);
  invFillText(g, s.name || 'Granfors Åkeri AB', INV.ML, INV.MT + 20);
  invFont(g, 26, 600, INV.serif);
  invColor(g, INV.ink);
  invFillText(g, 'Faktura', INV.W - INV.MR, INV.MT + 18, 'right');
  invFont(g, 9.5, 500, INV.inter);
  invColor(g, INV.ink);
  const noW = invMeasure(g, inv.no);
  invFillText(g, inv.no, INV.W - INV.MR, INV.MT + 34, 'right');
  invFont(g, 9, 400, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, 'Nr', INV.W - INV.MR - noW - 3.8, INV.MT + 34, 'right');
  let y = INV.MT + 46;
  if (inv.example) {
    invFont(g, 7.1, 500, INV.inter);
    invColor(g, INV.burgundy);
    invTracked(g, 'EXEMPELFAKTURA  ·  FINGERADE UPPGIFTER', INV.W - INV.MR, y, 0.7, 'right');
    y += 10;
  }
  invRule(g, INV.ML, y + 5, INV.CW, 0.7, INV.burgundy);
  y += 18;

  invFont(g, 7.1, 500, INV.inter);
  invColor(g, INV.muted);
  invTracked(g, 'ATT BETALA', INV.ML, y + 2, 1.15);
  invFont(g, 28, 600, INV.inter);
  invColor(g, inv.incomplete ? INV.burgundy : INV.ink);
  invTabular(g, invSEK(inv.total, false), INV.ML, y + 30, 'left');
  const amtW = invTabularWidth(g, invSEK(inv.total, false));
  invFont(g, 13, 500, INV.inter);
  invColor(g, inv.incomplete ? INV.burgundy : INV.muted);
  invFillText(g, 'kr', INV.ML + amtW + 8, y + 28.4);
  if (inv.incomplete) {
    invFont(g, 7.4, 500, INV.inter);
    invColor(g, INV.burgundy);
    invFillText(g, 'Ofullständigt belopp — pris saknas på vissa rader', INV.ML, y + 44);
  }

  const metaX = INV.ML + INV.CW * 0.56;
  const pairs = [
    ['Fakturadatum', invLongDate(inv.date)],
    ['Förfallodag', invLongDate(inv.due)],
    ['Betalningsvillkor', `${Math.round((parse(inv.due) - parse(inv.date)) / 864e5) || 30} dagar`]
  ];
  pairs.forEach((p, i) => {
    const py = y + 4 + i * 16;
    invFont(g, 7.4, 400, INV.inter);
    invColor(g, INV.muted);
    invFillText(g, p[0], metaX, py);
    invFont(g, 9.4, 500, INV.inter);
    invColor(g, INV.ink);
    invFillText(g, p[1], INV.W - INV.MR, py, 'right');
  });
  y += inv.incomplete ? 54 : 44;
  invRule(g, INV.ML, y, INV.CW, 0.4, INV.rule);
  y += 14;

  const colW = (INV.CW - 28) / 2;
  const xR = INV.ML + colW + 28;
  /* tunn vertikal linje mellan parterna */
  const partyTop = y;
  const party = (x, label, person) => {
    invFont(g, 7.0, 500, INV.inter);
    invColor(g, INV.muted);
    invTracked(g, label, x, y, 1.05);
    let py = y + 14;
    invFont(g, 11, 600, INV.inter);
    invColor(g, INV.ink);
    invFillText(g, person.name || '—', x, py);
    py += 13;
    const lines = invAddrLines(person);
    invFont(g, 8.6, 400, INV.inter);
    invColor(g, '#3F3A36');
    lines.forEach(tn => { invFillText(g, tn, x, py); py += 11.3; });
    if (person.email || person.phone) {
      invColor(g, INV.muted);
      const c = [person.phone, person.email].filter(Boolean).join('   ·   ');
      if (c) { invFillText(g, c, x, py); py += 11.3; }
    }
    return py;
  };
  const yL = party(INV.ML, 'FRÅN', s);
  const yR = party(xR, 'TILL', b);
  const yP = Math.max(yL, yR);
  g.fillStyle = INV.rule;
  const vx = invPx(INV.ML + colW + 14), vy = invPx(partyTop + 2);
  g.fillRect(vx, vy, Math.max(1, invPx(0.4)), invPx(yP - partyTop - 4));
  y = yP + 12;
  invRule(g, INV.ML, y, INV.CW, 0.4, INV.rule);
  y += 18;

  const refs = [
    ['Period', inv.periodLabel],
    ['Projekt', inv.projectLabel],
    ['Vår referens', inv.ourRef || '—'],
    ['Er referens', inv.theirRef || '—']
  ];
  refs.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col === 0 ? INV.ML : xR;
    const py = y + row * 24;
    invFont(g, 7.0, 500, INV.inter);
    invColor(g, INV.muted);
    invTracked(g, r[0].toUpperCase(), x, py, 0.8);
    invFont(g, 9.3, 400, INV.inter);
    invColor(g, INV.ink);
    const wrapped = invWrap(g, r[1], colW, 2);
    wrapped.forEach((tn, k) => invFillText(g, tn, x, py + 13 + k * 11));
  });
  y += 24 * 2 + 4;
  invRule(g, INV.ML, y, INV.CW, 0.4, INV.rule);
  return y + 12;
}

function measureTotals(inv) {
  let h = 14 + 15 * 2 + 10 + 18 + 6;
  if (inv.seller && inv.seller.bankgiro) h += 12;
  if (inv.incomplete) h += 14;
  if (inv.note) h += 24;
  return h + 10; /* luft ovanför sidfoten */
}

function drawTotals(g, cols, inv, y) {
  /* Bildtext under tabellen */
  invFont(g, 7.1, 400, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, 'Samtliga priser och belopp anges i SEK exklusive moms.', INV.ML, y + 11);
  const xL = cols.xApris - 78;
  let cy = y + 14;
  const row = (label, value, size, weight, color, withKr) => {
    invFont(g, 9.1, weight === 600 ? 600 : 400, INV.inter);
    invColor(g, INV.muted);
    invFillText(g, label, xL, cy);
    invMoney(g, value, cols.xBelopp, cy, { withKr, size, weight, color });
    cy += 15;
  };
  row('Delsumma', inv.subtotal, 9.3, 400, INV.ink, false);
  row(`Moms ${Math.round(inv.vatRate * 100)} %`, inv.vat, 9.3, 400, INV.ink, false);
  invRule(g, xL, cy - 5, cols.xBelopp - xL, 0.6, INV.ink);
  cy += 10;
  invFont(g, 10, 600, INV.inter);
  invColor(g, INV.ink);
  invFillText(g, 'Att betala', xL, cy + 3);
  invMoney(g, inv.total, cols.xBelopp, cy + 3, { withKr: true, size: 14, weight: 600, color: INV.burgundy });
  cy += 18;
  if (inv.seller && inv.seller.bankgiro) {
    invFont(g, 8, 400, INV.inter);
    invColor(g, INV.muted);
    invFillText(g, `Betalas till bankgiro  ${inv.seller.bankgiro}`, xL, cy);
    cy += 12;
  }
  if (inv.incomplete) {
    invFont(g, 7.6, 500, INV.inter);
    invColor(g, INV.burgundy);
    invFillText(g, `Belopp ofullständigt — pris saknas: ${inv.missing.join(', ')}`, INV.ML, cy);
    cy += 14;
  }
  if (inv.note) {
    invFont(g, 8, 400, INV.inter);
    invColor(g, INV.muted);
    const lines = invWrap(g, inv.note, INV.CW * 0.52, 3);
    lines.forEach((tn, i) => invFillText(g, tn, INV.ML, cy + i * 11));
    cy += lines.length * 11 + 4;
  }
  return cy + 6;
}

function drawTransport(g, cols, amount, y, kind) {
  invFont(g, 8.5, 500, INV.inter);
  invColor(g, INV.ink);
  invFillText(g, kind === 'from' ? 'Transport från föregående sida' : 'Transport', cols.xDesc, y + 12);
  invFont(g, 9.2, 500, INV.inter);
  invTabular(g, invSEK(amount, false), cols.xBelopp, y + 12, 'right');
  invRule(g, INV.ML, y + 20, INV.CW, 0.5, INV.rule2);
  return y + 28;
}


function specColLayout() {
  const w = INV.CW, belopp = 72, timmar = 54, tid = 82, gap = 8;
  const desc = w - (belopp + timmar + tid + gap * 3);
  const x0 = INV.ML;
  const xTid = x0 + desc + gap;
  const xTimmar = xTid + tid + gap + timmar;
  const xBelopp = xTimmar + gap + belopp;
  return { w, desc, tid, timmar, belopp, gap, xDesc: x0, xTid, xTimmar, xBelopp };
}
function drawSpecTitle(g, inv, y) {
  invFont(g, 14, 600, INV.serif);
  invColor(g, INV.ink);
  invFillText(g, 'Specifikation, dag för dag', INV.ML, y + 14);
  invFont(g, 8, 400, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, `Underlag till faktura ${inv.no}  ·  ${inv.periodLabel}`, INV.ML, y + 27);
  invRule(g, INV.ML, y + 35, INV.CW, 0.6, INV.burgundy);
  return y + 42;
}
function drawSpecHead(g, cols, y) {
  invFont(g, 6.7, 500, INV.inter);
  invColor(g, INV.muted);
  invTracked(g, 'BESKRIVNING', cols.xDesc, y, 0.5);
  invTracked(g, 'TID', cols.xTid, y, 0.5);
  invTracked(g, 'TIMMAR', cols.xTimmar, y, 0.5, 'right');
  invTracked(g, 'BELOPP', cols.xBelopp, y, 0.5, 'right');
  invRule(g, INV.ML, y + 6, INV.CW, 0.5, INV.burgundy);
  return y + 14;
}
function measureDayHead() { return 18; }
function drawDayHead(g, day, y, cont) {
  invFont(g, 9.4, 600, INV.inter);
  invColor(g, INV.burgundy);
  invFillText(g, cont ? `${day.title}  ·  fortsättning` : day.title, INV.ML, y + 12);
  return y + 18;
}
function measureSpecItem(g, cols, it) {
  invFont(g, 8.4, 500, INV.inter);
  const title = invWrap(g, it.title, cols.desc, 2);
  invFont(g, 7.2, 400, INV.inter);
  const detail = it.detail ? invWrap(g, it.detail, cols.desc, 2) : [];
  const note = it.note ? invWrap(g, it.note, cols.desc, 2) : [];
  let cy = 11 + title.length * 11;
  if (detail.length) cy += 1 + detail.length * 9;
  if (note.length) cy += 1 + note.length * 9;
  return Math.max(cy, 19) + 3;
}
function drawSpecItem(g, cols, it, y) {
  let cy = y + 11;
  invFont(g, 8.4, 500, INV.inter);
  invColor(g, INV.ink);
  const title = invWrap(g, it.title, cols.desc, 2);
  title.forEach((tn, i) => invFillText(g, tn, cols.xDesc, cy + i * 11));
  const mid = y + 11;
  if (it.time) {
    invFont(g, 7.4, 400, INV.inter);
    invColor(g, INV.ink);
    const tw = invWrap(g, it.time, cols.tid, 1);
    tw.forEach((tn, i) => invFillText(g, tn, cols.xTid, mid + i * 9));
  }
  invFont(g, 8.4, 400, INV.inter);
  invColor(g, INV.ink);
  if (it.qtyLabel) invTabular(g, it.qtyLabel, cols.xTimmar, mid, 'right');
  if (it.missing) {
    invFont(g, 7, 500, INV.inter);
    invColor(g, INV.burgundy);
    invFillText(g, 'pris saknas', cols.xBelopp, mid, 'right');
  } else if (it.amount != null) {
    invTabular(g, invSEK(it.amount, false), cols.xBelopp, mid, 'right');
  }
  cy += title.length * 11;
  if (it.detail) {
    invFont(g, 7.2, 400, INV.inter);
    invColor(g, INV.muted);
    const detail = invWrap(g, it.detail, cols.desc, 2);
    detail.forEach((tn, i) => invFillText(g, tn, cols.xDesc, cy + 1 + i * 9));
    cy += 1 + detail.length * 9;
  }
  if (it.note) {
    invFont(g, 7.2, 400, INV.inter);
    invColor(g, INV.muted);
    const note = invWrap(g, it.note, cols.desc, 2);
    note.forEach((tn, i) => invFillText(g, tn, cols.xDesc, cy + 1 + i * 9));
    cy += 1 + note.length * 9;
  }
  const bottom = Math.max(cy, mid + 8) + 3;
  invRule(g, INV.ML, bottom, INV.CW, 0.3, INV.rule);
  return bottom;
}
function measureDaySum() { return 16; }
function drawDaySum(g, cols, day, y) {
  invFont(g, 8, 500, INV.inter);
  invColor(g, INV.ink);
  invFillText(g, 'Dagssumma', cols.xDesc, y + 11);
  invTabular(g, invQty(day.hours) + ' h', cols.xTimmar, y + 11, 'right');
  if (day.missing && (day.amount == null || day.amount === 0)) {
    invFont(g, 7, 500, INV.inter);
    invColor(g, INV.burgundy);
    invFillText(g, '—', cols.xBelopp, y + 11, 'right');
  } else {
    invFont(g, 8.4, 500, INV.inter);
    invColor(g, INV.ink);
    invTabular(g, invSEK(day.amount, false), cols.xBelopp, y + 11, 'right');
  }
  invRule(g, INV.ML, y + 16, INV.CW, 0.5, INV.rule2);
  return y + 16;
}

function measureSpecTotal() { return 24; }
function drawSpecTotal(g, cols, inv, y) {
  const hours = (inv.days || []).reduce((s, d) => s + (d.hours || 0), 0);
  const amount = (inv.days || []).reduce((s, d) => s + (d.amount || 0), 0);
  invRule(g, INV.ML, y + 4, INV.CW, 0.6, INV.burgundy);
  invFont(g, 8.4, 600, INV.inter);
  invColor(g, INV.ink);
  invFillText(g, 'Summa specifikation', cols.xDesc, y + 17);
  const lw = invMeasure(g, 'Summa specifikation');
  invFont(g, 7, 400, INV.inter);
  invColor(g, INV.muted);
  invFillText(g, 'exkl. moms', cols.xDesc + lw + 6, y + 17);
  invFont(g, 8.4, 600, INV.inter);
  invColor(g, INV.ink);
  invTabular(g, invQty(hours) + ' h', cols.xTimmar, y + 17, 'right');
  invTabular(g, invSEK(amount, false), cols.xBelopp, y + 17, 'right');
  return y + 24;
}


async function buildInvoicePdf(inv) {
  await loadInvoiceFonts();
  const cols = colLayout();
  const pages = [];
  const bodyH = INV.H - INV.FOOT;
  const totalsH = measureTotals(inv);

  // Measure rows with a scratch context
  const scratch = newInvPage();
  const heights = inv.lines.map(l => measureRow(scratch.g, cols, l));

  // Paginate
  const content = []; // { type, ... }
  let first = true;
  let y = 0;
  let pageItems = [];
  let running = 0;
  const startY = () => first ? 0 : 0; // replaced after header known — we measure headers too

  // We'll do a two-phase: compute header heights by actually drawing on scratch? Easier: known constants + measure first header on scratch.
  const h1 = drawFirstHeader(scratch.g, inv); // this drew on scratch, we only needed the y
  // can't use that y because scratch started empty with watermark... it returns the y after header. Good.

  const pushPage = (items, isFirst) => { content.push({ isFirst, items }); };

  // Restart pagination properly
  const items = inv.lines.map((l, i) => ({ line: l, h: heights[i] }));
  let acc = [];
  first = true;
  const topFor = isFirst => isFirst ? h1 : (INV.MT + 30 + 14); // compact header + table head already included below
  // table head is 14 after start of table
  y = h1;
  y = drawTableHead(scratch.g, cols, y); // includes head height; returns after head
  const tableHeadH = 16; // drawTableHead returns y + 16
  // Redefine: first page table starts at h1, after head y = h1+14 (approx, drawTableHead returns y+14)
  let curY = h1 + tableHeadH;
  const bottomLimit = (lastish, remainingH) => bodyH - (lastish ? totalsH + 6 : 28);
  // We don't know last until packed. Pack greedily; if last page can't fit totals, move totals (and maybe last rows) .

  const packed = [];
  let page = { isFirst: true, rows: [], y0: h1 + tableHeadH, transportFrom: 0 };
  curY = h1 + tableHeadH;
  const contTop = INV.MT + 30 + 28 + tableHeadH; /* compact header + transport + table head */
  items.forEach((it, idx) => {
    const isLastItem = idx === items.length - 1;
    const reserve = isLastItem ? totalsH : 0;
    if (page.rows.length && curY + it.h + reserve > bodyH - 2) {
      packed.push(page);
      page = { isFirst: false, rows: [], y0: 0, transportFrom: running };
      curY = contTop;
    }
    page.rows.push(it);
    curY += it.h;
    if (it.line.kind === 'item' && it.line.amount != null) running += it.line.amount;
  });
  packed.push(page);
  const last = packed[packed.length - 1];
  const lastTop = last.isFirst ? h1 + tableHeadH : (INV.MT + 30 + (last.rows.length ? 28 : 0) + tableHeadH);
  const lastUsed = lastTop + last.rows.reduce((s, r) => s + r.h, 0);
  if (lastUsed + totalsH > bodyH - 2) {
    packed.push({ isFirst: false, rows: [], y0: 0, transportFrom: running, totalsOnly: true });
  }


  const lastInvUsedFinal = (packed[packed.length - 1].isFirst ? h1 + tableHeadH : (INV.MT + 30 + (packed[packed.length - 1].rows.length ? 28 : 0) + tableHeadH)) + packed[packed.length - 1].rows.reduce((s, r) => s + r.h, 0) + (packed[packed.length - 1].rows.length || packed[packed.length - 1].totalsOnly ? 0 : 0);
  const lastInvEnd = (packed[packed.length - 1].isFirst ? h1 + tableHeadH : (INV.MT + 30 + (packed[packed.length - 1].transportFrom ? 28 : 0) + tableHeadH)) + packed[packed.length - 1].rows.reduce((s, r) => s + r.h, 0) + totalsH;

  /* ---- Specifikation dag för dag (på som standard) ---- */
  const wantSpec = inv.daySpec !== false && Array.isArray(inv.days) && inv.days.length;
  const scols = specColLayout();
  const specTitleH = 42, specHeadH = 14;
  const specEls = [];
  if (wantSpec) {
    inv.days.forEach(day => {
      const items = day.items.map(it => ({ type: 'item', it, h: measureSpecItem(scratch.g, scols, it) }));
      const head = { type: 'day', day, h: measureDayHead(), first: true };
      const sum = { type: 'sum', day, h: measureDaySum() };
      specEls.push({ type: 'block', day, els: [head].concat(items, [sum]), h: head.h + items.reduce((s, it) => s + it.h, 0) + sum.h });
    });
  }
  const compactSpecTop = INV.MT + 30 + specHeadH;
  const specPages = [];
  if (wantSpec) {
    const roomOnInv = bodyH - lastInvEnd;
    const startNew = roomOnInv < (specTitleH + specHeadH + 50);
    const attachToInvoice = !startNew;
    let pageEls = [];
    let curY = startNew ? (INV.MT + 30 + specTitleH + specHeadH) : (lastInvEnd + 8 + specTitleH + specHeadH);
    const flush = () => {
      if (pageEls.length) specPages.push({ els: pageEls, attachToInvoice: specPages.length === 0 && attachToInvoice });
      pageEls = [];
      curY = compactSpecTop;
    };
    const trailing = { type: 'block', day: { title: '' }, els: [{ type: 'total', h: measureSpecTotal() }], h: measureSpecTotal() };
    specEls.concat([trailing]).forEach(block => {
      if (pageEls.length && curY + block.h > bodyH - 2) flush();
      if (curY + block.h <= bodyH - 2) {
        block.els.forEach(el => { pageEls.push(el); curY += el.h; });
        return;
      }
      /* En ensam dag är högre än en sida — dela, men upprepa dagrubriken */
      block.els.forEach(el => {
        const needHead = el.type === 'item' && !pageEls.some(e => e.type === 'day' && e.day === block.day);
        const extra = needHead ? measureDayHead() : 0;
        if (pageEls.length && curY + el.h + extra > bodyH - 2) {
          flush();
          if (el.type !== 'day') {
            pageEls.push({ type: 'day', day: block.day, h: measureDayHead(), first: false });
            curY += measureDayHead();
          }
        }
        pageEls.push(el);
        curY += el.h;
      });
    });
    if (pageEls.length) specPages.push({ els: pageEls, attachToInvoice: specPages.length === 0 && attachToInvoice });
  }

  const totalPages = packed.length + specPages.filter(sp => !sp.attachToInvoice).length;
  let pageNo = 0;

  packed.forEach((pg, i) => {
    const { c, g } = newInvPage();
    const isInvEnd = i === packed.length - 1;
    const attach = isInvEnd && specPages[0] && specPages[0].attachToInvoice;
    pageNo += 1;
    let y;
    if (pg.isFirst) y = drawFirstHeader(g, inv);
    else y = drawCompactHeader(g, inv, 'fortsättning');
    y = drawTableHead(g, cols, y);
    if (!pg.isFirst && (pg.transportFrom || pg.transportFrom === 0) && i > 0) {
      y = drawTransport(g, cols, packed[i].transportFrom, y, 'from');
    }
    pg.rows.forEach((r, ri) => {
      const line = Object.assign({}, r.line, { _last: isInvEnd && ri === pg.rows.length - 1 });
      y = drawRow(g, cols, line, y);
    });
    if (!isInvEnd) {
      const carried = packed[i + 1] ? packed[i + 1].transportFrom : running;
      y = drawTransport(g, cols, carried, y + 4, 'to');
    } else {
      y = drawTotals(g, cols, inv, y);
      if (wantSpec && !attach) {
        invFont(g, 7.6, 400, INV.inter);
        invColor(g, INV.muted);
        invFillText(g, 'Specifikation dag för dag finns på följande sidor.', INV.ML, y + 4);
      }
    }
    if (attach) {
      const sp = specPages[0];
      y = drawSpecTitle(g, inv, y);
      y = drawSpecHead(g, scols, y);
      sp.els.forEach(el => {
        if (el.type === 'day') y = drawDayHead(g, el.day, y, !el.first);
        else if (el.type === 'item') y = drawSpecItem(g, scols, el.it, y);
        else if (el.type === 'sum') y = drawDaySum(g, scols, el.day, y);
        else if (el.type === 'total') y = drawSpecTotal(g, scols, inv, y);
      });
    }
    drawPageFooter(g, inv, pageNo, totalPages, isInvEnd);
    pages.push(c);
  });

  specPages.forEach((sp, si) => {
    if (sp.attachToInvoice) return;
    const { c, g } = newInvPage();
    pageNo += 1;
    let y = drawCompactHeader(g, inv, 'Specifikation');
    if (si === 0 || (si === 1 && specPages[0].attachToInvoice)) {
      /* first standalone spec page may still need the section title if this is the first spec page overall */
      const firstStandalone = specPages.findIndex(s => !s.attachToInvoice) === si;
      if (firstStandalone) y = drawSpecTitle(g, inv, y - 4);
    }
    y = drawSpecHead(g, scols, y);
    sp.els.forEach(el => {
      if (el.type === 'day') y = drawDayHead(g, el.day, y, !el.first);
      else if (el.type === 'item') y = drawSpecItem(g, scols, el.it, y);
      else if (el.type === 'sum') y = drawDaySum(g, scols, el.day, y);
      else if (el.type === 'total') y = drawSpecTotal(g, scols, inv, y);
    });
    const isLast = pageNo === totalPages;
    drawPageFooter(g, inv, pageNo, totalPages, false);
    pages.push(c);
  });

  const blob = await canvasesToPdf(pages);
  blob.__pages = pages;
  return blob;
}

window.INV = INV;
window.invSEK = invSEK;
window.invQty = invQty;
window.defaultInvoiceSettings = defaultInvoiceSettings;
window.ensureInvoiceSettings = ensureInvoiceSettings;
window.nextInvoiceNo = nextInvoiceNo;
window.compileInvoice = compileInvoice;
window.exampleInvoice = exampleInvoice;
window.loadInvoiceFonts = loadInvoiceFonts;
window.buildInvoicePdf = buildInvoicePdf;
window.invVatFromOrg = invVatFromOrg;
window.invLongDate = invLongDate;
window.invDayTitle = invDayTitle;
window.compileDaySpec = compileDaySpec;
