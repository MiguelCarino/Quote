// node --test tests/   (no browser): the HTML versions of the quote and the price list (quote-report.js).
// They are drawn from the same model as the jsPDF files, so every string of the model must be in
// the HTML, escaped, and the file must stand alone (CarinoPdf.htmlFile hands it back untouched).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = global;
const R = require(path.join(ROOT, 'quote-report.js'));
// The fleet helper's pure half (fileName); it only touches the DOM when a file is made.
new Function(fs.readFileSync(path.join(ROOT, 'carino-pdf.js'), 'utf8'))();
const CarinoPdf = global.CarinoPdf;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const quote = () => ({
  lang: 'es', title: 'Acme - Cotización', org: 'Acme <Systems> & Co', logo: { src: PNG, aspect: 0.5 }, logoAlt: 'Logo',
  lines: ['Fecha: 10/11/2026', 'Cotización #: Q-7', 'Facturar a: "Clínica" Norte'],
  fiscal: 'México — RFC XAXX010101000  ·  Régimen 601',
  head: ['Cant.', 'Descripción', 'Proveedor', 'Enlace', 'Unitario (neto)', 'Importe (neto)'],
  rows: [
    [2, 'Switch 24 ports\nrack mount', 'Ubiquiti', 'https://example.com/a?b=1&c=2', '1500.00 MXN', '3000.00 MXN'],
    [1, 'Install <script>alert(1)</script>', '', 'javascript:alert(1)', '800.00 MXN', '800.00 MXN'],
    [1, '設置作業', 'Carino', '', '100.00 MXN', '100.00 MXN'],
  ],
  foot: [
    { label: 'Subtotal', value: '3900.00 MXN' },
    { label: 'IVA (16%)', value: '624.00 MXN' },
    { label: 'TOTAL (IVA incl.)', value: '4524.00 MXN', bold: true },
  ],
  notes: ['1 USD = 18.20 MXN (ECB, 2026-11-10)', 'Catálogo General rev. 12', 'Anticipo del 50 %.'],
  qr: { src: PNG, url: 'https://carino.systems/', caption: 'carino.systems' },
});

const priceList = () => ({
  lang: 'en', title: 'Price list — Infra', org: 'Acme', logo: null,
  heading: 'Price list — Infra', meta: 'rev. 3 · Date: 11/10/2026', fiscal: '',
  head: ['Description', 'Provider', 'Price'],
  groups: [
    { name: 'Cabling', items: [{ description: 'Cat6 run', note: 'per point', provider: 'Panduit', price: '450.00 MXN' },
                               { description: 'Patch panel', note: '', provider: '', price: 'Price after assessment' }] },
    { name: 'Wi-Fi', items: [{ description: 'AP install', note: '', provider: 'Ubiquiti', price: 'No charge' }] },
  ],
  notes: ['Prices are before VAT unless stated otherwise.', 'Valid 30 days.'],
  qr: { src: PNG, url: 'https://example.com/catalog.json', caption: 'Catalog and prices' },
  pageFoot: 'Infra "net" </style> · rev. 3',
});

