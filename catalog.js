/* Quote — catalog sources, editor, import/export and hosted sync.
   Loaded right after the page's inline script; uses its globals (appState, saveState, renderCatalog,
   normalizeCatalog, catState, catToast, renderTable, openCatalog, escapeHtml, GENERAL_CATALOG, LINE_CATALOGS)
   and t() from i18n.js.

   Where a catalog can come from:
     general · retina · pacs · infra   built in, read-only (editing one saves a copy as "My catalog")
     mine                              the visitor's own, edited here, kept in this browser (localStorage)
     hosted                            a JSON file the visitor's organisation publishes at an https URL,
                                       the desk.carino.systems model: Quote only reads it, re-checks it on
                                       every load, on focus and every 5 minutes, and keeps the last good copy.
   The file format (export it here to get a valid one):
     { "appType": "carino_quote_catalog", "version": 1, "name": "…", "revision": "3",
       "defaults": { "currency": "MXN", "vatRate": 16 },   ← what a quote switches to with this catalog
       "hiddenCategories": ["…"], "disclaimer": "…",
       "items": [ { "category", "description", "provider", "price" (number, or null = quoted after a visit),
                    "currency" (ISO 4217), "vatIncluded" (bool), "note", "link" (https) } ] }
   A spreadsheet works too: CSV with the columns category, description, provider, price, currency,
   vat_included, note, link (Spanish headers are understood; "," ";" or tab as separator). */
