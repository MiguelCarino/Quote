// node --test tests/   (no browser: the painter is played against a recording canvas context)
// Builds PDFs with the vendored jsPDF + AutoTable the way index.html does, then checks that the
// preview reads back exactly what the PDF holds: its text, its table fills, its images, its pages.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = global; global.self = global;
if (!global.navigator) global.navigator = { userAgent: 'node' };
global.atob = global.atob || (s => Buffer.from(s, 'base64').toString('binary'));
global.btoa = global.btoa || (s => Buffer.from(s, 'binary').toString('base64'));
const { jsPDF } = require(path.join(ROOT, 'vendor/jspdf.umd.min.js'));
const AT = require(path.join(ROOT, 'vendor/jspdf.plugin.autotable.min.js'));
(AT.applyPlugin || AT.default.applyPlugin)(jsPDF);
const P = require(path.join(ROOT, 'pdf-preview.js'));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

function withJpFont(doc) {
  const bytes = fs.readFileSync(path.join(ROOT, 'fonts/NotoSansJP-Regular.ttf'));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  doc.addFileToVFS('NotoSansJP.ttf', bin);
  doc.addFont('NotoSansJP.ttf', 'NotoSansJP', 'normal');
  doc.setFont('NotoSansJP', 'normal');
  return 'NotoSansJP';
}

// A canvas 2D context that records what is drawn, in PDF user space.
function recorder() {
  const log = { text: [], fills: [], images: [], strokes: 0 };
  let font = '10px x', fillStyle = '#000', rects = [];
  const ctx = {
    get font() { return font; }, set font(v) { font = v; },
    get fillStyle() { return fillStyle; }, set fillStyle(v) { fillStyle = v; },
    strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
    textBaseline: 'alphabetic', fontKerning: 'auto',
    save() {}, restore() {}, transform() {}, scale() {}, setTransform() {}, translate() {},
    beginPath() { rects = []; }, moveTo() {}, lineTo() {}, bezierCurveTo() {}, closePath() {}, clip() {},
    rect(x, y, w, h) { rects.push([x, y, w, h]); },
    fill() { log.fills.push({ style: fillStyle, rects: rects.slice() }); },
    stroke() { log.strokes++; },
    setLineDash() {},
    fillText(s) { log.text.push({ s, font }); }, strokeText() {},
    measureText(s) { return { width: [...s].length * 8 }; },
    drawImage(img) { log.images.push(img); },
  };
  return { ctx, log };
}

function paintAll(doc, images) {
  const fonts = P.fontTable(doc), out = [];
  for (let n = 1; n <= doc.internal.getNumberOfPages(); n++) {
    const { ops } = P.pageOps(doc, n), { ctx, log } = recorder();
    const stats = P.paintOps(ctx, ops, { fonts, images: images || {}, px: 0.3, family: () => 'JP' });
    out.push({ log, stats });
  }
  return out;
}

test('tokenizer reads literal strings, escapes, hex strings, names and arrays', () => {
  const ops = P.parseOps('BT /F1 12 Tf (a \\(b\\) \\\\ \\351) Tj [(x) -250 (y)] TJ <0041> Tj ET');
  assert.deepStrictEqual(ops.map(o => o.op), ['BT', 'Tf', 'Tj', 'TJ', 'Tj', 'ET']);
  assert.strictEqual(ops[1].args[0].name, 'F1');
  assert.strictEqual(ops[2].args[0].str, 'a (b) \\ é');
  assert.deepStrictEqual(ops[3].args[0].map(x => (typeof x === 'number' ? x : x.str)), ['x', -250, 'y']);
  assert.strictEqual(ops[4].args[0].hex, '0041');
});

test('a quote-like PDF reads back its text, table fills and images, nothing skipped', () => {
  const doc = P.track(new jsPDF());
  const font = withJpFont(doc);
  doc.setFontSize(16); doc.text('Acme 見積書', 14, 20);
  doc.addImage(PNG, 'PNG', 168, 12, 26, 26);
  doc.autoTable({
    head: [['Qty', 'Description', 'Amount (net)']],
    body: [[1, 'Instalación €', '100.00 MXN'], [2, 'Línea\nsegunda', '5.00 MXN']],
    foot: [[{ content: 'TOTAL', colSpan: 2, styles: { halign: 'right' } }, '105.00 MXN']],
    startY: 40, styles: { font, fontSize: 9 },
    headStyles: { fillColor: [234, 179, 8], textColor: [5, 5, 5] },
  });
  doc.setTextColor(90); doc.text('right aligned', 196, 290, { align: 'right' });
  const img = { fake: 'image' };
  const [page] = paintAll(doc, { I0: img });
  assert.deepStrictEqual(page.stats.skipped, {});
  const text = page.log.text.map(t => t.s);
  ['Acme 見積書', 'Description', 'Instalación €', 'Línea', 'segunda', 'TOTAL', '105.00 MXN', 'right aligned']
    .forEach(s => assert.ok(text.includes(s), `missing text: ${s} in ${JSON.stringify(text)}`));
  assert.ok(page.log.text.every(t => /JP/.test(t.font)), 'embedded-font text uses the embedded font');
  assert.ok(page.log.fills.some(f => /^rgb\(23[45],179,8\)$/.test(f.style) && f.rects.length), 'gold header fill');
  assert.deepStrictEqual(page.log.images, [img], 'the logo drawn from /I0');
});

test('track() remembers each image source by its PDF resource name, reused images once', () => {
  const doc = P.track(new jsPDF());
  doc.addImage(PNG, 'PNG', 10, 10, 5, 5);
  doc.addImage(PNG, 'PNG', 20, 10, 5, 5);
  const names = P.parseOps(doc.internal.pages[1].join('\n')).filter(o => o.op === 'Do').map(o => o.args[0].name);
  assert.deepStrictEqual(names, ['I0', 'I0']);
  // The bytes written are those of an untracked document with the same calls.
  const plain = new jsPDF();
  plain.addImage(PNG, 'PNG', 10, 10, 5, 5);
  plain.addImage(PNG, 'PNG', 20, 10, 5, 5);
  assert.strictEqual(doc.internal.pages[1].join('\n'), plain.internal.pages[1].join('\n'));
});

test('a long table runs onto more pages and every page is painted', () => {
  const doc = P.track(new jsPDF());
  doc.autoTable({ head: [['A', 'B']], body: Array.from({ length: 120 }, (_, i) => ['row ' + i, String(i)]) });
  const pages = paintAll(doc);
  assert.ok(pages.length >= 2);
  pages.forEach(p => assert.deepStrictEqual(p.stats.skipped, {}));
  const all = pages.flatMap(p => p.log.text.map(t => t.s));
  assert.ok(all.includes('row 0') && all.includes('row 119'));
  assert.ok(pages[pages.length - 1].log.text.some(t => t.s === 'row 119'), 'the last row is on a later page');
});

test('standard fonts decode WinAnsi bytes', () => {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.text('Precio — 5 €', 10, 10);
  const [page] = paintAll(doc);
  assert.strictEqual(page.log.text[0].s, 'Precio — 5 €');
  assert.match(page.log.text[0].font, /bold/);
});
