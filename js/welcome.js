/* PACTO 8.2 · painel de boas-vindas da tela Início (puro, sem DOM). Navegador: window.PactoWelcome · Node: require.
   Saudação pela hora local, data em pt-BR, resumo calculado só com os dados que o app já recebe (RLS/pacto-api)
   e clima opcional via Open-Meteo (sem chave, sem geolocalização: só a cidade que a pessoa escolher).
   Clima: cache local de 45 min por cidade; se a chamada falhar, devolve null e a tela mostra "indisponível" — nunca inventa valores. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PactoWelcome = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function greeting(d) { const h = (d || new Date()).getHours(); return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function firstName(name) {
    const s = String(name || '').replace(/^\s*(\[[^\]]*\]\s*)+/, '').trim();
    return s.split(/\s+/)[0] || '';
  }
  function dateLabel(d, lang) {
    const s = (d || new Date()).toLocaleDateString(lang || 'pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const OPEN = ['pending', 'partial', 'late'];
  const GONE = ['replaced', 'consolidated'];
  const rem = (s) => s.amountCents - (s.paidCents || 0) - (s.discountCents || 0);
  /* resumo: só dados existentes. ags = acordos que a pessoa vê; me = id dela; td = 'AAAA-MM-DD' local. */
  function summary(ags, me, td) {
    const month = td.slice(0, 7);
    const out = { next: [], paidMonth: { cents: 0, n: 0 }, receivedMonth: { cents: 0, n: 0 }, overdue: 0, review: 0, early: [] };
    (ags || []).forEach((a) => {
      const role = a.sellerId === me ? 'seller' : a.buyerId === me ? 'buyer' : null;
      if (!role) return;
      const cur = a.currency || 'BRL';
      (a.schedule || []).forEach((s) => {
        if (GONE.includes(s.status)) return;
        (s.reports || []).forEach((r) => {
          if (r.status === 'approved' && String(r.paidAt || '').slice(0, 7) === month && cur === 'BRL') {
            const bucket = role === 'buyer' ? out.paidMonth : out.receivedMonth; bucket.cents += r.amountCents || 0; bucket.n++;
          }
        });
        if (a.status !== 'active') return;
        if (s.status === 'review') out.review++;
        if (OPEN.includes(s.status) && !s.earlyId && rem(s) > 0) {
          if (s.due < td && !s.delayId) out.overdue++;
          else if (s.due >= td) out.next.push({ agId: a.id, title: a.title, due: s.due, cents: rem(s), currency: cur, role });
        }
      });
      (a.early || []).forEach((e) => {
        const mine = (e.status === 'awaiting_buyer' && role === 'buyer') || (e.status === 'awaiting_seller' && role === 'seller') || (e.status === 'accepted' && role === 'buyer');
        if (mine && (e.discountCents || 0) > 0) out.early.push({ agId: a.id, earlyId: e.id, title: a.title, discountCents: e.discountCents, netCents: e.netCents, status: e.status, currency: cur });
      });
    });
    out.next.sort((x, y) => x.due.localeCompare(y.due) || x.title.localeCompare(y.title));
    out.next = out.next.slice(0, 3);
    return out;
  }
  /* WMO weather codes (Open-Meteo) → texto curto pt-BR */
  const WMO = { 0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa fraca', 53: 'Garoa', 55: 'Garoa forte', 56: 'Garoa gelada', 57: 'Garoa gelada', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 66: 'Chuva gelada', 67: 'Chuva gelada', 71: 'Neve fraca', 73: 'Neve', 75: 'Neve forte', 77: 'Neve', 80: 'Pancadas de chuva', 81: 'Pancadas de chuva', 82: 'Pancadas fortes', 85: 'Neve', 86: 'Neve', 95: 'Trovoadas', 96: 'Trovoadas com granizo', 99: 'Trovoadas com granizo' };
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const FC = 'https://api.open-meteo.com/v1/forecast';
  const TTL = 45 * 60 * 1000, FAIL_TTL = 5 * 60 * 1000;
  function cityLabel(c) { return c ? [c.name, c.admin1, c.country_code || c.country].filter(Boolean).join(', ') : ''; }
  function createWeather(opts) {
    const o = opts || {};
    const doFetch = o.fetch || ((u) => fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer' }));
    const store = o.storage || null; const now = o.now || (() => Date.now());
    const mem = new Map();
    const key = (c) => 'pacto8:wx:' + Number(c.latitude).toFixed(2) + ',' + Number(c.longitude).toFixed(2);
    function readCache(k) {
      if (mem.has(k)) return mem.get(k);
      try { const v = store && JSON.parse(store.getItem(k) || 'null'); if (v) mem.set(k, v); return v; } catch (e) { return null; }
    }
    function writeCache(k, v) { mem.set(k, v); try { if (store) store.setItem(k, JSON.stringify(v)); } catch (e) { /* cota cheia: só memória */ } }
    async function getJSON(u) { const r = await doFetch(u); if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); return r.json(); }
    async function search(q) {
      const term = String(q || '').trim().slice(0, 60);
      if (term.length < 2) return [];
      try {
        const j = await getJSON(GEO + '?name=' + encodeURIComponent(term) + '&count=6&language=pt&format=json');
        return (j && Array.isArray(j.results) ? j.results : []).filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && c.name)
          .map((c) => ({ name: String(c.name), admin1: c.admin1 ? String(c.admin1) : '', country: c.country ? String(c.country) : '', country_code: c.country_code ? String(c.country_code) : '', latitude: c.latitude, longitude: c.longitude }));
      } catch (e) { return null; }
    }
    /* devolve { tempC, code, text, at, cached } ou null (indisponível) */
    async function current(c) {
      if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
      const k = key(c), hit = readCache(k), t = now();
      if (hit && hit.ok && t - hit.at < TTL) return { ...hit.ok, cached: true };
      if (hit && hit.fail && t - hit.at < FAIL_TTL) return null;
      try {
        const j = await getJSON(FC + '?latitude=' + c.latitude + '&longitude=' + c.longitude + '&current=temperature_2m,weather_code&timezone=auto');
        const cu = j && j.current; const temp = cu && cu.temperature_2m, code = cu && cu.weather_code;
        if (!Number.isFinite(temp) || !Number.isInteger(code)) throw new Error('resposta sem dados');
        const ok = { tempC: Math.round(temp), code, text: WMO[code] || '', at: t };
        writeCache(k, { at: t, ok }); return { ...ok, cached: false };
      } catch (e) { writeCache(k, { at: t, fail: true }); return null; }
    }
    return { search, current, key };
  }
  return { greeting, firstName, dateLabel, summary, createWeather, cityLabel, WMO, TTL };
});
