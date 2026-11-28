/* PACTOX · atualização do app instalado (PWA) sem reinstalar.
   1) registra o service worker (sw.js) com escopo ./ (o mesmo do manifesto: o ícone já instalado no iPhone continua valendo);
   2) procura versão nova ao abrir, ao voltar para o app e a cada 30 min;
   3) quando há versão nova baixada, mostra um aviso discreto “Nova versão disponível · Atualizar”;
   4) ao tocar em Atualizar, ativa a versão nova e recarrega. Nada é atualizado no meio do uso sem a pessoa pedir. */
(function () {
  'use strict';
  const BUILD = window.PACTO_BUILD || { version: 'dev' };
  window.PactoPWA = { version: BUILD.version, check: () => {} };
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (!/^https:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  // Trusted Types (CSP): só esta política pode criar a URL do worker, e só para ./sw.js
  let swUrl = './sw.js';
  try { if (window.trustedTypes && trustedTypes.createPolicy) swUrl = trustedTypes.createPolicy('pactox-sw', { createScriptURL: (u) => { if (u === './sw.js') return u; throw new TypeError('URL de worker recusada'); } }).createScriptURL('./sw.js'); } catch (e) { /* política já criada ou indisponível */ }
  let reg = null, refreshing = false, wantReload = false, lastCheck = 0, banner = null;
  function showBanner(worker) {
    if (banner || !worker) return;
    const el = (tag, props, ...kids) => { const n = document.createElement(tag); Object.assign(n, props || {}); kids.forEach((k) => k && n.append(k)); return n; };
    const btn = el('button', { type: 'button', className: 'pwa-update-btn', textContent: 'Atualizar' });
    const close = el('button', { type: 'button', className: 'pwa-update-x', textContent: '×', title: 'Agora não' });
    close.setAttribute('aria-label', 'Agora não');
    banner = el('div', { className: 'pwa-update glass', id: 'pwa-update' }, el('span', { className: 'pwa-update-dot' }), el('span', { className: 'pwa-update-txt', textContent: 'Nova versão disponível' }), btn, close);
    banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
    btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = 'Atualizando…'; wantReload = true; worker.postMessage({ type: 'SKIP_WAITING' }); setTimeout(() => { if (!refreshing) location.reload(); }, 4000); });
    close.addEventListener('click', () => { banner.remove(); banner = null; });
    document.body.append(banner);
  }
  function watch(w) { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showBanner(w); }); }
  // alguns motores (Safari/WebKit) não avisam a troca de estado do worker de forma confiável: confere também por sondagem curta
  function scan(tries) {
    if (!reg || banner) return;
    if (reg.waiting && navigator.serviceWorker.controller) { showBanner(reg.waiting); return; }
    if (reg.installing && tries > 0) setTimeout(() => scan(tries - 1), 1000);
  }
  function check(force) {
    if (!reg) return; const now = Date.now(); if (!force && now - lastCheck < 60000) return; lastCheck = now;
    reg.update().then(() => scan(30)).catch(() => scan(0));
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!wantReload || refreshing) return; refreshing = true; location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: './', updateViaCache: 'none' }).then((r) => {
      reg = r; window.PactoPWA.check = () => check(true);
      if (r.waiting && navigator.serviceWorker.controller) showBanner(r.waiting);
      r.addEventListener('updatefound', () => { watch(r.installing); scan(30); });
      check(true);
    }).catch(() => { /* sem service worker o app funciona normalmente, só sem o aviso */ });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
  window.addEventListener('focus', () => check(false));
  setInterval(() => check(true), 30 * 60 * 1000);
})();