const text = html => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function standsAlone(html) {
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'a full document');
  assert.ok(/<meta charset="utf-8">/.test(html), 'charset');
  assert.ok(!/<script\b/i.test(html), 'no script');
  assert.ok(!/<link\b/i.test(html), 'no linked file');
  assert.ok(!/<img\b[^>]*\bsrc="(?!data:)/i.test(html), 'pictures are data: URLs');
  assert.ok(!/url\(/i.test(html), 'no CSS url()');
  assert.ok(/@page\s*\{\s*size:\s*A4/.test(html), 'A4 like the PDF');
}

test('the quote HTML carries every string of the model, escaped, and stands alone', () => {
  const m = quote(), html = R.quoteHtml(m), body = text(html);
  standsAlone(html);
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(html.includes('<title>Acme - Cotización</title>'));
  for (const s of [m.org, ...m.lines, m.fiscal, ...m.head, ...m.notes, m.qr.caption]) assert.ok(body.includes(s), s);
  m.rows.forEach(r => [r[0], r[2], r[4], r[5]].forEach(v => assert.ok(body.includes(String(v)), v)));
  assert.ok(body.includes('Switch 24 ports\nrack mount'), 'line breaks kept (pre-line)');
  m.foot.forEach(f => { assert.ok(body.includes(f.label)); assert.ok(body.includes(f.value)); });
  assert.ok(!html.includes('<script>alert'), 'description is escaped');
  assert.ok(html.includes('Install &lt;script&gt;'), 'shown as text');
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'), 'http link kept, escaped');
  assert.ok(!html.includes('javascript:'), 'non-http link dropped');
  assert.ok(html.includes('<a href="https://carino.systems/"><img src="data:image/png'), 'QR links like the PDF');
  assert.ok(html.includes('class="q-logo" src="data:image/png'), 'logo written in');
  // AutoTable striped theme: the first body row and every other one are grey.
  const rows = html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr[^>]*>/g);
  assert.deepStrictEqual(rows, ['<tr class="odd">', '<tr>', '<tr class="odd">']);
  assert.ok(/<td class="r" colspan="5">TOTAL \(IVA incl\.\)<\/td>/.test(html), 'totals span the first five columns');
  assert.ok(/<tr class="total">/.test(html), 'the total is bold');
  assert.ok(/thead th \{ background: #eab308; color: #050505/.test(html), 'gold head as the PDF');
});

test('pictures that are not data: images never reach the file', () => {
  const m = quote();
  m.logo = { src: 'https://evil.example/x.png' };
  m.qr = { src: 'blob:https://quote.carino.systems/1', url: 'https://x', caption: 'x' };
  const html = R.quoteHtml(m);
  assert.ok(!/<img/.test(html), 'no image at all');
  assert.ok(!html.includes('evil.example'));
});

test('an empty quote still renders a whole document', () => {
  const html = R.quoteHtml({ org: 'Org', head: ['a', 'b'], rows: [], foot: [], notes: [] });
  standsAlone(html);
  assert.ok(html.includes('<tbody>\n</tbody>'));
  assert.ok(!html.includes('class="q-after"'), 'no notes block');
});

test('the price list HTML groups by category, stripes like AutoTable and carries the page footer', () => {
  const m = priceList(), html = R.priceListHtml(m), body = text(html);
  standsAlone(html);
  for (const s of [m.org, m.heading, m.meta, ...m.head, ...m.notes, m.qr.caption]) assert.ok(body.includes(s), s);
  m.groups.forEach(g => { assert.ok(html.includes(`<tr class="cat"><td colspan="3">${g.name}</td></tr>`)); g.items.forEach(i => {
    assert.ok(body.includes(i.description)); assert.ok(body.includes(i.price)); if (i.note) assert.ok(body.includes(i.note));
  }); });
  // Body row index counts the category rows: cat(0) item(1) item(2 grey) cat(3) item(4 grey).
  const rows = html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr[^>]*>/g);
  assert.deepStrictEqual(rows, ['<tr class="cat">', '<tr>', '<tr class="odd">', '<tr class="cat">', '<tr class="odd">']);
  assert.ok(/<col class="c-desc">/.test(html) && /\.pl \.c-desc \{ width: 112mm; \}/.test(html), 'PDF column widths');
  const foot = /@bottom-right \{ content: ("[^"]*") counter\(page\)/.exec(html);
  assert.ok(foot, 'page footer with the page number');
  assert.ok(!foot[1].includes('<') && !/[^\\]"/.test(foot[1].slice(1, -1)), 'footer text cannot close the string or the style');
  assert.strictEqual((html.match(/<\/style>/g) || []).length, 1, 'one style element');
});

test('the files are named as the PDF, with the HTML extension', () => {
  assert.strictEqual(CarinoPdf.fileName('quote.pdf', 'html'), 'quote.html');
  assert.strictEqual(CarinoPdf.fileName('infra-r3.pdf', 'pdf'), 'infra-r3.pdf');
  assert.strictEqual(R.SHEET_PX, 826);
});

test('index.html loads the HTML renderer and the fleet helper, and both reports offer HTML', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/<script src="quote-report\.js"><\/script>/.test(html));
  assert.ok(/<script src="carino-pdf\.js" defer><\/script>/.test(html));
  assert.ok(/html: async \(\) => \(\{ html: QuoteReport\.quoteHtml\(quoteData\(\)\), name: 'quote\.html' \}\)/.test(html), 'Export › PDF');
  assert.ok(/html: async \(\) => \(\{ html: QuoteReport\.priceListHtml\(catalogData\(cat\)\)/.test(html), 'price list');
  assert.ok(/const q = quoteData\(\);/.test(html), 'the PDF quote is drawn from the same model');
  assert.ok(/const m = catalogData\(cat\);/.test(html), 'the PDF price list is drawn from the same model');
  // The preview column: switch goes before the file name (pdf-preview.js), Print then one primary button.
  const actions = /<div class="rpv-actions">([\s\S]*?)<\/div>/.exec(html)[1];
  assert.deepStrictEqual(actions.match(/class="btn[^"]*"/g), ['class="btn"', 'class="btn btn-primary"']);
  const pv = fs.readFileSync(path.join(ROOT, 'pdf-preview.js'), 'utf8');
  assert.ok(/\$\('qpName'\)\.before\(_sw\.el\)/.test(pv), 'switch sits just above the file name');
});

test('every new preview string is translated in es, pt-BR, ja and ru', () => {
  global.document = { addEventListener() {}, documentElement: {} };
  global.addEventListener = () => {};
  const I18N = new Function(fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8') + '; return I18N;')();
  const keys = ['File', 'PDF', 'HTML', 'Download PDF', 'Download HTML', 'Creating the PDF…', 'Could not create the PDF.',
    'HTML preview', 'PDF preview', 'The HTML file itself, as it will be saved.', 'Preparing the HTML…',
    'One HTML file, ready to save.', 'Could not create the HTML file.'];
  for (const l of ['es', 'pt-BR', 'ja', 'ru']) for (const k of keys) assert.ok(I18N[l][k], `${l}: ${k}`);
  for (const l of ['es', 'pt-BR', 'ja', 'ru']) { assert.strictEqual(I18N[l].PDF, 'PDF'); assert.strictEqual(I18N[l].HTML, 'HTML'); }
});
