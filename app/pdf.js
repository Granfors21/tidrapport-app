// Enkel PDF-generator utan externa bibliotek: ritar sidor på canvas (A4, 150 dpi)
// och bäddar in dem som JPEG i en minimal PDF-fil.
'use strict';
class CanvasPdf {
  constructor() { this.W = 1240; this.H = 1754; this.M = 80; this.pages = []; this.newPage(); }
  newPage() {
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, this.W, this.H); g.textBaseline = 'top';
    this.c = c; this.g = g; this.y = this.M; this.pages.push(c);
  }
  ensure(hh) { if (this.y + hh > this.H - this.M) this.newPage(); }
  font(size, weight = 400, fam = 'system-ui, Roboto, Arial, sans-serif') { this.g.font = `${weight} ${size}px ${fam}`; }
  wrap(text, maxW) {
    const out = []; for (const para of String(text ?? '').split('\n')) {
      let line = ''; for (const w of para.split(/\s+/)) {
        const t = line ? line + ' ' + w : w;
        if (this.g.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
      } out.push(line);
    }
    return out.map(l => { while (this.g.measureText(l).width > maxW && l.length > 1) l = l.slice(0, -2) + '…'; return l; });
  }
  text(t, { size = 24, weight = 400, color = '#111', x = this.M, maxW = this.W - 2 * this.M, gap = 6, fam } = {}) {
    this.font(size, weight, fam); const lines = this.wrap(t, maxW); const lh = Math.round(size * 1.3);
    for (const l of lines) { this.ensure(lh); this.g.fillStyle = color; this.g.fillText(l, x, this.y); this.y += lh; }
    this.y += gap;
  }
  heading(t) { this.ensure(90); this.y += 16; this.text(t, { size: 30, weight: 700, color: '#7B1E2B', gap: 4 }); this.g.fillStyle = '#7B1E2B'; this.g.fillRect(this.M, this.y, this.W - 2 * this.M, 3); this.y += 12; }
  table(cols, rows, { size = 21, total } = {}) {
    // cols: [{t:'Rubrik', w:0.2, right:bool}]
    const tw = this.W - 2 * this.M, lh = Math.round(size * 1.3), pad = 8;
    const xs = []; let acc = this.M; cols.forEach(c => { xs.push(acc); acc += c.w * tw; });
    const drawHead = () => { this.ensure(lh + 2 * pad); this.font(size - 2, 700); this.g.fillStyle = '#555'; cols.forEach((c, i) => { const w = c.w * tw - 2 * pad; this.g.textAlign = c.right ? 'right' : 'left'; this.g.fillText(c.t, c.right ? xs[i] + c.w * tw - pad : xs[i] + pad, this.y + pad); }); this.g.textAlign = 'left'; this.y += lh + 2 * pad; this.g.fillStyle = '#7B1E2B'; this.g.fillRect(this.M, this.y - 2, tw, 2); };
    drawHead();
    const all = total ? [...rows, { __tot: true, cells: total }] : rows;
    for (const r of all) {
      const cells = r.__tot ? r.cells : r; this.font(size, r.__tot ? 700 : 400);
      const wrapped = cells.map((v, i) => this.wrap(v, cols[i].w * tw - 2 * pad));
      const hh = Math.max(...wrapped.map(w => w.length)) * lh + 2 * pad;
      if (this.y + hh > this.H - this.M) { this.newPage(); drawHead(); this.font(size, r.__tot ? 700 : 400); }
      if (r.__tot) { this.g.fillStyle = '#111'; this.g.fillRect(this.M, this.y, tw, 3); }
      this.g.fillStyle = '#111';
      wrapped.forEach((lines, i) => { this.g.textAlign = cols[i].right ? 'right' : 'left'; lines.forEach((l, k) => this.g.fillText(l, cols[i].right ? xs[i] + cols[i].w * tw - pad : xs[i] + pad, this.y + pad + k * lh)); });
      this.g.textAlign = 'left'; this.y += hh;
      if (!r.__tot) { this.g.fillStyle = '#ddd'; this.g.fillRect(this.M, this.y - 1, tw, 1); }
    }
    this.y += 10;
  }
  async images(list) { // [{src, cap}]
    const cols = 4, gap = 16, w = (this.W - 2 * this.M - gap * (cols - 1)) / cols, hgt = w * 0.75, cap = 24;
    for (let i = 0; i < list.length; i += cols) {
      this.ensure(hgt + cap + gap);
      for (let k = 0; k < cols && i + k < list.length; k++) {
        const it = list[i + k], x = this.M + k * (w + gap);
        try { const im = new Image(); im.src = it.src; await im.decode(); const r = Math.max(w / im.naturalWidth, hgt / im.naturalHeight); const sw = w / r, sh = hgt / r; this.g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, this.y, w, hgt); } catch (e) { this.g.fillStyle = '#eee'; this.g.fillRect(x, this.y, w, hgt); }
        this.font(17); this.g.fillStyle = '#444'; this.g.fillText(this.wrap(it.cap, w)[0] || '', x, this.y + hgt + 4);
      }
      this.y += hgt + cap + gap;
    }
  }
  footer(label) { this.pages.forEach((c, i) => { const g = c.getContext('2d'); g.font = '18px system-ui, Arial, sans-serif'; g.fillStyle = '#888'; g.textBaseline = 'top'; g.fillText(`${label} · sida ${i + 1} av ${this.pages.length}`, this.M, this.H - this.M + 30); }); }
  toBlob() {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-\u00ff]/g, '')); push(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const n = this.pages.length, pw = 595.28, ph = 841.89;
    const kids = [...Array(n)].map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
    this.pages.forEach((c, i) => {
      const b64 = c.toDataURL('image/jpeg', 0.82).split(',')[1]; const bin = atob(b64); const jpg = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
      const p = 3 + i * 3, cs = p + 1, im = p + 2, content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
      obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${cs} 0 R >>`));
      obj(cs, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
      obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
    });
    const total = 3 + n * 3, xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`; for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x); push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
}
window.CanvasPdf = CanvasPdf;
