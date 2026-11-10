// PDF preview: every PDF Quote writes is shown before it is saved or sent, as Topo's report dialog does.
//
// Quote draws its PDFs with jsPDF (vector text, tables, images), so there is no HTML version of the
// document to show, and no PDF renderer is vendored. What is shown instead is the PDF itself: the
// page content streams of the very jsPDF document the commit button writes, played back onto one
// canvas per page (text in the same embedded font file, rectangles, lines, images at the positions
// the PDF gives them). Download saves that same document; Close drops it and nothing is written.
//
// The painter understands the operators jsPDF 2.5 and AutoTable emit (paths, colours, line styles,
// text objects, images). Anything else is skipped and counted, never guessed at.
//
//   QuotePdfPreview.track(doc)        call right after new jsPDF(): remembers each image's source
//   QuotePdfPreview.open({ build, html?, commit? })
//       build()   -> Promise<{ doc, name }>  builds the document (again on a language change)
//       html()    -> Promise<{ html, name }> the same report as one standalone HTML file
//                    (quote-report.js); with it the column shows the File  PDF | HTML switch
//                    (CarinoPdf.formatSwitch, remembered for the site) just above the file name
//       commit    { label, icon, run(built) } — the primary button; default: Download PDF (doc.save)
//                    A commit of its own (Open in Files) hands over the PDF: no switch then.
//
// HTML selected: the stage shows the HTML file itself in a frame laid out at sheet width and
// scaled to fit, Print prints that frame, and the primary button (Download HTML) saves that very
// file through CarinoPdf.download (byte for byte: the file stands alone). PDF stays jsPDF's.
//
// The dialog is the fleet's report preview (.rpv, carino-ui.css 18b): title, ✕, page count, note,
// file name and the buttons in the left column, Print then the primary button at its foot.
// Print prints the very bytes Download writes (doc.output('blob') in a hidden frame), not the
// canvases, so what comes out of the printer can never differ from the saved file.
(function (root) {
  'use strict';

  /* ───────────── content-stream tokenizer ───────────── */
  const WS = /[\0\t\n\f\r ]/, DELIM = /[()<>[\]{}/%]/;

  function tokenize(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (WS.test(c)) { i++; continue; }
      if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
      if (c === '(') {                          // literal string, balanced parens and escapes
        let depth = 1, s = '';
        i++;
        while (i < n && depth) {
          const ch = src[i++];
          if (ch === '\\') {
            const e = src[i++];
            if (e === 'n') s += '\n'; else if (e === 'r') s += '\r'; else if (e === 't') s += '\t';
            else if (e === 'b') s += '\b'; else if (e === 'f') s += '\f';
            else if (e === '\r') { if (src[i] === '\n') i++; }
            else if (e === '\n') { /* line continuation */ }
            else if (e >= '0' && e <= '7') {
              let oct = e;
              while (oct.length < 3 && src[i] >= '0' && src[i] <= '7') oct += src[i++];
              s += String.fromCharCode(parseInt(oct, 8) & 255);
            } else s += e;
          } else if (ch === '(') { depth++; s += ch; }
          else if (ch === ')') { if (--depth) s += ch; }
          else s += ch;
        }
        out.push({ str: s });
        continue;
      }
      if (c === '<' && src[i + 1] !== '<') {     // hex string
        const end = src.indexOf('>', i);
        let hex = src.slice(i + 1, end < 0 ? n : end).replace(/[^0-9a-fA-F]/g, '');
        if (hex.length % 2) hex += '0';
        out.push({ hex });
        i = end < 0 ? n : end + 1;
        continue;
      }
      if (c === '<' || c === '>') { out.push({ op: src.substr(i, 2) }); i += 2; continue; }   // << >> (inline dicts: ignored)
      if (c === '[' || c === ']') { out.push({ op: c }); i++; continue; }
      if (c === '/') {
        let j = i + 1;
        while (j < n && !WS.test(src[j]) && !DELIM.test(src[j])) j++;
        out.push({ name: src.slice(i + 1, j) });
        i = j;
        continue;
      }
      let j = i;
      while (j < n && !WS.test(src[j]) && !DELIM.test(src[j])) j++;
      if (j === i) { i++; continue; }
      const word = src.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) out.push(+word);
      else out.push({ op: word });
    }
    return out;
  }

  // Operands collected up to each operator, arrays folded into JS arrays.
  function parseOps(src) {
    const toks = tokenize(src), ops = [];
    let stack = [], arrays = [];
    for (const tk of toks) {
      if (tk && tk.op === '[') { arrays.push(stack); stack = []; continue; }
      if (tk && tk.op === ']') { const arr = stack; stack = arrays.pop() || []; stack.push(arr); continue; }
      if (tk && tk.op && tk.op !== '<<' && tk.op !== '>>') {
        if (arrays.length) { stack.push(tk); continue; }   // stray word inside an array
        ops.push({ op: tk.op, args: stack });
        stack = [];
        continue;
      }
      stack.push(tk);
    }
    return ops;
  }

  /* ───────────── text decoding ───────────── */
  // WinAnsiEncoding's 0x80–0x9F block; the rest of the byte range is Latin-1.
  const WIN_ANSI = { 128: 0x20AC, 130: 0x201A, 131: 0x0192, 132: 0x201E, 133: 0x2026, 134: 0x2020, 135: 0x2021,
    136: 0x02C6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017D, 145: 0x2018, 146: 0x2019,
    147: 0x201C, 148: 0x201D, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02DC, 153: 0x2122, 154: 0x0161,
    155: 0x203A, 156: 0x0153, 158: 0x017E, 159: 0x0178 };

  function bytesOf(tk) {
    if (tk.str != null) return tk.str;
    let s = '';
    for (let i = 0; i < tk.hex.length; i += 2) s += String.fromCharCode(parseInt(tk.hex.substr(i, 2), 16));
    return s;
  }

  function decodeText(tk, font) {
    const b = bytesOf(tk);
    if (font && font.identity) {               // two-byte glyph ids, mapped back through the font's ToUnicode
      let s = '';
      for (let i = 0; i + 1 < b.length; i += 2) {
        const gid = (b.charCodeAt(i) << 8) | b.charCodeAt(i + 1), cp = font.toUnicode[gid];
        s += cp ? String.fromCodePoint(cp) : '�';
      }
      return s;
    }
    let s = '';
    for (let i = 0; i < b.length; i++) { const c = b.charCodeAt(i); s += String.fromCharCode(WIN_ANSI[c] || c); }
    return s;
  }

  /* ───────────── fonts and images of a document ───────────── */
  const SYSTEM_FAMILY = {
    helvetica: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
    times: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
    courier: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
    symbol: 'Symbol, serif',
    zapfdingbats: '"Zapf Dingbats", serif',
  };

  // { F1: { family, weight, style, identity, toUnicode, raw } } for every font the document knows.
  function fontTable(doc) {
    const table = {}, list = (doc.getFontList && doc.getFontList()) || {};
    Object.keys(list).forEach(fam => (list[fam] || []).forEach(style => {
      let f;
      try { f = doc.internal.getFont(fam, style); } catch (_) { return; }
      if (!f || !f.id || table[f.id]) return;
      const st = String(f.fontStyle || style || '').toLowerCase(), md = f.metadata || {};
      const identity = f.encoding === 'Identity-H';
      table[f.id] = {
        name: f.fontName, identity,
        family: identity ? null : (SYSTEM_FAMILY[String(f.fontName).toLowerCase()] || 'sans-serif'),
        weight: /bold/.test(st) ? 'bold' : 'normal',
        style: /italic|oblique/.test(st) ? 'italic' : 'normal',
        toUnicode: md.toUnicode || {},
        raw: identity ? md.rawData : null,
      };
    }));
    return table;
  }

  const imageSources = typeof WeakMap === 'function' ? new WeakMap() : null;

  // Wraps doc.addImage so each image the PDF holds (/I0, /I1 …) keeps the source it was made from.
  // The bytes written to the PDF are untouched.
  function track(doc) {
    if (!doc || !imageSources || imageSources.has(doc)) return doc;
    const map = {};
    imageSources.set(doc, map);
    const orig = doc.addImage;
    if (typeof orig !== 'function') return doc;
    doc.addImage = function (src) {
      const coll = (doc.internal.collections && doc.internal.collections.addImage_images) || {};
      const before = new Set(Object.keys(coll));
      const res = orig.apply(this, arguments);
      const after = (doc.internal.collections && doc.internal.collections.addImage_images) || {};
      Object.keys(after).forEach(k => { if (!before.has(k)) map['I' + after[k].index] = src; });
      return res;
    };
    return doc;
  }

  /* ───────────── the painter ───────────── */
  function mul(m, n) {   // m × n, PDF matrices [a b c d e f]
    return [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
            m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
            m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  }
  const grey = v => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${c},${c},${c})`; };
  const rgb = (r, g, b) => `rgb(${[r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
  const cmyk = (c, m, y, k) => rgb((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
  const FONT_UP = 16;   // canvas text is set 16× larger and scaled down: no browser minimum size applies

  // Plays one page's content stream onto ctx, which is already set to PDF user space (points, y up).
  // opts: { fonts (fontTable), images { I0: drawable }, family(font) -> CSS family, px (one device pixel in points) }
  function paintOps(ctx, ops, opts) {
    const fonts = opts.fonts || {}, images = opts.images || {}, px = opts.px || 0.5;
    let gs = { fill: '#000', stroke: '#000', lw: 1, font: null, fs: 12, Tc: 0, Tw: 0, Tz: 100, TL: 0, Tr: 0, Ts: 0 };
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], inPath = false, clip = null;
    const stats = { ops: 0, skipped: {} };
    const begin = () => { if (!inPath) { ctx.beginPath(); inPath = true; } };
    const done = () => {
      if (clip) { ctx.clip(clip); clip = null; }
      inPath = false;
    };
    const applyFill = () => { ctx.fillStyle = gs.fill; };
    const applyStroke = () => { ctx.strokeStyle = gs.stroke; ctx.lineWidth = gs.lw > 0 ? gs.lw : px; };

    function showText(str) {
      const f = fonts[gs.font] || {};
      const family = f.identity ? opts.family(f) : (f.family || 'sans-serif');
      ctx.save();
      ctx.font = `${f.style || 'normal'} ${f.weight || 'normal'} ${gs.fs * FONT_UP}px ${family}`;
      if ('fontKerning' in ctx) ctx.fontKerning = 'none';   // the PDF has no kerning either
      ctx.transform(tm[0], tm[1], tm[2], tm[3], tm[4], tm[5] + gs.Ts);
      ctx.scale(gs.Tz / 100 / FONT_UP, -1 / FONT_UP);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = gs.fill; ctx.strokeStyle = gs.stroke; ctx.lineWidth = Math.max(gs.lw, px) * FONT_UP;
      const draw = (s, x) => {
        if (gs.Tr === 0 || gs.Tr === 2 || gs.Tr === 4 || gs.Tr === 6) ctx.fillText(s, x, 0);
        if (gs.Tr === 1 || gs.Tr === 2 || gs.Tr === 5 || gs.Tr === 6) ctx.strokeText(s, x, 0);
      };
      let width;                                                // in text space units
      if (gs.Tc || (gs.Tw && / /.test(str))) {
        let x = 0;
        for (const ch of str) {
          draw(ch, x);
          x += ctx.measureText(ch).width + (gs.Tc + (ch === ' ' ? gs.Tw : 0)) * FONT_UP;
        }
        width = x / FONT_UP;
      } else {
        draw(str, 0);
        width = ctx.measureText(str).width / FONT_UP;
      }
      ctx.restore();
      tm = mul([1, 0, 0, 1, width * gs.Tz / 100, 0], tm);
    }
    function nextLine(tx, ty) { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); }

    for (const { op, args } of ops) {
      stats.ops++;
      const a = args;
      switch (op) {
        case 'q': ctx.save(); stack.push(Object.assign({}, gs)); break;
        case 'Q': ctx.restore(); if (stack.length) gs = stack.pop(); break;
        case 'cm': ctx.transform(a[0], a[1], a[2], a[3], a[4], a[5]); break;
        case 'w': gs.lw = a[0]; break;
        case 'J': ctx.lineCap = ['butt', 'round', 'square'][a[0]] || 'butt'; break;
        case 'j': ctx.lineJoin = ['miter', 'round', 'bevel'][a[0]] || 'miter'; break;
        case 'M': ctx.miterLimit = a[0] || 10; break;
        case 'd': if (ctx.setLineDash) ctx.setLineDash(Array.isArray(a[0]) ? a[0] : []); ctx.lineDashOffset = a[1] || 0; break;
        case 'g': gs.fill = grey(a[0]); break;
        case 'G': gs.stroke = grey(a[0]); break;
        case 'rg': gs.fill = rgb(a[0], a[1], a[2]); break;
        case 'RG': gs.stroke = rgb(a[0], a[1], a[2]); break;
        case 'k': gs.fill = cmyk(a[0], a[1], a[2], a[3]); break;
        case 'K': gs.stroke = cmyk(a[0], a[1], a[2], a[3]); break;
        case 'gs': case 'ri': case 'i': case 'cs': case 'CS': break;
        case 'm': begin(); ctx.moveTo(a[0], a[1]); break;
        case 'l': begin(); ctx.lineTo(a[0], a[1]); break;
        case 'c': begin(); ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); break;
        case 'h': if (inPath) ctx.closePath(); break;
        case 're': begin(); ctx.rect(a[0], a[1], a[2], a[3]); break;
        case 'S': applyStroke(); ctx.stroke(); done(); break;
        case 's': ctx.closePath(); applyStroke(); ctx.stroke(); done(); break;
        case 'f': case 'F': applyFill(); ctx.fill('nonzero'); done(); break;
        case 'f*': applyFill(); ctx.fill('evenodd'); done(); break;
        case 'B': applyFill(); ctx.fill('nonzero'); applyStroke(); ctx.stroke(); done(); break;
        case 'B*': applyFill(); ctx.fill('evenodd'); applyStroke(); ctx.stroke(); done(); break;
        case 'b': ctx.closePath(); applyFill(); ctx.fill('nonzero'); applyStroke(); ctx.stroke(); done(); break;
        case 'b*': ctx.closePath(); applyFill(); ctx.fill('evenodd'); applyStroke(); ctx.stroke(); done(); break;
        case 'n': done(); break;
        case 'W': clip = 'nonzero'; break;
        case 'W*': clip = 'evenodd'; break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case 'ET': break;
        case 'Tf': gs.font = a[0] && a[0].name; gs.fs = a[1]; break;
        case 'TL': gs.TL = a[0]; break;
        case 'Tc': gs.Tc = a[0]; break;
        case 'Tw': gs.Tw = a[0]; break;
        case 'Tz': gs.Tz = a[0]; break;
        case 'Tr': gs.Tr = a[0]; break;
        case 'Ts': gs.Ts = a[0]; break;
        case 'Td': nextLine(a[0], a[1]); break;
        case 'TD': gs.TL = -a[1]; nextLine(a[0], a[1]); break;
        case 'Tm': tlm = a.slice(0, 6); tm = tlm.slice(); break;
        case 'T*': nextLine(0, -gs.TL); break;
        case 'Tj': if (a[0]) showText(decodeText(a[0], fonts[gs.font])); break;
        case "'": nextLine(0, -gs.TL); if (a[0]) showText(decodeText(a[0], fonts[gs.font])); break;
        case '"': gs.Tw = a[0]; gs.Tc = a[1]; nextLine(0, -gs.TL); if (a[2]) showText(decodeText(a[2], fonts[gs.font])); break;
        case 'TJ':
          (a[0] || []).forEach(el => {
            if (typeof el === 'number') tm = mul([1, 0, 0, 1, -el / 1000 * gs.fs * gs.Tz / 100, 0], tm);
            else showText(decodeText(el, fonts[gs.font]));
          });
          break;
        case 'Do': {
          const img = a[0] && images[a[0].name];
          if (img) {   // unsmoothed, as PDF viewers draw an image without /Interpolate (the QR stays sharp)
            ctx.save(); ctx.transform(1, 0, 0, -1, 0, 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 1, 1); ctx.restore();
          }
          else stats.skipped.Do = (stats.skipped.Do || 0) + 1;
          break;
        }
        default: stats.skipped[op] = (stats.skipped[op] || 0) + 1;
      }
    }
    return stats;
  }

  // Page n (1-based) of a jsPDF document: its media box and parsed operators.
  function pageOps(doc, n) {
    const page = doc.internal.pages[n] || [];
    let box = { bottomLeftX: 0, bottomLeftY: 0, topRightX: 595.28, topRightY: 841.89 };
    try { box = doc.internal.getPageInfo(n).pageContext.mediaBox || box; } catch (_) {}
    return { box, ops: parseOps(page.join('\n')) };
  }

  /* ───────────── browser side: fonts, images, the dialog ───────────── */
  const fontFaces = new Map();   // embedded font bytes length+name -> CSS family

  function binToU8(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (typeof raw === 'string') {
      const u = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i) & 255;
      return u;
    }
    return new Uint8Array(raw);
  }

  async function loadFonts(table) {
    for (const id of Object.keys(table)) {
      const f = table[id];
      if (!f.identity || !f.raw) continue;
      const key = f.name + ':' + f.raw.length;
      if (!fontFaces.has(key)) {
        const fam = 'QuotePdf' + fontFaces.size;
        try {
          const face = new FontFace(fam, binToU8(f.raw));
          await face.load();
          document.fonts.add(face);
          fontFaces.set(key, `"${fam}", sans-serif`);
        } catch (e) {
          console.warn('PDF preview: could not load the embedded font', e);
          fontFaces.set(key, 'sans-serif');
        }
      }
      f.css = fontFaces.get(key);
    }
  }

  async function loadImages(doc) {
    const out = {}, srcs = (imageSources && imageSources.get(doc)) || {};
    await Promise.all(Object.keys(srcs).map(async name => {
      const s = srcs[name];
      if (s && typeof s === 'object' && (s.tagName === 'CANVAS' || s.tagName === 'IMG')) { out[name] = s; return; }
      if (typeof s !== 'string') return;
      const img = new Image();
      img.src = /^data:|^blob:/.test(s) ? s : 'data:image/png;base64,' + s;
      try { await img.decode(); out[name] = img; } catch (_) {}
    }));
    return out;
  }

  const SHEET_CSS_W = 794;   // an A4 sheet at 96 dpi: the canvases are shown at most this wide

  // Builds the sheets without touching the page: the caller puts them in only if its render is
  // still the current one (a newer refresh, or Close, may have started while fonts/images loaded).
  async function renderPages(doc) {
    const fonts = fontTable(doc);
    await loadFonts(fonts);
    const images = await loadImages(doc);
    const count = doc.internal.getNumberOfPages();
    const dpr = Math.min(2, Math.max(1, root.devicePixelRatio || 1));
    const sheets = [];
    for (let n = 1; n <= count; n++) {
      const { box, ops } = pageOps(doc, n);
      const wPt = box.topRightX - box.bottomLeftX, hPt = box.topRightY - box.bottomLeftY;
      const k = SHEET_CSS_W / wPt * dpr;
      const cv = document.createElement('canvas');
      cv.width = Math.round(wPt * k); cv.height = Math.round(hPt * k);
      cv.className = 'qp-page';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', TF('Page {n}', { n }));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(k, 0, 0, -k, -box.bottomLeftX * k, box.topRightY * k);   // PDF user space, y up
      const stats = paintOps(ctx, ops, { fonts, images, px: 1 / k, family: f => f.css || 'sans-serif' });
      if (Object.keys(stats.skipped).length) console.warn('PDF preview: page', n, 'skipped', stats.skipped);
      if (n > 1) {
        const cut = document.createElement('div');
        cut.className = 'qp-break';
        cut.innerHTML = '<span></span>';
        cut.firstChild.textContent = TF('Page {n}', { n });
        sheets.push(cut);
      }
      sheets.push(cv);
    }
    return { count, sheets };
  }

  const T = k => (typeof root.t === 'function' ? root.t(k) : k);
  const TF = (k, vars) => T(k).replace(/\{(\w+)\}/g, (m, v) => (vars && v in vars ? vars[v] : m));
  const $ = id => document.getElementById(id);
  const _qp = { seq: 0, cfg: null, built: null, back: null };

  // The format shown: 'html' only when the report has an HTML version and the button downloads.
  let _sw = null;
  const format = cfg => (cfg && cfg.html && !cfg.commit && _sw ? _sw.get() : 'pdf');
  const fileName = (name, f) => (root.CarinoPdf ? root.CarinoPdf.fileName(name, f)
    : String(name || 'report').replace(/\.(pdf|html?)$/i, '') + (f === 'html' ? '.html' : '.pdf'));
  function relabel(el, key) {
    if (!el) return;
    el.dataset.i18nKey = key;
    el.textContent = T(key);
  }
  // Title, note and button follow the format.
  function paintFormat(cfg) {
    const f = format(cfg), c = cfg.commit || {};
    relabel($('qpTitle'), f === 'html' ? 'HTML preview' : 'PDF preview');
    relabel($('qpNote'), f === 'html' ? 'The HTML file itself, as it will be saved.'
      : 'Drawn from the PDF itself, page by page, before anything is saved.');
    setCommitLabel(c.label || (f === 'html' ? 'Download HTML' : 'Download PDF'), c.icon || '⬇');
    if (_sw) _sw.el.hidden = !(cfg.html && !cfg.commit);
  }

  // The HTML file in a frame at sheet width (QuoteReport.SHEET_PX), scaled to the stage, never reflowed.
  const SHEET_PX = (root.QuoteReport && root.QuoteReport.SHEET_PX) || 826;
  function htmlSheet(html) {
    const wrap = document.createElement('div');
    wrap.className = 'qp-html';
    const fr = document.createElement('iframe');
    fr.className = 'qp-html-frame';
    fr.title = T('HTML preview');
    fr.setAttribute('sandbox', 'allow-same-origin allow-modals');   // no scripts; Print needs modals
    fr.style.width = SHEET_PX + 'px';
    fr.style.height = '1123px';
    wrap.appendChild(fr);
    return new Promise(res => {
      fr.addEventListener('load', () => {
        // Keys pressed inside the frame (after a click in it, or after Print) never reach the
        // window: hand them to the dialog's handler so Esc still closes and Tab still wraps.
        try { fr.contentDocument.addEventListener('keydown', e => { if (_qp.cfg) onKey(e); }); } catch (_) {}
        res(wrap);
      }, { once: true });
      fr.srcdoc = html;
      $('qpPages').replaceChildren(wrap);   // srcdoc loads once the frame is in the page
    });
  }
  function fitHtml() {
    const wrap = $('qpPages') && $('qpPages').querySelector('.qp-html');
    if (!wrap) return;
    const fr = wrap.firstChild;
    let h = 1123;
    try { h = Math.max(h, fr.contentDocument.documentElement.scrollHeight); } catch (_) {}
    const avail = $('qpPages').clientWidth || SHEET_PX;
    const k = Math.min(1, avail / SHEET_PX);
    fr.style.height = h + 'px';
    fr.style.transform = k < 1 ? `scale(${k})` : '';
    wrap.style.width = Math.floor(SHEET_PX * k) + 'px';
    wrap.style.height = Math.ceil(h * k) + 'px';
  }

  function setCommitLabel(label, icon) {
    const btn = $('qpCommit');
    if (!btn) return;
    btn.querySelector('.qp-ico').textContent = icon || '';
    const lab = btn.querySelector('.qp-lab');
    lab.dataset.i18nKey = label;
    lab.textContent = T(label);
  }

  async function refresh() {
    const seq = ++_qp.seq, cfg = _qp.cfg;
    const status = $('qpStatus'), commit = $('qpCommit'), pages = $('qpPages'), print = $('qpPrint');
    commit.disabled = true;
    if (print) print.disabled = true;
    _qp.built = null;
    dropPrintFrame();
    paintFormat(cfg);
    if (format(cfg) === 'html') return refreshHtml(seq, cfg);
    status.textContent = T('Creating the PDF…');
    let built;
    try {
      built = await cfg.build();
      if (seq !== _qp.seq) return;
      const { count: n, sheets } = await renderPages(built.doc);
      if (seq !== _qp.seq) return;
      pages.replaceChildren(...sheets);
      _qp.built = built;
      $('qpName').textContent = built.name || '';
      status.textContent = TF(n === 1 ? '1 page' : '{n} pages', { n });
      commit.disabled = false;
      if (print) print.disabled = false;
    } catch (e) {
      console.error(e);
      if (seq !== _qp.seq) return;
      pages.replaceChildren();
      status.textContent = T('Could not create the PDF.') + ' ' + (e && e.message || e);
    }
  }

  async function refreshHtml(seq, cfg) {
    const status = $('qpStatus'), commit = $('qpCommit'), print = $('qpPrint');
    status.textContent = T('Preparing the HTML…');
    try {
      const built = await cfg.html();
      if (seq !== _qp.seq) return;
      await htmlSheet(built.html);
      if (seq !== _qp.seq) return;
      fitHtml();
      _qp.built = { html: built.html, name: fileName(built.name, 'html') };
      $('qpName').textContent = _qp.built.name;
      status.textContent = T('One HTML file, ready to save.');
      commit.disabled = false;
      if (print) print.disabled = false;
    } catch (e) {
      console.error(e);
      if (seq !== _qp.seq) return;
      $('qpPages').replaceChildren();
      status.textContent = T('Could not create the HTML file.') + ' ' + (e && e.message || e);
    }
  }

  function open(cfg) {
    const ov = $('qpOverlay');
    if (!ov) {   // a page without the dialog commits straight away, as it did before
      return Promise.resolve(cfg.build()).then(b => (cfg.commit ? cfg.commit.run(b) : b.doc.save(b.name)));
    }
    if (_qp.cfg) close(true);
    _qp.cfg = cfg;
    _qp.back = document.activeElement;
    paintFormat(cfg);
    $('qpName').textContent = '';
    $('qpPages').replaceChildren();
    $('qpStage').scrollTop = 0;
    ov.hidden = false;
    root.addEventListener('keydown', onKey, true);
    $('qpClose').focus();
    return refresh();
  }

  function close(keepFocus) {
    _qp.seq++; _qp.cfg = null; _qp.built = null;
    dropPrintFrame();
    const ov = $('qpOverlay');
    if (ov) ov.hidden = true;
    const pages = $('qpPages');
    if (pages) pages.replaceChildren();   // the canvases are large; let them go
    root.removeEventListener('keydown', onKey, true);
    if (!keepFocus) focusBack(_qp.back);
    _qp.back = null;
  }

  // Focus goes back to the opener; when that is gone or hidden (an Export menu item: the menu shuts
  // on the click), to the nearest visible menu button that owns it (#exportMenuBtn, or the navbar's
  // overflow button when the menu lives there).
  function focusBack(el) {
    const shown = x => x && x.isConnected && x.getClientRects().length > 0;
    try {
      if (shown(el)) { el.focus(); return; }
      for (let a = el && el.parentElement; a; a = a.parentElement) {
        const b = [...a.querySelectorAll(':scope > [aria-haspopup], :scope > .cn-more')].find(shown);
        if (b) { b.focus(); return; }
      }
    } catch (_) {}
  }

  // Capture phase on window: runs before the catalog editor's and the catalog browser's own Escape,
  // so Esc closes only the preview on top of them.
  function onKey(e) {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {   // keep focus in the dialog
      const box = $('qpOverlay').querySelector('.qp-box');
      const f = [...box.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"]):not(button), iframe')]
        .filter(el => el.getClientRects().length);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // Print: the PDF itself (the bytes Download saves), never the preview canvases; the preview
  // stays open. Where the browser shows PDFs inline (navigator.pdfViewerEnabled), the PDF loads
  // into a hidden same-origin frame as soon as the pointer or focus reaches Print, so the click
  // usually finds it loaded and prints inside the user's gesture. Where the viewer will not print
  // from a frame (it throws, as Firefox's may), or there is no inline viewer at all (a phone, or
  // PDFs set to download), the PDF opens in a tab of its own from the click itself, so no pop-up
  // blocker stops it. The frame is never loaded without a viewer: there it would download the file.
  // A click before the frame has loaded prints once it has. close() drops the frame and its URL.
  const _pf = { frame: null, url: null, ready: false, pending: false };
  const inlinePdf = () => typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === true;
  function dropPrintFrame() {
    if (_pf.frame) _pf.frame.remove();
    if (_pf.url) URL.revokeObjectURL(_pf.url);
    _pf.frame = null; _pf.url = null; _pf.ready = false; _pf.pending = false;
  }
  function printUrl() {
    if (!_pf.url) _pf.url = URL.createObjectURL(_qp.built.doc.output('blob'));
    return _pf.url;
  }
  function preparePrint() {
    if (!_qp.built || !_qp.built.doc || _pf.frame || !inlinePdf()) return;
    const fr = document.createElement('iframe');
    _pf.frame = fr;
    fr.setAttribute('aria-hidden', 'true');
    fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    fr.addEventListener('load', () => {
      if (_pf.frame !== fr) return;
      _pf.ready = true;
      if (_pf.pending) { _pf.pending = false; printFrame(); }
    }, { once: true });
    fr.src = printUrl();
    document.body.appendChild(fr);
  }
  function printFrame() {
    try { _pf.frame.contentWindow.focus(); _pf.frame.contentWindow.print(); }
    catch (e) { console.warn('PDF preview: printing from a frame failed, opening the PDF', e); root.open(_pf.url, '_blank', 'noopener'); }
  }
  function print() {
    if (!_qp.built) return;
    if (_qp.built.html !== undefined) {   // HTML: print the very file shown in the frame
      const fr = $('qpPages').querySelector('.qp-html-frame');
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { console.warn('HTML preview: print failed', e); }
      if (_qp.cfg && $('qpPrint')) $('qpPrint').focus();   // back in the dialog once the print dialog shuts
      return;
    }
    if (!inlinePdf()) { root.open(printUrl(), '_blank', 'noopener'); return; }
    preparePrint();
    if (_pf.ready) printFrame(); else _pf.pending = true;
  }

  // Synchronous from the click: Open in Files opens its tab here, so no pop-up blocker.
  function commit() {
    const built = _qp.built, cfg = _qp.cfg;
    if (!built || !cfg) return;
    if (built.html !== undefined) { saveHtml(built); return; }
    close();
    if (cfg.commit && cfg.commit.run) cfg.commit.run(built);
    else built.doc.save(built.name);
  }

  // The HTML file through the fleet helper (it hands a standalone file back byte for byte);
  // the preview stays open, busy, until the file is handed to the browser.
  function saveHtml(built) {
    const btn = $('qpCommit'), status = $('qpStatus');
    const done = () => close();
    if (!root.CarinoPdf) {
      const url = URL.createObjectURL(new Blob([built.html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = built.name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      done();
      return;
    }
    btn.disabled = true;
    root.CarinoPdf.download({ html: built.html, name: built.name, format: 'html' }).then(r => {
      if (r && r.ok) { done(); return; }
      btn.disabled = false;
      status.textContent = T('Could not create the HTML file.') + (r && r.error ? ' ' + r.error : '');
    });
  }

  if (typeof document !== 'undefined') {
    const wire = () => {
      const ov = $('qpOverlay');
      if (!ov || ov.dataset.wired) return;
      ov.dataset.wired = '1';
      $('qpClose').addEventListener('click', () => close());
      $('qpCommit').addEventListener('click', commit);
      const pr = $('qpPrint');
      if (pr) {
        pr.addEventListener('click', print);
        ['pointerenter', 'focus'].forEach(ev => pr.addEventListener(ev, preparePrint));
      }
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      // File  PDF | HTML, above the file name, outside any scrolling list.
      if (root.CarinoPdf && root.CarinoPdf.formatSwitch) {
        root.CarinoPdf.t = T;
        _sw = root.CarinoPdf.formatSwitch({ onChange: () => { if (_qp.cfg) refresh(); } });
        _sw.el.hidden = true;
        $('qpName').before(_sw.el);
      }
      root.addEventListener('carino:langchange', () => {   // after i18n.js switched t()
        setTimeout(() => { if (_sw) _sw.relabel(); if (_qp.cfg) refresh(); }, 0);
      });
      root.addEventListener('resize', () => { if (_qp.cfg) fitHtml(); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  }

  const api = { track, open, close, tokenize, parseOps, decodeText, fontTable, paintOps, pageOps };
  root.QuotePdfPreview = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
