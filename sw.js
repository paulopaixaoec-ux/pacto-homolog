/* PACTOX · service worker de atualização do app instalado (PWA).
   Guarda SÓ os arquivos estáticos do próprio site (HTML, CSS, JS, fontes, ícones) para que cada versão abra inteira e igual.
   NUNCA intercepta nem guarda chamadas da API (Supabase / pacto-api), tokens, comprovantes ou dados financeiros:
   pedidos de outra origem e pedidos que não são GET passam direto para a rede. */
'use strict';
const VERSION = '8.2.1-int.3';
const CACHE = 'pactox-shell-' + VERSION;
const ASSETS = [
"./",
"./brand/apple-touch-icon.png",
"./brand/favicon.ico",
"./brand/icon-16.png",
"./brand/icon-192.png",
"./brand/icon-32.png",
"./brand/icon-48.png",
"./brand/icon-512.png",
"./brand/icon-maskable-192.png",
"./brand/icon-maskable-512.png",
"./brand/pacto-icon-maskable.svg",
"./brand/pacto-icon-small.svg",
"./brand/pacto-icon.svg",
"./brand/pacto-logo-dark.svg",
"./brand/pacto-logo-horizontal-dark.svg",
"./brand/pacto-logo-horizontal.svg",
"./brand/pacto-logo.svg",
"./brand/pacto-mark-dark.svg",
"./brand/pacto-mark-mono-petrol.svg",
"./brand/pacto-mark-mono-white.svg",
"./brand/pacto-mark-small-dark.svg",
"./brand/pacto-mark-small.svg",
"./brand/pacto-mark.svg",
"./brand/pacto-wordmark.svg",
"./css/app.css",
"./css/assinatura.css",
"./css/empresas.css",
"./css/studio.css",
"./fonts/inter-latin-ext-wght-normal.woff2",
"./fonts/inter-latin-wght-normal.woff2",
"./icon.svg",
"./index.html",
"./js/api.js",
"./js/app.js",
"./js/areas.js",
"./js/aura.js",
"./js/config.js",
"./js/core.js",
"./js/empresas.js",
"./js/hingabexit.js",
"./js/pwa.js",
"./js/px-accents.js",
"./js/remote.js",
"./js/seed.js",
"./js/studio-theme-lib.js",
"./js/studio.js",
"./js/temas-especiais-engine.js",
"./js/temas-especiais-fixtures.js",
"./js/ui.js",
"./js/vendor/supabase.js",
"./js/version.js",
"./js/welcome.js",
"./manifest.webmanifest"
];
const INDEX = new URL('./index.html', self.location).href;

self.addEventListener('install', (e) => {
  // baixa a versão nova inteira, direto da rede (sem cache HTTP); fica "esperando" até a pessoa tocar em Atualizar
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('pactox-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // Supabase, clima etc.: sempre rede, nada guardado
  if (r.mode === 'navigate') {
    // abertura do app (inclusive links de confirmação/recuperação com #… ou ?…): o HTML desta versão
    e.respondWith(caches.open(CACHE).then((c) => c.match(INDEX)).then((hit) => hit || fetch(r)).catch(() => fetch(r)));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(r)).then((hit) => hit || fetch(r)));
});
