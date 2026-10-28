/* carino-fx.js — shared exchange rates for the Carino fleet.
   Canonical copy: Currency/carino-fx.js. Carino-Systems/propagate.sh copies it to the sites that convert money
   (Quote). Do not edit a site's copy.

   One snapshot of reference rates, kept in USD terms and shared across *.carino.systems:
     • sources, in order: the ECB reference rates through Frankfurter (api.frankfurter.dev — the old
       api.frankfurter.app answers with a 301 that fails CORS), then open.er-api.com for the currencies
       the ECB does not publish (COP, ARS, CLP, PEN…) or when Frankfurter is down;
     • subdomains do not share localStorage, so the snapshot also travels in a small cookie on
       .carino.systems (like carino-lang.js). A rate fetched on currency.carino.systems is reused by
       quote.carino.systems, and the other way round, until it is SIX hours old;
     • nothing about the visitor is sent: the requests carry no query beyond the base currency.

   API (window.CarinoFX):
     await CarinoFX.latest({ need: ['MXN','COP'], force: false })  →  snapshot | null
     CarinoFX.peek()                     → the cached snapshot, no network (or null)
     CarinoFX.rate(snap, from, to)       → units of `to` per 1 `from`, or null when unknown
     CarinoFX.describe(snap, code)       → 'ECB' | 'open.er-api.com' (who published that currency's rate)
   snapshot = { b: 'USD', d: '2026-10-27' (publication date), t: fetched ms, s: 'ECB'|'ER', r: { MXN: 18.4, … }, e: ['COP', …] }
     r[X] = X per 1 USD.  e = codes taken from open.er-api.com (empty when ECB covered everything). */
(function () {
  'use strict';
  if (window.CarinoFX) return;
  var KEY = 'carino_fx', TTL = 6 * 3600 * 1000, TIMEOUT = 8000;
  // Kept in the cookie. Everything else stays in this site's localStorage copy only.
  var SHARE = ['USD', 'EUR', 'MXN', 'CAD', 'JPY', 'GBP', 'CHF', 'CNY', 'BRL', 'COP', 'ARS', 'CLP', 'PEN', 'KRW', 'INR', 'AUD',
    'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'SGD', 'HKD', 'ILS', 'THB', 'IDR', 'PHP', 'MYR', 'RUB', 'GTQ', 'CRC', 'UYU'];
  var onCarino = /(^|\.)carino\.systems$/.test(location.hostname);

  function readCookie() {
    var m = document.cookie.match(/(?:^|;\s*)carino_fx=([^;]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  function readLocal() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function valid(s) { return s && s.b === 'USD' && s.r && typeof s.t === 'number'; }
  function newest(a, b) { return !valid(a) ? (valid(b) ? b : null) : !valid(b) ? a : (b.t > a.t ? b : a); }

  function peek() { return newest(readLocal(), readCookie()); }

  function store(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* quota / private mode */ }
    if (!onCarino || location.protocol !== 'https:') return;
    var r = {}; SHARE.forEach(function (c) { if (s.r[c] != null) r[c] = +(+s.r[c]).toPrecision(7); });
    var small = { b: 'USD', d: s.d, t: s.t, s: s.s, r: r, e: (s.e || []).filter(function (c) { return r[c] != null; }) };
    document.cookie = 'carino_fx=' + encodeURIComponent(JSON.stringify(small)) +
      '; Max-Age=' + (TTL / 1000) + '; Domain=.carino.systems; Path=/; SameSite=Lax; Secure';
  }

  function getJSON(url) {
    var ctl = new AbortController(), kill = setTimeout(function () { ctl.abort(); }, TIMEOUT);
    return fetch(url, { signal: ctl.signal, credentials: 'omit', cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(url.split('/')[2] + ' HTTP ' + res.status); return res.json(); })
      .finally(function () { clearTimeout(kill); });
  }
  function fromECB() {
    return getJSON('https://api.frankfurter.dev/v1/latest?base=USD').then(function (j) {
      var r = j.rates || {}; r.USD = 1;
      return { b: 'USD', d: j.date || '', t: Date.now(), s: 'ECB', r: r, e: [] };
    });
  }
  function fromER() {
    return getJSON('https://open.er-api.com/v6/latest/USD').then(function (j) {
      if (j.result && j.result !== 'success') throw new Error('open.er-api.com: ' + j.result);
      var r = j.rates || {}; r.USD = 1;
      var d = j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) : '';
      return { b: 'USD', d: d, t: Date.now(), s: 'ER', r: r, e: Object.keys(r) };
    });
  }
  function missing(s, need) { return (need || []).filter(function (c) { return c && s.r[c] == null; }); }

  var inflight = null;
  function latest(opts) {
    opts = opts || {};
    var need = opts.need || [], have = peek();
    if (!opts.force && have && Date.now() - have.t < TTL && !missing(have, need).length) return Promise.resolve(have);
    if (inflight) return inflight;
    inflight = fromECB().then(function (s) {
      var gap = missing(s, need.concat(SHARE));
      if (!gap.length) return s;
      // Fill only the gaps from open.er-api.com; the ECB numbers stay ECB numbers.
      return fromER().then(function (x) {
        gap.forEach(function (c) { if (x.r[c] != null) { s.r[c] = x.r[c]; s.e.push(c); } });
        return s;
      }).catch(function () { return s; });
    }).catch(function () { return fromER(); })
      .then(function (s) { store(s); return s; })
      .catch(function () { return have || null; })   // offline: the last good snapshot, however old
      .finally(function () { inflight = null; });
    return inflight;
  }

  function rate(s, from, to) {
    if (from === to) return 1;
    if (!valid(s)) return null;
    var a = s.r[from], b = s.r[to];
    return a && b ? b / a : null;
  }
  function describe(s, code) {
    if (!valid(s)) return '';
    return (s.s === 'ER' || (s.e || []).indexOf(code) >= 0) ? 'open.er-api.com' : 'ECB';
  }

  window.CarinoFX = { latest: latest, peek: peek, rate: rate, describe: describe, TTL: TTL };
})();
