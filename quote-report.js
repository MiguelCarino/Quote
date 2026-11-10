// HTML versions of Quote's two PDFs: the quote (Export › PDF) and a catalog's price list.
//
// The PDFs are drawn with jsPDF + AutoTable in index.html (buildPDF, buildCatalogPDF). Both the
// PDF and the HTML are made from the same plain model (quoteData(), catalogData(cat) in
// index.html: every string already formatted and translated), so the two files say the same
// thing: header, issuer's tax block, table, totals, rates line, catalog revision, disclaimer, QR.
// The HTML copies the PDF's look: A4 with the same margins, the gold table head, the striped rows,
// the grey foot, the same type sizes in pt; on paper it prints as the PDF does.
//
// The file stands alone: one <style>, no script, no linked file, the logo and the QR written in
// as data: URLs, so it opens offline and CarinoPdf.htmlFile() hands it back byte for byte.
// Text is the system's (Noto Sans JP when installed, else Helvetica/Arial): the PDF's embedded
// Noto Sans JP is 2.7 MB and is not written into every HTML file.
//
//   QuoteReport.quoteHtml(model)      -> string   model: see quoteData() in index.html
//   QuoteReport.priceListHtml(model)  -> string   model: see catalogData() in index.html
//   QuoteReport.SHEET_PX               the sheet's width on screen, margins included (preview scaling)
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // A string inside a CSS "…" (the price list's page footer): no quote, backslash, line break or "<".
  const cssStr = s => '"' + String(s == null ? '' : s).replace(/[\\"<\n\r]/g, c => '\\' + c.charCodeAt(0).toString(16) + ' ') + '"';
  // Only pictures already inside the page (the logo, the QR) are written in; never an address.
  const dataImg = s => (typeof s === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(s) ? s : '');
  const httpLink = s => (typeof s === 'string' && /^https?:\/\//i.test(s.trim()) ? s.trim() : '');

  const SHEET_PX = 826;   // 210 mm at 96 dpi (794 px) + 16 px either side

  // jsPDF / AutoTable values, so the HTML reads like the PDF: gold head (234,179,8) on near-black,
  // body text 80 grey, every other body row 245 grey (from the first), foot 245 with (31,41,55).
  const CSS = `
@page { size: A4; margin: 12mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; color: #000; font-family: "Noto Sans JP", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.25; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media screen {
  html { background: #d6d8dc; }
  body { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm 14mm 14mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.28); }
}
.q-head { position: relative; min-height: 28mm; padding-right: 32mm; }
.q-logo { position: absolute; top: 0; right: 2mm; width: 26mm; height: auto; }
.q-org { margin: 0; padding-top: 2.4mm; font-size: 16pt; font-weight: normal; line-height: 1.2; overflow-wrap: anywhere; }
.q-lines { margin: 2mm 0 0; padding: 0; list-style: none; font-size: 10pt; line-height: 6mm; }
.q-sub { margin: 2.4mm 0 0; font-size: 12pt; font-weight: normal; }
.q-meta { margin: 1.6mm 0 0; font-size: 9pt; color: #5a5a5a; }
.q-fiscal { margin: 1mm 0 0; max-width: 150mm; font-size: 8pt; line-height: 4.5mm; overflow-wrap: anywhere; }
.q-meta + .q-fiscal { color: #5a5a5a; }
table { width: 100%; margin-top: 5mm; border-collapse: collapse; font-size: 9pt; color: #505050; }
th, td { padding: 1.76mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
thead th { background: #eab308; color: #050505; font-weight: bold; }
tbody tr.odd > td { background: #f5f5f5; }
tfoot td { background: #f5f5f5; color: #1f2937; font-weight: bold; }
tfoot td.r, td.r, th.r { text-align: right; }
tfoot tr.total td { font-weight: bold; }
td.link a { color: #0000ff; text-decoration: none; word-break: break-all; }
td.qty { white-space: nowrap; }
td.money { white-space: nowrap; }
td.desc { white-space: pre-line; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
.pl th, .pl td { padding: 2.2mm; }
.pl .c-desc { width: 112mm; }
.pl .c-prov { width: 30mm; }
.pl td.prov { color: #5a5a5a; }
.pl td.price { text-align: right; }
.pl tr.cat > td { background: #f5f5f5; color: #a16207; font-size: 10pt; }
.pl .note { display: block; }
.q-after { display: flex; align-items: flex-start; gap: 6mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.q-notes { flex: 1; min-width: 0; margin: 0; font-size: 8pt; line-height: 4mm; color: #5a5a5a; }
.q-notes p { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
.q-qr { flex: none; width: 34mm; margin: -2mm 0 0; text-align: center; }
.q-qr a { display: inline-block; }
.q-qr img { display: block; width: 28mm; height: 28mm; margin: 0 auto; }
.q-qr figcaption { margin-top: 1mm; font-size: 7pt; line-height: 3mm; color: #5a5a5a; overflow-wrap: anywhere; }
`;

  function page(o, body, extraCss) {
    return '<!DOCTYPE html>\n<html lang="' + esc(o.lang || 'en') + '">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta name="generator" content="Carino Quote">\n' +
      '<title>' + esc(o.title || '') + '</title>\n<style>' + CSS + (extraCss || '') + '</style>\n</head>\n<body>\n' +
      body + '</body>\n</html>\n';
  }

  function logo(o) {
    const src = o.logo && dataImg(o.logo.src);
    return src ? '<img class="q-logo" src="' + esc(src) + '" alt="' + esc(o.logoAlt || 'Logo') + '">' : '';
  }

  // The notes under the table, and the QR beside them, as in the PDF (QR 28 mm at the right).
  function after(o) {
    const notes = (o.notes || []).filter(Boolean);
    const qr = o.qr && dataImg(o.qr.src) ? o.qr : null;
    if (!notes.length && !qr) return '';
    let h = '<div class="q-after">';
    h += '<div class="q-notes">' + notes.map(n => '<p>' + esc(n) + '</p>').join('') + '</div>';
    if (qr) {
      const href = httpLink(qr.url);
      const img = '<img src="' + esc(qr.src) + '" alt="QR">';
      h += '<figure class="q-qr">' + (href ? '<a href="' + esc(href) + '">' + img + '</a>' : img) +
        (qr.caption ? '<figcaption>' + esc(qr.caption) + '</figcaption>' : '') + '</figure>';
    }
    return h + '</div>\n';
  }

  // model: { lang, title, org, logo: { src } | null, logoAlt, lines: [string], fiscal: string,
  //          head: [6 labels], rows: [[qty, description, provider, link, unit, amount]],
  //          foot: [{ label, value, bold }], notes: [string], qr: { src, url, caption } | null }
  function quoteHtml(o) {
    o = o || {};
    const head = o.head || [];
    let h = '<header class="q-head">' + logo(o) + '<h1 class="q-org">' + esc(o.org) + '</h1>';
    h += '<ul class="q-lines">' + (o.lines || []).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>';
    if (o.fiscal) h += '<p class="q-fiscal">' + esc(o.fiscal) + '</p>';
    h += '</header>\n<table>\n<thead><tr>' + head.map((x, i) => '<th' + (i === 0 ? ' class="qty"' : '') + '>' + esc(x) + '</th>').join('') + '</tr></thead>\n<tbody>\n';
    (o.rows || []).forEach((r, i) => {
      const link = httpLink(r[3]);
      h += '<tr' + (i % 2 === 0 ? ' class="odd"' : '') + '>' +
        '<td class="qty">' + esc(r[0]) + '</td><td class="desc">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td>' +
        '<td class="link">' + (link ? '<a href="' + esc(link) + '">' + esc(link) + '</a>' : '') + '</td>' +
        '<td class="money">' + esc(r[4]) + '</td><td class="money">' + esc(r[5]) + '</td></tr>\n';
    });
    h += '</tbody>\n<tfoot>\n';
    (o.foot || []).forEach(f => {
      h += '<tr' + (f.bold ? ' class="total"' : '') + '><td class="r" colspan="' + Math.max(1, head.length - 1) + '">' + esc(f.label) +
        '</td><td class="money">' + esc(f.value) + '</td></tr>\n';
    });
    h += '</tfoot>\n</table>\n' + after(o);
    return page(o, h);
  }

  // model: { lang, title, org, logo, logoAlt, heading, meta, fiscal, head: [3 labels],
  //          groups: [{ name, items: [{ description, note, provider, price }] }],
  //          notes: [string], qr: { src, url, caption } | null, pageFoot: string }
  function priceListHtml(o) {
    o = o || {};
    const head = o.head || [];
    let h = '<header class="q-head">' + logo(o) + '<h1 class="q-org">' + esc(o.org) + '</h1>';
    h += '<h2 class="q-sub">' + esc(o.heading) + '</h2>';
    if (o.meta) h += '<p class="q-meta">' + esc(o.meta) + '</p>';
    if (o.fiscal) h += '<p class="q-fiscal">' + esc(o.fiscal) + '</p>';
    h += '</header>\n<table class="pl">\n<colgroup><col class="c-desc"><col class="c-prov"><col></colgroup>\n' +
      '<thead><tr><th>' + esc(head[0]) + '</th><th>' + esc(head[1]) + '</th><th class="r">' + esc(head[2]) + '</th></tr></thead>\n<tbody>\n';
    let n = 0;   // AutoTable stripes by body row, the category rows included
    (o.groups || []).forEach(g => {
      h += '<tr class="cat"><td colspan="3">' + esc(g.name) + '</td></tr>\n'; n++;
      (g.items || []).forEach(it => {
        h += '<tr' + (n % 2 === 0 ? ' class="odd"' : '') + '><td class="desc">' + esc(it.description) +
          (it.note ? '<span class="note">' + esc(it.note) + '</span>' : '') + '</td>' +
          '<td class="prov">' + esc(it.provider) + '</td><td class="price">' + esc(it.price) + '</td></tr>\n';
        n++;
      });
    });
    h += '</tbody>\n</table>\n' + after(o);
    // The PDF's page footer (catalog · revision · page number), 7 pt grey at the bottom right, on paper.
    const foot = o.pageFoot ? '@page { @bottom-right { content: ' + cssStr(o.pageFoot + ' · ') + ' counter(page); font-size: 7pt; color: #8c8c8c; } }\n' : '';
    return page(o, h, foot);
  }

  const api = { quoteHtml, priceListHtml, esc, SHEET_PX };
  root.QuoteReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