(function () {
  'use strict';
  const LS_MINE = 'quoteMyCatalog', LS_SRC = 'quoteCatalogSource', LS_RAW = 'quoteCatalogRaw';
  const SYNC_EVERY = 5 * 60 * 1000, MAX_ITEMS = 2000;
  // Revision of the built-in catalogs: bump it whenever their items or prices change.
  const BUILTIN_REV = '2026-10-28';
  // Hidden unless the visitor shows them: PACS work is quoted after an on-site assessment.
  const DEFAULT_HIDDEN = { general: ['DICOM & Medical Imaging'] };
  const COLS = ['category', 'description', 'provider', 'price', 'currency', 'vat_included', 'note', 'link'];
  const ALIASES = {
    category: ['category', 'categoria', 'categoría', 'rubro'], description: ['description', 'descripcion', 'descripción', 'concepto', 'desc'],
    provider: ['provider', 'proveedor', 'marca'], price: ['price', 'precio', 'importe', 'precio unitario'], currency: ['currency', 'moneda', 'divisa'],
    vat_included: ['vat_included', 'vatincluded', 'vatstripped', 'iva_incluido', 'iva incluido', 'incluye iva', 'incl_vat'],
    note: ['note', 'notes', 'nota', 'notas'], link: ['link', 'url', 'enlace'],
  };

  const T = s => (typeof t === 'function' ? t(s) : s);
  const esc = s => escapeHtml(s == null ? '' : String(s));
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  function lsSet(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; }
    catch (e) { catToast(T('Could not save: browser storage is full'), 'err'); return false; }
  }

  /* ───────────── cleaning anything that comes in ───────────── */
  const str = (v, n) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const safeLink = u => { u = str(u, 500); return /^https?:\/\/[^\s]+$/i.test(u) ? u : ''; };
  const truthy = v => v === true || /^(1|true|yes|y|si|sí|x)$/i.test(String(v == null ? '' : v).trim());
  function parsePrice(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return null;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{3}(?!\d)/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function cleanItem(raw, defCur) {
    if (!raw || typeof raw !== 'object') return null;
    const description = str(raw.description != null ? raw.description : raw.desc, 200);
    if (!description) return null;
    const cur = str(raw.currency, 3).toUpperCase();
    const vat = raw.vatIncluded != null ? raw.vatIncluded : raw.vatStripped != null ? raw.vatStripped : raw.vat_included;
    return {
      category: str(raw.category, 80) || 'General', description, provider: str(raw.provider, 80),
      price: parsePrice(raw.price), currency: /^[A-Z]{3}$/.test(cur) ? cur : defCur,
      note: str(raw.note != null ? raw.note : raw.notes, 400), vatStripped: truthy(vat), link: safeLink(raw.link || raw.url),
    };
  }
  function cleanCatalog(c, fallbackName) {
    const defCur = /^[A-Z]{3}$/.test(str(c.currency, 3).toUpperCase()) ? str(c.currency, 3).toUpperCase() : (appState.config.targetCurrency || 'USD');
    const items = (c.items || []).slice(0, MAX_ITEMS).map(x => cleanItem(x, defCur)).filter(Boolean);
    return {
      name: str(c.name, 80) || fallbackName || T('My catalog'), revision: str(c.revision != null ? c.revision : c.version, 40),
      items, hiddenCategories: Array.isArray(c.hiddenCategories) ? c.hiddenCategories.map(x => str(x, 80)).filter(Boolean) : null,
      disclaimer: str(c.disclaimer, 2000), defaults: cleanDefaults(c.defaults), dropped: (c.items || []).length - items.length,
    };
  }
  // A catalog's suggested quote settings: currency (ISO 4217) and VAT %; either may be absent.
  function cleanDefaults(d) {
    if (!d || typeof d !== 'object') return null;
    const cur = str(d.currency, 3).toUpperCase(), vat = d.vatRate == null || d.vatRate === '' ? NaN : parseFloat(d.vatRate);
    const out = {};
    if (/^[A-Z]{3}$/.test(cur)) out.currency = cur;
    if (isFinite(vat) && vat >= 0 && vat <= 100) out.vatRate = vat;
    return Object.keys(out).length ? out : null;
  }

  /* ───────────── formats ───────────── */
  // JSON: this format, a whole Quote config (its "catalog"), or a bare array of items.
  function fromJSON(json) {
    if (Array.isArray(json)) return { items: json };
    if (json && typeof json === 'object') {
      if (json.appType === 'carino_quote_catalog' || Array.isArray(json.items)) return json;
      if (Array.isArray(json.catalog)) return { name: json.organization && json.organization.name, items: json.catalog, disclaimer: json.disclaimer, defaults: json.defaults };
    }
    throw new Error(T('Not a Quote catalog'));
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = ch => first.split('"').filter((_, i) => i % 2 === 0).join('').split(ch).length - 1;
    const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"' && f === '') q = true;   // a quote is special only at the start of a field
      else if (ch === sep) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const live = rows.filter(r => r.some(c => c.trim() !== ''));
    if (live.length < 2) throw new Error(T('The CSV needs a header row and at least one item'));
    const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const head = live[0].map(fold), idx = {};
    COLS.forEach(k => { idx[k] = head.findIndex(h => ALIASES[k].map(fold).includes(h)); });
    if (idx.description < 0) throw new Error(T('The CSV has no "description" column'));
    return { items: live.slice(1).map(r => Object.fromEntries(COLS.filter(k => idx[k] >= 0).map(k => [k, r[idx[k]]]))) };
  }
  function parseAny(text, nameHint) {
    const s = text.trim();
    const raw = /^[\[{]/.test(s) ? fromJSON(JSON.parse(s)) : parseCSV(text);
    return cleanCatalog(raw, nameHint);
  }
  function toJSON(cat) {
    return JSON.stringify({
      appType: 'carino_quote_catalog', version: 1, name: cat.name || '', revision: cat.revision || '', defaults: cat.defaults || undefined,
      hiddenCategories: cat.hiddenCategories || [], disclaimer: cat.disclaimer || undefined,
      items: cat.items.map(i => {
        const o = { category: i.category, description: i.description };
        if (i.provider) o.provider = i.provider;
        o.price = i.price == null ? null : i.price; o.currency = i.currency;
        if (i.vatStripped) o.vatIncluded = true;
        if (i.note) o.note = i.note;
        if (i.link) o.link = i.link;
        return o;
      }),
    }, null, 2);
  }
  function toCSV(items) {
    const cell = v => { const s = v == null ? '' : String(v); return /[",\n;\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [COLS.join(',')].concat(items.map(i =>
      [i.category, i.description, i.provider, i.price == null ? '' : i.price, i.currency, i.vatStripped ? 'yes' : '', i.note, i.link].map(cell).join(',')));
    return '﻿' + lines.join('\r\n') + '\r\n';   // BOM: Excel opens UTF-8 accents correctly
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileName = (cat, ext) => (str(cat.name, 60).replace(/[^\wÀ-ɏ-]+/g, '-').replace(/^-|-$/g, '') || 'catalog') + (cat.revision ? '-r' + cat.revision.replace(/[^\w.-]/g, '') : '') + '.' + ext;

  /* ───────────── sources ───────────── */
  const getMine = () => { const m = lsGet(LS_MINE); return m && Array.isArray(m.items) ? m : null; };
  const getSource = () => { const s = lsGet(LS_SRC); return s && typeof s.url === 'string' && s.url ? s : null; };
  function hosted() {
    const raw = localStorage.getItem(LS_RAW), src = getSource();
    if (!raw || !src) return null;
    try { return parseAny(raw, src.name || hostOf(src.url)); } catch (e) { return null; }
  }
  const hostOf = u => { try { return new URL(u).host; } catch (e) { return u; } };
  function sources() {
    const out = { general: { label: T('General'), items: GENERAL_CATALOG, builtin: true } };
    Object.entries(LINE_CATALOGS).forEach(([k, v]) => { out[k] = { label: v.label, items: v.items, builtin: true, defaults: v.defaults || { currency: 'MXN', vatRate: 16 } }; });
    const m = getMine(); if (m) out.mine = { label: m.name || T('My catalog'), items: m.items, hiddenCategories: m.hiddenCategories, disclaimer: m.disclaimer, revision: m.revision, defaults: cleanDefaults(m.defaults) };
    const h = hosted(); if (h) out.hosted = { label: h.name, items: h.items, hiddenCategories: h.hiddenCategories, disclaimer: h.disclaimer, revision: h.revision, defaults: h.defaults, remote: true };
    return out;
  }
  function activate(key, quiet, byUser) {
    const all = sources(), src = all[key] || all.general;
    if (appState.activeCatalog !== (all[key] ? key : 'general')) catState.cat = '__all';
    appState.activeCatalog = all[key] ? key : 'general';
    appState.catalog = src.items.map(i => Object.assign({}, i));
    normalizeCatalog();
    // A catalog may carry a suggested disclaimer; it fills an empty one and never overwrites the visitor's.
    const d = appState.config.disclaimer || (appState.config.disclaimer = { on: false, text: '' });
    if (src.disclaimer && !d.text) {
      d.text = src.disclaimer;
      const box = document.getElementById('disc-text'); if (box) box.value = d.text;
    }
    saveState();
    if (!quiet && document.getElementById('cat-modal').classList.contains('open')) renderCatalog();
    if (!quiet) renderTable();   // the QR code on the quote may point at the catalog
    if (byUser) offerDefaults(src);
  }
  /* ───────────── per-catalog defaults ───────────── */
  // An empty quote takes the catalog's currency and VAT at once; a quote with items asks first.
  async function offerDefaults(src) {
    const d = src && src.defaults; if (!d) return;
    const cfg = appState.config, cur = d.currency && d.currency !== cfg.targetCurrency, vat = d.vatRate != null && +d.vatRate !== +cfg.vatRate;
    if (!cur && !vat) return;
    const what = [d.currency, d.vatRate != null ? d.vatRate + ' % ' + T('VAT') : ''].filter(Boolean).join(', ');
    if (appState.items.length && !(await ask(T('Use the catalog\'s defaults?'),
      esc(src.label + ': ' + what + '. ' + T('The items already on the quote are converted, not removed.')), T('Apply')))) return;
    applyDefaults(d);
    catToast('✓ ' + T('Quote set to') + ' ' + what);
  }
  function applyDefaults(d) {
    const cfg = appState.config;
    if (d.currency) {
      if (!appState.availableCurrencies.includes(d.currency)) {
        appState.availableCurrencies = appState.availableCurrencies.concat([d.currency]);
        document.querySelectorAll('.dynamic-currency').forEach(sel => { const o = document.createElement('option'); o.value = o.textContent = d.currency; sel.appendChild(o); });
      }
      cfg.targetCurrency = d.currency;
      const g = document.getElementById('global-currency'); if (g) g.value = d.currency;
    }
    if (d.vatRate != null) { cfg.vatRate = +d.vatRate; const v = document.getElementById('global-vat'); if (v) v.value = cfg.vatRate; }
    saveState();
    fetchRates().then(renderTable);
  }
  // Which catalog an item came from, stamped on the item when it is added, and printed on the quote.
  function stamp() {
    const key = appState.activeCatalog || 'general', s = sources()[key] || sources().general;
    const day = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
    let rev = s.revision || '', date = '';
    if (s.builtin) { rev = BUILTIN_REV; }
    else if (key === 'mine') { const m = getMine(); date = m && m.saved ? m.saved.slice(0, 10) : ''; }
    else if (key === 'hosted') { const src = getSource() || {}; date = src.lastModified ? day(Date.parse(src.lastModified)) : day(src.lastSync); }
    return { key, label: s.label, rev, date };
  }
  // "Catalog: Infraestructura · rev. 2026-10-28", one entry per catalog the quote's items came from.
  function revisionLine(items) {
    const seen = new Map();
    (items || []).forEach(i => { const c = i.cat; if (c && c.label) seen.set(c.label + '|' + (c.rev || '') + '|' + (c.date || ''), c); });
    if (!seen.size) return '';
    return T('Catalog') + ': ' + [...seen.values()].map(c => c.label + (c.rev ? ' · ' + T('rev.') + ' ' + c.rev : '') + (c.date && c.date !== c.rev ? ' · ' + c.date : '')).join('; ');
  }

  // The link that reopens Quote on the active catalog (for the QR code), or null when it lives only in this browser.
  function shareUrl() {
    const base = /(^|\.)carino\.systems$/.test(location.hostname) ? location.origin + location.pathname : 'https://quote.carino.systems/';
    const key = appState.activeCatalog || 'general', src = getSource();
    if (key === 'mine') return null;
    if (key === 'hosted') return src ? base + '?catalog=' + encodeURIComponent(src.url) : null;
    return base + '?catalog=' + key;
  }
  const activeLabel = () => { const s = sources()[appState.activeCatalog]; return s ? s.label : T('General'); };

  /* ───────────── hidden categories ───────────── */
  function hiddenList(key) {
    key = key || appState.activeCatalog || 'general';
    const mine = appState.hiddenCats && appState.hiddenCats[key];
    if (Array.isArray(mine)) return mine;
    const s = sources()[key];
    return (s && s.hiddenCategories) || DEFAULT_HIDDEN[key] || [];
  }
  function toggleHidden(cat) {
    const key = appState.activeCatalog || 'general', list = hiddenList(key).slice(), i = list.indexOf(cat);
    if (i >= 0) list.splice(i, 1); else list.push(cat);
    appState.hiddenCats = Object.assign({}, appState.hiddenCats, { [key]: list });
    if (catState.cat === cat && i < 0) catState.cat = '__all';
    saveState(); renderCatalog();
  }
  const isHidden = cat => hiddenList().includes(cat);

  /* ───────────── hosted sync (desk.carino.systems model) ───────────── */
  function normalizeUrl(input) {
    const raw = (input || '').trim();
    if (!/^https?:\/\//i.test(raw)) return null;
    let u; try { u = new URL(raw); } catch (e) { return null; }
    if (location.protocol === 'https:' && u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return null;
    return u.href;
  }
  let syncing = false, lastError = '';
  async function sync(manual) {
    const src = getSource();
    if (!src || syncing) return 'unchanged';
    syncing = true; renderSourceBox();
    try {
      const conditional = !src.noConditional && !!(src.etag || src.lastModified);
      const go = cond => {
        const headers = {};
        if (cond) { if (src.etag) headers['If-None-Match'] = src.etag; if (src.lastModified) headers['If-Modified-Since'] = src.lastModified; }
        return fetch(src.url, { cache: 'no-store', credentials: 'omit', redirect: 'follow', headers });
      };
      let res;
      if (conditional) {
        // Conditional headers force a CORS preflight that many static hosts refuse; fall back to plain
        // requests for this source on the first sign of that, permanently.
        try { res = await go(true); } catch (e) { res = await go(false); src.noConditional = true; }
      } else res = await go(false);
      if (res.status === 304) { src.lastSync = Date.now(); lsSet(LS_SRC, src); lastError = ''; return 'unchanged'; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const cat = parseAny(text, hostOf(src.url));
      if (!cat.items.length) throw new Error(T('The file has no items'));
      src.etag = res.headers.get('ETag') || ''; src.lastModified = res.headers.get('Last-Modified') || '';
      src.lastSync = Date.now(); src.name = cat.name; lastError = '';
      const changed = text !== localStorage.getItem(LS_RAW), prevRev = src.revision || '';
      src.revision = cat.revision;
      lsSet(LS_SRC, src);
      if (!changed) return 'unchanged';
      lsSet(LS_RAW, text);
      if (appState.activeCatalog === 'hosted') activate('hosted', !manual);
      // Items already on the quote are never touched by a sync.
      catToast('⬇ ' + T('Catalog updated') + ': ' + cat.name + (cat.revision ? ` (${prevRev && prevRev !== cat.revision ? prevRev + ' → ' : ''}${cat.revision})` : ''));
      return 'updated';
    } catch (e) {
      lastError = e.message || String(e);
      if (manual) catToast(T('Could not read the catalog') + ': ' + lastError, 'err');
      return 'error';
    } finally { syncing = false; renderSourceBox(); renderSwitch(); }
  }
  async function connect(url) {
    const u = normalizeUrl(url);
    if (!u) { catToast(T('Use an https:// address'), 'err'); return false; }
    const prev = getSource(), prevRaw = localStorage.getItem(LS_RAW);
    lsSet(LS_SRC, { url: u });
    if (!prev || prev.url !== u) localStorage.removeItem(LS_RAW);
    const r = await sync(true);
    if (r === 'error' || !hosted()) { lsSet(LS_SRC, prev); if (prevRaw != null) lsSet(LS_RAW, prevRaw); renderSourceBox(); return false; }
    activate('hosted', false, true); startSync();
    return true;
  }
  function disconnect() {
    lsSet(LS_SRC, null); localStorage.removeItem(LS_RAW); lastError = '';
    if (appState.activeCatalog === 'hosted') activate('general');
    renderSourceBox(); renderSwitch();
  }
  let timer = null;
  function startSync() {
    if (timer || !getSource()) return;
    sync(false);
    timer = setInterval(() => { if (!document.hidden) sync(false); }, SYNC_EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(false); });
  }

  /* ───────────── a small confirm dialog (same look as Reset All) ───────────── */
  function ask(title, body, ok) {
    return new Promise(resolve => {
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim';
      scrim.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true"><div class="modal-head"><div class="modal-title">${esc(title)}</div></div>
        <div class="modal-body">${body}</div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-r="0">${esc(T('Cancel'))}</button>
        <button type="button" class="btn btn-primary" data-r="1">${esc(ok)}</button></div></div>`;
      scrim.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b || e.target === scrim) { scrim.remove(); resolve(!!(b && b.dataset.r === '1')); } });
      document.body.append(scrim);
      scrim.querySelector('[data-r="1"]').focus();
    });
  }

  /* ───────────── catalog browser additions ───────────── */
  function renderSwitch() {
    const box = document.getElementById('cat-switch'); if (!box) return;
    const all = sources(), cur = appState.activeCatalog || 'general';
    box.innerHTML = Object.entries(all).map(([k, s]) =>
      `<button type="button" data-cat-src="${k}" class="${k === cur ? 'active' : ''}" title="${esc(s.remote ? T('Published by your organisation') : s.builtin ? T('Built in') : T('Saved in this browser'))}">${s.remote ? '⇅ ' : ''}${esc(s.label)}</button>`).join('') +
      `<button type="button" class="cat-edit" data-cat-edit>✎ ${esc(T('Edit catalog'))}</button>`;
  }
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-cat-src]');
    if (s) { activate(s.dataset.catSrc, false, true); catState.cat = '__all'; renderCatalog(); return; }
    if (e.target.closest('[data-cat-edit]')) { openEditor(); return; }
    const h = e.target.closest('[data-cat-hide]');
    if (h) { e.stopPropagation(); toggleHidden(h.dataset.catHide); return; }
    if (e.target.closest('[data-cat-showhidden]')) {
      catState.showHidden = !catState.showHidden;
      if (!catState.showHidden && catState.cat !== '__all' && isHidden(catState.cat)) catState.cat = '__all';
      renderCatalog();
    }
  });

  /* ───────────── the editor ───────────── */
  let draft = null, draftOrigin = '', draftDirty = false, edFilter = '';
  function buildEditor() {
    if (document.getElementById('ced-modal')) return;
    const el = document.createElement('div');
    el.id = 'ced-modal'; el.className = 'cat-modal-backdrop'; el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="cat-modal ced" role="dialog" aria-modal="true" aria-labelledby="ced-title">
      <div class="cat-head">
        <h2 id="ced-title">${esc(T('Edit catalog'))}</h2>
        <input class="input ced-name" id="ced-name" maxlength="80" aria-label="${esc(T('Catalog name'))}">
        <input class="input ced-rev" id="ced-rev" maxlength="40" aria-label="${esc(T('Revision'))}" placeholder="${esc(T('Revision'))}">
        <button class="cat-close" data-ced="close" aria-label="${esc(T('Close'))}">&times;</button>
      </div>
      <div class="ced-tabs" role="tablist"><button type="button" data-ced-tab="items" class="active">${esc(T('Items'))}</button><button type="button" data-ced-tab="share">${esc(T('Import & share'))}</button></div>
      <div class="ced-body" id="ced-items">
        <div class="ced-bar"><input class="input" id="ced-q" placeholder="${esc(T('Filter items…'))}"><span class="ced-count" id="ced-count"></span>
          <label class="ced-def" title="${esc(T('A quote switches to these when this catalog is picked'))}">${esc(T('Quote defaults'))}
            <input class="input ced-cur" id="ced-dcur" maxlength="3" list="ced-curs" placeholder="${esc(T('Currency'))}">
            <input class="input ced-num" id="ced-dvat" inputmode="decimal" placeholder="${esc(T('VAT (%)'))}"></label>
          <button type="button" class="btn" data-ced="add">＋ ${esc(T('Add item'))}</button></div>
        <div class="ced-scroll"><table class="ced-table"><thead><tr>
          <th>${esc(T('Category'))}</th><th>${esc(T('Description'))}</th><th>${esc(T('Provider'))}</th><th>${esc(T('Price'))}</th>
          <th>${esc(T('Currency'))}</th><th title="${esc(T('Price includes VAT (Strip it)'))}">${esc(T('incl. VAT'))}</th><th>${esc(T('Notes'))}</th><th>${esc(T('Link'))}</th><th></th></tr></thead>
          <tbody id="ced-rows"></tbody></table></div>
        <p class="ced-hint">${esc(T('Leave the price empty for items quoted after a visit. Categories you hide in the catalog browser stay hidden for everyone you share the file with.'))}</p>
      </div>
      <div class="ced-body" id="ced-share" hidden>
        <section><h3>${esc(T('Start from'))}</h3><div class="ced-row" id="ced-from"></div></section>
        <section><h3>${esc(T('Import'))}</h3>
          <p>${esc(T('A .json exported from Quote, or a spreadsheet saved as .csv with the columns category, description, provider, price, currency, vat_included, note, link.'))}</p>
          <div class="ced-row"><label class="btn">📂 ${esc(T('Choose a file…'))}<input type="file" id="ced-file" accept=".json,.csv,.txt,application/json,text/csv" hidden></label>
            <label class="ced-mode"><input type="checkbox" id="ced-append"> ${esc(T('Add to the current items instead of replacing them'))}</label></div>
          <textarea class="input ced-paste" id="ced-paste" rows="4" placeholder="${esc(T('…or paste JSON or CSV here'))}"></textarea>
          <div class="ced-row"><button type="button" class="btn" data-ced="paste">${esc(T('Import pasted text'))}</button></div></section>
        <section><h3>${esc(T('Export'))}</h3>
          <div class="ced-row"><button type="button" class="btn" data-ced="json">⇩ JSON</button><button type="button" class="btn" data-ced="csv">⇩ CSV</button>
            <button type="button" class="btn btn-ghost" data-ced="tpl">⇩ ${esc(T('CSV template'))}</button></div>
          <p>${esc(T('Edit the CSV in Excel or Google Sheets, then import it back here.'))}</p></section>
        <section><h3>${esc(T('Publish for your team'))}</h3>
          <p>${esc(T('Host the exported JSON at an https address that allows cross-origin reads (GitHub Pages, S3, R2, any web server). Quote reads it, checks it for changes every time it opens and every 5 minutes, and keeps the last good copy if the host is down. Nothing passes through Carino.'))}</p>
          <div class="ced-row"><input class="input" id="ced-url" placeholder="https://example.com/catalog.json"><button type="button" class="btn btn-primary" data-ced="connect">${esc(T('Connect'))}</button></div>
          <div id="ced-source"></div></section>
      </div>
      <div class="ced-foot"><span class="ced-note" id="ced-note"></span><span class="sp"></span>
        <button type="button" class="btn btn-ghost" data-ced="close">${esc(T('Cancel'))}</button>
        <button type="button" class="btn btn-primary" data-ced="save">${esc(T('Save as my catalog'))}</button></div>
    </div>`;
    document.body.append(el);
    el.addEventListener('click', onEditorClick);
    el.addEventListener('input', onEditorInput);
    el.addEventListener('change', onEditorChange);
    el.addEventListener('mousedown', e => { if (e.target === el) requestClose(); });
  }
  function openEditor() {
    buildEditor();
    const s = sources()[appState.activeCatalog] || sources().general;
    draftOrigin = appState.activeCatalog || 'general';
    draft = { name: draftOrigin === 'mine' ? s.label : (s.builtin ? T('My catalog') : s.label), revision: s.revision || '',
      items: s.items.map(i => Object.assign({}, i)), hiddenCategories: hiddenList(draftOrigin).slice(), disclaimer: s.disclaimer || '',
      defaults: Object.assign({}, s.defaults) };
    draftDirty = false; edFilter = '';
    document.getElementById('ced-name').value = draft.name;
    document.getElementById('ced-rev').value = draft.revision;
    document.getElementById('ced-dcur').value = draft.defaults.currency || '';
    document.getElementById('ced-dvat').value = draft.defaults.vatRate != null ? draft.defaults.vatRate : '';
    document.getElementById('ced-q').value = '';
    showTab('items'); renderRows(); renderFrom(); renderSourceBox();
    document.getElementById('ced-note').textContent = s.builtin || s.remote
      ? T('Editing a copy. Saving keeps it as "My catalog" in this browser; the original is not changed.') : '';
    document.getElementById('ced-modal').classList.add('open');
  }
  function closeEditor() { const m = document.getElementById('ced-modal'); if (m) m.classList.remove('open'); draft = null; }
  async function requestClose() {
    if (draftDirty && !(await ask(T('Discard changes?'), esc(T('The catalog has unsaved changes.')), T('Discard')))) return;
    closeEditor();
  }
  function showTab(k) {
    document.querySelectorAll('#ced-modal [data-ced-tab]').forEach(b => b.classList.toggle('active', b.dataset.cedTab === k));
    document.getElementById('ced-items').hidden = k !== 'items';
    document.getElementById('ced-share').hidden = k !== 'share';
  }
  const curOpts = () => (appState.availableCurrencies || []).map(c => `<option value="${esc(c)}">`).join('');
  function renderRows() {
    const q = edFilter.toLowerCase();
    const rows = draft.items.map((it, i) => {
      if (q && ![it.category, it.description, it.provider, it.note].join(' ').toLowerCase().includes(q)) return '';
      return `<tr data-i="${i}">
        <td><input class="input" data-f="category" value="${esc(it.category)}" list="ced-cats" maxlength="80"></td>
        <td><input class="input ced-desc" data-f="description" value="${esc(it.description)}" maxlength="200"></td>
        <td><input class="input" data-f="provider" value="${esc(it.provider)}" maxlength="80"></td>
        <td><input class="input ced-num" data-f="price" value="${it.price == null ? '' : esc(it.price)}" inputmode="decimal" placeholder="${esc(T('on request'))}"></td>
        <td><input class="input ced-cur" data-f="currency" value="${esc(it.currency)}" list="ced-curs" maxlength="3"></td>
        <td class="ced-c"><input type="checkbox" data-f="vatStripped" ${it.vatStripped ? 'checked' : ''}></td>
        <td><input class="input" data-f="note" value="${esc(it.note)}" maxlength="400"></td>
        <td><input class="input" data-f="link" value="${esc(it.link)}" maxlength="500" placeholder="https://"></td>
        <td class="ced-c ced-act"><button type="button" title="${esc(T('Duplicate'))}" data-ced="dup">⧉</button><button type="button" title="${esc(T('Delete'))}" data-ced="del">✕</button></td></tr>`;
    }).join('');
    const cats = [...new Set(draft.items.map(i => i.category))];
    document.getElementById('ced-rows').innerHTML = rows +
      `<datalist id="ced-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="ced-curs">${curOpts()}</datalist>`;
    document.getElementById('ced-count').textContent = `${draft.items.length} ${T('items')} · ${cats.length} ${T('categories')}`;
  }
  function renderFrom() {
    const all = sources();
    document.getElementById('ced-from').innerHTML = Object.entries(all).map(([k, s]) =>
      `<button type="button" class="btn" data-ced-from="${k}">${esc(s.label)} <span class="ced-n">${s.items.length}</span></button>`).join('');
  }
  function renderSourceBox() {
    const box = document.getElementById('ced-source'); if (!box) return;
    const src = getSource();
    if (!src) { box.innerHTML = ''; return; }
    const when = src.lastSync ? new Date(src.lastSync).toLocaleString() : '—';
    const share = location.origin + location.pathname + '?catalog=' + encodeURIComponent(src.url);
    box.innerHTML = `<div class="ced-src">
      <div><b>${esc(T('Connected'))}:</b> <code>${esc(src.url)}</code></div>
      <div>${esc(T('Last checked'))}: ${esc(when)}${src.revision ? ' · ' + esc(T('Revision')) + ' ' + esc(src.revision) : ''}${syncing ? ' · ' + esc(T('checking…')) : ''}</div>
      ${lastError ? `<div class="ced-err">${esc(T('Last check failed'))}: ${esc(lastError)}. ${esc(T('Using the last good copy.'))}</div>` : ''}
      <div class="ced-row"><button type="button" class="btn" data-ced="syncnow">↻ ${esc(T('Check now'))}</button>
        <button type="button" class="btn" data-ced="copylink">🔗 ${esc(T('Copy link for your team'))}</button>
        <button type="button" class="btn btn-ghost" data-ced="disconnect">${esc(T('Disconnect'))}</button></div>
      <p class="ced-hint">${esc(T('The link opens Quote with this catalog; each person confirms it once.'))} <code>${esc(share)}</code></p></div>`;
  }
  function onEditorInput(e) {
    if (e.target.id === 'ced-q') { edFilter = e.target.value; renderRows(); return; }
    if (e.target.id === 'ced-name') { draft.name = e.target.value; draftDirty = true; return; }
    if (e.target.id === 'ced-rev') { draft.revision = e.target.value; draftDirty = true; return; }
    if (e.target.id === 'ced-dcur') { draft.defaults.currency = e.target.value.toUpperCase(); draftDirty = true; return; }
    if (e.target.id === 'ced-dvat') { draft.defaults.vatRate = e.target.value; draftDirty = true; return; }
    const tr = e.target.closest('tr[data-i]'), f = e.target.dataset.f;
    if (!tr || !f || f === 'vatStripped') return;
    const it = draft.items[+tr.dataset.i];
    it[f] = f === 'currency' ? e.target.value.toUpperCase() : e.target.value;
    draftDirty = true;
  }
  function onEditorChange(e) {
    if (e.target.id === 'ced-file') { const file = e.target.files[0]; e.target.value = ''; if (file) file.text().then(txt => importText(txt, file.name)); return; }
    const tr = e.target.closest('tr[data-i]');
    if (tr && e.target.dataset.f === 'vatStripped') { draft.items[+tr.dataset.i].vatStripped = e.target.checked; draftDirty = true; }
    if (tr && e.target.dataset.f === 'price') { const p = parsePrice(e.target.value); draft.items[+tr.dataset.i].price = p; e.target.value = p == null ? '' : p; }
  }
  function importText(text, name) {
    let cat;
    try { cat = parseAny(text, (name || '').replace(/\.[^.]+$/, '')); }
    catch (err) { catToast(T('Import failed') + ': ' + err.message, 'err'); return; }
    if (!cat.items.length) { catToast(T('Import failed') + ': ' + T('The file has no items'), 'err'); return; }
    const append = document.getElementById('ced-append').checked;
    draft.items = append ? draft.items.concat(cat.items) : cat.items;
    if (!append) {
      if (cat.name) { draft.name = cat.name; document.getElementById('ced-name').value = cat.name; }
      draft.revision = cat.revision; document.getElementById('ced-rev').value = cat.revision;
      if (cat.hiddenCategories) draft.hiddenCategories = cat.hiddenCategories;
      if (cat.disclaimer) draft.disclaimer = cat.disclaimer;
      if (cat.defaults) {
        draft.defaults = Object.assign({}, cat.defaults);
        document.getElementById('ced-dcur').value = draft.defaults.currency || '';
        document.getElementById('ced-dvat').value = draft.defaults.vatRate != null ? draft.defaults.vatRate : '';
      }
    }
    draftDirty = true; renderRows(); showTab('items');
    catToast(`✓ ${cat.items.length} ${T('items imported')}` + (cat.dropped ? ` · ${cat.dropped} ${T('skipped (no description)')}` : ''));
  }
  function cleanDraft() {
    return cleanCatalog({ name: draft.name, revision: draft.revision, items: draft.items, hiddenCategories: draft.hiddenCategories, disclaimer: draft.disclaimer, defaults: draft.defaults }, T('My catalog'));
  }
  async function onEditorClick(e) {
    const tab = e.target.closest('[data-ced-tab]'); if (tab) { showTab(tab.dataset.cedTab); return; }
    const from = e.target.closest('[data-ced-from]');
    if (from) {
      const s = sources()[from.dataset.cedFrom];
      if (draft.items.length && !(await ask(T('Replace the items?'), esc(T('The items in the editor are replaced with a copy of') + ' ' + s.label + '.'), T('Replace')))) return;
      draft.items = s.items.map(i => Object.assign({}, i)); draft.hiddenCategories = hiddenList(from.dataset.cedFrom).slice();
      draft.defaults = Object.assign({}, s.defaults);
      document.getElementById('ced-dcur').value = draft.defaults.currency || '';
      document.getElementById('ced-dvat').value = draft.defaults.vatRate != null ? draft.defaults.vatRate : '';
      draftDirty = true; renderRows(); showTab('items'); return;
    }
    const b = e.target.closest('[data-ced]'); if (!b) return;
    const act = b.dataset.ced, tr = b.closest('tr[data-i]');
    if (act === 'close') return requestClose();
    if (act === 'add') {
      const last = draft.items[draft.items.length - 1];
      draft.items.push({ category: last ? last.category : 'General', description: '', provider: '', price: null, currency: appState.config.targetCurrency || 'USD', note: '', vatStripped: false, link: '' });
      draftDirty = true; edFilter = ''; document.getElementById('ced-q').value = ''; renderRows();
      const rows = document.querySelectorAll('#ced-rows tr'); const r = rows[rows.length - 1];
      if (r) { r.scrollIntoView({ block: 'nearest' }); r.querySelector('.ced-desc').focus(); }
      return;
    }
    if (act === 'dup' && tr) { const i = +tr.dataset.i; draft.items.splice(i + 1, 0, Object.assign({}, draft.items[i])); draftDirty = true; renderRows(); return; }
    if (act === 'del' && tr) { draft.items.splice(+tr.dataset.i, 1); draftDirty = true; renderRows(); return; }
    if (act === 'paste') { const v = document.getElementById('ced-paste').value; if (v.trim()) { importText(v, ''); document.getElementById('ced-paste').value = ''; } return; }
    if (act === 'json') { const c = cleanDraft(); return download(fileName(c, 'json'), toJSON(c), 'application/json'); }
    if (act === 'csv') { const c = cleanDraft(); return download(fileName(c, 'csv'), toCSV(c.items), 'text/csv;charset=utf-8'); }
    if (act === 'tpl') return download('quote-catalog-template.csv', toCSV([{ category: 'Servicios', description: 'Ejemplo: instalación', provider: '', price: 1500, currency: 'MXN', vatStripped: false, note: '', link: '' }]), 'text/csv;charset=utf-8');
    if (act === 'connect') { const u = document.getElementById('ced-url').value; if (await connect(u)) { catToast('✓ ' + T('Connected')); closeEditor(); openCatalog(); } return; }
    if (act === 'syncnow') return sync(true);
    if (act === 'disconnect') { if (await ask(T('Disconnect the published catalog?'), esc(T('Quote stops checking it. Items already on your quote stay.')), T('Disconnect'))) disconnect(); return; }
    if (act === 'copylink') {
      const src = getSource(); if (!src) return;
      const link = location.origin + location.pathname + '?catalog=' + encodeURIComponent(src.url);
      try { await navigator.clipboard.writeText(link); catToast('✓ ' + T('Link copied')); } catch (err) { prompt(T('Copy link for your team'), link); }
      return;
    }
    if (act === 'save') {
      const c = cleanDraft();
      if (!c.items.length) { catToast(T('Add at least one item with a description'), 'err'); return; }
      if (getMine() && draftOrigin !== 'mine' && !(await ask(T('Replace My catalog?'), esc(T('You already have a catalog saved in this browser. Saving replaces it. Export it first if you want to keep it.')), T('Replace')))) return;
      if (!lsSet(LS_MINE, { name: c.name, revision: c.revision, items: c.items, hiddenCategories: c.hiddenCategories || [], disclaimer: c.disclaimer, defaults: c.defaults, saved: new Date().toISOString() })) return;
      appState.hiddenCats = Object.assign({}, appState.hiddenCats, { mine: c.hiddenCategories || [] });
      activate('mine', false, true); draftDirty = false; closeEditor();
      catToast(`✓ ${T('Saved')}: ${c.name} · ${c.items.length} ${T('items')}` + (c.dropped ? ` · ${c.dropped} ${T('skipped (no description)')}` : ''));
      if (document.getElementById('cat-modal').classList.contains('open')) renderCatalog();
    }
  }
  document.addEventListener('keydown', e => {
    const m = document.getElementById('ced-modal');
    if (e.key === 'Escape' && m && m.classList.contains('open')) { e.stopImmediatePropagation(); requestClose(); }
  }, true);

  /* ───────────── boot ───────────── */
  // Runs after loadState(). Returns what the page should do once its UI is up.
  function boot() {
    if (!appState.activeCatalog) {
      // First run of this version: a catalog that came in through "Load config…" becomes My catalog, so nothing is lost.
      const saved = appState.catalog || [], gen = GENERAL_CATALOG;
      const custom = saved.length && (saved.length !== gen.length || saved.some((x, i) => x.description !== gen[i].description));
      if (custom && !getMine()) lsSet(LS_MINE, { name: appState.config.orgName || T('My catalog'), items: cleanCatalog({ items: saved }).items, saved: new Date().toISOString() });
      appState.activeCatalog = custom ? 'mine' : 'general';
    }
    let open = false, pendingUrl = null;
    const p = new URLSearchParams(location.search).get('catalog');
    if (p && (LINE_CATALOGS[p] || p === 'general' || p === 'mine')) { appState.activeCatalog = p; open = true; }
    else if (p && /^https?:\/\//i.test(p)) pendingUrl = p;
    activate(appState.activeCatalog, true);
    return { open, pendingUrl };
  }
  async function afterBoot(info) {
    startSync();
    if (info.pendingUrl) {
      const u = normalizeUrl(info.pendingUrl), src = getSource();
      history.replaceState(null, '', location.pathname + location.hash);
      if (!u) { catToast(T('Use an https:// address'), 'err'); return; }
      if (src && src.url === u) { activate('hosted'); openCatalog(); return; }
      const ok = await ask(T('Use a published catalog?'),
        `${esc(T('This link connects Quote to a catalog published at'))} <b>${esc(hostOf(u))}</b>. ${esc(T('Quote will read it and check it for updates each time it opens. Your current quote is not changed.'))}<br><code style="word-break:break-all">${esc(u)}</code>`,
        T('Use this catalog'));
      if (ok && await connect(u)) { startSync(); openCatalog(); }
      return;
    }
    if (info.open) { openCatalog(); offerDefaults(sources()[appState.activeCatalog]); }
  }

  // A config or catalog file loaded from the Export menu (or dropped) becomes My catalog.
  function adopt(json) {
    let c; try { c = cleanCatalog(fromJSON(json), json.organization && json.organization.name); } catch (e) { return; }
    if (!c.items.length) return;
    lsSet(LS_MINE, { name: c.name, revision: c.revision, items: c.items, hiddenCategories: c.hiddenCategories || [], disclaimer: c.disclaimer, defaults: c.defaults, saved: new Date().toISOString() });
    if (c.hiddenCategories) appState.hiddenCats = Object.assign({}, appState.hiddenCats, { mine: c.hiddenCategories });
    activate('mine', true);
  }
  // A dropped .csv: open the editor on the current catalog and import into it, for review before saving.
  function importInEditor(text, name) { openEditor(); importText(text, name); }

  window.QuoteCatalog = { stamp, revisionLine, shareUrl, boot, adopt, importInEditor, afterBoot, renderSwitch, isHidden, hiddenList, activeLabel, openEditor, safeLink, parseAny, toCSV, toJSON };
})();
