/* PACTO 8.0 + 8.1 · aplicação (views + roteador). Toda leitura/escrita passa por PactoAPI, que aplica as regras de acesso. */
(function () {
  'use strict';
  const C = window.PactoCore, U = window.UI, Seed = window.PactoSeed;
  const { h, icon, t, money, date, dateShort, toast, sheet, closeSheet, pill, field, seg, toggle, progress, ring, empty, avatar } = U;
  const clock = { now: () => new Date() };
  /* 8.2: modo "supabase" (contas reais, banco compartilhado) quando js/config.js traz URL + chave pública;
     senão, o modo local 8.1 (demonstração no navegador) continua funcionando igual. */
  const CFG = window.PACTO_CONFIG || {};
  const BOOT_URL = { hash: location.hash || '', search: location.search || '' }; // links de e-mail (recuperação de senha): lidos antes de o supabase-js limpar a URL
  const REMOTE = CFG.mode === 'supabase' && !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase && window.PactoRemote);
  const adapter = REMOTE ? null : window.PactoAPI.localStorageAdapter('pacto8');
  const api = REMOTE
    ? window.PactoRemote.createRemoteAPI({
      supabase: window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pacto82-auth' } }),
      functionsUrl: CFG.functionsUrl || CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1', anonKey: CFG.supabaseAnonKey, clock,
      redirectTo: CFG.redirectTo || (location.origin + location.pathname), functionsRegion: CFG.functionsRegion || '' })
    : window.PactoAPI.createPactoAPI({ adapter, clock });
  const ENV_LABEL = REMOTE ? (CFG.envLabel || 'Homologação 8.2') : 'Demonstração local';
  if (!REMOTE) window.__pacto = { api, C }; // depuração local (só no modo demonstração)

  const S = {
    token: sessionStorage.getItem('pacto8:token'), me: null, ags: [], cons: [], ntf: [], feed: [], people: {},
    homeRole: sessionStorage.getItem('pacto8:homeRole') || null, collapsed: localStorage.getItem('pacto8:ui:collapsed') === '1',
    filters: { ag: 'all', agq: '', pay: 'upcoming', payq: '', inst: {}, cl: 'all', clq: '', clSort: 'next' }, dash: null,
    cal: { view: 'month', cursor: null, sel: null, role: 'all', discreet: sessionStorage.getItem('pacto8:discreet') === '1' }, wiz: null, lastAct: Date.now(), lastTouch: 0, loading: true, locked: false, authMode: 'login', menu: false,
  };
  const $root = () => document.getElementById('root');
  const today = () => api.today();
  const meId = () => S.me && S.me.id;
  const role = (a) => C.roleOf(a, meId());
  const person = (id, a) => S.people[id] || { id, name: (a && a.buyerEmail) || 'Convidado', photo: '' };
  const other = (a) => person(C.counterpartOf(a, meId()), a);
  const findAg = (id) => S.ags.find((a) => a.id === id);
  const cur = (a) => (a && a.currency) || 'BRL';
  const isRec = (a) => a && a.billing === 'recurring';
  const BILL = C.BILLING_LABEL;
  const PER = { weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', custom: 'Personalizada' };
  const perLabel = (tm) => (tm.periodicity === 'custom' ? `a cada ${tm.intervalDays} dias` : PER[tm.periodicity].toLowerCase());
  const agIcon = (a) => U.catIcon(a.category, a.group);
  const CHG = { start: 'o início do contrato', suspend: 'suspender o contrato', resume: 'retomar o contrato', readjust: 'reajustar o contrato', cancel: 'cancelar o contrato', renew: 'renovar o contrato' };
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  const route = () => { const p = (location.hash || '#/inicio').slice(2).split('/'); return { page: p[0] || 'inicio', id: p[1], sub: p[2] }; };
  const statusRank = { review: 0, correction: 1, overdue: 2, partial: 3, pending: 4, paid: 5, replaced: 6, consolidated: 7 };

  /* ---------- API wrapper ---------- */
  async function call(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); await refresh(); return r ?? true; }
    catch (e) { handleErr(e); return null; }
  }
  function handleErr(e) {
    if (!e) return;
    if (e.code === 'LOCKED') { showLock(); return; }
    if (e.code === 'EXPIRED' || e.code === 'UNAUTHENTICATED') { signOutLocal(); toast(e.message, 'err'); return; }
    if (e.code === 'MFA_ENROLL_REQUIRED') { toast(e.message, 'err'); mfaSetup().then((ok) => { S.mfaOn = undefined; mfaProbe(); if (ok) refresh(); }); return; }
    console.warn(e);
    toast(e.message || 'Algo deu errado.', 'err');
  }
  async function refresh() {
    if (!S.token) return render();
    try {
      const [me, ags, cons, ntf, feed, people, dash] = await Promise.all([api.me(S.token), api.listAgreements(S.token), api.listConsolidations(S.token), api.listNotifications(S.token), api.feed(S.token, 80), api.contacts(S.token), api.dashboards(S.token)]);
      Object.assign(S, { me, ags, cons, ntf, feed, dash, loading: false });
      if (S.homeRole === 'recurring' && !dash.hasRecurring) S.homeRole = null;
      S.people = Object.fromEntries(people.map((p) => [p.id, p]));
      if (!S.homeRole) S.homeRole = ags.some((a) => a.sellerId === me.id) && !ags.some((a) => a.buyerId === me.id) ? 'seller' : 'buyer';
      applyPrefs();
    } catch (e) { if (e.code === 'LOCKED') { S.loading = false; showLock(); return; } handleErr(e); }
    render();
    mfaProbe();
  }
  function signOutLocal() { S.token = null; S.me = null; S.mfaOn = undefined; S.forgotUntil = 0; sessionStorage.removeItem('pacto8:token'); hideLock(); closeSheet(true); render(); }
  function applyPrefs() {
    const me = S.me; if (!me) return;
    U.setLang(me.lang);
    const dark = me.theme === 'dark' || (me.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#071a18' : '#f5f4ee');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);

  /* ---------- derivações ---------- */
  function statusOf(a) {
    const pv = C.pendingVersion(a);
    if (a.lockedBy) return ['Em proposta de unificação', 'info'];
    if (a.status === 'proposed') return pv && pv.authorId !== meId() ? ['Aguardando sua resposta', 'lime'] : ['Aguardando a outra parte', 'warn'];
    if (a.status === 'active' && pv) return pv.authorId !== meId() ? ['Renegociação para você', 'lime'] : ['Renegociação enviada', 'warn'];
    if (a.status === 'active') return a.schedule.some((s) => C.OPEN.includes(s.status) && s.due < today()) ? ['Ativo · com atraso', 'danger'] : ['Ativo', 'ok'];
    if (a.status === 'settled') return ['Quitado', 'ok'];
    if (a.status === 'consolidated') return ['Unificado em novo acordo', ''];
    if (a.status === 'refused') return ['Proposta recusada', 'danger'];
    return [a.status, ''];
  }
  const INST = { pending: ['A vencer', ''], overdue: ['Atrasada', 'danger'], review: ['Em análise', 'info'], correction: ['Correção solicitada', 'warn'], partial: ['Pagamento parcial', 'warn'], paid: ['Quitada', 'ok'], replaced: ['Substituída na renegociação', ''], consolidated: ['Levada à unificação', ''] };
  const instState = (s) => C.installmentStatus(s, today());
  /* 8.2 · cores de status padronizadas (sempre com texto): verde quitado · azul em análise · âmbar vence em breve · vermelho atrasado · cinza futuro.
     Mesma regra do calendário (C.calendarColor). */
  function instPill(s) {
    const st = instState(s); let [l, k] = INST[st] || [st, ''];
    if (st === 'pending') { const c = C.calendarColor(s, today(), (S.me && S.me.prefs && S.me.prefs.soonDays) || 7); [l, k] = c === 'yellow' ? ['Vence em breve', 'warn'] : c === 'blue' ? ['Em análise', 'info'] : ['A vencer', 'future']; }
    return [l, k];
  }
  const instLabel = (s) => (s.kind === 'down' ? 'Entrada' : s.kind === 'extra' ? 'Extra' : s.kind === 'fee' ? 'Enc.' : String(s.seq || ''));
  function liveSchedule(a) { return a.schedule.filter((s) => !['replaced', 'consolidated'].includes(s.status)).sort((x, y) => x.due.localeCompare(y.due)); }
  function nextOpen(a) { return liveSchedule(a).find((s) => C.OPEN.includes(s.status) || s.status === 'review'); }
  function contracted(a) {
    if (a.terms && a.terms.mode === 'recurring') return C.totals(a).contracted;
    const tm = a.terms || (C.pendingVersion(a) && C.pendingVersion(a).terms);
    if (!tm) return 0;
    return tm.mode === 'recurring' ? tm.amountCents : C.calcPlan(tm).grandTotalCents;
  }
  function pendingActions() {
    const out = []; const me = meId(); const td = today();
    S.ags.forEach((a) => {
      const r = role(a), pv = C.pendingVersion(a);
      if (pv && pv.authorId !== me) out.push({ kind: 'proposal', a, label: a.status === 'active' ? 'Renegociação' : 'Nova proposta', icon: 'handshake', tone: '', go: () => openProposal(a.id) });
      (a.early || []).forEach((e) => {
        if ((e.status === 'awaiting_buyer' && r === 'buyer') || (e.status === 'awaiting_seller' && r === 'seller')) out.push({ kind: 'early', a, e, label: 'Antecipação', icon: 'zap', tone: '', go: () => openEarly(a.id, e.id) });
        if (e.status === 'review' && r === 'seller') out.push({ kind: 'early-review', a, e, label: 'Conferir antecipação', icon: 'eye', tone: '', go: () => openEarlyReview(a.id, e.id) });
        if (e.status === 'accepted' && r === 'buyer') out.push({ kind: 'early-pay', a, e, label: 'Pagar antecipação', icon: 'zap', tone: '', go: () => openEarlyPay(a.id, e.id) });
      });
      (a.delays || []).filter((d) => d.status === 'pending').forEach((d) => { const v = d.versions[d.versions.length - 1]; if (v.authorId !== me) out.push({ kind: 'delay', a, label: r === 'seller' ? 'Justificativa de atraso' : 'Nova data proposta', icon: 'clock', tone: '', go: () => openDelayRespond(a.id, d.id) }); });
      if (a.status !== 'active') return;
      a.schedule.forEach((s) => {
        if (s.status === 'review' && r === 'seller') out.push({ kind: 'review', a, s, label: 'Conferir comprovante', icon: 'eye', tone: '', go: () => openReview(a.id, s.id) });
        if (s.status === 'correction' && r === 'buyer') out.push({ kind: 'correction', a, s, label: 'Corrigir comprovante', icon: 'alert', tone: 'warn', go: () => openPay(a.id, s.id) });
        if (C.OPEN.includes(s.status) && !s.earlyId && !s.delayId && s.due < td && s.status !== 'correction') out.push({ kind: 'overdue', a, s, label: r === 'buyer' ? 'Em atraso' : 'Atraso do cliente', icon: 'alert', tone: 'danger', go: () => (r === 'buyer' ? openPay(a.id, s.id) : go('#/acordo/' + a.id)) });
      });
    });
    S.cons.forEach((c) => { const v = c.versions.find((x) => x.status === 'pending'); if (c.status === 'pending' && v && v.authorId !== me) out.push({ kind: 'consolidation', c, label: 'Unificação', icon: 'layers', tone: '', go: () => openConsolidation(c.id) }); });
    return out;
  }
  const unread = () => S.ntf.filter((n) => !n.read).length;

  /* ---------- shell ---------- */
  const NAV = [['inicio', 'home', 'home'], ['acordos', 'doc', 'agreements'], ['calendario', 'calendar', 'calendar'], ['negociacoes', 'handshake', 'negotiations'], ['mais', 'grid', 'more']];
  const SIDE = [['inicio', 'home', 'home'], ['acordos', 'doc', 'agreements'], ['calendario', 'calendar', 'calendar'], ['pagamentos', 'wallet', 'payments'], ['negociacoes', 'handshake', 'negotiations'], ['clientes', 'users', 'clients'], ['projecoes', 'chart', 'projections'], ['assistente', 'robot', 'assistant'], ['notificacoes', 'bell', 'notifications'], ['perfil', 'user', 'profile']];
  function navOf(page) { return { acordo: 'acordos', novo: 'acordos', unificar: 'negociacoes', cliente: 'clientes' }[page] || page; }
  function tabOf(page) { const n = navOf(page); return ['inicio', 'acordos', 'calendario', 'negociacoes'].includes(n) ? n : 'mais'; }
  function logo(size = 30, { tagline = false } = {}) {
    return h('span', { class: 'logo' + (tagline ? ' with-tag' : ''), role: 'img', 'aria-label': 'PACTO' + (tagline ? ' — ' + t('tagline') : '') },
      U.brandMark(size), h('span', { class: 'logo-text', 'aria-hidden': 'true' }, h('span', { class: 'logo-word' }, 'PACTO'), tagline ? h('span', { class: 'logo-tag', text: t('tagline') }) : null));
  }

  function shell(title, sub, content, { fab } = {}) {
    const r = route(), active = navOf(r.page), acts = pendingActions().length, nu = unread();
    const side = h('nav', { class: 'side glass', 'aria-label': 'Navegação principal' },
      h('div', { class: 'brand-row' }, logo(), h('button', { class: 'icon-btn', 'aria-label': t('collapse'), title: t('collapse'), on: { click: () => { S.collapsed = !S.collapsed; localStorage.setItem('pacto8:ui:collapsed', S.collapsed ? '1' : '0'); document.querySelector('.app').classList.toggle('collapsed', S.collapsed); } } }, icon('sidebar', 18))),
      h('div', { class: 'tag' }, t('tagline')),
      SIDE.map(([p, ic, k]) => h('button', { class: 'nav-item', 'aria-current': active === p ? 'page' : null, title: t(k), on: { click: () => go('#/' + p) } }, icon(ic, 20), h('span', { class: 'lbl', text: t(k) }),
        p === 'negociacoes' && acts ? [h('span', { class: 'cnt', text: String(acts) }), h('i', { class: 'ndot' })] : null,
        p === 'notificacoes' && nu ? [h('span', { class: 'cnt', text: String(nu) }), h('i', { class: 'ndot' })] : null)),
      h('button', { class: 'btn lime', style: { margin: '14px 4px 0' }, on: { click: () => newAgreement() } }, icon('plus', 18), h('span', { class: 'lbl', text: t('newAgreement') })),
      REMOTE ? h('div', { class: 'side-foot glass' }, h('b', null, ENV_LABEL), 'Contas e banco reais de teste. Use só dados fictícios. E-mail e WhatsApp: estrutura preparada, ainda não ativa.')
        : h('div', { class: 'side-foot glass' }, h('b', null, 'Ambiente de demonstração · 8.1'), 'Dados fictícios guardados só neste navegador. E-mail, push e WhatsApp ainda não estão ativos.'));
    const bell = h('button', { class: 'icon-btn', 'aria-label': `${t('notifications')}${nu ? ` (${nu} não lidas)` : ''}`, on: { click: () => go('#/notificacoes') } }, icon('bell', 20), nu ? h('span', { class: 'badge', text: nu > 99 ? '99+' : String(nu) }) : null);
    const av = h('div', { style: { position: 'relative' } }, h('button', { class: 'avatar-btn', 'aria-label': 'Conta e trocar usuário', 'aria-haspopup': 'menu', 'aria-expanded': String(S.menu), on: { click: (e) => { e.stopPropagation(); S.menu = !S.menu; render(); } } }, avatar(S.me, 42)), S.menu ? accountMenu() : null);
    const top = h('header', { class: 'top' }, h('div', { class: 'brand-mini', role: 'img', 'aria-label': 'PACTO' }, U.brandMark(22, { small: true })), h('div', { class: 'titles' }, h('h1', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null), bell, av);
    const tabbar = h('nav', { class: 'tabbar glass', 'aria-label': 'Navegação' }, h('span', { class: 'tab-pill', 'aria-hidden': 'true' }),
      NAV.map(([p, ic, k]) => h('button', { class: 'tab', 'aria-current': tabOf(r.page) === p ? 'page' : null, dataset: { p }, on: { click: () => go('#/' + p) } }, icon(ic, 22), h('span', { text: t(k) }), p === 'negociacoes' && acts ? h('i', { class: 'dot', 'aria-label': `${acts} pendências` }) : null)));
    const app = h('div', { class: ['app', S.collapsed && 'collapsed'] }, side,
      h('div', { class: 'main' }, h('a', { class: 'skip', href: '#conteudo', on: { click: (e) => { e.preventDefault(); document.getElementById('conteudo').focus(); } } }, 'Pular para o conteúdo'), top, h('main', { id: 'conteudo', class: 'content', tabindex: '-1' }, content)),
      tabbar, fab ? h('button', { class: 'fab', on: { click: fab.onClick } }, icon('plus', 20), fab.label) : null);
    requestAnimationFrame(() => placeTabPill(tabbar));
    return app;
  }
  function placeTabPill(bar) {
    const a = bar.querySelector('.tab[aria-current=page]'), pillEl = bar.querySelector('.tab-pill');
    if (!a) { pillEl.style.opacity = '0'; return; }
    pillEl.style.opacity = '1'; pillEl.style.width = a.offsetWidth + 'px'; pillEl.style.transform = `translateX(${a.offsetLeft - 6}px)`;
  }
  function accountMenu() {
    const demos = REMOTE ? [] : Seed.DEMO.filter((d) => d.email !== S.me.email);
    return h('div', { class: 'menu glass-strong', role: 'menu', on: { click: (e) => e.stopPropagation() } },
      h('div', { class: 'who' }, avatar(S.me, 36), h('div', null, h('b', { text: S.me.name }), h('div', { class: 'small muted', text: S.me.email }))),
      h('hr', { class: 'divider', style: { margin: '4px 0' } }),
      demos.length ? [h('div', { class: 'eyebrow', style: { padding: '6px 12px', position: 'relative', zIndex: 2 } }, t('switchAccount') + ' · demo'),
        demos.map((d) => h('button', { role: 'menuitem', on: { click: () => switchTo(d.email) } }, icon('swap', 18), d.name)),
        h('hr', { class: 'divider', style: { margin: '4px 0' } })] : null,
      h('button', { role: 'menuitem', on: { click: () => { S.menu = false; go('#/perfil'); } } }, icon('user', 18), t('profile')),
      h('button', { role: 'menuitem', on: { click: () => lockNow() } }, icon('lock', 18), t('lock')),
      h('button', { role: 'menuitem', on: { click: () => logout() } }, icon('logout', 18), t('logout')));
  }
  document.addEventListener('click', () => { if (S.menu) { S.menu = false; render(); } });
  async function switchTo(email) {
    S.menu = false;
    try { await api.logout(S.token); } catch {}
    try { const r = await api.login({ email, password: Seed.DEMO_PASSWORD }); setToken(r.token); S.homeRole = null; location.hash = '#/inicio'; await refresh(); toast('Agora você está como ' + r.user.name); }
    catch (e) { S.token = null; handleErr(e); render(); }
  }
  function setToken(tk) { S.token = tk; sessionStorage.setItem('pacto8:token', tk); S.lastAct = Date.now(); }
  async function logout() { S.menu = false; try { await api.logout(S.token); } catch {} signOutLocal(); location.hash = '#/inicio'; }

  /* ---------- trava por inatividade ---------- */
  /* 8.2 · CAPTCHA (Cloudflare Turnstile ou hCaptcha) nas telas de senha. Só liga quando config.js traz uma chave PÚBLICA de site;
     sem chave, nada muda. A chave secreta fica só no painel do Supabase (Auth → Attack Protection). */
  const CAPTCHA = REMOTE && CFG.captchaSiteKey && /^(turnstile|hcaptcha)$/.test(CFG.captchaProvider || '') ? { provider: CFG.captchaProvider, key: CFG.captchaSiteKey } : null;
  let captchaLib = null;
  const NO_CAPTCHA = Object.freeze({ el: null, need: async () => undefined, reset: () => {} });
  function loadCaptcha() {
    if (!CAPTCHA) return Promise.resolve(null);
    if (captchaLib) return captchaLib;
    // a biblioteca vem por <script> estático no index.html (gerado por tools/configure.mjs); aqui só esperamos ela ficar pronta
    captchaLib = new Promise((res, rej) => { const t0 = Date.now(); (function wait() { const L = CAPTCHA.provider === 'turnstile' ? window.turnstile : window.hcaptcha; if (L && L.render) return res(L); if (Date.now() - t0 > 20000) { captchaLib = null; return rej(new Error('captcha')); } setTimeout(wait, 100); })(); });
    return captchaLib;
  }
  /** Caixa de verificação anti-robô. need() devolve o token (ou lança aviso); reset() após cada tentativa (o token vale uma vez). */
  function captchaBox() {
    if (!CAPTCHA) return NO_CAPTCHA;
    let token = null, wid = null, lib = null;
    const el = h('div', { class: 'captcha-box', style: { minHeight: '68px', margin: '6px 0 10px', display: 'flex', justifyContent: 'center' }, 'aria-label': 'Verificação anti-robô' });
    loadCaptcha().then((L) => {
      lib = L; if (!L) throw new Error('captcha');
      const opts = { sitekey: CAPTCHA.key, callback: (t) => { token = t; }, 'expired-callback': () => { token = null; }, 'error-callback': () => { token = null; }, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' };
      if (CAPTCHA.provider === 'turnstile') { opts.language = 'pt-br'; opts.appearance = 'interaction-only'; opts.action = 'auth'; }
      wid = L.render(el, opts);
    }).catch(() => { el.replaceChildren(h('div', { class: 'err', text: 'Não foi possível carregar a verificação anti-robô. Confira a conexão e recarregue a página.' })); });
    return {
      el,
      need: async () => { if (token) return token; throw Object.assign(new Error('Confirme a verificação anti-robô (“Não sou um robô”) e tente de novo.'), { code: 'CAPTCHA' }); },
      reset: () => { token = null; try { if (lib && wid != null) lib.reset(wid); } catch {} },
    };
  }
  async function lockNow() { S.menu = false; try { await api.lock(S.token); } catch {} showLock(); }
  function showLock() {
    if (S.locked) return; S.locked = true;
    const pw = h('input', { type: 'password', autocomplete: 'current-password', class: 'input', placeholder: 'Sua senha', 'aria-label': 'Senha' });
    const err = h('div', { class: 'err', role: 'alert' });
    const cap = captchaBox();
    const unlock = async () => { try { await api.unlock(S.token, pw.value, await cap.need()); cap.reset(); hideLock(); S.lastAct = Date.now(); refresh(); } catch (e) { if (['EXPIRED', 'UNAUTHENTICATED'].includes(e.code)) { hideLock(); signOutLocal(); } cap.reset(); err.textContent = e.message; } };
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
    const demo = S.me && S.me.demo;
    const el = h('div', { class: 'lockscreen', id: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sessão bloqueada' },
      h('div', { class: 'lock-card glass-strong' }, avatar(S.me, 72), h('h2', { style: { margin: '6px 0 0' }, text: 'Sessão bloqueada' }), h('p', { class: 'muted', style: { margin: 0 }, text: 'Por segurança, o PACTO bloqueia após inatividade. Digite sua senha para continuar.' }),
        h('div', { style: { width: '100%' } }, pw), cap.el, err, demo ? h('div', { class: 'small muted' }, 'Conta demo · senha: ', h('code', { text: Seed.DEMO_PASSWORD })) : null,
        h('button', { class: 'btn block', on: { click: unlock } }, icon('lock', 18), 'Desbloquear'), h('button', { class: 'link-btn', on: { click: () => { hideLock(); logout(); } } }, 'Sair e entrar com outra conta')));
    document.body.appendChild(el); setTimeout(() => pw.focus(), 50);
  }
  function hideLock() { S.locked = false; const l = document.getElementById('lock'); if (l) l.remove(); }
  /* 8.2 · recuperação de MFA com código de uso único (para quem perdeu o app autenticador). */
  function recoveryDialog() {
    return new Promise((resolve) => {
      const old = document.getElementById('mfa-recover'); if (old) old.remove();
      const code = h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '24', placeholder: 'XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Código de recuperação', style: { textAlign: 'center', letterSpacing: '.12em', fontFamily: 'ui-monospace, monospace' } });
      const err = h('div', { class: 'err', role: 'alert' });
      const done = (ok) => { el.remove(); resolve(ok); };
      const go = h('button', { class: 'btn block lime', on: { click: async () => {
        go.disabled = true; err.textContent = '';
        try { await api.mfaRecover(code.value); done(true); toast('Verificação em duas etapas desvinculada. Ative de novo com o app autenticador novo.'); location.hash = '#/perfil'; render(); }
        catch (e) { err.textContent = e.message; go.disabled = false; }
      } } }, icon('key', 18), 'Usar código de recuperação');
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); if (e.key === 'Escape') done(false); });
      const el = h('div', { class: 'lockscreen', id: 'mfa-recover', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recuperar acesso sem o app autenticador' },
        h('div', { class: 'lock-card glass-strong' }, h('span', { class: 'ev-ico warn', style: { width: '52px', height: '52px' } }, icon('key', 26)),
          h('h2', { style: { margin: '6px 0 0' }, text: 'Perdi meu autenticador' }),
          h('p', { class: 'muted', style: { margin: 0 }, text: 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação em duas etapas. Cada código vale uma vez. Depois, ative de novo com o aparelho novo.' }),
          h('div', { style: { width: '100%' } }, code), err, go,
          h('p', { class: 'small muted', style: { margin: 0 }, text: 'Sem códigos? Fale com o suporte do PACTO pelo e-mail da sua conta: a remoção assistida exige confirmação de identidade e espera de 72 horas.' }),
          h('button', { class: 'link-btn', on: { click: () => done(false) } }, 'Cancelar')));
      document.body.appendChild(el); setTimeout(() => code.focus(), 50);
    });
  }
  function recoveryCodesView(codes, onDone) {
    const txt = 'PACTO · códigos de recuperação da verificação em duas etapas\nGerados em ' + new Date().toLocaleString('pt-BR') + '\nCada código vale UMA vez. Guarde fora do celular (papel ou gerenciador de senhas).\n\n' + codes.join('\n') + '\n';
    return h('div', { class: 'stack', style: { gap: '10px' } },
      h('div', { class: 'row wrap', style: { gap: '8px' } }, pill('Mostrados só agora', 'warn')),
      h('p', { class: 'small', style: { margin: 0 }, text: 'Guarde estes códigos em lugar seguro, fora do celular. Se perder o app autenticador, um deles libera sua conta (uma vez cada). O PACTO não consegue mostrá-los de novo.' }),
      h('div', { class: 'card', style: { padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px 16px' } }, codes.map((c) => h('code', { text: c, style: { fontSize: '14px', letterSpacing: '.06em' } }))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost sm', on: { click: async () => { try { await navigator.clipboard.writeText(txt); toast('Códigos copiados.'); } catch { toast('Não foi possível copiar: anote os códigos.', 'err'); } } } }, icon('copy', 16), 'Copiar'),
        h('button', { class: 'btn ghost sm', on: { click: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'pacto-codigos-recuperacao.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } } }, icon('download', 16), 'Baixar .txt'),
        h('button', { class: 'btn sm', on: { click: onDone } }, icon('check', 16), 'Já guardei')));
  }
  /* 8.2 · reautenticação forte (step-up) para aceites e aprovações financeiras. Hoje: código TOTP; passkey entra aqui depois. */
  function stepUpDialog() {
    return new Promise((resolve) => {
      const old = document.getElementById('stepup'); if (old) old.remove();
      const code = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Código de 6 dígitos', style: { textAlign: 'center', letterSpacing: '.3em', fontSize: '20px' } });
      const err = h('div', { class: 'err', role: 'alert' });
      const done = (ok) => { el.remove(); resolve(ok); };
      const ok = h('button', { class: 'btn block lime', on: { click: async () => { ok.disabled = true; try { await api.mfaVerify({ code: code.value }); done(true); } catch (e) { if (e.code === 'MFA_ENROLL_REQUIRED') { done(false); mfaSetup().then(() => { S.mfaOn = undefined; mfaProbe(); }); return; } err.textContent = e.message; ok.disabled = false; code.select(); } } } }, icon('shield', 18), 'Confirmar');
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') done(false); });
      const el = h('div', { class: 'lockscreen', id: 'stepup', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirmação em duas etapas' },
        h('div', { class: 'lock-card glass-strong' }, h('span', { class: 'ev-ico lime', style: { width: '52px', height: '52px' } }, icon('shield', 26)),
          h('h2', { style: { margin: '6px 0 0' }, text: 'Confirme que é você' }),
          h('p', { class: 'muted', style: { margin: 0 }, text: 'Aceites e aprovações financeiras pedem o código do seu app autenticador (válido por 15 minutos depois de confirmado).' }),
          h('div', { style: { width: '100%' } }, code), err, ok,
          h('button', { class: 'link-btn', on: { click: async () => { done(false); await recoveryDialog(); } } }, 'Perdi meu autenticador'),
          h('button', { class: 'link-btn', on: { click: () => done(false) } }, 'Cancelar')));
      document.body.appendChild(el); setTimeout(() => code.focus(), 50);
    });
  }
  if (REMOTE && api.onStepUp) api.onStepUp(stepUpDialog);

  /* 8.2 · ativação guiada da verificação em duas etapas (TOTP): passo a passo para iPhone e Android, QR code, chave manual e códigos de recuperação.
     Abre sozinha no primeiro acesso sem 2FA, quando uma operação financeira exige 2FA e pelo botão em Perfil. Nenhum dado biométrico/segredo fica no PACTO além do fator do Supabase Auth. */
  function mfaSetup() {
    return new Promise((resolve) => {
      const old = document.getElementById('mfa-setup'); if (old) old.remove();
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      let plat = isIOS ? 'ios' : 'android', en = null;
      const body = h('div', { style: { display: 'grid', gap: '12px', width: '100%', textAlign: 'left' } });
      const card = h('div', { class: 'lock-card glass-strong', style: { width: 'min(560px, 100%)', maxHeight: '92dvh', overflow: 'auto', textAlign: 'left', justifyItems: 'stretch' } }, body);
      const el = h('div', { class: 'lockscreen', id: 'mfa-setup', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ativar verificação em duas etapas' }, card);
      let finished = false;
      const done = (ok) => { if (finished) return; finished = true; el.remove(); resolve(ok); };
      const head = (n, title, sub) => [h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'ev-ico lime', style: { width: '40px', height: '40px', borderRadius: '14px' } }, icon('shield', 22)), h('div', null, h('div', { class: 'eyebrow', text: `Passo ${n} de 3` }), h('h2', { style: { margin: 0, fontSize: '20px' }, text: title }))), sub ? h('p', { class: 'muted small', style: { margin: 0 }, text: sub }) : null];
      const later = (label = 'Agora não') => h('button', { class: 'link-btn', type: 'button', style: { justifySelf: 'center' }, on: { click: () => done(false) } }, label);
      const STEPS = {
        ios: [
          ['App recomendado: Google Authenticator ou Microsoft Authenticator (App Store, grátis). No iOS 18 ou mais novo você também pode usar o app “Senhas” da Apple, que já vem no iPhone.'],
          ['No app: toque em “+” e depois em “Ler código QR”. Se estiver neste mesmo iPhone, use “Inserir chave de configuração” e cole a chave do próximo passo.'],
          ['App Senhas (Apple): toque em “+”, crie a entrada “PACTO”, toque em “Configurar código de verificação” e escolha “Inserir chave de configuração”.'],
        ],
        android: [
          ['App recomendado: Google Authenticator ou Microsoft Authenticator (Play Store, grátis).'],
          ['No app: toque em “+” e depois em “Ler código QR”.'],
          ['Se estiver neste mesmo celular, não dá para escanear a própria tela: escolha “Inserir chave de configuração”, nome “PACTO”, tipo “Baseada em tempo”, e cole a chave do próximo passo.'],
        ],
      };
      const step1 = () => {
        body.replaceChildren(...head(1, 'Escolha onde ficará seu código', 'Leva cerca de 2 minutos. Seu app autenticador gera um código novo de 6 dígitos a cada 30 segundos; ele protege aceites, aprovações e renegociações.'),
          seg([['ios', 'iPhone'], ['android', 'Android']], plat, (v) => { plat = v; step1(); }, 'Aparelho'),
          h('ol', { style: { margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px', fontSize: '14px' } }, STEPS[plat].map(([t1]) => h('li', { text: t1 }))),
          h('div', { class: 'note' }, icon('shield', 18), h('span', { text: 'O PACTO não guarda sua biometria. Se perder o celular, os códigos de recuperação (passo 3) devolvem seu acesso.' })),
          h('button', { class: 'btn block lime', type: 'button', on: { click: async (e) => {
            e.currentTarget.disabled = true;
            try { en = await api.mfaEnroll(); step2(); } catch (ex) { handleErr(ex); e.target.disabled = false; }
          } } }, icon('right', 18), 'Gerar QR code'), later());
      };
      const step2 = () => {
        const code = h('input', { class: 'input', id: 'mfa-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Código de 6 dígitos do app', style: { textAlign: 'center', letterSpacing: '.3em', fontSize: '20px' } });
        const err = h('div', { class: 'err', role: 'alert' });
        const secretTxt = String(en.secret || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
        const ok = h('button', { class: 'btn block lime', type: 'button', on: { click: async () => {
          ok.disabled = true; err.textContent = '';
          try { await api.mfaVerify({ factorId: en.factorId, code: code.value }); S.mfaOn = true; step3(); } catch (ex) { err.textContent = ex.message; ok.disabled = false; code.select(); }
        } } }, icon('check', 18), 'Ativar');
        code.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
        body.replaceChildren(...head(2, 'Adicione o PACTO ao app', 'Escaneie o QR code com o app autenticador ou digite a chave. Depois, digite o código de 6 dígitos que o app mostrar.'),
          h('div', { class: 'row wrap', style: { gap: '16px', alignItems: 'center', justifyContent: 'center' } },
            h('img', { src: en.qr, alt: 'QR code para o app autenticador', width: 176, height: 176, style: { background: '#fff', borderRadius: '14px', padding: '8px' } }),
            h('div', { style: { minWidth: '210px', flex: 1 } }, h('div', { class: 'eyebrow', text: 'Chave manual (sem câmera)' }),
              h('code', { id: 'mfa-secret', text: secretTxt, style: { wordBreak: 'break-all', fontSize: '15px', letterSpacing: '.04em', display: 'block', margin: '4px 0 8px' } }),
              h('button', { class: 'btn ghost sm', type: 'button', on: { click: async () => { try { await navigator.clipboard.writeText(String(en.secret || '')); toast('Chave copiada. Cole no app autenticador.'); } catch { toast('Não foi possível copiar: digite a chave.', 'err'); } } } }, icon('copy', 16), 'Copiar chave'))),
          h('p', { class: 'small muted', style: { margin: 0 }, text: (plat === 'ios' ? 'No iPhone: Authenticator → “+” → “Ler código QR”; ou Senhas → “Configurar código de verificação” → “Inserir chave”. ' : 'No Android: Authenticator → “+” → “Ler código QR”; ou “Inserir chave de configuração”. ') + 'Está neste mesmo celular? Use “Copiar chave” e cole no app.' }),
          h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'mfa-code', text: 'Código de 6 dígitos' }), code), err, ok, later('Cancelar'));
        setTimeout(() => code.focus(), 60);
      };
      const step3 = async () => {
        body.replaceChildren(...head(3, 'Guarde seus códigos de recuperação', 'Verificação ativada! Agora gere os códigos que devolvem seu acesso se você perder o celular.'), U.skeleton(2));
        let r = null;
        try { r = await api.mfaRecoveryGenerate(); } catch (ex) { /* servidor sem recuperação: segue sem códigos */ }
        const fin = () => { toast('Verificação em duas etapas ativada.'); done(true); };
        if (r && r.codes && typeof recoveryCodesView === 'function') body.replaceChildren(...head(3, 'Guarde seus códigos de recuperação', 'Verificação ativada! Cada código vale uma vez e é mostrado só agora.'), recoveryCodesView(r.codes, fin));
        else body.replaceChildren(...head(3, 'Tudo pronto', 'Verificação em duas etapas ativada. Gere os códigos de recuperação em Perfil → Verificação em duas etapas.'), h('button', { class: 'btn block lime', type: 'button', on: { click: fin } }, 'Concluir'));
      };
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
      document.body.appendChild(el); step1();
    });
  }
  /* 2FA ainda não ativada: aviso na tela inicial + abertura automática do guia uma vez por sessão do navegador */
  async function mfaProbe() {
    if (!REMOTE || S.mfaOn !== undefined) return;
    S.mfaOn = null;
    try {
      const st = await api.mfaStatus(); S.mfaOn = !!st.enabled;
      if (!st.enabled && !sessionStorage.getItem('pacto8:mfaAsked')) { sessionStorage.setItem('pacto8:mfaAsked', '1'); render(); await mfaSetup(); S.mfaOn = undefined; mfaProbe(); }
      else render();
    } catch { S.mfaOn = undefined; }
  }
  function mfaBanner() {
    if (!REMOTE || S.mfaOn !== false) return null;
    return h('div', { class: 'card glass', style: { marginBottom: '14px' } }, h('div', { class: 'row wrap', style: { alignItems: 'center' } }, h('span', { class: 'ev-ico warn' }, icon('shield', 14)),
      h('div', { style: { flex: 1, minWidth: '200px' } }, h('b', null, 'Ative a verificação em duas etapas'), h('div', { class: 'small muted', text: 'Necessária para aceitar propostas, aprovar comprovantes e renegociar. Leva 2 minutos, com QR code e passo a passo para iPhone e Android.' })),
      h('button', { class: 'btn sm lime', on: { click: async () => { await mfaSetup(); S.mfaOn = undefined; mfaProbe(); } } }, 'Ativar agora')));
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, () => {
    S.lastAct = Date.now();
    if (S.token && !S.locked && Date.now() - S.lastTouch > 45000) { S.lastTouch = Date.now(); api.touch(S.token).catch((e) => { if (e.code === 'LOCKED') showLock(); }); }
  }, { passive: true }));
  setInterval(() => { if (S.token && S.me && !S.locked && Date.now() - S.lastAct > (S.me.prefs.autoLockMin || 10) * 60000) lockNow(); }, 10000);

  /* ---------- autenticação ---------- */
  function pwInput(id, ac) {
    const inp = h('input', { id, type: 'password', autocomplete: ac, required: true, placeholder: '••••••••••' });
    const b = h('button', { type: 'button', 'aria-label': 'Mostrar senha', on: { click: () => { const s = inp.type === 'password'; inp.type = s ? 'text' : 'password'; b.setAttribute('aria-label', s ? 'Ocultar senha' : 'Mostrar senha'); } } }, icon('eye', 18));
    return [inp, h('div', { class: 'pw-wrap' }, inp, b)];
  }
  async function mailboxView(email) {
    const box = h('div', { class: 'mailbox', 'aria-live': 'polite' });
    const msgs = await api.demoMailbox(email);
    box.append(...msgs.slice(0, 2).map((m) => h('div', { class: 'mail' }, h('b', null, '📬 E-mail simulado · ' + m.subject), m.body)));
    return box;
  }
  function authView() {
    const mode = S.authMode;
    const err = h('div', { class: 'err', role: 'alert' });
    const email = h('input', { id: 'au-email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'voce@exemplo.com', value: S.authEmail || '' });
    const [pw, pwWrap] = pwInput('au-pw', mode === 'signup' ? 'new-password' : 'current-password');
    const name = h('input', { id: 'au-name', autocomplete: 'name', placeholder: 'Como quer ser chamado(a)?' });
    const code = h('input', { id: 'au-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000' });
    const cap = ['login', 'signup', 'reset'].includes(mode) ? captchaBox() : NO_CAPTCHA;
    const busy = (b, on) => { b.disabled = on; b.dataset.label = b.dataset.label || b.textContent; b.textContent = on ? 'Aguarde…' : b.dataset.label; };
    let form;
    const submit = h('button', { class: 'btn block', type: 'submit' }, mode === 'signup' ? 'Criar minha conta' : mode === 'reset' ? (REMOTE ? 'Enviar link' : 'Enviar código') : mode === 'reset2' || mode === 'newpass' ? 'Salvar nova senha' : 'Entrar');
    const onSubmit = async (e) => {
      e.preventDefault(); err.textContent = ''; busy(submit, true);
      try {
        if (mode === 'login') { const r = await api.login({ email: email.value, password: pw.value, captchaToken: await cap.need() }); setToken(r.token); location.hash = '#/inicio'; await refresh(); if (S.me) toast('Bem-vindo(a), ' + S.me.name.split(' ')[0] + '!'); return; }
        if (mode === 'signup') {
          const r = await api.signup({ email: email.value, name: name.value, password: pw.value, captchaToken: await cap.need() });
          if (r.pending) { S.authEmail = r.email; S.authMode = 'sent'; render(); return; }
          setToken(r.token); location.hash = '#/inicio'; await refresh(); toast(REMOTE ? 'Conta criada.' : 'Conta criada. Confirme seu e-mail para movimentar acordos.'); return;
        }
        if (mode === 'reset' && REMOTE) { await api.requestReset(email.value, await cap.need()); S.authEmail = email.value; S.authMode = 'resetSent'; render(); return; }
        if (mode === 'newpass') { await api.resetPassword({ password: pw.value }); S.recovery = false; S.authMode = 'login'; const r = await api.restore(); if (r) { setToken(r.token); location.hash = '#/inicio'; await refresh(); } else render(); toast('Senha alterada. Outros aparelhos foram desconectados.'); return; }
        if (mode === 'reset') { await api.requestReset(email.value); S.authEmail = email.value; S.authMode = 'reset2'; render(); toast('Se o e-mail existir, enviamos um código.'); return; }
        if (mode === 'reset2') { await api.resetPassword({ email: email.value, code: code.value, password: pw.value }); S.authMode = 'login'; render(); toast('Senha alterada. Entre com a nova senha.'); return; }
      } catch (ex) { err.textContent = ex.message; cap.reset(); } finally { busy(submit, false); }
    };
    const demo = h('div', { class: 'demo-box' }, h('div', { class: 'row between' }, h('b', null, 'Acesso rápido de teste'), pill('Demo', 'lime')),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Contas fictícias com senha ', h('code', { text: Seed.DEMO_PASSWORD }), '. Abra outra aba para usar dois usuários ao mesmo tempo.'),
      h('div', { class: 'demo-users' }, Seed.DEMO.map((d, i) => h('button', { class: 'demo-user lift', on: { click: async () => { try { const r = await api.login({ email: d.email, password: Seed.DEMO_PASSWORD }); setToken(r.token); location.hash = '#/inicio'; await refresh(); toast('Entrou como ' + d.name); } catch (ex) { err.textContent = ex.message; } } } },
        avatar({ name: d.name }, 38), h('div', null, h('div', { class: 'n', text: d.name }), h('div', { class: 'r', text: ['Vendedora · cria e acompanha acordos', 'Comprador · também vende uma bicicleta', 'Cliente de serviço (terceira conta)'][i] })), h('span', { style: { marginLeft: 'auto' } }, icon('right', 18))))));
    const fields = [];
    if (mode === 'signup') fields.push(field('Nome de exibição', name));
    if (mode !== 'newpass') fields.push(field('E-mail', email));
    if (mode === 'reset2') fields.push(field('Código recebido', code));
    if (mode !== 'reset') fields.push(h('div', { class: 'field' }, h('label', { for: 'au-pw', text: mode === 'reset2' ? 'Nova senha' : 'Senha' }), pwWrap, mode !== 'login' ? h('small', { class: 'hint', text: REMOTE ? 'Mínimo de 10 caracteres, com letras e números. Use uma senha exclusiva para o PACTO.' : 'Mínimo de 10 caracteres, com letras e números. Nunca use uma senha real nesta demonstração.' }) : null));
    form = h('form', { novalidate: true, on: { submit: onSubmit } }, fields, cap.el, err, submit);
    const titles = { login: ['Entre no seu espaço', 'Acompanhe o que você deve e o que vai receber.'], signup: ['Crie sua conta', 'Uma única conta para comprar e vender.'], reset: ['Recuperar senha', REMOTE ? 'Enviaremos um link seguro para o seu e-mail.' : 'Enviaremos um código para o seu e-mail.'], reset2: ['Nova senha', 'Digite o código e escolha uma senha nova.'], newpass: ['Defina uma nova senha', 'Você abriu o link de recuperação. Escolha a nova senha.'] }[mode] || ['', ''];
    if (mode === 'sent' || mode === 'resetSent') {
      const isSent = mode === 'sent';
      const msg = isSent ? `Enviamos um link de confirmação para ${S.authEmail}. Abra o e-mail (confira também o spam), toque em “Confirmar” e você entra automaticamente.` : `Se existir uma conta para ${S.authEmail}, enviamos um link para criar uma nova senha. Ele vale por pouco tempo.`;
      const capR = captchaBox();
      const again = h('button', { class: 'btn ghost sm', on: { click: async (e) => { e.target.disabled = true; try { const t = await capR.need(); await (isSent ? api.resendSignup(S.authEmail, t) : api.requestReset(S.authEmail, t)); toast('Enviado de novo.'); } catch (ex) { toast(ex.message, 'err'); } finally { capR.reset(); setTimeout(() => { e.target.disabled = false; }, 60000); } } } }, icon('mail', 16), 'Reenviar');
      const sentPanel = h('div', { class: 'auth-panel' }, h('span', { class: 'eyebrow' }, 'PACTO 8.2 · ' + ENV_LABEL), h('h2', { text: isSent ? 'Confirme seu e-mail' : 'Confira seu e-mail' }), h('p', { class: 'muted', text: msg }),
        capR.el, h('div', { class: 'actions' }, again, h('button', { class: 'link-btn', on: { click: () => { S.authMode = 'login'; render(); } } }, icon('left', 16), 'Voltar ao login')));
      return h('div', { class: 'auth' }, h('div', { class: 'auth-card glass-strong' }, h('div', { class: 'auth-brand' }, logo(40), h('h1', null, 'O combinado tem valor.'), h('p', null, 'Acordos às claras.')), sentPanel));
    }
    const panel = h('div', { class: 'auth-panel' }, h('span', { class: 'eyebrow' }, REMOTE ? 'PACTO 8.2 · ' + ENV_LABEL : 'PACTO 8.1 · protótipo de testes'), h('h2', { text: titles[0] }), h('p', { class: 'muted', style: { margin: '0 0 18px' }, text: titles[1] }),
      mode === 'login' && S.authNotice ? h('div', { class: 'note ok', role: 'status', style: { margin: '0 0 14px' } }, icon('check', 18), h('span', { text: S.authNotice })) : null,
      mode === 'login' || mode === 'signup' ? h('div', { style: { marginBottom: '16px' } }, seg([['login', 'Entrar'], ['signup', 'Criar conta']], mode, (v) => { S.authMode = v; render(); }, 'Modo')) : null,
      form,
      h('div', { class: 'row between', style: { marginTop: '12px' } },
        mode === 'login' ? h('button', { class: 'link-btn', on: { click: () => { S.authMode = 'reset'; S.authEmail = email.value; render(); } } }, 'Esqueci minha senha') : h('button', { class: 'link-btn', on: { click: () => { S.authMode = 'login'; render(); } } }, icon('left', 16), 'Voltar ao login')),
      mode === 'reset2' ? h('div', { id: 'mbx' }) : null,
      mode === 'login' && !REMOTE ? demo : null,
      h('p', { class: 'small muted', style: { marginTop: '16px' } }, icon('shield', 14), REMOTE ? ' Senhas protegidas pelo Supabase Auth (bcrypt), e-mail confirmado, sessão com renovação segura e bloqueio automático. Ambiente de testes: use apenas dados fictícios.' : ' Senhas protegidas com PBKDF2 (210 mil iterações) e sessão com expiração e bloqueio automático. Protótipo local: os dados ficam só neste navegador.'));
    if (mode === 'reset2') mailboxView(S.authEmail).then((m) => { const x = document.getElementById('mbx'); if (x) x.replaceChildren(m); });
    return h('div', { class: 'auth' }, h('div', { class: 'auth-card glass-strong' },
      h('div', { class: 'auth-brand' }, logo(40), h('h1', null, 'O combinado tem valor.'), h('p', null, 'Acordos às claras: combine parcelas, comprove pagamentos e renegocie com transparência — com a leveza de uma rede social e o rigor de um app financeiro.'),
        h('div', { class: 'auth-feats' }, [['shield', 'Aceite bilateral em cada versão'], ['clip', 'Comprovantes obrigatórios e imutáveis após aprovação'], ['hash', 'Histórico encadeado por SHA-256'], ['layers', 'Unificação e antecipação sem perder a origem']].map(([i, l]) => h('div', { class: 'auth-feat' }, icon(i, 18), l))),
        h('div', { class: 'rule' }, h('b', null, 'A regra do PACTO'), 'Quem vende sabe quanto vai receber. Quem compra sabe quanto deve. Nenhum acordo muda sem que os dois concordem.')),
      panel));
  }

  /* ---------- 8.2 · recuperação de senha (link por e-mail do Supabase Auth; sem senha antiga; preserva o MFA) ---------- */
  function parseAuthLink(u) {
    const hp = new URLSearchParams(/^#[^/]/.test(u.hash) ? u.hash.slice(1) : ''), qp = new URLSearchParams(u.search);
    const g = (k) => hp.get(k) || qp.get(k) || '';
    const out = { kind: null, reason: 'invalid', tokenHash: '' };
    if (g('error') || g('error_code')) { out.kind = 'error'; out.reason = /expired|otp/i.test(g('error_code') + ' ' + g('error_description')) ? 'expired' : 'invalid'; }
    else if (hp.get('type') === 'recovery' && hp.get('access_token')) out.kind = 'recovery';
    else if (qp.get('type') === 'recovery' && qp.get('token_hash')) { out.kind = 'confirm'; out.tokenHash = qp.get('token_hash'); }
    return out;
  }
  const maskEmail = (e) => { const [u, d] = String(e || '').split('@'); return d ? (u.length <= 2 ? u[0] + '•' : u.slice(0, 2) + '•••') + '@' + d : '•••'; };
  function recLeave() { history.replaceState(null, '', location.pathname); location.reload(); }
  async function recAdvance() {
    try { const st = await api.recoveryState(); S.rec = st.ok ? { stage: st.mfa ? 'mfa' : 'newpass', email: st.email } : { stage: 'error', reason: 'invalid' }; }
    catch { S.rec = { stage: 'error', reason: 'invalid' }; }
    render();
  }
  async function recStart() { if (S.rec) return; S.rec = { stage: 'wait' }; render(); await recAdvance(); }
  function recoveryView() {
    const R = S.rec || { stage: 'wait' };
    const card = (...kids) => h('div', { class: 'auth' }, h('div', { class: 'auth-card glass-strong' },
      h('div', { class: 'auth-brand' }, logo(40), h('h1', null, 'O combinado tem valor.'), h('p', null, 'Acordos às claras.')),
      h('div', { class: 'auth-panel', 'aria-live': 'polite' }, h('span', { class: 'eyebrow' }, 'PACTO 8.2 · ' + ENV_LABEL), ...kids)));
    const ico = (name, kind) => h('div', null, h('span', { class: 'ev-ico ' + kind, style: { width: '56px', height: '56px', borderRadius: '18px', margin: '10px 0 4px' } }, icon(name, 28)));
    const busy = (b, on) => { b.disabled = on; b.dataset.label = b.dataset.label || b.textContent; b.textContent = on ? 'Aguarde…' : b.dataset.label; };
    const back = (label, fn) => h('button', { class: 'link-btn', type: 'button', on: { click: fn } }, icon('left', 16), label);
    if (R.stage === 'wait') return card(h('h2', { text: 'Validando o link…' }), h('p', { class: 'muted', text: 'Só um instante.' }), U.skeleton(2));
    if (R.stage === 'confirm') {
      const err = h('div', { class: 'err', role: 'alert' });
      const go1 = h('button', { class: 'btn block', type: 'button', on: { click: async () => { busy(go1, true); err.textContent = ''; try { await api.recoveryFromTokenHash(R.tokenHash); await recAdvance(); } catch (e) { S.rec = { stage: 'error', reason: 'expired' }; render(); } } } }, 'Continuar');
      return card(ico('key', 'ok'), h('h2', { text: 'Criar uma nova senha' }), h('p', { class: 'muted', text: 'Você abriu o link de recuperação enviado por e-mail. Toque em continuar para escolher a nova senha.' }), err, go1, back('Cancelar', recLeave));
    }
    if (R.stage === 'mfa') {
      const code = h('input', { id: 'rc-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Código de 6 dígitos', style: { textAlign: 'center', letterSpacing: '.3em', fontSize: '20px' } });
      const err = h('div', { class: 'err', role: 'alert' });
      const ok = h('button', { class: 'btn block lime', type: 'button', on: { click: async () => { busy(ok, true); err.textContent = ''; try { await api.mfaVerify({ code: code.value }); await recAdvance(); } catch (e) { err.textContent = e.message; busy(ok, false); code.select(); } } } }, icon('shield', 18), 'Confirmar código');
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
      setTimeout(() => code.focus(), 60);
      return card(ico('shield', 'ok'), h('h2', { text: 'Confirme que é você' }),
        h('p', { class: 'muted', text: 'Sua conta tem verificação em duas etapas. O link do e-mail sozinho não basta: digite o código de 6 dígitos do app autenticador para criar a nova senha.' }),
        field('Código do app autenticador', code), err, ok,
        typeof recoveryDialog === 'function' ? h('button', { class: 'link-btn', type: 'button', on: { click: async () => { if (await recoveryDialog()) await recAdvance(); } } }, 'Perdi meu autenticador') : null,
        back('Cancelar', async () => { await api.recoveryCancel().catch(() => {}); recLeave(); }));
    }
    if (R.stage === 'newpass') {
      const [p1, w1] = pwInput('rc-pw', 'new-password'), [p2, w2] = pwInput('rc-pw2', 'new-password');
      const err = h('div', { class: 'err', role: 'alert' });
      const rules = h('ul', { class: 'small', style: { margin: '0 0 12px', paddingLeft: '18px', display: 'grid', gap: '2px' }, 'aria-label': 'Requisitos da senha' });
      const match = h('small', { class: 'hint', id: 'rc-match', 'aria-live': 'polite' });
      const sub = h('button', { class: 'btn block', type: 'submit' }, 'Salvar nova senha');
      const upd = () => {
        const probs = C.passwordProblems(p1.value);
        const R3 = [['mínimo de 10 caracteres', p1.value.length >= 10], ['letras e números', /[A-Za-z]/.test(p1.value) && /\d/.test(p1.value)], ['não use senhas óbvias', !/^(12345|senha|password|qwerty)/i.test(p1.value || '')]];
        rules.replaceChildren(...R3.map(([l, okk]) => h('li', { style: { color: okk && p1.value ? 'var(--ok)' : 'var(--muted)', fontWeight: 600 } }, (okk && p1.value ? '✓ ' : '• ') + l)));
        if (p2.value) { const same = p1.value === p2.value; match.textContent = same ? '✓ As senhas coincidem.' : 'As senhas ainda não coincidem.'; match.style.color = same ? 'var(--ok)' : 'var(--danger)'; p2.setAttribute('aria-invalid', String(!same)); } else { match.textContent = ''; p2.removeAttribute('aria-invalid'); }
        return probs;
      };
      p1.addEventListener('input', () => { err.textContent = ''; upd(); }); p2.addEventListener('input', () => { err.textContent = ''; upd(); }); upd();
      const form = h('form', { novalidate: true, on: { submit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const probs = upd(); if (probs.length) { err.textContent = 'Senha fraca: ' + probs.join(', ') + '.'; p1.focus(); return; }
        if (p1.value !== p2.value) { err.textContent = 'As duas senhas precisam ser iguais.'; p2.focus(); return; }
        busy(sub, true);
        try { await api.resetPassword({ password: p1.value }); S.rec = { stage: 'done', email: R.email }; render(); }
        catch (ex) {
          if (ex.code === 'MFA_REQUIRED') { S.rec = { stage: 'mfa', email: R.email }; render(); toast(ex.message, 'err'); return; }
          if (ex.code === 'UNAUTHENTICATED' || ex.code === 'LINK_INVALID' || /session/i.test(ex.message)) { S.rec = { stage: 'error', reason: 'expired' }; render(); return; }
          err.textContent = ex.message; busy(sub, false);
        }
      } } },
      h('div', { class: 'field' }, h('label', { for: 'rc-pw', text: 'Nova senha' }), w1), rules,
      h('div', { class: 'field' }, h('label', { for: 'rc-pw2', text: 'Confirme a nova senha' }), w2, match), err, sub);
      return card(ico('key', 'ok'), h('h2', { text: 'Defina uma nova senha' }),
        h('p', { class: 'muted', style: { margin: '0 0 14px' }, text: `Conta ${maskEmail(R.email)}. Escolha uma senha exclusiva para o PACTO. Você não precisa da senha anterior.` }), form,
        back('Cancelar', async () => { await api.recoveryCancel().catch(() => {}); recLeave(); }));
    }
    if (R.stage === 'done') {
      const to = h('button', { class: 'btn block lime', type: 'button', on: { click: () => { if (R.email) sessionStorage.setItem('pacto8:prefill', R.email); sessionStorage.setItem('pacto8:notice', 'Senha alterada com sucesso. Entre com a nova senha.'); recLeave(); } } }, icon('right', 18), 'Entrar no PACTO');
      setTimeout(() => to.focus(), 60);
      return card(h('div', null, h('span', { class: 'ev-ico ok', role: 'img', 'aria-label': 'Sucesso', style: { width: '64px', height: '64px', borderRadius: '22px', margin: '10px 0 4px' } }, icon('check', 34))), h('h2', { text: 'Senha alterada com sucesso' }),
        h('p', { class: 'muted', role: 'status', text: 'Sua nova senha já vale. Por segurança, os outros aparelhos conectados foram desconectados. Se você usa verificação em duas etapas, ela continua ativa.' }), to);
    }
    // erro: link expirado, já usado ou inválido
    const email = h('input', { id: 'rc-email', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'voce@exemplo.com', value: S.authEmail || '' });
    const err = h('div', { class: 'err', role: 'alert' });
    const cap = (typeof captchaBox === 'function') ? captchaBox() : { el: null, need: async () => undefined, reset: () => {} };
    const send = h('button', { class: 'btn block', type: 'submit' }, icon('mail', 16), 'Enviar novo link');
    const form = h('form', { novalidate: true, on: { submit: async (e) => {
      e.preventDefault(); err.textContent = ''; send.disabled = true;
      try { await api.requestReset(email.value, await cap.need()); S.authEmail = email.value.trim(); S.rec = null; S.authMode = 'resetSent'; history.replaceState(null, '', location.pathname); render(); }
      catch (ex) { err.textContent = ex.message; cap.reset(); send.disabled = false; }
    } } }, field('E-mail da sua conta', email), cap.el, err, send);
    const title = R.reason === 'expired' ? 'Link expirado ou já utilizado' : 'Link inválido';
    return card(ico('alert', 'warn'), h('h2', { text: title }),
      h('p', { class: 'muted', text: 'Por segurança, cada link de recuperação vale uma única vez e por pouco tempo. Peça um novo: nenhuma senha foi alterada.' }), form,
      h('p', { class: 'small muted', text: 'Se este link era a confirmação do seu cadastro, volte ao login e peça o reenvio.' }),
      back('Voltar ao login', recLeave));
  }

  function verifyBanner() {
    if (!S.me || S.me.emailVerified) return null;
    const code = h('input', { class: 'input', inputmode: 'numeric', maxlength: '6', placeholder: 'Código de 6 dígitos', 'aria-label': 'Código de verificação', style: { maxWidth: '200px' } });
    const box = h('div');
    mailboxView(S.me.email).then((m) => box.replaceChildren(m));
    return h('div', { class: 'card glass', style: { marginBottom: '14px' } }, h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { class: 'ev-ico warn' }, icon('mail', 14)), h('div', { style: { flex: 1 } }, h('b', null, 'Confirme seu e-mail'), h('div', { class: 'small muted' }, 'Sem a verificação você pode navegar, mas não criar nem aceitar acordos. Como ainda não há servidor de e-mail, o código aparece abaixo (simulado).'))),
      box, h('div', { class: 'row wrap', style: { marginTop: '10px' } }, code, h('button', { class: 'btn sm', on: { click: () => call(() => api.verifyEmail(S.token, code.value), 'E-mail confirmado!') } }, 'Confirmar'), h('button', { class: 'link-btn', on: { click: () => call(() => api.resendVerification(S.token), 'Novo código enviado.') } }, 'Reenviar')));
  }

  /* ---------- componentes de acordo ---------- */
  function agCard(a, compact) {
    const r = role(a), o = other(a), [lbl, kind] = statusOf(a), n = nextOpen(a), tt = C.totals(a), total = contracted(a);
    const paidRatio = total ? (tt.paid + tt.discount) / total : 0;
    return h('button', { class: 'ag-card glass lift sheen', on: { click: () => go('#/acordo/' + a.id) }, 'aria-label': `${a.title}, ${lbl}` },
      h('div', { class: 'ag-top' }, h('span', { class: 'ag-ico' }, icon(agIcon(a), 22)),
        h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'ag-title', text: a.title }), h('div', { class: 'ag-sub' }, h('span', { class: 'role-tag ' + r, text: r === 'seller' ? 'Você vende' : 'Você compra' }), avatar(o, 18), h('span', { text: o.name })))),
      h('div', { class: 'row wrap', style: { gap: '6px' } }, pill(lbl, kind), a.billing && a.billing !== 'installment' ? pill(BILL[a.billing], a.billing === 'recurring' ? 'lime' : '') : null, isRec(a) && a.terms && a.terms.suspended ? pill('Suspenso', 'warn') : null, isRec(a) && a.terms && a.terms.cancelled ? pill('Cancelado', 'danger') : null),
      isRec(a) && a.status !== 'proposed' && a.status !== 'refused'
        ? h('div', { class: 'ag-amounts' }, h('div', null, h('div', { class: 'lbl' }, r === 'seller' ? 'Em aberto' : 'A pagar'), h('div', { class: 'v', text: money(tt.open, cur(a)) })), h('div', { class: 'r' }, h('div', { class: 'lbl' }, 'Por período · ' + perLabel(a.terms)), h('div', { class: 'v', text: money(a.terms.amountCents, cur(a)) })))
      : a.status === 'proposed' || a.status === 'refused'
        ? h('div', { class: 'ag-amounts' }, h('div', null, h('div', { class: 'lbl' }, 'Valor proposto'), h('div', { class: 'v', text: money(total, cur(a)) })), h('div', { class: 'r' }, h('div', { class: 'lbl' }, 'Versão'), h('div', { class: 'v', text: 'v' + a.versions.length })))
        : h('div', { class: 'ag-amounts' }, h('div', null, h('div', { class: 'lbl' }, r === 'seller' ? 'Falta receber' : 'Falta pagar'), h('div', { class: 'v', text: money(tt.open, cur(a)) })),
          h('div', { class: 'r' }, h('div', { class: 'lbl' }, n ? 'Próximo · ' + dateShort(n.due) : 'Próximo'), h('div', { class: 'v', text: n ? money(C.remainingOf(n), cur(a)) : '—' }))),
      compact ? null : isRec(a) ? h('div', { class: 'small muted', text: `${a.schedule.filter((x) => x.status === 'paid').length} período(s) pago(s) · ${n ? 'próximo ' + dateShort(n.due) : 'sem cobrança aberta'}` }) : progress(paidRatio, `${Math.round(paidRatio * 100)}% quitado`));
  }
  const EV = {
    'agreement.proposed': ['handshake', '', (d) => (d.version > 1 ? (d.change && d.change !== 'start' ? `propôs ${CHG[d.change]} (v${d.version})` : `enviou uma nova proposta (v${d.version})`) : d.billing && d.billing !== 'installment' ? `propôs um ${BILL[d.billing].toLowerCase()}` : 'propôs um novo acordo')],
    'delay.submitted': ['clock', '', (d) => `justificou um atraso e propôs pagar em ${date(d.newDate)}`],
    'delay.countered': ['swap', 'lime', (d) => `contrapropôs nova data: ${date(d.newDate)}${d.feeCents ? ' + encargo de ' + money(d.feeCents) : ''}`],
    'delay.accepted': ['check', 'ok', (d) => `aceitou a nova data (${date(d.newDate)}) — vale para os dois`],
    'delay.refused': ['x', 'danger', () => 'recusou a justificativa de atraso'],
    'agreement.countered': ['swap', 'lime', (d) => `fez uma contraproposta (v${d.version})`],
    'agreement.accepted': ['check', 'ok', (d) => (d.change && d.change !== 'start' ? `aceitou ${CHG[d.change]} (v${d.version})` : `aceitou a versão ${d.version} — vale para os dois`)],
    'agreement.refused': ['x', 'danger', (d) => `recusou a versão ${d.version}`],
    'agreement.note': ['msg', '', () => 'deixou uma observação'],
    'agreement.settled': ['spark', 'lime', () => 'confirmou a quitação total 🎉'],
    'agreement.consolidated': ['layers', '', () => 'acordo levado à unificação'],
    'payment.reported': ['clip', '', () => 'informou um pagamento com comprovante'],
    'payment.approved': ['check', 'ok', () => 'confirmou um pagamento'],
    'payment.correction_requested': ['alert', 'warn', () => 'pediu correção de um comprovante'],
    'payment.refused': ['x', 'danger', () => 'recusou um comprovante'],
    'early.proposed': ['zap', 'lime', (d) => (d.pct ? `propôs antecipação com ${d.pct}% de desconto` : 'pediu para antecipar parcelas')],
    'early.countered': ['zap', '', (d) => `respondeu à antecipação (${d.pct ? d.pct + '%' : 'sem desconto definido'})`],
    'early.accepted': ['check', 'ok', () => 'aceitou a antecipação'],
    'early.refused': ['x', 'danger', () => 'recusou a antecipação'],
    'early.payment_reported': ['clip', '', () => 'enviou o comprovante da antecipação'],
    'early.settled': ['spark', 'lime', () => 'confirmou a antecipação com desconto'],
    'early.correction_requested': ['alert', 'warn', () => 'pediu correção do comprovante da antecipação'],
    'consolidation.proposed': ['layers', 'lime', () => 'propôs unificar dívidas'],
    'consolidation.countered': ['layers', '', () => 'contrapropôs a unificação'],
    'consolidation.accepted': ['layers', 'ok', () => 'aceitou a unificação — novo acordo criado'],
    'consolidation.refused': ['x', 'danger', () => 'recusou a unificação'],
    'consolidation.origin_locked': null, 'auth.login': null,
  };
  function post(e) {
    const def = EV[e.type]; if (def === null) return null;
    const [ic, tone, verb] = def || ['doc', '', () => e.type];
    const who = e.actorId === meId() ? { ...S.me, name: 'Você' } : person(e.actorId);
    const a = e.agreementId ? findAg(e.agreementId) : null;
    const amount = e.data.amountCents || e.data.totalCents || e.data.principalCents || (e.data.after && e.data.after.totalCents) || null;
    const subtitle = a ? `${a.category} · ${role(a) === 'seller' ? 'você vende para ' : 'você compra de '}${other(a).name}` : '';
    return h('article', { class: 'post glass' },
      h('div', { class: 'post-head' }, avatar(who, 40), h('div', { class: 'who' }, h('b', { text: who.name }), ' ', verb(e.data), h('div', { class: 'when' }, h('span', { class: 'ev-ico ' + tone }, icon(ic, 13)), U.ago(e.at), h('span', { 'aria-hidden': 'true' }, '·'), h('span', { class: 'hashline', title: 'Hash do evento (SHA-256)', text: '#' + e.hash.slice(0, 8) })))),
      a || e.data.consolidationId ? h('div', { class: 'post-body' }, h('div', { style: { minWidth: 0 } }, h('div', { class: 't', text: a ? a.title : 'Unificação de dívidas' }), subtitle ? h('div', { class: 'd', text: subtitle }) : null, e.data.reason ? h('div', { class: 'd', text: '“' + e.data.reason + '”' }) : null), amount ? h('div', { class: 'amt', text: money(amount, cur(a)) }) : null) : null,
      a ? h('div', { class: 'post-foot' }, h('button', { class: 'btn ghost sm', on: { click: () => go('#/acordo/' + a.id) } }, 'Ver acordo', icon('right', 16))) : e.data.consolidationId ? h('div', { class: 'post-foot' }, h('button', { class: 'btn ghost sm', on: { click: () => openConsolidation(e.data.consolidationId) } }, 'Ver unificação', icon('right', 16))) : null);
  }

  /* ---------- Início ---------- */
  function homePage() {
    const r = S.homeRole, me = S.me, td = today();
    const mine = S.ags.filter((a) => (r === 'recurring' ? role(a) === 'seller' && isRec(a) : role(a) === r) && a.status !== 'consolidated');
    const acts = pendingActions();
    const stories = h('div', { class: 'stories', role: 'list', 'aria-label': 'Pendências' },
      acts.length ? acts.slice(0, 14).map((x) => {
        const who = x.a ? other(x.a) : person(x.c.sellerId === meId() ? x.c.buyerId : x.c.sellerId);
        return h('button', { class: 'story', role: 'listitem', on: { click: x.go }, 'aria-label': `${x.label}: ${x.a ? x.a.title : x.c.title}` }, h('span', { class: 'story-ring' }, h('span', { class: 'story-inner' }, avatar(who, 60)), h('span', { class: 'story-kind ' + x.tone }, icon(x.icon, 14))), h('span', { class: 'lbl', text: x.label }));
      }) : h('div', { class: 'story seen' }, h('span', { class: 'story-ring' }, h('span', { class: 'story-inner' }, h('span', { class: 'ag-ico', style: { width: '100%', height: '100%', borderRadius: '50%' } }, icon('check', 24)))), h('span', { class: 'lbl', text: 'Tudo em dia' })));
    // próximo pagamento/recebimento
    const nexts = [];
    mine.filter((a) => a.status === 'active').forEach((a) => liveSchedule(a).forEach((s) => { if (C.OPEN.includes(s.status) && !s.earlyId) nexts.push({ a, s }); }));
    nexts.sort((x, y) => x.s.due.localeCompare(y.s.due));
    const nx = nexts.find((x) => x.s.due >= td) || nexts[0];
    const overdue = nexts.filter((x) => x.s.due < td);
    const openTotal = mine.reduce((s, a) => s + C.totals(a).open, 0);
    const review = mine.reduce((n, a) => n + a.schedule.filter((s) => s.status === 'review').length, 0);
    const month = td.slice(0, 7);
    const monthDue = nexts.filter((x) => x.s.due.slice(0, 7) === month).reduce((s, x) => s + C.remainingOf(x.s), 0);
    const hero = nx ? h('section', { class: 'hero', 'aria-label': r === 'buyer' ? 'Próximo pagamento' : 'Próximo recebimento' }, h('span', { class: 'hero-mark', 'aria-hidden': 'true' }, U.brandMark(96)),
      h('div', { class: 'eyebrow' }, r === 'buyer' ? 'Seu próximo pagamento' : 'Seu próximo recebimento'),
      h('div', { class: 'big money', text: money(C.remainingOf(nx.s), cur(nx.a)) }),
      h('div', { class: 'what', text: `${nx.a.title} · ${isRec(nx.a) ? 'período' : 'parcela'} ${instLabel(nx.s)}` }),
      h('div', { class: 'when' }, (nx.s.due < td ? 'Venceu em ' : 'Vence em ') + date(nx.s.due) + ` · ${r === 'buyer' ? 'para' : 'de'} ${other(nx.a).name}`),
      h('div', { class: 'hero-meta' }, h('span', { class: 'hero-chip' }, icon('calendar', 14), `${C.daysBetween(td, nx.s.due) >= 0 ? 'em ' + C.daysBetween(td, nx.s.due) + ' dia(s)' : Math.abs(C.daysBetween(td, nx.s.due)) + ' dia(s) de atraso'}`), h('span', { class: 'hero-chip' }, icon('doc', 14), instPill(nx.s)[0])),
      r === 'buyer' ? h('button', { class: 'btn lime', on: { click: () => openPay(nx.a.id, nx.s.id) } }, icon('upload', 18), 'Informar pagamento') : h('button', { class: 'btn lime', on: { click: () => go('#/acordo/' + nx.a.id) } }, 'Acompanhar acordo', icon('right', 18)))
      : h('section', { class: 'hero' }, h('span', { class: 'hero-mark', 'aria-hidden': 'true' }, U.brandMark(96)), h('div', { class: 'eyebrow' }, r === 'buyer' ? 'Pagamentos' : 'Recebimentos'), h('div', { class: 'big', style: { fontSize: '28px' } }, r === 'buyer' ? 'Nada a pagar por aqui.' : 'Nenhum recebimento ativo.'), h('div', { class: 'when' }, r === 'seller' ? 'Crie um acordo e envie para o aceite do comprador.' : 'Quando alguém propuser um acordo, ele aparece aqui.'), r === 'seller' ? h('button', { class: 'btn lime', on: { click: () => newAgreement() } }, icon('plus', 18), t('newAgreement')) : null);
    const stats = indicators(r);
    const feedAll = S.feed.map(post).filter(Boolean); const feedN = S.feedN || 6; const feedEls = feedAll.slice(0, feedN);
    const seller = S.ags.filter((a) => a.sellerId === meId()).length, buyer = S.ags.filter((a) => a.buyerId === meId()).length;
    const hello = h('div', { class: 'hello' }, h('div', null, h('div', { class: 'eyebrow', text: new Date().toLocaleDateString(U.lang, { weekday: 'long', day: 'numeric', month: 'long' }) }), h('div', { style: { fontSize: '20px', fontWeight: 760, letterSpacing: '-.03em' } }, `Olá, ${me.name.split(' ')[0]} 👋`)),
      seg([['buyer', `${t('buying')} · ${buyer}`], ['seller', `${t('selling')} · ${seller}`], ...(S.dash && S.dash.hasRecurring ? [['recurring', t('recurring')]] : [])], r, (v) => { S.homeRole = v; sessionStorage.setItem('pacto8:homeRole', v); render(); }, 'Ver como'));
    const left = h('div', null, verifyBanner(), mfaBanner(), hello, h('div', { class: 'section-h', style: { marginTop: '4px' } }, h('h2', null, t('pending')), h('span', { class: 'small muted', text: acts.length ? `${acts.length} ação(ões)` : '' })), stories, hero, stats,
      h('div', { class: 'section-h' }, h('h2', null, r === 'buyer' ? 'Meus acordos' : r === 'recurring' ? 'Contratos recorrentes' : 'Acordos que vendi'), h('button', { class: 'link-btn', on: { click: () => { S.filters.ag = r; go('#/acordos'); } } }, t('seeAll'), icon('right', 16))),
      mine.length ? h('div', { class: 'hscroll' }, mine.slice(0, 8).map((a) => agCard(a))) : empty('doc', 'Nenhum acordo aqui', r === 'seller' ? 'Cadastre uma venda, serviço ou empréstimo e envie para aceite.' : 'Você ainda não comprou nada pelo PACTO.', r === 'seller' ? h('button', { class: 'btn', on: { click: () => newAgreement() } }, icon('plus', 18), t('newAgreement')) : null));
    const right = h('div', { class: 'aside' }, h('div', { class: 'section-h', style: { marginTop: '4px' } }, h('h2', null, t('activity')), h('span', { class: 'pill info' }, icon('hash', 12), 'auditável')),
      feedEls.length ? h('div', { class: 'feed' }, feedEls, feedAll.length > feedN ? h('button', { class: 'btn ghost block', on: { click: () => { S.feedN = feedN + 10; render(); } } }, 'Ver mais atividade') : null) : empty('msg', 'Sem atividade ainda', 'Propostas, aceites e comprovantes aparecem aqui, como num feed.'),
      h('p', { class: 'small muted', style: { margin: '14px 4px' } }, 'Avisos aparecem no app. E-mail e push: não ativos nesta versão.'));
    return h('div', { class: 'home-grid' }, left, right);
  }

  /* ---------- Acordos ---------- */
  function searchBox(value, onInput, label) {
    const inp = h('input', { type: 'search', class: 'input', value, placeholder: label || t('search'), 'aria-label': label || t('search'), style: { paddingLeft: '42px' }, on: { input: (e) => onInput(e.target.value) } });
    return h('div', { class: 'input-affix', style: { marginBottom: '12px' } }, h('span', null, icon('search', 18)), inp);
  }
  function matchQ(a, q) { if (!q) return true; q = q.toLowerCase(); return [a.title, a.category, a.description, other(a).name].some((x) => String(x || '').toLowerCase().includes(q)); }
  function agreementsPage() {
    const f = S.filters;
    const defs = [['all', 'Todos', () => true], ['buyer', t('buying'), (a) => role(a) === 'buyer'], ['seller', t('selling'), (a) => role(a) === 'seller'], ['pending', 'Aguardando aceite', (a) => !!C.pendingVersion(a) || a.status === 'proposed'], ['active', 'Ativos', (a) => a.status === 'active'], ['late', 'Com atraso', (a) => a.status === 'active' && a.schedule.some((s) => C.OPEN.includes(s.status) && s.due < today())], ['settled', 'Quitados', (a) => a.status === 'settled'], ['consolidated', 'Unificados', (a) => a.status === 'consolidated' || a.category === 'Unificação']];
    const listEl = h('div', { class: 'list' });
    const paint = () => {
      const fn = defs.find((d) => d[0] === f.ag)[2];
      const items = S.ags.filter(fn).filter((a) => matchQ(a, f.agq));
      listEl.replaceChildren(...(items.length ? items.map((a) => agCard(a)) : [empty('search', 'Nada encontrado', 'Tente outro filtro ou termo de busca.')]));
    };
    const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtros' }, defs.map(([k, l, fn]) => h('button', { class: 'chip', 'aria-pressed': String(f.ag === k), on: { click: (e) => { f.ag = k; chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); paint(); } } }, l, h('span', { class: 'count', text: String(S.ags.filter(fn).length) }))));
    paint();
    return h('div', null, searchBox(f.agq, (v) => { f.agq = v; paint(); }), chips, h('div', { style: { height: '8px' } }), S.ags.length ? listEl : empty('doc', 'Nenhum acordo ainda', 'Toda venda, serviço ou empréstimo vira um acordo com parcelas claras.', h('button', { class: 'btn', on: { click: () => newAgreement() } }, icon('plus', 18), t('newAgreement'))));
  }

  /* ---------- Detalhe ---------- */
  function partyChip(u, label) { return h('div', { class: 'party' }, avatar(u, 30), h('div', null, h('small', { text: label }), u.name)); }
  function detailPage(id, tab) {
    const a = findAg(id);
    if (!a) return empty('lock', 'Acordo indisponível', 'Ele não existe ou você não é parte deste acordo. Cada pessoa só vê os próprios contratos.', h('button', { class: 'btn', on: { click: () => go('#/acordos') } }, 'Voltar aos acordos'));
    const r = role(a), o = other(a), [lbl, kind] = statusOf(a), tt = C.totals(a), total = contracted(a), pv = C.pendingVersion(a);
    tab = tab || 'parcelas';
    const ratio = total ? (tt.paid + tt.discount) / total : 0;
    const plan = a.terms && !isRec(a) ? C.calcPlan(a.terms) : null;
    const seller = person(a.sellerId), buyer = a.buyerId ? person(a.buyerId) : { name: a.buyerEmail + ' (convite)', photo: '' };
    const actions = [];
    if (pv && pv.authorId !== meId()) actions.push(h('button', { class: 'btn lime', on: { click: () => openProposal(a.id) } }, icon('handshake', 18), 'Analisar proposta v' + pv.no));
    if (a.status === 'active' && !a.lockedBy) {
      const n = nextOpen(a);
      if (r === 'buyer' && n && C.OPEN.includes(n.status) && !n.earlyId) actions.push(h('button', { class: 'btn', on: { click: () => openPay(a.id, n.id) } }, icon('upload', 18), 'Informar pagamento'));
      if (!pv) actions.push(h('button', { class: 'btn ghost', on: { click: () => (isRec(a) ? openRecurringChange(a.id) : openRenegotiate(a.id)) } }, icon(isRec(a) ? 'repeat' : 'swap', 18), isRec(a) ? 'Reajustar, suspender ou cancelar' : 'Propor mudança'));
      if (!isRec(a) && !C.activeEarly(a) && !pv) actions.push(h('button', { class: 'btn ghost', on: { click: () => openEarlyNew(a.id) } }, icon('zap', 18), r === 'seller' ? 'Oferecer antecipação' : 'Antecipar parcelas'));
      const ae = C.activeEarly(a); if (ae) actions.push(h('button', { class: 'btn ghost', on: { click: () => openEarly(a.id, ae.id) } }, icon('zap', 18), 'Antecipação em andamento'));
    }
    (a.delays || []).filter((d) => d.status === 'pending').forEach((d) => actions.push(h('button', { class: 'btn ' + (d.versions[d.versions.length - 1].authorId !== meId() ? 'lime' : 'ghost'), on: { click: () => openDelayRespond(a.id, d.id) } }, icon('clock', 18), d.versions[d.versions.length - 1].authorId !== meId() ? 'Responder justificativa' : 'Justificativa enviada')));
    if (a.billing === 'single' && r === 'seller' && a.buyerId && ['active', 'settled'].includes(a.status)) actions.push(h('button', { class: 'btn ghost', on: { click: () => newAgreement({ fromAgreementId: a.id, title: a.title, category: a.category, group: a.group, billing: 'recurring' }) } }, icon('repeat', 18), 'Transformar em pacote ou recorrente'));
    if (a.status === 'refused' && r === 'seller') actions.push(h('button', { class: 'btn', on: { click: () => openCounter(a.id, true) } }, icon('edit', 18), 'Enviar nova proposta'));
    actions.push(h('button', { class: 'btn ghost', on: { click: () => openNote(a.id) } }, icon('msg', 18), 'Observação'));

    const head = h('section', { class: 'detail-head glass' },
      h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { class: 'ag-ico', style: { width: '52px', height: '52px', borderRadius: '16px' } }, icon(agIcon(a), 26)),
        h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'eyebrow', text: a.category + ' · ' + BILL[a.billing || 'installment'] + (a.currentVersion ? ` · versão vigente v${a.currentVersion}` : ` · proposta v${a.versions.length}`) }), h('h2', { style: { margin: '2px 0 6px', fontSize: '22px', letterSpacing: '-.035em', lineHeight: 1.15 }, text: a.title }), pill(lbl, kind))),
      h('div', { class: 'parties', style: { marginTop: '14px' } }, partyChip(seller, a.sellerId === meId() ? 'Vende · você' : 'Vende'), icon('right', 16, 'muted'), partyChip(buyer, a.buyerId === meId() ? 'Compra · você' : 'Compra')),
      a.status === 'active' || a.status === 'settled' || a.status === 'consolidated'
        ? h('div', { class: 'balance' }, ring(ratio, 76, `${Math.round(ratio * 100)}% quitado`), h('div', null, h('div', { class: 'eyebrow' }, r === 'seller' ? 'Saldo a receber' : 'Saldo a pagar'), h('div', { class: 'big', text: money(tt.open, cur(a)) }), h('div', { class: 'small muted', text: isRec(a) ? `Pago ${money(tt.paid, cur(a))} · ${a.schedule.filter((x) => x.kind === 'recurring').length} cobrança(s) gerada(s) até agora` : `Pago ${money(tt.paid, cur(a))} de ${money(total, cur(a))} contratados` })))
        : h('div', { class: 'balance' }, h('div', null, h('div', { class: 'eyebrow' }, 'Valor total proposto'), h('div', { class: 'big', text: money(total, cur(a)) }), h('div', { class: 'small muted', text: 'As parcelas só são geradas depois do aceite das duas partes.' }))),
      a.lockedBy ? h('div', { class: 'note', style: { marginTop: '12px' } }, icon('layers', 18), 'Este acordo está em uma proposta de unificação. Ele fica travado até a resposta.') : null,
      a.consolidatedInto ? h('div', { class: 'note', style: { marginTop: '12px' } }, icon('layers', 18), h('span', null, 'Saldo aberto levado à unificação. ', h('button', { class: 'link-btn', on: { click: () => go('#/acordo/' + a.consolidatedInto) } }, 'Abrir acordo unificado'))) : null,
      h('div', { class: 'actions' }, actions));
    const tabs = [['parcelas', 'Parcelas'], ['negociacao', 'Negociação'], ['antecipacoes', 'Antecipações'], ['historico', 'Histórico'], ['detalhes', 'Detalhes']];
    const tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), on: { click: () => go(`#/acordo/${a.id}/${k}`) } }, l)));
    const body = tab === 'parcelas' ? installmentsTab(a) : tab === 'negociacao' ? versionsTab(a) : tab === 'antecipacoes' ? earlyTab(a) : tab === 'historico' ? historyTab(a) : detailsTab(a);
    const aside = h('div', { class: 'aside' }, h('div', { class: 'card glass' }, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'Condições vigentes'),
      isRec(a) && a.terms ? recurringAside(a) : plan ? [kv('Modalidade', { none: 'Sem juros', simple: 'Juros simples', price: 'Tabela Price' }[plan.method]), kv('Taxa', U.pct(a.terms.ratePct) + ' a.m.'), kv('Parcelas', `${a.terms.count}× ${money(plan.installmentCents, cur(a))}`), plan.downCents ? kv('Entrada', money(plan.downCents, cur(a))) : null, plan.extrasCents ? kv('Extras', money(plan.extrasCents, cur(a))) : null, kv('Juros totais', money(plan.interestCents, cur(a))), kv('Total contratado', money(plan.grandTotalCents, cur(a))), kv('Previsão de quitação', date(plan.settlementDate)), tt.discount ? kv('Economia com descontos', money(tt.discount, cur(a))) : null]
        : h('p', { class: 'muted small', text: 'Ainda sem condições vigentes — aguardando o primeiro aceite.' })),
      h('div', { class: 'card glass' }, h('div', { class: 'row' }, h('span', { class: 'ev-ico ok' }, icon('shield', 14)), h('b', null, 'Regra do PACTO')), h('p', { class: 'small muted', style: { margin: '6px 0 0' }, text: 'Nenhuma condição muda sem que as duas partes aceitem exatamente a mesma versão. Parcelas pagas nunca são alteradas.' })));
    return h('div', null, h('button', { class: 'link-btn', style: { marginBottom: '8px' }, on: { click: () => history.length > 1 ? history.back() : go('#/acordos') } }, icon('left', 16), t('back')), h('div', { class: 'detail-grid' }, h('div', null, head, tabBar, body), aside));
  }
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', { text: k }), h('b', { text: v }));
  function instRow(a, s, { showReports = true } = {}) {
    const st = instState(s), [l, k] = instPill(s), r = role(a);
    const side = [];
    if (a.status === 'active' && r === 'buyer' && C.OPEN.includes(s.status) && !s.earlyId) side.push(h('button', { class: 'btn sm', on: { click: () => openPay(a.id, s.id) } }, s.status === 'correction' ? 'Reenviar' : 'Informar'));
    if (r === 'seller' && s.status === 'review') side.push(h('button', { class: 'btn lime sm', on: { click: () => openReview(a.id, s.id) } }, 'Conferir'));
    if (a.status === 'active' && r === 'buyer' && st === 'overdue' && !s.delayId && !s.earlyId) side.push(h('button', { class: 'btn ghost sm', on: { click: () => openDelay(a.id, s.id) } }, 'Justificar atraso'));
    if (s.delayId) side.push(h('button', { class: 'btn ghost sm', on: { click: () => openDelayRespond(a.id, s.delayId) } }, 'Justificativa'));
    side.push(h('button', { class: 'icon-btn sm', 'aria-label': 'Detalhes da parcela ' + instLabel(s), title: 'Detalhes, comprovantes e histórico', on: { click: () => openInstallment(a.id, s.id) } }, icon('more', 18)));
    const row = h('div', { class: 'inst' }, h('span', { class: 'inst-n ' + st + (k === 'warn' && st === 'pending' ? ' soon' : ''), text: instLabel(s), 'aria-label': 'Parcela ' + instLabel(s) }),
      h('div', { class: 'inst-main' }, h('div', { class: 'a', text: money(s.amountCents, cur(a)) }), h('div', { class: 'b' }, icon('calendar', 13), date(s.due), pill(l, k), s.earlyId && s.status !== 'paid' ? pill('Em antecipação', 'lime') : null, s.discountCents ? pill('Desconto ' + money(s.discountCents, cur(a)), 'lime') : null, s.paidCents && s.status !== 'paid' ? h('span', { text: 'pago ' + money(s.paidCents, cur(a)) }) : null, s.delayId ? pill('Justificativa em análise', 'info') : null, s.originalDue ? h('span', { class: 'muted', text: 'venc. original ' + dateShort(s.originalDue) + ' (atraso registrado)' }) : null, s.kind === 'recurring' && s.period ? h('span', { class: 'muted', text: 'período ' + dateShort(s.period.from) + '–' + dateShort(s.period.to) }) : null)),
      h('div', { class: 'inst-side' }, side),
      showReports && s.reports.length ? h('div', { class: 'reports' }, s.reports.map((rep) => reportView(a, rep))) : null);
    return row;
  }
  function reportView(a, rep) {
    const st = { review: ['Em análise', 'info'], approved: ['Aprovado', 'ok'], correction: ['Correção solicitada', 'warn'], refused: ['Recusado', 'danger'] }[rep.status] || [rep.status, ''];
    return h('div', { class: 'report' }, h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, rep.locked ? icon('lock', 14) : icon('clip', 14), h('b', { text: money(rep.amountCents, cur(a)) }), h('span', { class: 'muted', text: 'pago em ' + date(rep.paidAt) })), pill(st[0], st[1])),
      rep.comment ? h('div', { class: 'muted', text: '“' + rep.comment + '”' }) : null,
      rep.reviewReason ? h('div', null, h('b', null, 'Vendedor: '), rep.reviewReason) : null,
      h('div', { class: 'row wrap' }, h('button', { class: 'link-btn', on: { click: () => openFile(rep.attachment.fileId) } }, icon('eye', 15), rep.attachment.name), h('span', { class: 'hashline', title: 'SHA-256 do arquivo', text: 'sha256 ' + rep.attachment.sha256.slice(0, 16) + '…' }), rep.locked ? h('span', { class: 'small muted', text: '· imutável' }) : null));
  }
  function installmentsTab(a) {
    if (!a.schedule.length) return empty('clock', 'Parcelas ainda não geradas', 'Depois do aceite bilateral, o cronograma aparece aqui.');
    const f = S.filters.inst[a.id] || 'all';
    const defs = [['upcoming', 'A vencer', (s) => C.OPEN.includes(s.status) && s.due >= today()], ['overdue', 'Atrasadas', (s) => instState(s) === 'overdue'], ['review', 'Em conferência', (s) => s.status === 'review'], ['paid', 'Quitadas', (s) => s.status === 'paid'], ['all', 'Todas', (s) => !['replaced', 'consolidated'].includes(s.status)], ['archived', 'Substituídas', (s) => ['replaced', 'consolidated'].includes(s.status)]];
    const fn = defs.find((d) => d[0] === f)[2];
    const rows = a.schedule.filter(fn).sort((x, y) => x.due.localeCompare(y.due));
    return h('div', null, h('div', { class: 'chips' }, defs.map(([k, l, fx]) => { const n = a.schedule.filter(fx).length; return k === 'archived' && !n ? null : h('button', { class: 'chip', 'aria-pressed': String(f === k), on: { click: () => { S.filters.inst[a.id] = k; render(); } } }, l, h('span', { class: 'count', text: String(n) })); })),
      h('div', { class: 'card glass', style: { marginTop: '8px', padding: '6px 14px' } }, rows.length ? rows.map((s) => instRow(a, s)) : h('p', { class: 'muted', style: { padding: '14px 0' }, text: 'Nenhuma parcela neste filtro.' })));
  }
  function termsDiff(before, after, curr) {
    if (after && after.mode === 'recurring') return recurringDiff(before, after, curr);
    if (!before) return h('div', { class: 'diff' }, h('div', { class: 'same' }, `${money(after.totalCents, curr)} · ${after.count}× ${after.installmentCents ? money(after.installmentCents, curr) : ''} · ${U.pct(after.ratePct)} a.m.`));
    const rows = [['Valor', money(before.totalCents, curr), money(after.totalCents, curr)], ['Parcelas', before.count + '×', after.count + '×'], ['Parcela', before.installmentCents ? money(before.installmentCents, curr) : '—', after.installmentCents ? money(after.installmentCents, curr) : '—'], ['Juros', U.pct(before.ratePct) + ' a.m.', U.pct(after.ratePct) + ' a.m.'], ['1º vencimento', date(before.firstDue), date(after.firstDue)]];
    return h('div', { class: 'diff' }, rows.map(([k, x, y]) => [h('div', { class: 'k', text: k }), x === y ? h('div', { class: 'same', text: y }) : [h('span', { class: 'old', text: x }), icon('right', 14, 'muted'), h('span', { class: 'new', text: y })]]));
  }
  function versionsTab(a) {
    const vt = versionsTimeline(a);
    return (a.delays || []).length ? h('div', null, delaysSection(a), h('div', { class: 'section-h' }, h('h2', null, 'Versões do acordo')), vt) : vt;
  }
  function versionsTimeline(a) {
    const vs = [...a.versions].reverse();
    const ST = { pending: ['Aguardando aceite', 'lime'], accepted: ['Aceita pelos dois', 'ok'], superseded: ['Substituída por contraproposta', ''], refused: ['Recusada', 'danger'] };
    return h('div', { class: 'timeline' }, vs.map((v) => {
      const au = v.authorId === meId() ? { ...S.me, name: 'Você' } : person(v.authorId);
      const after = C.summarizeTerms(v.terms);
      return h('div', { class: 'tl-item glass ' + v.status }, h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, avatar(au, 30), h('div', null, h('b', { text: `v${v.no} · ${v.kind === 'counter' ? 'Contraproposta' : v.kind === 'consolidation' ? 'Unificação' : 'Proposta'}${v.change && v.change !== 'start' ? ' · ' + CHG[v.change] : ''}` }), h('div', { class: 'small muted', text: `${au.name} · ${U.dateTime(v.at)}` }))), pill(...ST[v.status])),
        h('div', { class: 'small', style: { marginTop: '8px' }, text: '“' + v.reason + '”' }), termsDiff(v.before, after, cur(a)),
        v.refuseReason ? h('div', { class: 'small', style: { marginTop: '6px' } }, h('b', null, 'Motivo da recusa: '), v.refuseReason) : null,
        h('div', { class: 'hashline', style: { marginTop: '8px' }, text: 'termos sha256 ' + v.termsHash.slice(0, 24) + '… · aceites: ' + v.acceptedBy.map((x) => (x.userId === meId() ? 'você' : person(x.userId).name)).join(' + ') }),
        v.status === 'pending' && v.authorId !== meId() ? h('div', { class: 'actions' }, h('button', { class: 'btn lime sm', on: { click: () => openProposal(a.id) } }, 'Responder')) : null);
    }));
  }
  function earlyTab(a) {
    if (!a.early.length) return empty('zap', 'Nenhuma antecipação', a.status === 'active' ? 'Antecipe parcelas futuras com desconto de 1% a 70% definido pelo vendedor. Exige aceite dos dois.' : 'Disponível com o acordo ativo.', a.status === 'active' && !C.activeEarly(a) ? h('button', { class: 'btn', on: { click: () => openEarlyNew(a.id) } }, icon('zap', 18), 'Simular antecipação') : null);
    const ST = { awaiting_buyer: ['Aguardando comprador', 'warn'], awaiting_seller: ['Aguardando vendedor', 'warn'], accepted: ['Aceita · aguardando pagamento', 'lime'], review: ['Comprovante em análise', 'info'], settled: ['Quitada com desconto', 'ok'], refused: ['Recusada', 'danger'] };
    return h('div', { class: 'stack' }, [...a.early].reverse().map((e) => { const c = C.earlyCalc(a, e.installmentIds, e.pct); return h('div', { class: 'card glass' }, h('div', { class: 'row between wrap' }, h('b', { text: `${e.installmentIds.length} parcela(s) · ${e.pct ? e.pct + '% de desconto' : 'desconto a definir'}` }), pill(...(ST[e.status] || [e.status, '']))), kv('Valor original', money(e.grossCents || c.grossCents, cur(a))), kv('Economia', money(e.discountCents ?? c.discountCents, cur(a))), kv('Valor a pagar', money(e.netCents ?? c.netCents, cur(a))), h('div', { class: 'actions' }, h('button', { class: 'btn ghost sm', on: { click: () => openEarly(a.id, e.id) } }, 'Abrir'))); }));
  }
  function historyTab(a) {
    const box = h('div', null, U.skeleton(2));
    api.auditLog(S.token, a.id).then(({ events, chain }) => {
      box.replaceChildren(
        h('div', { class: 'note ' + (chain.ok ? 'ok' : 'danger'), style: { marginBottom: '12px' } }, icon(chain.ok ? 'shield' : 'alert', 18), chain.ok ? `Cadeia de eventos íntegra · ${chain.count} eventos verificados por SHA-256.` : `Integridade comprometida no evento #${chain.brokenAt} (${chain.reason}). Os dados locais foram alterados fora do app.`),
        h('div', { class: 'card glass', style: { padding: '6px 14px' } }, [...events].reverse().map((e) => { const d = EV[e.type]; const who = e.actorId === meId() ? 'Você' : person(e.actorId).name; return h('div', { class: 'inst', style: { gridTemplateColumns: 'auto 1fr' } }, h('span', { class: 'ev-ico ' + ((d && d[1]) || '') }, icon((d && d[0]) || 'doc', 13)), h('div', null, h('div', { class: 'small' }, h('b', { text: who }), ' ', d ? d[2](e.data) : e.type, h('span', { class: 'muted', text: ' · ' + U.dateTime(e.at) })), h('div', { class: 'hashline', text: `#${e.seq} ${e.hash.slice(0, 20)}… ← ${e.prevHash.slice(0, 12)}…` }))); })));
    }).catch(handleErr);
    return box;
  }
  function detailsTab(a) {
    const inp = h('textarea', { placeholder: 'Escreva uma observação visível para as duas partes', maxlength: '500', 'aria-label': 'Observação' });
    return h('div', { class: 'stack' },
      h('div', { class: 'card glass' }, h('div', { class: 'eyebrow' }, 'Descrição'), h('p', { style: { margin: '6px 0 0' }, text: a.description || 'Sem descrição.' }), kv('Moeda', a.currency), kv('Criado em', U.dateTime(a.createdAt)), a.activatedAt ? kv('Ativado em', U.dateTime(a.activatedAt)) : null),
      a.origins && a.origins.length ? h('div', { class: 'card glass' }, h('div', { class: 'eyebrow' }, 'Origem da unificação (preservada)'), a.origins.map((o) => h('div', { class: 'kv' }, h('button', { class: 'link-btn', on: { click: () => go('#/acordo/' + o.agreementId) } }, o.title), h('b', { text: money(o.openCents, cur(a)) })))) : null,
      h('div', { class: 'card glass' }, h('div', { class: 'eyebrow' }, 'Observações'), a.notes.length ? a.notes.map((n) => h('div', { class: 'kv' }, h('span', null, (n.by === meId() ? 'Você' : person(n.by).name) + ' · ' + U.dateTime(n.at)), h('b', { style: { fontWeight: 500, textAlign: 'left', flex: 1, marginLeft: '12px' }, text: n.text }))) : h('p', { class: 'muted small', text: 'Nenhuma observação.' }),
        field('Nova observação', inp), h('button', { class: 'btn sm', on: { click: () => call(() => api.addNote(S.token, a.id, inp.value), 'Observação registrada.') } }, 'Registrar')));
  }
  function openNote(id) { go(`#/acordo/${id}/detalhes`); setTimeout(() => { const ta = document.querySelector('textarea'); if (ta) ta.focus(); }, 80); }
  async function openFile(fileId) {
    try {
      const f = await api.getFile(S.token, fileId);
      const blob = new Blob([C.b64.dec(f.dataB64)], { type: f.type });
      const url = URL.createObjectURL(blob);
      const body = h('div', null, h('div', { class: 'note ' + (f.integrity ? 'ok' : 'danger') }, icon(f.integrity ? 'shield' : 'alert', 18), f.integrity ? 'Integridade conferida: o SHA-256 do arquivo bate com o registrado no envio.' : 'O conteúdo do arquivo não confere com o hash registrado.'),
        f.type.startsWith('image/') ? h('img', { src: url, alt: 'Comprovante ' + f.name, style: { width: '100%', borderRadius: '14px', marginTop: '12px' } }) : h('p', { class: 'muted', text: 'Documento PDF · ' + Math.round(f.size / 1024) + ' KB' }),
        kv('Arquivo', f.name), kv('Tipo detectado', f.type), kv('Enviado em', U.dateTime(f.at)), h('div', { class: 'hashline', text: 'sha256 ' + f.sha256 }),
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: url, download: f.name }, icon('download', 18), 'Baixar'), f.type === 'application/pdf' ? h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, icon('eye', 18), 'Abrir PDF') : null));
      sheet('Comprovante', body, { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000) });
    } catch (e) { handleErr(e); }
  }

  /* ---------- editor de condições + cálculo ao vivo ---------- */
  function moneyInput(cents, onChange, { id, label, currency = 'BRL' } = {}) {
    const sym = { BRL: 'R$', USD: 'US$', EUR: '€' }[currency];
    const inp = h('input', { id, inputmode: 'decimal', autocomplete: 'off', value: cents ? U.centsToInput(cents) : '', placeholder: '0,00', 'aria-label': label,
      on: { input: (e) => { const v = e.target.value.trim() === '' ? 0 : C.parseMoney(e.target.value); e.target.setAttribute('aria-invalid', String(Number.isNaN(v))); onChange(Number.isNaN(v) ? NaN : v); }, blur: (e) => { const v = C.parseMoney(e.target.value); if (!Number.isNaN(v) && e.target.value) e.target.value = U.centsToInput(v); } } });
    return h('div', { class: 'input-affix' }, h('span', { text: sym }), inp);
  }
  function plusDaysISO(n) { return C.plusDays(today(), n); }
  function termsEditor(init, { mode = 'create', currency = 'BRL', onChange }) {
    const tm = { totalCents: 0, downCents: 0, downDue: today(), extras: [], count: 10, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: plusDaysISO(30), bankRef: null, ...init };
    tm.extras = (tm.extras || []).map((x) => ({ ...x }));
    const emit = () => onChange && onChange(tm);
    const wrap = h('div');
    const draw = () => {
      if (mode === 'single') {
        Object.assign(tm, { count: 1, method: 'none', ratePct: 0, downCents: 0, downDue: null, extras: [] });
        wrap.replaceChildren(field('Valor do atendimento/serviço', moneyInput(tm.totalCents, (v) => { tm.totalCents = v; emit(); }, { id: 'te-total', label: 'Valor', currency }), 'Serviço avulso gera uma única cobrança, sem juros.'),
          field('Vencimento', h('input', { id: 'te-first', type: 'date', value: tm.firstDue, on: { input: (e) => { tm.firstDue = e.target.value; emit(); } } })),
          h('div', { class: 'note' }, icon('repeat', 18), 'Virou cliente frequente? Depois do aceite você pode transformar este atendimento em pacote ou contrato recorrente — por um novo acordo, sem apagar este.'));
        return;
      }
      const rateInp = h('input', { id: 'te-rate', type: 'number', inputmode: 'decimal', min: '0', max: '10', step: '0.01', value: tm.method === 'none' ? 0 : tm.ratePct, disabled: tm.method === 'none', on: { input: (e) => { tm.ratePct = Number(e.target.value); emit(); } } });
      const countInp = h('input', { id: 'te-count', type: 'number', inputmode: 'numeric', min: '1', max: '600', value: tm.count, on: { input: (e) => { tm.count = parseInt(e.target.value, 10); range.value = Math.min(120, tm.count || 1); emit(); } } });
      const range = h('input', { type: 'range', min: '1', max: '120', value: Math.min(120, tm.count), 'aria-label': 'Número de parcelas (deslizar)', on: { input: (e) => { tm.count = parseInt(e.target.value, 10); countInp.value = tm.count; emit(); } } });
      const parts = [];
      if (mode !== 'consolidation') parts.push(field(mode === 'reneg' ? 'Saldo a renegociar' : 'Valor total (editável)', moneyInput(tm.totalCents, (v) => { tm.totalCents = v; emit(); }, { id: 'te-total', label: 'Valor total', currency }), mode === 'reneg' ? 'Pré-preenchido com o saldo em aberto. Parcelas já pagas não mudam.' : 'Valor do bem, serviço ou empréstimo.'));
      if (mode === 'create') parts.push(h('div', { class: 'form-grid' }, field('Entrada (opcional)', moneyInput(tm.downCents, (v) => { tm.downCents = v; emit(); }, { id: 'te-down', label: 'Entrada', currency })), field('Data da entrada', h('input', { id: 'te-downdue', type: 'date', value: tm.downDue || today(), on: { input: (e) => { tm.downDue = e.target.value; emit(); } } }))));
      parts.push(h('div', { class: 'field' }, h('label', { for: 'te-count', text: 'Número de parcelas' }), h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, range), h('div', { style: { width: '96px' } }, countInp))));
      parts.push(h('div', { class: 'field' }, h('label', null, 'Periodicidade'), seg([['monthly', 'Mensal'], ['biweekly', 'Quinzenal'], ['weekly', 'Semanal']], tm.periodicity, (v) => { tm.periodicity = v; emit(); }, 'Periodicidade')));
      parts.push(field('Primeiro vencimento', h('input', { id: 'te-first', type: 'date', value: tm.firstDue, on: { input: (e) => { tm.firstDue = e.target.value; emit(); } } })));
      parts.push(h('div', { class: 'field' }, h('label', null, 'Modalidade de cálculo'), seg([['none', 'Sem juros'], ['simple', 'Juros simples'], ['price', 'Tabela Price']], tm.method, (v) => { tm.method = v; if (v === 'none') tm.ratePct = 0; else if (!tm.ratePct) tm.ratePct = 1; draw(); emit(); }, 'Modalidade')));
      if (tm.method !== 'none') parts.push(field('Taxa de juros (% ao mês)', h('div', { class: 'input-affix suffix' }, rateInp, h('span', null, '% a.m.')), 'De 0% a 10% ao mês. Em quinzenal/semanal a taxa é convertida para o período.'));
      if (mode === 'create') {
        parts.push(h('div', { class: 'field' }, h('label', null, 'Parcelas extras (balões, intermediárias)'), tm.extras.map((x, i) => h('div', { class: 'extras-row', style: { marginBottom: '8px' } },
          moneyInput(x.amountCents, (v) => { x.amountCents = v; emit(); }, { label: 'Valor da extra ' + (i + 1), currency }), h('input', { type: 'date', class: 'input', value: x.due, 'aria-label': 'Data da extra ' + (i + 1), on: { input: (e) => { x.due = e.target.value; emit(); } } }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remover extra', on: { click: () => { tm.extras.splice(i, 1); draw(); emit(); } } }, icon('x', 18)))),
          h('button', { class: 'btn ghost sm', type: 'button', on: { click: () => { tm.extras.push({ amountCents: 0, due: plusDaysISO(180) }); draw(); emit(); } } }, icon('plus', 16), 'Adicionar extra'), h('small', { class: 'hint', text: 'Valores fixos nas datas indicadas, descontados do saldo financiado.' })));
      }
      if (mode !== 'consolidation') {
        const ref = tm.bankRef || { pct: '', source: '' };
        parts.push(h('details', { class: 'field', open: !!tm.bankRef }, h('summary', { style: { cursor: 'pointer', fontWeight: 700, fontSize: '13px' } }, 'Comparar com taxa bancária (opcional)'),
          h('div', { class: 'form-grid', style: { marginTop: '10px' } }, field('Taxa de referência (% a.m.)', h('input', { type: 'number', step: '0.01', min: '0', max: '10', value: ref.pct, on: { input: (e) => { tm.bankRef = { ...(tm.bankRef || {}), pct: Number(e.target.value) }; emit(); } } })),
            field('Fonte identificada', h('input', { maxlength: '80', placeholder: 'ex.: banco e produto', value: ref.source, on: { input: (e) => { tm.bankRef = { ...(tm.bankRef || {}), source: e.target.value }; emit(); } } }))),
          h('small', { class: 'hint', text: 'Só comparamos quando você informa a taxa e a fonte. O PACTO não inventa taxas.' })));
      }
      wrap.replaceChildren(...parts);
    };
    draw();
    return { el: wrap, get: () => tm };
  }
  function donut(parts, size = 92) {
    const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0) || 1, r = size / 2 - 9, c = 2 * Math.PI * r;
    let off = 0;
    return U.s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': parts.map((p) => `${p.l}: ${money(p.v)}`).join(', ') },
      U.s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 12 }),
      parts.map((p) => { const len = (Math.max(0, p.v) / total) * c; const el = U.s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: p.c, 'stroke-width': 12, 'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${size / 2} ${size / 2})` }); off += len; return el; }));
  }
  function calcPanel(currency = 'BRL') {
    const el = h('div', { class: 'calc glass', 'aria-live': 'polite' });
    const mini = h('div', { class: 'calc-mini glass', 'aria-hidden': 'true' });
    const update = (tm, extra) => {
      const full = { ...tm, extras: (tm.extras || []).filter((x) => x.amountCents || x.due) };
      const p = C.calcPlan(full);
      mini.replaceChildren(...(p.ok ? [h('div', null, h('div', { class: 'eyebrow', text: 'Parcela' }), h('b', { text: `${tm.count}× ${money(p.installmentCents, currency)}` })), h('div', { style: { textAlign: 'right' } }, h('div', { class: 'eyebrow', text: 'Juros · total' }), h('b', { text: `${money(p.interestCents, currency)} · ${money(p.grandTotalCents, currency)}` }))] : [h('span', { class: 'small muted', text: p.errors[0] })]));
      if (!p.ok) { el.replaceChildren(h('div', { class: 'eyebrow' }, 'Cálculo em tempo real'), h('p', { class: 'muted', style: { margin: '10px 0 0' }, text: p.errors[0] })); return; }
      const ref = C.compareReference(full, full.bankRef);
      el.replaceChildren(); U.append(el, [h('div', { class: 'eyebrow' }, 'Cálculo em tempo real'),
        h('div', { class: 'big', style: { marginTop: '8px' } }, money(p.installmentCents, currency), h('span', { class: 'per', text: ` / ${{ monthly: 'mês', biweekly: 'quinzena', weekly: 'semana' }[tm.periodicity]}` })),
        p.lastCents !== p.installmentCents ? h('div', { class: 'small muted', text: `Última parcela: ${money(p.lastCents, currency)} (ajuste de arredondamento)` }) : null,
        h('div', { class: 'donut-wrap' }, donut([{ l: 'Entrada e extras', v: p.downCents + p.extrasCents, c: 'var(--petrol-300)' }, { l: 'Principal financiado', v: p.principalCents, c: 'var(--petrol-500)' }, { l: 'Juros', v: p.interestCents, c: 'var(--lime-strong)' }]),
          h('div', { class: 'legend' }, h('div', null, h('i', { style: { background: 'var(--petrol-500)' } }), 'Financiado ', h('b', { text: money(p.principalCents, currency) })), h('div', null, h('i', { style: { background: 'var(--lime-strong)' } }), 'Juros ', h('b', { text: money(p.interestCents, currency) })), p.downCents + p.extrasCents ? h('div', null, h('i', { style: { background: 'var(--petrol-300)' } }), 'Entrada + extras ', h('b', { text: money(p.downCents + p.extrasCents, currency) })) : null)),
        kv('Juros totais', money(p.interestCents, currency)), kv('Total futuro', money(p.grandTotalCents, currency)), kv('Previsão de quitação', date(p.settlementDate)), kv('Nº de pagamentos', String(p.schedule.length)),
        ref ? h('div', { class: 'note ' + (ref.savingCents >= 0 ? 'ok' : 'warn'), style: { marginTop: '10px' } }, icon('trend', 18), h('span', null, `Com ${U.pct(ref.pct)} a.m. (${ref.source}), os juros seriam ${money(ref.bankInterestCents, currency)}. `, h('b', { text: ref.savingCents >= 0 ? `Economia de ${money(ref.savingCents, currency)}.` : `Custo adicional de ${money(-ref.savingCents, currency)}.` }))) : null,
        extra || null]);
    };
    return { el, update, mini };
  }
  function schedulePreview(tm, currency) {
    const p = C.calcPlan(tm); if (!p.ok) return h('p', { class: 'muted', text: p.errors[0] });
    const rows = p.schedule.length > 12 ? [...p.schedule.slice(0, 8), null, ...p.schedule.slice(-2)] : p.schedule;
    return h('div', { class: 'mini-sched' }, rows.map((s) => (s ? h('div', null, h('span', { text: `${s.kind === 'down' ? 'Entrada' : s.kind === 'extra' ? 'Extra' : 'Parcela ' + s.seq} · ${date(s.due)}` }), h('b', { text: money(s.amountCents, currency) })) : h('div', { class: 'muted', style: { justifyContent: 'center' } }, `… mais ${p.schedule.length - 10} parcelas …`))));
  }

  /* ---------- Novo acordo (3 passos) ---------- */
  const SUGGEST = [['Apartamento', 'building'], ['Veículo', 'car'], ['Celular', 'phone'], ['Camisa', 'shirt'], ['Empréstimo', 'coins'], ['Serviço', 'briefcase'], ['Eletrônico', 'laptop'], ['Outro', 'box']];
  function newAgreement(prefill) {
    if (S.me && !S.me.emailVerified) { toast('Confirme seu e-mail antes de criar acordos.', 'err'); go('#/inicio'); return; }
    const p = prefill || {};
    const origin = p.fromAgreementId ? findAg(p.fromAgreementId) : null;
    S.wiz = { step: 1, billingTouched: !!p.billing,
      meta: { title: p.title || '', category: p.category || '', group: p.group || '', billing: p.billing || 'installment', fields: {}, description: '', currency: (origin && origin.currency) || 'BRL', fromAgreementId: p.fromAgreementId || null },
      buyerEmail: '', buyer: origin && origin.buyerId ? person(origin.buyerId) : null, origin,
      terms: { totalCents: 0, downCents: 0, downDue: today(), extras: [], count: 10, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: plusDaysISO(30), bankRef: null },
      single: { totalCents: 0, count: 1, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: plusDaysISO(7), downCents: 0, extras: [], bankRef: null },
      rterms: { mode: 'recurring', amountCents: origin && origin.terms && origin.terms.totalCents ? origin.terms.totalCents : 0, periodicity: 'monthly', intervalDays: 30, startDate: plusDaysISO(7), endDate: null },
      reason: '', confirm: false };
    go('#/novo');
  }
  const BILL_HINT = { installment: 'Produto, bem ou empréstimo dividido em parcelas (com ou sem juros, entrada e extras).', recurring: 'Mensalidade, semanal ou intervalo próprio. O PACTO gera uma cobrança por período — nunca a dívida futura inteira.', single: 'Um atendimento ou serviço com uma única cobrança. Pode virar pacote ou recorrente depois, por um novo acordo.' };
  function categoryPicker(w, rerender) {
    const groups = C.CATEGORY_GROUPS;
    const custom = (S.me.prefs.customCategories || []);
    const g = groups.find((x) => x.id === w.meta.group);
    const gchips = h('div', { class: 'suggest', role: 'group', 'aria-label': 'Grupo de categoria' }, groups.map((x) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(w.meta.group === x.id), on: { click: () => { w.meta.group = x.id; if (!x.items.includes(w.meta.category) && !custom.some((c) => c.label === w.meta.category && c.group === x.id)) w.meta.category = x.items[0]; if (!w.billingTouched) w.meta.billing = x.billing; w.meta.fields = {}; rerender(); } } }, icon(U.catIcon(null, x.id), 16), x.label)));
    if (!g) return h('div', null, gchips);
    const items = [...g.items, ...custom.filter((c) => c.group === g.id).map((c) => c.label)];
    const newIn = h('input', { class: 'input', maxlength: '40', placeholder: 'Nova categoria (ex.: Bolos sob encomenda)', 'aria-label': 'Nova categoria' });
    const sub = h('div', { class: 'suggest', role: 'group', 'aria-label': 'Categoria' }, items.map((c) => h('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(w.meta.category === c), on: { click: () => { w.meta.category = c; rerender(); } } }, c)));
    const add = h('div', { class: 'row', style: { marginTop: '6px' } }, newIn, h('button', { type: 'button', class: 'btn ghost sm', on: { click: async () => { const label = C.cleanText(newIn.value, 40); if (label.length < 2) { toast('Dê um nome com ao menos 2 letras.', 'err'); return; } const list = [...custom, { label, group: g.id }]; if (await call(() => api.updateProfile(S.token, { prefs: { customCategories: list } }), 'Categoria criada só para você.')) { w.meta.category = label; rerender(); } } } }, icon('plus', 16), 'Criar'));
    const fdefs = C.categoryFields(g.id);
    const fields = fdefs.length ? h('div', { class: 'form-grid', style: { marginTop: '10px' } }, fdefs.map((f) => field(f.label + (f.optional ? ' (opcional)' : ''), h('input', { type: f.type === 'date' ? 'date' : 'text', maxlength: '120', value: w.meta.fields[f.key] || '', on: { input: (e) => { w.meta.fields[f.key] = e.target.value; } } })))) : null;
    return h('div', null, gchips, h('div', { class: 'cat-sub glass' }, h('div', { class: 'small muted', text: 'Categoria em ' + g.label }), sub, add, fields ? h('div', { class: 'small muted', style: { marginTop: '10px' }, text: 'Campos leves de ' + g.label.toLowerCase() } ) : null, fields));
  }
  function recurringEditor(init, { currency = 'BRL', onChange, change = false } = {}) {
    const tm = { mode: 'recurring', amountCents: 0, periodicity: 'monthly', intervalDays: 30, startDate: plusDaysISO(7), endDate: null, suspended: false, cancelled: false, ...init };
    if (!tm.intervalDays) tm.intervalDays = 30;
    const emit = () => onChange && onChange(tm);
    const wrap = h('div');
    const draw = () => {
      const days = h('input', { type: 'number', min: '1', max: '365', value: tm.intervalDays, 'aria-label': 'Intervalo em dias', on: { input: (e) => { tm.intervalDays = parseInt(e.target.value, 10); emit(); } } });
      const hasEnd = h('input', { type: 'checkbox', id: 're-hasend', checked: !!tm.endDate, on: { change: (e) => { tm.endDate = e.target.checked ? C.plusMonths(tm.startDate || today(), 6) : null; draw(); emit(); } } });
      wrap.replaceChildren(); U.append(wrap, [
        field(change ? 'Novo valor por período' : 'Valor por período', moneyInput(tm.amountCents, (v) => { tm.amountCents = v; emit(); }, { id: 're-amount', label: 'Valor por período', currency }), change ? 'Vale só para as próximas cobranças. As já geradas não mudam.' : 'Ex.: mensalidade, valor da semana ou do pacote.'),
        h('div', { class: 'field' }, h('label', null, 'Periodicidade'), seg([['weekly', 'Semanal'], ['biweekly', 'Quinzenal'], ['monthly', 'Mensal'], ['custom', 'Personalizada']], tm.periodicity, (v) => { tm.periodicity = v; draw(); emit(); }, 'Periodicidade')),
        tm.periodicity === 'custom' ? field('A cada quantos dias?', h('div', { class: 'input-affix suffix' }, days, h('span', null, 'dias'))) : null,
        field('Primeira cobrança', h('input', { id: 're-start', type: 'date', value: tm.startDate, disabled: change, on: { input: (e) => { tm.startDate = e.target.value; emit(); } } }), change ? 'A data de início não muda depois de ativado.' : null),
        h('label', { class: 'row', for: 're-hasend', style: { fontSize: '14px', cursor: 'pointer', margin: '4px 0 10px' } }, hasEnd, h('span', null, 'Definir data de término')),
        tm.endDate ? field('Término', h('input', { type: 'date', value: tm.endDate, min: tm.startDate, on: { input: (e) => { tm.endDate = e.target.value || null; emit(); } } })) : null]);
    };
    draw();
    return { el: wrap, get: () => tm };
  }
  function recurringPanel(currency = 'BRL') {
    const el = h('div', { class: 'calc glass', 'aria-live': 'polite' });
    const mini = h('div', { class: 'calc-mini glass', 'aria-hidden': 'true' });
    const update = (tm) => {
      let ok = true, msg = '';
      try { C.normalizeRecurring(tm); } catch (e) { ok = false; msg = tm.amountCents ? e.message : 'Informe o valor por período para ver o resumo.'; }
      const me = ok ? C.monthlyEquivalent(tm) : 0;
      const dates = ok ? [0, 1, 2, 3].map((k) => C.recurringDate(tm.startDate, tm, k)).filter((d) => !tm.endDate || d <= tm.endDate) : [];
      mini.replaceChildren(...(ok ? [h('div', null, h('div', { class: 'eyebrow', text: 'Por período' }), h('b', { text: money(tm.amountCents, currency) + ' · ' + perLabel(tm) })), h('div', { style: { textAlign: 'right' } }, h('div', { class: 'eyebrow', text: 'Previsão mensal' }), h('b', { text: money(me, currency) }))] : [h('span', { class: 'small muted', text: msg })]));
      el.replaceChildren(); U.append(el, [h('div', { class: 'eyebrow' }, 'Resumo da recorrência'),
        ok ? [h('div', { class: 'calc-big', text: money(tm.amountCents, currency) }), h('div', { class: 'small muted', text: 'por período · ' + perLabel(tm) }),
          h('div', { style: { height: '10px' } }), kv('Equivalente mensal', money(me, currency)), h('div', { class: 'row', style: { gap: '6px', margin: '2px 0 8px' } }, h('span', { class: 'kind-tag forecast', text: 'Previsto' }), h('span', { class: 'small muted', text: 'não soma como recebido' })),
          kv('Término', tm.endDate ? date(tm.endDate) : 'Sem término (até cancelar)'),
          h('div', { class: 'eyebrow', style: { marginTop: '10px' } }, 'Próximas cobranças'), h('div', { class: 'mini-dates' }, dates.map((d, i) => h('div', { class: 'kv' }, h('span', { text: `Período ${i + 1}` }), h('b', { text: date(d) })))),
          h('div', { class: 'note', style: { marginTop: '10px' } }, icon('repeat', 18), 'Cada cobrança é gerada perto do vencimento (até 7 dias antes), enquanto o contrato estiver ativo. Suspender, reajustar, cancelar ou renovar exige aceite das duas partes.')]
          : h('p', { class: 'small muted', text: msg })]);
    };
    return { el, mini, update };
  }
  function wizardPage() {
    if (!S.wiz) { newAgreement(); return h('div'); }
    const w = S.wiz, m = w.meta;
    const stepper = h('div', { class: 'stepper', 'aria-label': `Passo ${w.step} de 3` }, ['Identificação', 'Condições', 'Revisão'].map((l, i) => h('div', { class: ['step', i + 1 < w.step && 'done', i + 1 === w.step && 'cur'] }, h('i'), h('span', { text: `${i + 1}. ${l}` }))));
    const calc = calcPanel(m.currency), rp = recurringPanel(m.currency);
    const T = m.billing === 'recurring' ? w.rterms : m.billing === 'single' ? w.single : w.terms;
    let body;
    const err = h('div', { class: 'err', role: 'alert' });
    if (w.step === 1) {
      const title = h('input', { id: 'wz-title', maxlength: '80', value: m.title, placeholder: m.billing === 'recurring' ? 'ex.: Treino 3x por semana, Mensalidade de inglês' : m.billing === 'single' ? 'ex.: Manicure + pedicure, Visita técnica' : 'ex.: iPhone 15 Pro, Apartamento 42', on: { input: (e) => (m.title = e.target.value) } });
      const desc = h('textarea', { id: 'wz-desc', maxlength: '600', placeholder: 'Detalhes que ajudam as duas partes (estado, garantia, combinados).', on: { input: (e) => (m.description = e.target.value) } }); desc.value = m.description;
      const buyerInfo = h('div', { class: 'small', style: { minHeight: '20px', marginTop: '-6px', marginBottom: '12px' } });
      const showBuyer = () => buyerInfo.replaceChildren(w.buyer ? h('span', { class: 'row' }, avatar(w.buyer, 22), h('b', { text: w.buyer.name }), pill('tem conta PACTO', 'ok')) : C.isEmail(w.buyerEmail) ? h('span', { class: 'muted' }, 'Ainda não tem conta: o convite fica guardado e é vinculado quando a pessoa se cadastrar com este e-mail (envio de e-mail simulado).') : '');
      let tmr;
      const email = h('input', { id: 'wz-email', type: 'email', inputmode: 'email', value: w.buyerEmail, placeholder: 'cliente@exemplo.com', on: { input: (e) => { w.buyerEmail = e.target.value.trim(); clearTimeout(tmr); tmr = setTimeout(async () => { w.buyer = C.isEmail(w.buyerEmail) ? await api.findUserByEmail(S.token, w.buyerEmail).catch(() => null) : null; showBuyer(); }, 300); } } });
      showBuyer();
      body = h('div', null,
        w.origin ? h('div', { class: 'note', style: { marginBottom: '12px' } }, icon('repeat', 18), h('span', null, 'Convertendo “', h('b', { text: w.origin.title }), '” em um novo acordo. O original continua preservado e ligado a este.')) : null,
        h('div', { class: 'field' }, h('label', null, 'Tipo de cobrança'), seg([['installment', 'Venda parcelada'], ['recurring', 'Serviço recorrente'], ['single', 'Serviço avulso']], m.billing, (v) => { m.billing = v; w.billingTouched = true; wizardRerender(); }, 'Tipo de cobrança'), h('small', { class: 'hint', text: BILL_HINT[m.billing] })),
        field(m.billing === 'installment' ? 'O que foi vendido?' : 'Qual é o serviço?', title),
        h('div', { class: 'small muted', style: { margin: '-6px 0 8px' } }, 'Categoria · escolha o grupo'), categoryPicker(w, wizardRerender), h('div', { style: { height: '12px' } }),
        field('Descrição', desc),
        w.origin ? h('div', { class: 'field' }, h('label', null, 'Cliente'), h('div', { class: 'row' }, avatar(w.buyer, 28), h('b', { text: w.buyer.name }), pill('do acordo de origem', 'ok'))) : [field('E-mail do cliente/comprador', email), buyerInfo],
        h('div', { class: 'field' }, h('label', null, 'Moeda'), seg([['BRL', 'Real (R$)'], ['USD', 'Dólar'], ['EUR', 'Euro']], m.currency, (v) => { m.currency = v; }, 'Moeda')),
        h('div', { class: 'note', style: { marginTop: '4px' } }, icon('shield', 18), 'Você será a parte vendedora/prestadora. A outra parte precisa aceitar antes de qualquer cobrança existir.'));
    } else if (w.step === 2) {
      if (m.billing === 'recurring') { const ed = recurringEditor(w.rterms, { currency: m.currency, onChange: (tm) => { w.rterms = tm; rp.update(tm); } }); body = ed.el; }
      else if (m.billing === 'single') { const ed = termsEditor(w.single, { mode: 'single', currency: m.currency, onChange: (tm) => { w.single = tm; calc.update(tm); } }); body = ed.el; }
      else { const ed = termsEditor(w.terms, { mode: 'create', currency: m.currency, onChange: (tm) => { w.terms = tm; calc.update(tm); } }); body = ed.el; }
    } else {
      const reason = h('textarea', { maxlength: '300', placeholder: 'Mensagem para a outra parte (opcional)', on: { input: (e) => (w.reason = e.target.value) } }); reason.value = w.reason;
      const chk = h('input', { type: 'checkbox', id: 'wz-ok', checked: w.confirm, on: { change: (e) => (w.confirm = e.target.checked) } });
      const who = w.buyer ? w.buyer.name : w.buyerEmail;
      const fl = C.categoryFields(m.group).filter((f) => C.cleanText(m.fields[f.key])).map((f) => kv(f.label, m.fields[f.key]));
      let summary;
      if (m.billing === 'recurring') {
        const tm = w.rterms;
        summary = [kv('Tipo', BILL.recurring), kv('Valor por período', money(tm.amountCents, m.currency)), kv('Periodicidade', perLabel(tm)), kv('Primeira cobrança', date(tm.startDate)), kv('Término', tm.endDate ? date(tm.endDate) : 'Sem término'), kv('Previsão mensal', money(C.monthlyEquivalent(tm), m.currency))];
      } else {
        const p = C.calcPlan(T);
        summary = [kv('Tipo', BILL[m.billing]), kv('Total', money(T.totalCents, m.currency)), T.downCents ? kv('Entrada', money(T.downCents, m.currency) + ' em ' + date(T.downDue)) : null, kv(m.billing === 'single' ? 'Cobrança única' : 'Parcelas', m.billing === 'single' ? date(T.firstDue) : `${T.count}× ${p.ok ? money(p.installmentCents, m.currency) : '—'}`), m.billing === 'single' ? null : kv('Juros', p.ok ? `${{ none: 'Sem juros', simple: 'Simples', price: 'Price' }[p.method]} · ${U.pct(T.ratePct)} a.m.` : '—')];
      }
      body = h('div', null, h('div', { class: 'card glass', style: { marginBottom: '12px' } }, h('div', { class: 'row' }, h('span', { class: 'ag-ico' }, icon(U.catIcon(m.category, m.group), 22)), h('div', null, h('b', { text: m.title }), h('div', { class: 'small muted', text: `${m.category || 'Outro'} · para ${who}` }))), summary, fl),
        m.billing === 'recurring' ? h('div', { class: 'note' }, icon('repeat', 18), 'Nenhuma cobrança futura é lançada de uma vez: o PACTO gera uma por período, enquanto o contrato estiver ativo.') : [h('div', { class: 'eyebrow', style: { margin: '6px 0' } }, 'Cronograma'), schedulePreview(T, m.currency)],
        h('div', { style: { height: '12px' } }), field('Mensagem', reason),
        h('label', { class: 'row', for: 'wz-ok', style: { alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' } }, chk, h('span', null, 'Confirmo que os dados são fictícios ou autorizados e que o acordo só vale após o aceite da outra parte.')));
    }
    const nextBtn = h('button', { class: 'btn ' + (w.step === 3 ? 'lime' : ''), on: { click: async () => {
      err.textContent = '';
      const T = m.billing === 'recurring' ? w.rterms : m.billing === 'single' ? w.single : w.terms;
      if (w.step === 1) { if (C.cleanText(m.title).length < 2) return (err.textContent = m.billing === 'installment' ? 'Informe o que foi vendido.' : 'Informe o serviço.'); if (!w.origin) { if (!C.isEmail(w.buyerEmail)) return (err.textContent = 'Informe um e-mail válido para o cliente.'); if (w.buyerEmail.toLowerCase() === S.me.email) return (err.textContent = 'O cliente precisa ser outra pessoa.'); } if (!m.category) m.category = 'Outro'; if (!m.group) m.group = C.groupOfCategory(m.category); }
      if (w.step === 2) {
        if (m.billing === 'recurring') { try { C.normalizeRecurring(w.rterms); } catch (e) { return (err.textContent = e.message); } }
        else { const p = C.calcPlan(T); if (!p.ok) return (err.textContent = p.errors[0]); }
      }
      if (w.step === 3) {
        if (!w.confirm) return (err.textContent = 'Marque a confirmação para enviar.');
        nextBtn.disabled = true;
        const terms = m.billing === 'recurring' ? { ...w.rterms } : { ...T, extras: (T.extras || []).filter((x) => x.amountCents), downDue: T.downCents ? T.downDue : null, bankRef: T.bankRef && T.bankRef.pct && T.bankRef.source ? T.bankRef : null };
        const a = await call(() => api.createAgreement(S.token, { meta: m, buyerEmail: w.origin ? '' : w.buyerEmail, terms, reason: w.reason || 'Proposta inicial' }), 'Proposta enviada para aceite.');
        nextBtn.disabled = false;
        if (a) { S.wiz = null; go('#/acordo/' + a.id + '/negociacao'); }
        return;
      }
      w.step++; wizardRerender(); window.scrollTo({ top: 0, behavior: 'smooth' });
    } } }, w.step === 3 ? [icon('check', 18), 'Enviar para aceite'] : [t('next'), icon('right', 18)]);
    const nav = h('div', { class: 'actions between', style: { justifyContent: 'space-between' } }, w.step > 1 ? h('button', { class: 'btn ghost', on: { click: () => { w.step--; wizardRerender(); } } }, icon('left', 18), t('back')) : h('button', { class: 'btn ghost', on: { click: () => { S.wiz = null; go('#/acordos'); } } }, t('cancel')), nextBtn);
    const panel = m.billing === 'recurring' ? rp : calc;
    if (m.billing === 'recurring') rp.update(w.rterms); else calc.update(T);
    return h('div', { class: 'wizard' }, h('div', { class: 'card glass', style: { padding: '20px' } }, stepper, w.step === 2 ? panel.mini : null, body, err, nav), panel.el);
  }
  function wizardRerender() { render(); }

  /* ---------- propostas: analisar, aceitar, recusar, contrapropor ---------- */
  function openProposal(id) {
    const a = findAg(id), v = a && C.pendingVersion(a); if (!v) return;
    if (v.terms.mode === 'recurring') return openRecurringProposal(a, v);
    const au = person(v.authorId), p = C.calcPlan(v.terms);
    const reason = h('textarea', { maxlength: '300', placeholder: 'Motivo (obrigatório para recusar)' });
    const body = h('div', null,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, avatar(au, 36), h('div', null, h('b', { text: `${au.name} · v${v.no}` }), h('div', { class: 'small muted', text: `${v.kind === 'counter' ? 'Contraproposta' : 'Proposta'} · ${U.dateTime(v.at)}` }))),
      h('div', { class: 'note' }, icon('msg', 18), '“' + v.reason + '”'),
      termsDiff(v.before, C.summarizeTerms(v.terms), cur(a)),
      h('div', { style: { height: '10px' } }),
      p.ok ? [kv('Parcela', `${v.terms.count}× ${money(p.installmentCents, cur(a))}`), kv('Juros totais', money(p.interestCents, cur(a))), kv('Total futuro', money(p.grandTotalCents, cur(a))), kv('Quitação prevista', date(p.settlementDate))] : null,
      h('details', { style: { margin: '10px 0' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Ver cronograma'), schedulePreview(v.terms, cur(a))),
      a.status === 'active' ? h('div', { class: 'note warn' }, icon('lock', 18), 'Parcelas já pagas ficam como estão. Apenas as abertas são substituídas.') : null,
      h('div', { class: 'hashline', style: { margin: '10px 0' }, text: 'Você está aceitando exatamente os termos com sha256 ' + v.termsHash.slice(0, 32) + '…' }),
      field('Resposta', reason),
      h('div', { class: 'actions' },
        h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.respond(S.token, id, { versionNo: v.no, action: 'accept' }), 'Aceito pelos dois lados. Cronograma ativado.')) closeSheet(); } } }, icon('check', 18), 'Aceitar v' + v.no),
        h('button', { class: 'btn ghost', on: { click: () => openCounter(id) } }, icon('swap', 18), 'Contrapropor'),
        h('button', { class: 'btn danger', on: { click: async () => { if (C.cleanText(reason.value).length < 3) { toast('Explique o motivo da recusa.', 'err'); reason.focus(); return; } if (await call(() => api.respond(S.token, id, { versionNo: v.no, action: 'refuse', reason: reason.value }), 'Proposta recusada. As condições anteriores continuam.')) closeSheet(); } } }, icon('x', 18), 'Recusar')));
    sheet('Proposta · ' + a.title, body, { wide: true });
  }
  function proposalSheet(a, title, init, mode, submitLabel, onSubmit, note) {
    const calc = calcPanel(cur(a));
    const ed = termsEditor(init, { mode, currency: cur(a), onChange: (tm) => calc.update(tm) });
    const reason = h('textarea', { maxlength: '300', placeholder: 'Justificativa visível para a outra parte' });
    const body = h('div', { class: 'wizard', style: { gap: '14px' } }, h('div', null, calc.mini, note ? h('div', { class: 'note', style: { marginBottom: '12px' } }, icon('shield', 18), note) : null, ed.el, field('Justificativa', reason),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => { const tm = ed.get(); const terms = { ...tm, extras: (tm.extras || []).filter((x) => x.amountCents), downDue: tm.downCents ? tm.downDue : null, bankRef: tm.bankRef && tm.bankRef.pct && tm.bankRef.source ? tm.bankRef : null }; if (await onSubmit(terms, reason.value)) closeSheet(); } } }, icon('check', 18), submitLabel))), calc.el);
    calc.update(ed.get());
    sheet(title, body, { wide: true });
  }
  function openCounter(id, fresh) {
    const a = findAg(id), v = C.pendingVersion(a);
    if (isRec(a)) return openRecurringChange(id, !fresh);
    const base = v ? v.terms : a.versions[a.versions.length - 1].terms;
    const mode = a.billing === 'single' ? 'single' : a.status === 'active' ? 'reneg' : 'create';
    proposalSheet(a, fresh ? 'Nova proposta' : `Contraproposta à v${v ? v.no : ''}`, { ...base }, mode, fresh ? 'Enviar proposta' : 'Enviar contraproposta',
      (terms, reason) => call(() => api.propose(S.token, id, { terms, reason: reason || (fresh ? 'Nova proposta' : 'Contraproposta') }), fresh ? 'Proposta enviada.' : 'Contraproposta enviada. A versão anterior fica no histórico.'),
      fresh ? null : 'A contraproposta invalida a versão pendente (que fica preservada no histórico) e exige novo aceite da outra parte.');
  }
  function openRenegotiate(id) {
    const a = findAg(id), open = C.openBalance(a), n = nextOpen(a);
    proposalSheet(a, 'Propor mudança · ' + a.title, { ...a.terms, totalCents: open, downCents: 0, downDue: null, extras: [], count: a.billing === 'single' ? 1 : a.schedule.filter((s) => C.OPEN.includes(s.status)).length || 1, firstDue: n ? (n.due < today() ? plusDaysISO(7) : n.due) : plusDaysISO(30) }, a.billing === 'single' ? 'single' : 'reneg', 'Enviar para aceite',
      (terms, reason) => call(() => api.propose(S.token, id, { terms, reason }), 'Proposta enviada. Nada muda até a outra parte aceitar.'),
      `Saldo aberto atual: ${money(open, cur(a))}. Parcelas pagas (${a.schedule.filter((s) => s.status === 'paid').length}) não serão alteradas.`);
  }

  /* ---------- arquivos ---------- */
  function fileDrop(onFile) {
    const inp = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp' });
    const label = h('div', null, h('b', null, 'Anexar comprovante'), h('div', { class: 'small', text: 'PDF, PNG, JPG ou WebP · até 1,5 MB · obrigatório' }));
    const box = h('label', { class: 'drop' }, icon('upload', 26), label, inp);
    const take = async (f) => {
      if (!f) return;
      if (f.size > C.MAX_FILE) { toast('Arquivo acima de 1,5 MB.', 'err'); return; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const real = C.sniffType(bytes);
      if (!real) { toast('Formato não aceito. Use PDF ou imagem (PNG, JPG, WebP).', 'err'); return; }
      onFile({ name: f.name, type: f.type || real, size: f.size, bytes });
      box.classList.add('has-file'); label.replaceChildren(h('b', { text: f.name }), h('div', { class: 'small', text: `${Math.round(f.size / 1024)} KB · tipo verificado: ${real}` }));
    };
    inp.addEventListener('change', () => take(inp.files[0]));
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('over'); take(e.dataTransfer.files[0]); });
    const demo = h('button', { type: 'button', class: 'link-btn small', on: { click: () => { const f = Seed.pdfFile('Comprovante de teste ' + new Date().toLocaleString()); onFile(f); box.classList.add('has-file'); label.replaceChildren(h('b', { text: f.name }), h('div', { class: 'small', text: 'PDF fictício gerado para teste' })); } } }, icon('spark', 14), 'Usar comprovante fictício de teste');
    return h('div', { class: 'field' }, box, demo);
  }

  /* ---------- informar pagamento / conferir ---------- */
  function openPay(id, sid) {
    const a = findAg(id), s = a && a.schedule.find((x) => x.id === sid); if (!s) return;
    let file = null;
    const remaining = C.remainingOf(s);
    let amount = remaining;
    const dt = h('input', { type: 'date', value: today(), max: today() });
    const cm = h('textarea', { maxlength: '400', placeholder: 'ex.: Pix enviado às 14h, ID da transação…' });
    const last = s.reports[s.reports.length - 1];
    const body = h('div', null,
      h('div', { class: 'card glass', style: { marginBottom: '12px' } }, h('div', { class: 'eyebrow', text: a.title }), h('div', { style: { fontSize: '26px', fontWeight: 780, letterSpacing: '-.03em' }, text: money(remaining, cur(a)) }), h('div', { class: 'small muted', text: `Parcela ${instLabel(s)} · vence ${date(s.due)} · para ${person(a.sellerId).name}` })),
      last && last.status === 'correction' ? h('div', { class: 'note warn', style: { marginBottom: '12px' } }, icon('alert', 18), 'Correção pedida: ' + last.reviewReason) : null,
      h('div', { class: 'form-grid' }, field('Valor pago', moneyInput(amount, (v) => (amount = v), { label: 'Valor pago', currency: cur(a) }), 'Pode ser parcial.'), field('Data do pagamento', dt)),
      fileDrop((f) => (file = f)), field('Comentário (opcional)', cm),
      h('div', { class: 'note' }, icon('clock', 18), 'O status vira “em análise”. Só a aprovação do vendedor confirma a quitação.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime block', on: { click: async () => {
        if (!file) { toast('Anexe o comprovante (PDF ou imagem).', 'err'); return; }
        if (await call(() => api.reportPayment(S.token, id, { installmentId: sid, amountCents: amount, paidAt: dt.value, comment: cm.value, file }), 'Pagamento informado. Aguardando conferência.')) closeSheet();
      } } }, icon('upload', 18), 'Enviar para conferência')));
    sheet('Informar pagamento', body);
  }
  function openReview(id, sid) {
    const a = findAg(id), s = a && a.schedule.find((x) => x.id === sid); if (!s) return;
    const rep = s.reports.find((r) => r.status === 'review'); if (!rep) return;
    const why = h('textarea', { maxlength: '300', placeholder: 'Justificativa (obrigatória para correção ou recusa)' });
    const act = (decision, msg) => async () => { if (decision !== 'approve' && C.cleanText(why.value).length < 5) { toast('Escreva uma justificativa (mín. 5 caracteres).', 'err'); why.focus(); return; } if (await call(() => api.reviewPayment(S.token, id, { installmentId: sid, reportId: rep.id, decision, reason: why.value }), msg)) closeSheet(); };
    const body = h('div', null, h('div', { class: 'row', style: { marginBottom: '10px' } }, avatar(person(rep.by), 36), h('div', null, h('b', { text: person(rep.by).name + ' informou pagamento' }), h('div', { class: 'small muted', text: `${a.title} · parcela ${instLabel(s)} · ${U.dateTime(rep.at)}` }))),
      kv('Valor da parcela', money(s.amountCents, cur(a))), kv('Valor informado', money(rep.amountCents, cur(a))), kv('Data do pagamento', date(rep.paidAt)), rep.comment ? kv('Comentário', rep.comment) : null,
      rep.amountCents < C.remainingOf(s) ? h('div', { class: 'note warn', style: { margin: '10px 0' } }, icon('alert', 18), 'Pagamento parcial: se aprovado, o restante continua em aberto.') : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', on: { click: () => openFile(rep.attachment.fileId) } }, icon('eye', 18), 'Ver comprovante')),
      h('div', { style: { height: '12px' } }), field('Justificativa', why),
      h('div', { class: 'note', style: { marginBottom: '6px' } }, icon('lock', 18), 'Após aprovado, o comprovante fica imutável — ninguém edita ou exclui.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: act('approve', 'Pagamento confirmado.') } }, icon('check', 18), 'Aprovar'), h('button', { class: 'btn ghost', on: { click: act('correction', 'Correção solicitada ao comprador.') } }, icon('edit', 18), 'Solicitar correção'), h('button', { class: 'btn danger', on: { click: act('refuse', 'Comprovante recusado.') } }, icon('x', 18), 'Recusar')));
    sheet('Conferir comprovante', body);
  }

  /* ---------- antecipação ---------- */
  function earlyEditor(a, initIds, initPct, isSeller, onSubmit, label) {
    const elig = C.earlyEligible(a, today());
    const sel = new Set(initIds && initIds.length ? initIds : elig.slice(-1).map((s) => s.id));
    let p = initPct || 10;
    const out = h('div');
    const paint = () => {
      const c = C.earlyCalc(a, [...sel], isSeller ? p : null);
      out.replaceChildren(h('div', { class: 'card glass', style: { margin: '12px 0' } }, kv('Valor original selecionado', money(c.grossCents, cur(a))), kv('Desconto', isSeller ? U.pct(p) : 'definido pelo vendedor'), kv('Economia', isSeller ? money(c.discountCents, cur(a)) : '—'), kv('Valor a pagar', isSeller ? money(c.netCents, cur(a)) : money(c.grossCents, cur(a)) + ' (antes do desconto)'), kv('Saldo após quitar', money(Math.max(0, c.balanceAfterCents), cur(a)))));
    };
    const pctOut = h('b', { text: p + '%' });
    const range = h('input', { type: 'range', min: '1', max: '70', value: p, 'aria-label': 'Percentual de desconto', on: { input: (e) => { p = Number(e.target.value); pctOut.textContent = p + '%'; paint(); } } });
    paint();
    if (!elig.length) return h('div', null, empty('zap', 'Sem parcelas elegíveis', 'Só parcelas futuras, abertas e sem desconto anterior podem ser antecipadas.'));
    return h('div', null, h('div', { class: 'eyebrow' }, 'Parcelas futuras elegíveis'),
      h('div', { class: 'card glass', style: { padding: '4px 14px', marginTop: '8px', maxHeight: '260px', overflow: 'auto' } }, elig.map((s) => h('label', { class: 'toggle' }, h('span', { class: 'toggle-label' }, `Parcela ${instLabel(s)} · ${date(s.due)}`, h('b', { text: money(s.amountCents, cur(a)) })), h('input', { type: 'checkbox', checked: sel.has(s.id), on: { change: (e) => { e.target.checked ? sel.add(s.id) : sel.delete(s.id); paint(); } } }), h('span', { class: 'toggle-ui' })))),
      isSeller ? h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', null, 'Desconto: ', pctOut), range, h('small', { class: 'hint', text: 'De 1% a 70% sobre o valor nominal selecionado. O desconto não é acumulável.' })) : h('div', { class: 'note', style: { marginTop: '12px' } }, icon('percent', 18), 'Quem define o desconto é o vendedor. Ele responde com o percentual e você decide se aceita.'),
      out, h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => { if (!sel.size) { toast('Selecione ao menos uma parcela.', 'err'); return; } if (await onSubmit([...sel], isSeller ? p : null)) closeSheet(); } } }, icon('zap', 18), label)));
  }
  function openEarlyNew(id) {
    const a = findAg(id), isSeller = role(a) === 'seller';
    sheet(isSeller ? 'Oferecer antecipação com desconto' : 'Pedir antecipação', earlyEditor(a, null, 10, isSeller, (ids, pct) => call(() => api.proposeEarly(S.token, id, { installmentIds: ids, pct }), 'Proposta de antecipação enviada.'), 'Enviar proposta'));
  }
  function openEarly(id, eid) {
    const a = findAg(id), e = a && a.early.find((x) => x.id === eid); if (!e) return;
    const r = role(a), awaitingMe = (e.status === 'awaiting_buyer' && r === 'buyer') || (e.status === 'awaiting_seller' && r === 'seller');
    if (e.status === 'review' && r === 'seller') return openEarlyReview(id, eid);
    if (e.status === 'accepted' && r === 'buyer') return openEarlyPay(id, eid);
    const c = C.earlyCalc(a, e.installmentIds, e.pct);
    const body = h('div', null, kv('Parcelas', String(e.installmentIds.length)), kv('Valor original', money(c.grossCents, cur(a))), kv('Desconto', e.pct ? U.pct(e.pct) : 'a definir pelo vendedor'), kv('Economia', money(c.discountCents, cur(a))), kv('Valor a pagar', money(c.netCents, cur(a))), kv('Situação', { awaiting_buyer: 'Aguardando comprador', awaiting_seller: 'Aguardando vendedor', accepted: 'Aceita · aguardando comprovante', review: 'Comprovante em análise', settled: 'Quitada', refused: 'Recusada' }[e.status]),
      h('div', { class: 'eyebrow', style: { margin: '14px 0 6px' } }, 'Rodadas'), e.rounds.map((x, i) => h('div', { class: 'small', style: { padding: '4px 0' }, text: `${i + 1}. ${x.by === meId() ? 'Você' : person(x.by).name} · ${x.installmentIds.length} parcela(s) · ${x.pct ? x.pct + '%' : 'sem %'} · ${U.dateTime(x.at)}` })),
      awaitingMe ? h('div', { class: 'actions' },
        e.pct ? h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.respondEarly(S.token, id, { earlyId: eid, action: 'accept' }), 'Antecipação aceita. Agora é só pagar e enviar o comprovante.')) closeSheet(); } } }, icon('check', 18), 'Aceitar') : null,
        h('button', { class: 'btn ghost', on: { click: () => sheet(r === 'seller' ? 'Definir desconto' : 'Contrapropor seleção', earlyEditor(a, e.installmentIds, e.pct || 10, r === 'seller', (ids, pct) => call(() => api.respondEarly(S.token, id, { earlyId: eid, action: 'counter', installmentIds: ids, pct }), 'Resposta enviada.'), r === 'seller' ? 'Enviar desconto' : 'Enviar contraproposta')) } }, icon('swap', 18), r === 'seller' && !e.pct ? 'Definir desconto' : 'Contrapropor'),
        h('button', { class: 'btn danger', on: { click: async () => { if (await call(() => api.respondEarly(S.token, id, { earlyId: eid, action: 'refuse', reason: 'Recusado' }), 'Antecipação recusada.')) closeSheet(); } } }, icon('x', 18), 'Recusar')) : h('div', { class: 'note', style: { marginTop: '12px' } }, icon('clock', 18), 'Aguardando a outra parte.'));
    sheet('Antecipação · ' + a.title, body);
  }
  function openEarlyPay(id, eid) {
    const a = findAg(id), e = a.early.find((x) => x.id === eid); let file = null;
    const dt = h('input', { type: 'date', value: today(), max: today() });
    const last = e.reports[e.reports.length - 1];
    sheet('Pagar antecipação', h('div', null, h('div', { class: 'card glass' }, h('div', { class: 'eyebrow' }, 'Valor com desconto de ' + e.pct + '%'), h('div', { style: { fontSize: '28px', fontWeight: 780 }, text: money(e.netCents, cur(a)) }), h('div', { class: 'small muted', text: `Economia de ${money(e.discountCents, cur(a))} sobre ${money(e.grossCents, cur(a))}` })),
      last && last.status === 'correction' ? h('div', { class: 'note warn', style: { marginTop: '10px' } }, icon('alert', 18), 'Correção pedida: ' + last.reviewReason) : null,
      h('div', { style: { height: '12px' } }), field('Data do pagamento', dt), fileDrop((f) => (file = f)),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime block', on: { click: async () => { if (!file) { toast('Anexe o comprovante.', 'err'); return; } if (await call(() => api.reportEarly(S.token, id, { earlyId: eid, paidAt: dt.value, file }), 'Comprovante enviado para conferência.')) closeSheet(); } } }, icon('upload', 18), 'Enviar comprovante'))));
  }
  function openEarlyReview(id, eid) {
    const a = findAg(id), e = a.early.find((x) => x.id === eid), rep = e.reports[e.reports.length - 1];
    const why = h('textarea', { maxlength: '300', placeholder: 'Justificativa (para correção)' });
    sheet('Conferir antecipação', h('div', null, kv('Parcelas', String(e.installmentIds.length)), kv('Valor a receber', money(e.netCents, cur(a))), kv('Desconto concedido', money(e.discountCents, cur(a)) + ` (${e.pct}%)`), kv('Pago em', date(rep.paidAt)),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', on: { click: () => openFile(rep.attachment.fileId) } }, icon('eye', 18), 'Ver comprovante')), field('Justificativa', why),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.reviewEarly(S.token, id, { earlyId: eid, decision: 'approve' }), 'Antecipação quitada com desconto.')) closeSheet(); } } }, icon('check', 18), 'Aprovar e dar baixa'),
        h('button', { class: 'btn ghost', on: { click: async () => { if (await call(() => api.reviewEarly(S.token, id, { earlyId: eid, decision: 'correction', reason: why.value }), 'Correção solicitada.')) closeSheet(); } } }, icon('edit', 18), 'Solicitar correção'))));
  }

  /* ---------- Pagamentos (agrupado por acordo) ---------- */
  function paymentsPage() {
    const f = S.filters, td = today();
    const defs = [['upcoming', 'A vencer', (s) => C.OPEN.includes(s.status) && s.due >= td], ['overdue', 'Atrasadas', (s) => instState(s) === 'overdue'], ['review', 'Em conferência', (s) => s.status === 'review'], ['paid', 'Quitadas', (s) => s.status === 'paid'], ['all', 'Todas', (s) => !['replaced', 'consolidated'].includes(s.status)]];
    const fn = defs.find((d) => d[0] === f.pay)[2];
    const ags = S.ags.filter((a) => a.schedule.length && matchQ(a, f.payq));
    const all = ags.flatMap((a) => a.schedule.map((s) => ({ a, s })));
    const sumOf = (k) => all.filter((x) => defs.find((d) => d[0] === k)[2](x.s)).reduce((n, x) => n + C.remainingOf(x.s), 0);
    const cntOf = (k) => all.filter((x) => defs.find((d) => d[0] === k)[2](x.s)).length;
    const highlights = h('div', { class: 'stats', style: { marginTop: 0, marginBottom: '14px' } },
      [['upcoming', 'A vencer', 'calendar'], ['overdue', 'Atrasadas', 'alert'], ['review', 'Em conferência', 'eye']].map(([k, l, ic]) => h('button', { class: 'stat glass lift', style: { border: 0, textAlign: 'left' }, 'aria-pressed': String(f.pay === k), on: { click: () => { f.pay = k; render(); } } }, h('div', { class: 'lbl' }, icon(ic, 14), l), h('div', { class: 'val', text: String(cntOf(k)) }), h('div', { class: 'ctx', text: money(sumOf(k)) }))));
    const groups = ags.map((a) => ({ a, rows: a.schedule.filter(fn).sort((x, y) => x.due.localeCompare(y.due)) })).filter((g) => g.rows.length);
    groups.sort((x, y) => (statusRank[instState(x.rows[0])] - statusRank[instState(y.rows[0])]) || x.rows[0].due.localeCompare(y.rows[0].due));
    const open = S.filters.payOpen || (S.filters.payOpen = {});
    const list = groups.length ? h('div', { class: 'stack' }, groups.map(({ a, rows }) => {
      const isOpen = open[a.id] ?? groups.length <= 3;
      const sum = rows.reduce((n, s) => n + (f.pay === 'paid' ? s.paidCents : C.remainingOf(s)), 0);
      return h('section', { class: 'group glass' }, h('button', { class: 'group-head', 'aria-expanded': String(isOpen), on: { click: () => { open[a.id] = !isOpen; render(); } } },
        h('span', { class: 'ag-ico' }, icon(agIcon(a), 20)), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'ag-title', text: a.title }), h('div', { class: 'ag-sub' }, h('span', { class: 'role-tag ' + role(a), text: role(a) === 'seller' ? 'Recebo' : 'Pago' }), `${rows.length} parcela(s) · ${other(a).name}`)),
        h('div', { style: { textAlign: 'right' } }, h('div', { style: { fontWeight: 780 }, class: 'num', text: money(sum, cur(a)) }), h('div', { class: 'small muted', text: dateShort(rows[0].due) })), icon('down', 18, 'chev')),
        isOpen ? h('div', { class: 'group-body' }, rows.slice(0, 24).map((s) => instRow(a, s, { showReports: f.pay === 'review' })), rows.length > 24 ? h('button', { class: 'link-btn', on: { click: () => go('#/acordo/' + a.id) } }, `Ver todas as ${rows.length} no acordo`) : null) : null);
    })) : empty('wallet', 'Nada neste filtro', 'Escolha outro filtro para ver parcelas.');
    return h('div', null, highlights, searchBox(f.payq, (v) => { f.payq = v; render(); setTimeout(() => { const i = document.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }); }), h('div', { class: 'chips' }, defs.map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(f.pay === k), on: { click: () => { f.pay = k; render(); } } }, l))), h('div', { style: { height: '8px' } }), list);
  }

  /* ---------- Negociações ---------- */
  function negotiationsPage() {
    const acts = pendingActions().filter((x) => ['proposal', 'early', 'consolidation', 'early-review', 'early-pay'].includes(x.kind));
    const waiting = [];
    S.ags.forEach((a) => { const v = C.pendingVersion(a); if (v && v.authorId === meId()) waiting.push({ t: a.title, d: `v${v.no} enviada ${U.ago(v.at)}`, go: () => go(`#/acordo/${a.id}/negociacao`), ic: 'handshake' }); (a.early || []).forEach((e) => { const r = role(a); if ((e.status === 'awaiting_buyer' && r === 'seller') || (e.status === 'awaiting_seller' && r === 'buyer')) waiting.push({ t: a.title, d: 'Antecipação aguardando resposta', go: () => openEarly(a.id, e.id), ic: 'zap' }); }); });
    S.cons.forEach((c) => { const v = c.versions.find((x) => x.status === 'pending'); if (c.status === 'pending' && v && v.authorId === meId()) waiting.push({ t: c.title, d: `Unificação v${v.no} aguardando`, go: () => openConsolidation(c.id), ic: 'layers' }); });
    const sellerBuyers = [...new Set(S.ags.filter((a) => a.sellerId === meId() && a.buyerId).map((a) => a.buyerId))];
    const canUnify = sellerBuyers.some((b) => C.consolidationEligible(S.ags, meId(), b).length >= 2);
    const closed = [];
    S.ags.forEach((a) => a.versions.filter((v) => v.status !== 'pending' && v.no > 1).forEach((v) => closed.push({ a, v })));
    closed.sort((x, y) => (y.v.closedAt || y.v.at).localeCompare(x.v.closedAt || x.v.at));
    const item = (title, desc, onClick, ic, tone) => h('button', { class: 'ag-card glass lift', on: { click: onClick } }, h('div', { class: 'ag-top' }, h('span', { class: 'ag-ico' }, icon(ic, 20)), h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'ag-title', text: title }), h('div', { class: 'ag-sub', text: desc })), tone ? pill(tone, 'lime') : icon('right', 18)));
    return h('div', null,
      h('div', { class: 'grid2' }, h('button', { class: 'card glass lift sheen', style: { border: 0, textAlign: 'left' }, disabled: !canUnify, on: { click: () => go('#/unificar') } }, h('div', { class: 'row' }, h('span', { class: 'ag-ico' }, icon('layers', 22)), h('div', null, h('b', null, 'Unificar dívidas'), h('div', { class: 'small muted', text: canUnify ? 'Junte saldos abertos de um mesmo comprador, sem perder a origem.' : 'Disponível quando você vende 2+ acordos ativos a um mesmo comprador.' })))),
        h('button', { class: 'card glass lift sheen', style: { border: 0, textAlign: 'left' }, on: { click: () => { S.filters.ag = 'active'; go('#/acordos'); toast('Abra um acordo ativo e toque em “Antecipar”.'); } } }, h('div', { class: 'row' }, h('span', { class: 'ag-ico' }, icon('zap', 22)), h('div', null, h('b', null, 'Antecipar com desconto'), h('div', { class: 'small muted', text: 'Desconto de 1% a 70% definido pelo vendedor, com aceite bilateral.' }))))),
      h('div', { class: 'section-h' }, h('h2', null, 'Aguardando você'), pill(String(acts.length), acts.length ? 'lime' : '')),
      acts.length ? h('div', { class: 'list' }, acts.map((x) => item(x.a ? x.a.title : x.c.title, x.label + (x.a ? ' · ' + other(x.a).name : ''), x.go, x.icon, 'Responder'))) : empty('check', 'Nada pendente', 'Quando alguém propuser algo, aparece aqui.'),
      h('div', { class: 'section-h' }, h('h2', null, 'Aguardando a outra parte'), pill(String(waiting.length))),
      waiting.length ? h('div', { class: 'list' }, waiting.map((x) => item(x.t, x.d, x.go, x.ic))) : h('p', { class: 'muted small', text: 'Nenhuma proposta sua em aberto.' }),
      S.cons.length ? [h('div', { class: 'section-h' }, h('h2', null, 'Unificações')), h('div', { class: 'list' }, S.cons.map((c) => item(c.title, `${c.snapshot.map((s) => s.title).join(' + ')} · ${{ pending: 'em negociação', accepted: 'aceita', refused: 'recusada' }[c.status]}`, () => openConsolidation(c.id), 'layers')))] : null,
      h('div', { class: 'section-h' }, h('h2', null, 'Histórico de negociações')),
      closed.length ? h('div', { class: 'card glass', style: { padding: '6px 14px' } }, closed.slice(0, 20).map(({ a, v }) => h('div', { class: 'kv' }, h('button', { class: 'link-btn', on: { click: () => go(`#/acordo/${a.id}/negociacao`) } }, `${a.title} · v${v.no}`), h('b', null, pill({ accepted: 'Aceita', refused: 'Recusada', superseded: 'Substituída' }[v.status], { accepted: 'ok', refused: 'danger' }[v.status] || ''))))) : h('p', { class: 'muted small', text: 'Sem negociações encerradas ainda.' }));
  }

  /* ---------- Unificação ---------- */
  function unifyPage() {
    const buyers = [...new Set(S.ags.filter((a) => a.sellerId === meId() && a.buyerId && a.status === 'active').map((a) => a.buyerId))];
    if (!buyers.length) return empty('layers', 'Nada para unificar', 'Você precisa ter acordos ativos como vendedor.');
    const u = S.unify || (S.unify = { buyerId: buyers[0], sel: new Set(), terms: { count: 12, method: 'price', ratePct: 1, periodicity: 'monthly', firstDue: plusDaysISO(30) }, title: '' });
    if (!buyers.includes(u.buyerId)) u.buyerId = buyers[0];
    const mine = S.ags.filter((a) => a.sellerId === meId() && a.buyerId === u.buyerId && a.status === 'active');
    const elig = C.consolidationEligible(S.ags, meId(), u.buyerId).map((a) => a.id);
    [...u.sel].forEach((id) => { if (!elig.includes(id)) u.sel.delete(id); });
    const preview = h('div');
    const paint = () => {
      const origins = C.consolidationSnapshot(S.ags.filter((a) => u.sel.has(a.id)));
      const pv = C.consolidationPreview(origins, u.terms);
      if (origins.length < 2) { preview.replaceChildren(h('div', { class: 'note' }, icon('layers', 18), 'Selecione ao menos duas dívidas. As não selecionadas continuam como estão.')); return; }
      const p = pv.plan;
      const maxV = Math.max(pv.beforeMonthlyCents, p.ok ? p.installmentCents : 0) || 1;
      const bar = (l, v, c) => h('div', { style: { marginBottom: '8px' } }, h('div', { class: 'row between small' }, h('span', { text: l }), h('b', { text: money(v) })), h('div', { class: 'progress', style: { height: '12px' } }, h('span', { style: { width: (v / maxV) * 100 + '%', background: c } })));
      preview.replaceChildren(h('div', { class: 'card glass' }, h('div', { class: 'eyebrow' }, 'Simulação'), h('div', { style: { fontSize: '28px', fontWeight: 780, letterSpacing: '-.03em', margin: '6px 0' }, text: money(pv.principalCents) }), h('div', { class: 'small muted', style: { marginBottom: '12px' }, text: 'Soma apenas dos saldos em aberto. Parcelas pagas permanecem nos acordos de origem.' }),
        origins.map((o) => kv(o.title, money(o.openCents))), h('hr', { class: 'divider' }),
        bar('Antes: soma das próximas parcelas', pv.beforeMonthlyCents, 'var(--petrol-300)'), p.ok ? bar(`Depois: ${u.terms.count}× de`, p.installmentCents, 'linear-gradient(90deg,var(--petrol-500),var(--lime-strong))') : null,
        p.ok ? [kv('Juros da unificação', money(p.interestCents)), kv('Custo total depois', money(p.financedCents)), kv('Quitação prevista', date(p.settlementDate))] : h('p', { class: 'err', text: p.errors[0] })));
    };
    const ed = termsEditor(u.terms, { mode: 'consolidation', onChange: (tm) => { u.terms = tm; paint(); } });
    const title = h('input', { maxlength: '80', value: u.title, placeholder: 'ex.: Unificação camisa + empréstimo + moto', on: { input: (e) => (u.title = e.target.value) } });
    paint();
    return h('div', { class: 'wizard' }, h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Comprador'), seg(buyers.map((b) => [b, person(b).name]), u.buyerId, (v) => { u.buyerId = v; u.sel.clear(); render(); }, 'Comprador')),
      h('div', { class: 'eyebrow', style: { margin: '6px 0 8px' } }, 'Escolha o que unificar (o resto fica fixo)'),
      h('div', { class: 'grid2' }, mine.map((a) => { const ok = elig.includes(a.id); return h('label', { class: 'card glass lift', style: { cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.65, display: 'flex', gap: '12px', alignItems: 'center', margin: 0 } },
        h('input', { type: 'checkbox', checked: u.sel.has(a.id), disabled: !ok, style: { width: '20px', height: '20px', accentColor: 'var(--petrol-500)' }, on: { change: (e) => { e.target.checked ? u.sel.add(a.id) : u.sel.delete(a.id); paint(); } } }),
        h('span', { class: 'ag-ico' }, icon(agIcon(a), 20)), h('div', { style: { minWidth: 0 } }, h('b', { text: a.title }), h('div', { class: 'small muted', text: ok ? 'Saldo aberto ' + money(C.openBalance(a)) : 'Fixo: tem pendência (proposta, análise ou antecipação)' }))); })),
      h('div', { class: 'card glass', style: { marginTop: '14px' } }, field('Nome do novo acordo', title), ed.el,
        h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => { const r = await call(() => api.proposeConsolidation(S.token, { originIds: [...u.sel], terms: { ...u.terms, title: u.title || 'Dívidas unificadas' }, reason: 'Proposta de unificação' }), 'Unificação enviada para aceite do comprador.'); if (r) { S.unify = null; go('#/negociacoes'); } } } }, icon('layers', 18), 'Enviar proposta de unificação')))), preview);
  }
  function openConsolidation(cid) {
    const c = S.cons.find((x) => x.id === cid); if (!c) return toast('Unificação indisponível.', 'err');
    const v = c.versions.find((x) => x.status === 'pending');
    const p = C.calcPlan(c.versions[c.versions.length - 1].terms);
    const mine = v && v.authorId !== meId();
    const body = h('div', null, h('div', { class: 'eyebrow' }, 'Origens (preservadas)'), c.snapshot.map((s) => kv(s.title, money(s.openCents))), kv('Total unificado', money(c.versions[0].terms.totalCents)),
      h('div', { class: 'eyebrow', style: { margin: '14px 0 6px' } }, 'Versões'), h('div', { class: 'timeline' }, [...c.versions].reverse().map((x) => { const pl = C.calcPlan(x.terms); return h('div', { class: 'tl-item glass ' + x.status }, h('div', { class: 'row between' }, h('b', { text: `v${x.no} · ${x.authorId === meId() ? 'você' : person(x.authorId).name}` }), pill({ pending: 'Pendente', accepted: 'Aceita', superseded: 'Substituída', refused: 'Recusada' }[x.status], { accepted: 'ok', pending: 'lime', refused: 'danger' }[x.status] || '')), h('div', { class: 'small', text: `${x.terms.count}× ${pl.ok ? money(pl.installmentCents) : ''} · ${U.pct(x.terms.ratePct)} a.m. · 1º venc. ${date(x.terms.firstDue)}` }), h('div', { class: 'small muted', text: '“' + x.reason + '”' })); })),
      c.status === 'accepted' ? h('div', { class: 'actions' }, h('button', { class: 'btn', on: { click: () => { closeSheet(); go('#/acordo/' + c.resultAgreementId); } } }, 'Abrir acordo unificado')) : null,
      mine ? h('div', { class: 'actions' },
        h('button', { class: 'btn lime', on: { click: async () => { const r = await call(() => api.respondConsolidation(S.token, cid, { versionNo: v.no, action: 'accept' }), 'Unificação aceita. Novo acordo criado.'); if (r) { closeSheet(); if (r.agreement) go('#/acordo/' + r.agreement.id); } } } }, icon('check', 18), 'Aceitar v' + v.no),
        h('button', { class: 'btn ghost', on: { click: () => openConsolidationCounter(cid) } }, icon('swap', 18), 'Contrapropor'),
        h('button', { class: 'btn danger', on: { click: async () => { if (await call(() => api.respondConsolidation(S.token, cid, { versionNo: v.no, action: 'refuse', reason: 'Recusado' }), 'Unificação recusada. Os acordos de origem seguem como estavam.')) closeSheet(); } } }, icon('x', 18), 'Recusar')) : c.status === 'pending' ? h('div', { class: 'note', style: { marginTop: '12px' } }, icon('clock', 18), 'Aguardando a outra parte.') : null);
    void p;
    sheet(c.title, body, { wide: true });
  }
  function openConsolidationCounter(cid) {
    const c = S.cons.find((x) => x.id === cid), v = c.versions.find((x) => x.status === 'pending');
    const calc = calcPanel();
    const ed = termsEditor({ ...v.terms }, { mode: 'consolidation', onChange: (tm) => calc.update({ ...tm, totalCents: v.terms.totalCents }) });
    const reason = h('textarea', { maxlength: '300', placeholder: 'Justificativa' });
    calc.update(v.terms);
    sheet('Contraproposta de unificação', h('div', { class: 'wizard' }, h('div', null, h('div', { class: 'note', style: { marginBottom: '12px' } }, icon('shield', 18), `O total (${money(v.terms.totalCents)}) é a soma dos saldos abertos e não muda. Ajuste prazo, juros e vencimento.`), ed.el, field('Justificativa', reason),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.respondConsolidation(S.token, cid, { versionNo: v.no, action: 'counter', terms: ed.get(), reason: reason.value || 'Contraproposta' }), 'Contraproposta enviada.')) closeSheet(); } } }, icon('check', 18), 'Enviar contraproposta'))), calc.el), { wide: true });
  }

  /* ---------- Projeções ---------- */
  function barChart(monthly, { height = 220 } = {}) {
    const keys = Object.keys(monthly).sort();
    if (!keys.length) return h('p', { class: 'muted', text: 'Sem dados no período.' });
    const W = Math.max(320, keys.length * 34 + 50), H = height, pad = { l: 44, r: 8, t: 12, b: 34 };
    const max = Math.max(...keys.map((k) => monthly[k].paid + monthly[k].open), 1);
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; })();
    const bw = (W - pad.l - pad.r) / keys.length;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
    const svg = U.s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Evolução mensal: pago e a pagar por mês' });
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => { svg.appendChild(U.s('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(nice * f), y2: y(nice * f) })); svg.appendChild(U.s('text', { x: pad.l - 6, y: y(nice * f) + 3, 'text-anchor': 'end' }, U.moneyShort(nice * f).replace(/\s/g, ''))); });
    const tm = today().slice(0, 7);
    keys.forEach((k, i) => {
      const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64, d = monthly[k];
      const g = U.s('g');
      g.appendChild(U.s('title', null, `${k}: pago ${money(d.paid)} · a pagar ${money(d.open)}`));
      if (d.paid) g.appendChild(U.s('rect', { class: 'bar-paid', x, width: w, y: y(d.paid), height: y(0) - y(d.paid), rx: 4 }));
      if (d.open) g.appendChild(U.s('rect', { class: 'bar-open', x, width: w, y: y(d.paid + d.open), height: y(d.paid) - y(d.paid + d.open), rx: 4 }));
      svg.appendChild(g);
      if (keys.length <= 14 || i % Math.ceil(keys.length / 12) === 0) svg.appendChild(U.s('text', { x: x + w / 2, y: H - pad.b + 14, 'text-anchor': 'middle' }, new Date(k + '-15').toLocaleDateString(U.lang, { month: 'short' }).replace('.', '')));
      if (k.endsWith('-01') || i === 0) svg.appendChild(U.s('text', { x: x + w / 2, y: H - pad.b + 27, 'text-anchor': 'middle' }, k.slice(0, 4)));
      if (k === tm) svg.appendChild(U.s('line', { class: 'today', x1: x + w / 2, x2: x + w / 2, y1: pad.t, y2: H - pad.b }));
    });
    svg.appendChild(U.s('line', { class: 'axis', x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0) }));
    return h('div', { style: { overflowX: 'auto' } }, h('div', { style: { minWidth: W + 'px' } }, svg));
  }
  function projectionsPage() {
    const pf = S.pf || (S.pf = { role: 'all', agreementId: '', counterpartId: '', period: '12' });
    const td = today();
    const range = pf.period === 'all' ? {} : pf.period === 'past' ? { from: C.plusMonths(td, -12), to: td } : { from: C.plusMonths(td, -3), to: C.plusMonths(td, Number(pf.period)) };
    const res = C.projections(S.ags, meId(), { role: pf.role, agreementId: pf.agreementId || null, counterpartId: pf.counterpartId || null, ...range, today: td });
    const parties = [...new Set(S.ags.map((a) => C.counterpartOf(a, meId())).filter(Boolean))];
    const sel = (val, opts, on, label) => h('select', { class: 'input', 'aria-label': label, on: { change: (e) => on(e.target.value) } }, opts.map(([v, l]) => h('option', { value: v, selected: v === val, text: l })));
    const kpi = (l, v, ctx, tone) => h('div', { class: 'stat glass' }, h('div', { class: 'lbl', text: l }), h('div', { class: 'val', style: { color: tone || '' }, text: v }), h('div', { class: 'ctx', text: ctx }));
    const yearly = Object.keys(res.yearly).sort();
    return h('div', null,
      h('div', { class: 'card glass', style: { marginBottom: '14px' } }, h('div', { class: 'grid2' }, field('Perspectiva', sel(pf.role, [['all', 'Tudo'], ['seller', 'O que recebo'], ['buyer', 'O que pago']], (v) => { pf.role = v; render(); }, 'Perspectiva')), field('Período', sel(pf.period, [['12', 'Próximos 12 meses'], ['24', 'Próximos 24 meses'], ['past', 'Últimos 12 meses'], ['all', 'Todo o período']], (v) => { pf.period = v; render(); }, 'Período')),
        field('Contrato', sel(pf.agreementId, [['', 'Todos os contratos'], ...S.ags.filter((a) => a.terms).map((a) => [a.id, a.title])], (v) => { pf.agreementId = v; render(); }, 'Contrato')), field('Pessoa', sel(pf.counterpartId, [['', 'Todas as pessoas'], ...parties.map((p) => [p, person(p).name])], (v) => { pf.counterpartId = v; render(); }, 'Pessoa')))),
      h('div', { class: 'stats', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' } },
        kpi('Contratado', money(res.contracted), `${res.agreements} acordo(s), com juros`), kpi('Efetivamente pago', money(res.paid), 'confirmado pelo vendedor', 'var(--ok)'), kpi('Pendente (previsto)', money(res.pending), 'ainda não pago'), kpi('Juros contratados', money(res.interest), 'parte do contratado'), kpi('Economia em descontos', money(res.discount), 'antecipações'), kpi('Vencido', money(res.overdue), `${res.overdueCount} parcela(s) em atraso`, res.overdue ? 'var(--danger)' : ''), kpi('Quitação prevista', res.settlement ? date(res.settlement) : '—', 'última parcela aberta')),
      h('div', { class: 'card glass', style: { marginTop: '14px' } }, h('div', { class: 'row between wrap' }, h('h2', { style: { margin: 0, fontSize: '16px' } }, 'Evolução mensal'), h('div', { class: 'legend', style: { display: 'flex', gap: '14px' } }, h('span', null, h('i', { style: { background: 'var(--petrol-500)' } }), 'Pago'), h('span', null, h('i', { style: { background: 'var(--lime-strong)' } }), 'A pagar / receber'), h('span', null, h('i', { style: { background: 'var(--danger)', height: '2px' } }), 'Mês atual'))), h('div', { style: { marginTop: '12px' } }, barChart(res.monthly))),
      h('div', { class: 'card glass', style: { marginTop: '14px' } }, h('h2', { style: { margin: '0 0 8px', fontSize: '16px' } }, 'Por ano'), yearly.length ? yearly.map((y) => { const d = res.yearly[y], tot = d.paid + d.open || 1; return h('div', { style: { margin: '10px 0' } }, h('div', { class: 'row between small' }, h('b', { text: y }), h('span', { class: 'muted', text: `pago ${money(d.paid)} · pendente ${money(d.open)}` })), h('div', { class: 'progress', style: { height: '10px' } }, h('span', { style: { width: (d.paid / tot) * 100 + '%' } }))); }) : h('p', { class: 'muted', text: 'Sem dados.' })),
      h('p', { class: 'small muted', style: { margin: '14px 4px' }, text: 'Valores pagos só contam após aprovação do comprovante. Previsões nunca são somadas ao que foi efetivamente recebido.' }));
  }

  /* ---------- Notificações ---------- */
  const NT_ICON = { proposal: 'handshake', counter: 'swap', accepted: 'check', refused: 'x', payment: 'clip', review: 'eye', due: 'calendar', overdue: 'alert', early: 'zap', consolidation: 'layers', note: 'msg', settled: 'spark', joined: 'users', charge: 'repeat', delay: 'clock', security: 'shield' };
  function notificationsPage() {
    const list = S.ntf;
    const td = new Date().toDateString();
    const groups = [['Hoje', list.filter((n) => new Date(n.at).toDateString() === td)], ['Anteriores', list.filter((n) => new Date(n.at).toDateString() !== td)]];
    return h('div', null, h('div', { class: 'row between wrap', style: { marginBottom: '12px' } }, h('div', { class: 'note' }, icon('bell', 18), h('span', null, 'Notificações internas ativas. E-mail, push e WhatsApp: não ativos nesta versão. ', h('button', { class: 'link-btn', on: { click: () => go('#/assistente') } }, 'Ajustar o Assistente'))), unread() ? h('button', { class: 'btn ghost sm', on: { click: () => call(() => api.markRead(S.token, 'all')) } }, icon('check', 16), t('markAll')) : null),
      list.length ? groups.filter((g) => g[1].length).map(([l, items]) => [h('div', { class: 'section-h' }, h('h2', null, l)), h('div', { class: 'stack' }, items.slice(0, 80).map((n) => h('div', { class: ['ntf glass', !n.read && 'unread'] },
        h('span', { class: 'ev-ico ' + (n.type === 'overdue' ? 'danger' : n.type === 'accepted' || n.type === 'settled' ? 'ok' : n.type === 'due' ? 'warn' : ''), style: { width: '34px', height: '34px', borderRadius: '11px' } }, icon(NT_ICON[n.type] || 'bell', 17)),
        h('div', { class: 'body' }, h('div', { class: 't', text: n.title }), h('div', { class: 'd', text: n.body }), n.amountCents ? h('div', { class: 'small', style: { fontWeight: 700 }, text: money(n.amountCents) + (n.due ? ' · vence ' + date(n.due) : '') }) : null,
          h('div', { class: 'channels' }, n.source === 'assistant' ? pill('Assistente PACTO', 'lime') : null, pill('No app · entregue', 'ok'), pill('E-mail · não ativo', 'muted'), pill('Push · não ativo', 'muted')), h('div', { class: 'small muted', text: U.ago(n.at) })),
        n.agreementId || n.consolidationId ? h('button', { class: 'btn ghost sm', on: { click: async () => { await api.markRead(S.token, [n.id]).catch(() => {}); if (n.consolidationId && !n.agreementId) { await refresh(); openConsolidation(n.consolidationId); } else go('#/acordo/' + n.agreementId); } } }, t('open')) : null)))]) : empty('bell', 'Sem notificações', 'Avisos de vencimento, propostas e comprovantes aparecem aqui.'));
  }

  /* ---------- Perfil ---------- */
  async function resizePhoto(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use PNG, JPG ou WebP.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Imagem muito grande.');
    const bmp = await createImageBitmap(file);
    const size = 256, cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'); const sc = Math.max(size / bmp.width, size / bmp.height);
    ctx.drawImage(bmp, (size - bmp.width * sc) / 2, (size - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
    let url = cv.toDataURL('image/webp', 0.85); if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', 0.85);
    return url;
  }
  function mfaCard() {
    const box = h('div', null, U.skeleton(1));
    const card = h('section', { class: 'card glass', id: 'mfa-card' }, h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, 'Verificação em duas etapas'),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: 'Obrigatória para aceitar propostas, renegociações, unificações, antecipações e novas datas, e para aprovar comprovantes. Use Google Authenticator, Microsoft Authenticator, 1Password ou similar.' }), box);
    const recBox = h('div', { style: { margin: '8px 0' } });
    const recShow = async () => {
      let rs; try { rs = await api.mfaRecoveryStatus(); } catch (e) { recBox.replaceChildren(h('div', { class: 'small muted', text: 'Códigos de recuperação: não foi possível consultar agora.' })); return; }
      const gen = h('button', { class: 'btn ghost sm', on: { click: async () => {
        if (rs.active && !confirm('Gerar novos códigos? Os ' + rs.active + ' códigos atuais deixam de valer.')) return;
        gen.disabled = true;
        try { const r = await api.mfaRecoveryGenerate(); recBox.replaceChildren(recoveryCodesView(r.codes, recShow)); } catch (e) { handleErr(e); gen.disabled = false; }
      } } }, icon('key', 16), rs.active ? 'Gerar novos códigos' : 'Gerar códigos de recuperação');
      recBox.replaceChildren(h('div', { class: 'kv' }, h('span', { text: 'Códigos de recuperação' }),
        rs.active ? pill(rs.active + ' válidos', 'ok') : pill('Ainda não gerados', 'warn')),
        rs.active ? null : h('p', { class: 'small muted', style: { margin: '4px 0 8px' }, text: 'Gere e guarde os códigos agora: eles são a forma segura de recuperar a conta se você perder o celular.' }),
        h('div', { class: 'actions' }, gen));
    };
    const show = async () => {
      let st; try { st = await api.mfaStatus(); } catch (e) { box.replaceChildren(h('div', { class: 'err', text: e.message })); return; }
      if (st.enabled) recShow();
      if (st.enabled) {
        box.replaceChildren(h('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '8px' } }, pill('Ativa', 'ok'), pill(st.level === 'aal2' ? 'Confirmada nesta sessão' : 'Será pedida nas operações financeiras', st.level === 'aal2' ? 'ok' : 'info')),
          ...st.factors.map((f) => kv(f.name, 'desde ' + U.dateTime(f.createdAt))),
          recBox,
          h('div', { class: 'actions' }, h('button', { class: 'link-btn', on: { click: () => recoveryDialog() } }, 'Perdi meu autenticador'), h('button', { class: 'btn ghost sm', on: { click: async () => {
            if (!confirm('Desativar a verificação em duas etapas? Você não conseguirá aceitar nem aprovar operações financeiras até ativá-la de novo.')) return;
            try { if (st.level !== 'aal2' && !(await stepUpDialog())) return; await api.mfaUnenroll(st.factors[0].id); toast('Verificação em duas etapas desativada.'); show(); } catch (e) { handleErr(e); }
          } } }, 'Desativar')));
        return;
      }
      box.replaceChildren(h('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '10px' } }, pill('Desativada', 'warn')),
        h('button', { class: 'btn sm lime', on: { click: async () => { await mfaSetup(); S.mfaOn = undefined; mfaProbe(); show(); } } }, icon('shield', 16), 'Ativar verificação em duas etapas'));
    };
    show();
    return card;
  }
  function profilePage() {
    const me = S.me;
    const name = h('input', { value: me.name, maxlength: '60' });
    const photoIn = h('input', { type: 'file', id: 'photo', accept: 'image/png,image/jpeg,image/webp', on: { change: async (e) => { try { const url = await resizePhoto(e.target.files[0]); await call(() => api.updateProfile(S.token, { photo: url }), 'Foto atualizada.'); } catch (x) { toast(x.message, 'err'); } } } });
    const pcur = h('input', { type: 'password', autocomplete: 'current-password' }), pnew = h('input', { type: 'password', autocomplete: 'new-password' });
    const capPw = captchaBox();
    const sessBox = h('div', null, U.skeleton(1));
    /* 8.2 · “Esqueci minha senha” (Supabase Auth): link por e-mail para o endereço cadastrado, sem pedir a senha atual */
    const forgotBox = h('div', { 'aria-live': 'polite' });
    const forgotNote = () => h('div', { class: 'note ok', role: 'status', style: { marginTop: '10px' } }, icon('mail', 18), h('span', null, `Se o e-mail da conta estiver correto, enviamos um link para ${maskEmail(S.me.email)}. Ele vale uma vez e por pouco tempo. Abra neste aparelho, escolha a nova senha e pronto: não precisa da senha atual. Não chegou em alguns minutos? Olhe o spam.`));
    if (S.forgotUntil && Date.now() < S.forgotUntil) forgotBox.replaceChildren(forgotNote()); // a tela é redesenhada em segundo plano: o aviso não pode sumir
    const capForgot = typeof capPw !== 'undefined' ? capPw : { need: async () => undefined, reset: () => {} };
    const forgotBtn = h('button', { class: 'btn sm ghost', type: 'button', on: { click: async () => {
      forgotBtn.disabled = true; let cool = 60000;
      try {
        const t = await capForgot.need(); await api.requestReset(S.me.email, t); capForgot.reset();
        S.forgotUntil = Date.now() + 60000; forgotBox.replaceChildren(forgotNote());
      } catch (e) { toast(e.message, 'err'); if (e.code === 'CAPTCHA') cool = 0; }
      setTimeout(() => { forgotBtn.disabled = false; }, cool);
    } } }, icon('mail', 16), 'Esqueci minha senha');
    if (S.forgotUntil && Date.now() < S.forgotUntil) { forgotBtn.disabled = true; setTimeout(() => { forgotBtn.disabled = false; }, S.forgotUntil - Date.now()); }
    api.listSessions(S.token).then((ss) => sessBox.replaceChildren(...ss.map((x) => kv(`${x.current ? 'Esta aba' : 'Outra sessão'} · ${x.ua.slice(0, 28)}`, 'expira ' + U.dateTime(new Date(x.expiresAt).toISOString()))))).catch(() => {});
    const logBox = h('div');
    const prefs = me.prefs;
    const setPref = (k, v) => call(() => api.updateProfile(S.token, { prefs: { ...prefs, [k]: v } }), 'Preferência salva.');
    return h('div', { class: 'stack', style: { maxWidth: '760px' } },
      verifyBanner(),
      h('section', { class: 'profile-hero glass' }, h('div', { class: 'photo-edit' }, avatar(me, 84), h('label', { for: 'photo', 'aria-label': 'Alterar foto', title: 'Alterar foto' }, icon('camera', 17)), photoIn),
        h('div', { style: { flex: 1, minWidth: '200px' } }, h('div', { style: { fontSize: '22px', fontWeight: 760, letterSpacing: '-.03em' }, text: me.name }), h('div', { class: 'muted small', text: me.email }), h('div', { class: 'row wrap', style: { marginTop: '6px' } }, me.emailVerified ? pill('E-mail verificado', 'ok') : pill('E-mail não verificado', 'warn'), me.demo ? pill('Conta demo', 'lime') : null, pill(`${S.ags.filter((a) => a.sellerId === me.id).length} vendendo · ${S.ags.filter((a) => a.buyerId === me.id).length} comprando`))),
        me.photo ? h('button', { class: 'link-btn', on: { click: () => call(() => api.updateProfile(S.token, { photo: '' }), 'Foto removida.') } }, 'Remover foto') : null),
      h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 12px', fontSize: '16px' } }, 'Perfil e aparência'), field('Nome de exibição', name),
        h('div', { class: 'field' }, h('label', null, t('language')), seg([['pt-BR', 'Português'], ['en', 'English'], ['es', 'Español']], me.lang, (v) => call(() => api.updateProfile(S.token, { lang: v })), t('language'))),
        h('div', { class: 'field' }, h('label', null, t('theme')), seg([['light', t('light')], ['dark', t('dark')], ['auto', t('auto')]], me.theme, (v) => call(() => api.updateProfile(S.token, { theme: v })), t('theme'))),
        h('button', { class: 'btn sm', on: { click: () => call(() => api.updateProfile(S.token, { name: name.value }), 'Perfil salvo.') } }, t('save'))),
      h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, t('prefs')), h('p', { class: 'small muted', style: { margin: '0 0 6px' }, text: 'Lembretes de vencimento sem duplicidade (um por parcela e janela).' }),
        toggle('7 dias antes do vencimento', prefs.d7, (v) => setPref('d7', v)), toggle('3 dias antes', prefs.d3, (v) => setPref('d3', v)), toggle('No dia do vencimento', prefs.d0, (v) => setPref('d0', v)), toggle('Parcelas em atraso', prefs.overdue, (v) => setPref('overdue', v)),
        toggle('E-mail', false, () => {}, { disabled: true, badge: 'não ativo' }), toggle('Push no celular', false, () => {}, { disabled: true, badge: 'não ativo' }),
        h('button', { class: 'btn ghost sm', style: { marginTop: '8px' }, on: { click: () => go('#/assistente') } }, icon('robot', 16), 'Mais ajustes no Assistente PACTO')),
      h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, 'Privacidade do contato'),
        toggle('Mostrar meu e-mail para quem tem acordo comigo', !!prefs.shareContact, (v) => setPref('shareContact', v)),
        h('p', { class: 'small muted', style: { margin: '6px 0 0' }, text: 'Desligado por padrão. Ninguém fora dos seus acordos vê seus dados; inadimplência nunca é exibida publicamente.' })),
      categoriesCard(),
      REMOTE ? mfaCard() : null,
      h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 12px', fontSize: '16px' } }, t('security')),
        h('div', { class: 'field' }, h('label', null, 'Bloquear após inatividade'), seg([[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']], prefs.autoLockMin, (v) => setPref('autoLockMin', v), 'Bloqueio automático')),
        h('div', { class: 'form-grid' }, field('Senha atual', pcur), field('Nova senha', pnew, 'Mín. 10 caracteres com letras e números.')),
        capPw.el,
        h('div', { class: 'actions' }, h('button', { class: 'btn sm ghost', on: { click: async () => { let t; try { t = await capPw.need(); } catch (e) { toast(e.message, 'err'); return; } await call(() => api.changePassword(S.token, { current: pcur.value, next: pnew.value, captchaToken: t }), 'Senha alterada. Outras sessões foram encerradas.'); capPw.reset(); } } }, icon('key', 16), 'Alterar senha'), REMOTE ? forgotBtn : null),
        REMOTE ? h('p', { class: 'small muted', style: { margin: '8px 0 0' }, text: 'Perdeu a senha atual? Use “Esqueci minha senha”: enviamos um link para o e-mail cadastrado. Se você usa verificação em duas etapas, o código do app autenticador continua sendo exigido.' }) : null, REMOTE ? forgotBox : null,
        h('hr', { class: 'divider' }), h('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, 'Sessões ativas'), sessBox,
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost sm', on: { click: () => call(() => api.revokeOtherSessions(S.token), 'Outras sessões encerradas.') } }, 'Encerrar outras sessões'), h('button', { class: 'btn ghost sm', on: { click: lockNow } }, icon('lock', 16), t('lock')),
          h('button', { class: 'btn ghost sm', on: { click: async () => { const v = await api.verifyLog(S.token).catch(handleErr); if (v) logBox.replaceChildren(h('div', { class: 'note ' + (v.ok ? 'ok' : 'danger'), style: { marginTop: '10px' } }, icon(v.ok ? 'shield' : 'alert', 18), v.ok ? `Log íntegro: ${v.count} eventos encadeados. Topo: ${v.head.slice(0, 16)}…` : `Adulteração detectada no evento #${v.brokenAt}: ${v.reason}.`)); } } }, icon('hash', 16), 'Verificar integridade do log')), logBox),
      REMOTE ? h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 6px', fontSize: '16px' } }, ENV_LABEL), h('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: 'Você está no ambiente de homologação: contas reais de teste, banco compartilhado e sincronização entre aparelhos. Use somente dados fictícios.' }),
        h('button', { class: 'btn ghost sm', on: { click: logout } }, icon('logout', 16), t('logout'))) : h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 6px', fontSize: '16px' } }, t('demo')), h('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: 'Para testar com dois usuários: abra uma segunda aba (ou janela anônima não funciona: ela não compartilha os dados) e entre com a outra conta. As mudanças aparecem ao vivo nas duas.' }),
        h('div', { class: 'actions' }, Seed.DEMO.filter((d) => d.email !== me.email).map((d) => h('button', { class: 'btn ghost sm', on: { click: () => switchTo(d.email) } }, icon('swap', 16), d.name)), h('button', { class: 'btn danger sm', on: { click: async () => { if (!confirm('Apagar todos os dados locais e recriar a demonstração?')) return; await api.resetAll(); sessionStorage.clear(); location.hash = ''; location.reload(); } } }, icon('refresh', 16), 'Reiniciar demonstração')),
        h('button', { class: 'btn ghost sm', style: { marginTop: '10px' }, on: { click: logout } }, icon('logout', 16), t('logout'))),
      h('p', { class: 'small muted', style: { textAlign: 'center' }, text: (REMOTE ? 'PACTO 8.2 · ' + ENV_LABEL + ' · O combinado tem valor. · servidor Supabase.' : 'PACTO 8.1 (sobre a base 8.0) · O combinado tem valor. · protótipo local (sem servidor).') + ' Quem vende sabe quanto vai receber. Quem compra sabe quanto deve. Nenhum acordo muda sem que os dois concordem.' }));
  }

  /* =====================================================================
   * PACTO 8.1 · novas áreas (mesma arquitetura e identidade visual)
   * ===================================================================== */
  const KIND_TAG = { forecast: 'Previsto', received: 'Recebido', paid: 'Pago', open: 'Em aberto', late: 'Atraso', review: 'Em análise', count: 'Clientes' };
  function indicators(r) {
    const D = S.dash; if (!D) return h('div', { class: 'stats' });
    const tile = (ic, label, box, ctx, kind, opts = {}) => h('button', { class: 'stat glass lift', style: { border: 0, textAlign: 'left' }, 'aria-label': `${label}: ${opts.count ? box.count : money(box.cents)}. Ver composição`, on: { click: () => (opts.go ? opts.go() : openDrill(label, box, kind)) } },
      h('div', { class: 'lbl' }, icon(ic, 14), label), h('div', { class: 'val money', style: { color: kind === 'late' && box.count ? 'var(--danger)' : '' }, text: opts.count ? String(box.count) : U.moneyShort(box.cents) }),
      h('div', { class: 'ctx' }, h('span', { class: 'kind-tag ' + kind, text: KIND_TAG[kind] }), ' ', ctx));
    let tiles;
    if (r === 'buyer') {
      const b = D.buyer;
      tiles = [tile('calendar', 'Pagar neste mês', b.dueMonth, 'vencimentos do mês', 'forecast'), tile('check', 'Já paguei', b.paidTotal, 'confirmado pelos vendedores', 'paid'), tile('wallet', 'Falta concluir', b.remaining, 'saldo dos acordos', 'open'), tile('alert', 'Atrasos', b.overdue, `${b.overdue.count} parcela(s)`, 'late')];
    } else if (r === 'recurring') {
      const c = D.recurring;
      tiles = [tile('repeat', 'Receita recorrente', c.forecastMonthly, 'equivalente por mês', 'forecast'), tile('check', 'Recebido no mês', c.receivedMonth, 'mensalidades confirmadas', 'received'), tile('clock', 'Pendentes', c.pending, `${c.pending.count} cobrança(s)`, 'open'), tile('users', 'Clientes ativos', c.activeClients, 'com contrato vigente', 'count', { count: true, go: () => go('#/clientes') })];
    } else {
      const v = D.seller;
      tiles = [tile('calendar', 'Receber neste mês', v.forecastMonth, 'ainda não recebido', 'forecast'), tile('check', 'Recebido no mês', v.receivedMonth, 'confirmado por você', 'received'), tile('eye', 'Em análise', v.review, 'para você conferir', 'review', { count: true, go: () => { S.filters.pay = 'review'; go('#/pagamentos'); } }), tile('alert', 'Atrasos', v.overdue, `${v.overdue.count} parcela(s)`, 'late'),
        h('button', { class: 'stat glass lift', style: { border: 0, textAlign: 'left' }, on: { click: () => { S.filters.cl = 'attention'; go('#/clientes'); } } }, h('div', { class: 'lbl' }, icon('users', 14), 'Precisam de atenção'), h('div', { class: 'val', text: String(v.attention.length) }), h('div', { class: 'ctx' }, h('span', { class: 'kind-tag count', text: 'Clientes' }), ' atraso ou vencendo'))];
    }
    return h('div', { class: 'stats stats-ind' }, tiles);
  }
  function openDrill(label, box, kind) {
    const items = [...box.items].sort((x, y) => String(x.due || x.paidAt || '').localeCompare(String(y.due || y.paidAt || '')));
    const body = h('div', null,
      kind === 'forecast' ? h('div', { class: 'note', style: { marginBottom: '12px' } }, icon('calendar', 18), 'Previsão: valores ainda NÃO recebidos/pagos. Nunca somamos previsão com dinheiro confirmado.') : kind === 'received' || kind === 'paid' ? h('div', { class: 'note ok', style: { marginBottom: '12px' } }, icon('check', 18), 'Somente pagamentos com comprovante aprovado pelo vendedor.') : null,
      h('div', { class: 'card glass', style: { padding: '6px 14px' } }, items.length ? items.map((it) => { const a = findAg(it.agreementId); const o = person(it.counterpartId); return h('button', { class: 'drill-row', on: { click: () => { closeSheet(); go('#/acordo/' + it.agreementId); } } }, avatar(o, 32), h('div', { style: { minWidth: 0, flex: 1, textAlign: 'left' } }, h('div', { class: 'small', style: { fontWeight: 700 }, text: it.title }), h('div', { class: 'small muted', text: `${o.name}${it.due ? ' · vence ' + dateShort(it.due) : ''}${it.periodicity ? ' · ' + PER[it.periodicity].toLowerCase() : ''}` })), h('b', { class: 'money', text: kind === 'count' ? '' : money(it.amountCents, cur(a)) })); }) : h('p', { class: 'muted small', style: { padding: '12px 0' }, text: 'Nada compõe este indicador agora.' })),
      kind === 'count' ? null : h('div', { class: 'kv', style: { marginTop: '10px' } }, h('span', null, h('span', { class: 'kind-tag ' + kind, text: KIND_TAG[kind] }), ' Total'), h('b', { class: 'money', text: money(box.cents) })));
    sheet('Composição · ' + label, body);
  }
  function recurringAside(a) {
    const tm = a.terms, R = a.recurring || {};
    const st = tm.cancelled ? ['Cancelado', 'danger'] : tm.suspended ? ['Suspenso', 'warn'] : R.ended ? ['Encerrado', ''] : ['Ativo', 'ok'];
    return [kv('Tipo', BILL.recurring), h('div', { class: 'kv' }, h('span', null, 'Situação'), pill(...st)), kv('Valor por período', money(tm.amountCents, cur(a))), kv('Periodicidade', perLabel(tm)), kv('Início', date(tm.startDate)), kv('Término', tm.endDate ? date(tm.endDate) : 'Sem término'),
      h('div', { class: 'kv' }, h('span', null, 'Previsão mensal ', h('span', { class: 'kind-tag forecast', text: 'Previsto' })), h('b', { text: money(C.monthlyEquivalent(tm), cur(a)) })),
      kv('Cobranças geradas', String(a.schedule.filter((x) => x.kind === 'recurring').length)),
      h('p', { class: 'small muted', style: { margin: '8px 0 0' }, text: 'Cada cobrança é criada perto do vencimento. A dívida futura nunca é lançada de uma vez.' })];
  }
  function recurringDiff(before, after, curr) {
    const st = (x) => (x.cancelled ? 'Cancelado' : x.suspended ? 'Suspenso' : 'Ativo');
    const per = (x) => (x.periodicity === 'custom' ? `a cada ${x.intervalDays} dias` : PER[x.periodicity]);
    const rows = [['Valor por período', (x) => money(x.amountCents, curr)], ['Periodicidade', per], ['Início', (x) => date(x.firstDue || x.startDate)], ['Término', (x) => (x.endDate ? date(x.endDate) : 'Sem término')], ['Situação', st]];
    if (!before || before.mode !== 'recurring') return h('div', { class: 'diff' }, rows.map(([k, f]) => [h('div', { class: 'k', text: k }), h('div', { class: 'same', text: f(after) })]));
    return h('div', { class: 'diff' }, rows.map(([k, f]) => { const x = f(before), y = f(after); return [h('div', { class: 'k', text: k }), x === y ? h('div', { class: 'same', text: y }) : [h('span', { class: 'old', text: x }), icon('right', 14, 'muted'), h('span', { class: 'new', text: y })]]; }));
  }
  function openRecurringChange(id, isCounter) {
    const a = findAg(id); if (!a) return;
    const pv = C.pendingVersion(a);
    const base = { ...(isCounter && pv ? pv.terms : a.terms || (pv && pv.terms)) };
    const notActive = a.status !== 'active';
    const kinds = notActive ? [['readjust', 'Ajustar condições']] : base.cancelled ? [['renew', 'Renovar']] : base.suspended ? [['resume', 'Retomar'], ['readjust', 'Reajustar'], ['cancel', 'Cancelar']] : [['readjust', 'Reajustar'], ['suspend', 'Suspender'], ['cancel', 'Cancelar'], ['renew', 'Renovar/estender']];
    let kind = kinds[0][0];
    const reason = h('textarea', { maxlength: '300', placeholder: 'Justificativa visível para a outra parte (obrigatória)' });
    const holder = h('div');
    let ed = null, endIn = null;
    const draw = () => {
      ed = null; endIn = null;
      if (kind === 'readjust') { ed = recurringEditor(base, { currency: cur(a), change: !notActive }); holder.replaceChildren(ed.el); }
      else if (kind === 'renew') { endIn = h('input', { type: 'date', value: base.endDate ? C.plusMonths(base.endDate, 6) : '', min: today() }); holder.replaceChildren(field('Novo término (vazio = sem término)', endIn), h('p', { class: 'small muted', text: 'Ao renovar um contrato cancelado, as cobranças recomeçam a partir do próximo período — nada é cobrado retroativamente.' })); }
      else holder.replaceChildren(h('div', { class: 'note ' + (kind === 'cancel' ? 'warn' : '') }, icon(kind === 'suspend' ? 'pause' : kind === 'resume' ? 'play' : 'x', 18), kind === 'suspend' ? 'Suspende a geração de novas cobranças até a retomada. Cobranças já geradas continuam valendo.' : kind === 'resume' ? 'Retoma a partir do próximo período. Períodos da suspensão não são cobrados.' : 'Encerra o contrato: nenhuma nova cobrança será gerada. As já geradas continuam até a quitação.'));
    };
    draw();
    const body = h('div', null,
      kinds.length > 1 ? h('div', { class: 'field' }, h('label', null, 'O que você quer propor?'), seg(kinds, kind, (v) => { kind = v; draw(); }, 'Tipo de mudança')) : null,
      holder, field('Justificativa', reason),
      h('div', { class: 'note', style: { margin: '6px 0 12px' } }, icon('shield', 18), 'Nada muda até a outra parte aceitar exatamente esta versão. Cobranças já pagas nunca são alteradas.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime', on: { click: async () => {
        let terms;
        if (kind === 'readjust') terms = { ...ed.get(), startDate: base.startDate && !notActive ? base.startDate : ed.get().startDate, suspended: !!base.suspended, cancelled: false };
        else if (kind === 'suspend') terms = { ...base, suspended: true, cancelled: false };
        else if (kind === 'resume') terms = { ...base, suspended: false, cancelled: false };
        else if (kind === 'cancel') terms = { ...base, suspended: false, cancelled: true };
        else terms = { ...base, suspended: false, cancelled: false, endDate: endIn.value || null };
        if (C.cleanText(reason.value).length < 3) { toast('Explique o motivo da mudança.', 'err'); reason.focus(); return; }
        if (await call(() => api.propose(S.token, id, { terms, reason: reason.value }), 'Proposta enviada. Nada muda até a outra parte aceitar.')) closeSheet();
      } } }, icon('check', 18), isCounter ? 'Enviar contraproposta' : 'Enviar para aceite')));
    sheet((isCounter ? 'Contraproposta · ' : 'Mudança no contrato · ') + a.title, body);
  }
  function openRecurringProposal(a, v) {
    const au = person(v.authorId);
    const reason = h('textarea', { maxlength: '300', placeholder: 'Motivo (obrigatório para recusar)' });
    const body = h('div', null,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, avatar(au, 36), h('div', null, h('b', { text: `${au.name} · v${v.no}` }), h('div', { class: 'small muted', text: `${v.change && v.change !== 'start' ? 'Propõe ' + CHG[v.change] : 'Contrato recorrente'} · ${U.dateTime(v.at)}` }))),
      h('div', { class: 'note' }, icon('msg', 18), '“' + v.reason + '”'),
      recurringDiff(v.before && v.before.mode === 'recurring' ? { ...v.before, startDate: v.before.firstDue } : null, v.terms, cur(a)),
      h('div', { style: { height: '10px' } }), kv('Previsão mensal', money(C.monthlyEquivalent(v.terms), cur(a))),
      a.status === 'active' ? h('div', { class: 'note warn', style: { marginTop: '10px' } }, icon('lock', 18), 'Cobranças já geradas não mudam. A mudança vale para os próximos períodos.') : h('div', { class: 'note', style: { marginTop: '10px' } }, icon('repeat', 18), 'Ao aceitar, só a cobrança do período corrente é gerada. As próximas aparecem uma a uma.'),
      h('div', { class: 'hashline', style: { margin: '10px 0' }, text: 'Você está aceitando exatamente os termos com sha256 ' + v.termsHash.slice(0, 32) + '…' }),
      field('Resposta', reason),
      h('div', { class: 'actions' },
        h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.respond(S.token, a.id, { versionNo: v.no, action: 'accept' }), 'Aceito pelos dois lados.')) closeSheet(); } } }, icon('check', 18), 'Aceitar v' + v.no),
        h('button', { class: 'btn ghost', on: { click: () => openRecurringChange(a.id, true) } }, icon('swap', 18), 'Contrapropor'),
        h('button', { class: 'btn danger', on: { click: async () => { if (C.cleanText(reason.value).length < 3) { toast('Explique o motivo da recusa.', 'err'); reason.focus(); return; } if (await call(() => api.respond(S.token, a.id, { versionNo: v.no, action: 'refuse', reason: reason.value }), 'Proposta recusada. As condições anteriores continuam.')) closeSheet(); } } }, icon('x', 18), 'Recusar')));
    sheet('Proposta · ' + a.title, body, { wide: true });
  }

  /* ---------- justificar atraso ---------- */
  function openDelay(id, sid) {
    const a = findAg(id), s = a && a.schedule.find((x) => x.id === sid); if (!s) return;
    let file = null;
    const why = h('textarea', { maxlength: '300', placeholder: 'ex.: o salário atrasou, despesa médica…' });
    const nd = h('input', { type: 'date', min: plusDaysISO(1), max: plusDaysISO(180), value: plusDaysISO(7) });
    const note = h('textarea', { maxlength: '400', placeholder: 'Observação (opcional)' });
    const late = Math.abs(C.daysBetween(today(), s.due));
    const drop = fileDrop((f) => (file = f));
    drop.querySelector('.small').textContent = 'PDF, PNG, JPG ou WebP · até 1,5 MB · opcional';
    drop.querySelector('b').textContent = 'Anexo (opcional)';
    const body = h('div', null,
      h('div', { class: 'card glass', style: { marginBottom: '12px' } }, h('div', { class: 'eyebrow', text: a.title }), h('div', { style: { fontSize: '24px', fontWeight: 780, letterSpacing: '-.03em' }, text: money(C.remainingOf(s), cur(a)) }), h('div', { class: 'small', style: { color: 'var(--danger)' }, text: `Parcela ${instLabel(s)} · venceu em ${date(s.due)} · ${late} dia(s) de atraso` })),
      field('Motivo do atraso', why), field('Nova data proposta para pagamento', nd), field('Observação', note), drop,
      h('div', { class: 'note', style: { margin: '6px 0 12px' } }, icon('shield', 18), 'O vencimento contratual só muda se o vendedor aceitar. O registro do atraso fica preservado no histórico. Enquanto a justificativa estiver em análise, o Assistente não envia lembretes desta parcela.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn lime block', on: { click: async () => {
        if (await call(() => api.proposeDelay(S.token, id, { installmentId: sid, newDate: nd.value, reason: why.value, note: note.value, file }), 'Justificativa enviada ao vendedor.')) closeSheet();
      } } }, icon('clock', 18), 'Enviar justificativa')));
    sheet('Justificar atraso', body);
  }
  const DLY = { pending: ['Em análise', 'info'], accepted: ['Aceita pelos dois', 'ok'], refused: ['Recusada', 'danger'], closed_paid: ['Encerrada: parcela paga', ''], superseded: ['Substituída por contraproposta', ''], closed: ['Encerrada', ''] };
  function delayCard(a, d, compact) {
    const s = a.schedule.find((x) => x.id === d.installmentId);
    return h('div', { class: ['tl-item glass', d.status === 'pending' ? 'pending' : d.status, compact && 'no-dot'] },
      h('div', { class: 'row between wrap' }, h('b', { text: `Parcela ${s ? instLabel(s) : ''} · venc. original ${date(d.originalDue)}` }), pill(...DLY[d.status])),
      d.versions.map((v) => { const au = v.authorId === meId() ? 'Você' : person(v.authorId).name; return h('div', { class: 'dly-v' }, h('div', { class: 'small' }, h('b', { text: `v${v.no} · ${au}` }), h('span', { class: 'muted', text: ' · ' + U.dateTime(v.at) + ' · ' }), pill(...(DLY[v.status] || [v.status, '']))), h('div', { class: 'small' }, 'Nova data: ', h('b', { text: date(v.newDate) }), v.feeCents ? h('span', { text: ' · encargo ' + money(v.feeCents, cur(a)) }) : null), h('div', { class: 'small muted', text: '“' + v.reason + '”' + (v.note ? ' · ' + v.note : '') }), v.attachment ? h('button', { class: 'link-btn small', on: { click: () => openFile(v.attachment.fileId) } }, icon('clip', 14), v.attachment.name) : null); }),
      d.refuseReason ? h('div', { class: 'small', style: { marginTop: '6px' } }, h('b', null, 'Motivo da recusa: '), d.refuseReason) : null,
      !compact && d.status === 'pending' ? h('div', { class: 'actions' }, h('button', { class: 'btn sm ' + (d.versions[d.versions.length - 1].authorId !== meId() ? 'lime' : 'ghost'), on: { click: () => openDelayRespond(a.id, d.id) } }, d.versions[d.versions.length - 1].authorId !== meId() ? 'Responder' : 'Ver')) : null);
  }
  function delaysSection(a) {
    return h('div', null, h('div', { class: 'section-h' }, h('h2', null, 'Justificativas de atraso')), h('div', { class: 'timeline' }, [...a.delays].reverse().map((d) => delayCard(a, d))));
  }
  function openDelayRespond(id, delayId) {
    const a = findAg(id), d = a && (a.delays || []).find((x) => x.id === delayId); if (!d) return;
    const v = d.versions[d.versions.length - 1], mine = v.authorId === meId();
    const reason = h('textarea', { maxlength: '300', placeholder: 'Resposta (obrigatória para recusar)' });
    const nd = h('input', { type: 'date', min: plusDaysISO(1), value: v.newDate });
    let fee = 0;
    const counterBox = h('div', { class: 'card glass', style: { display: 'none', marginTop: '10px' } }, h('div', { class: 'form-grid' }, field('Outra data', nd), field('Encargo (opcional)', moneyInput(0, (x) => (fee = x), { label: 'Encargo', currency: cur(a) }), 'Gera uma cobrança separada, só se aceita.')),
      h('button', { class: 'btn sm', on: { click: async () => { if (await call(() => api.respondDelay(S.token, id, { delayId, action: 'counter', newDate: nd.value, feeCents: fee || 0, reason: reason.value }), 'Contraproposta enviada.')) closeSheet(); } } }, icon('swap', 16), 'Enviar contraproposta'));
    const body = h('div', null, delayCard(a, d, true),
      d.status === 'pending' && !mine ? [field('Resposta', reason),
        h('div', { class: 'note', style: { margin: '6px 0 12px' } }, icon('shield', 18), 'Aceitar muda o vencimento para a nova data para os dois. O atraso original fica registrado.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn lime', on: { click: async () => { if (await call(() => api.respondDelay(S.token, id, { delayId, action: 'accept' }), 'Nova data aceita pelos dois lados.')) closeSheet(); } } }, icon('check', 18), 'Aceitar ' + dateShort(v.newDate)),
          h('button', { class: 'btn ghost', on: { click: () => { counterBox.style.display = counterBox.style.display === 'none' ? '' : 'none'; } } }, icon('swap', 18), 'Contrapropor'),
          h('button', { class: 'btn danger', on: { click: async () => { if (await call(() => api.respondDelay(S.token, id, { delayId, action: 'refuse', reason: reason.value }), 'Justificativa recusada. O vencimento original continua.')) closeSheet(); } } }, icon('x', 18), 'Recusar')), counterBox]
        : d.status === 'pending' ? h('div', { class: 'note', style: { marginTop: '10px' } }, icon('clock', 18), 'Aguardando a resposta da outra parte.') : null);
    sheet('Justificativa de atraso · ' + a.title, body);
  }

  /* ---------- detalhe de uma parcela (calendário/acordo) ---------- */
  function openInstallment(id, sid) {
    const a = findAg(id), s = a && a.schedule.find((x) => x.id === sid); if (!s) return;
    const st = instState(s), r = role(a);
    const hist = h('div', null, U.skeleton(1));
    api.auditLog(S.token, id).then(({ events }) => {
      const evs = events.filter((e) => e.data && (e.data.installmentId === sid || (e.data.installmentIds || []).includes(sid))).reverse();
      hist.replaceChildren(evs.length ? h('div', { class: 'card glass', style: { padding: '6px 14px' } }, evs.map((e) => { const d = EV[e.type]; const who = e.actorId === meId() ? 'Você' : person(e.actorId).name; return h('div', { class: 'small', style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } }, h('b', { text: who }), ' ', d ? d[2](e.data) : e.type, h('span', { class: 'muted', text: ' · ' + U.dateTime(e.at) }), h('div', { class: 'hashline', text: '#' + e.seq + ' ' + e.hash.slice(0, 16) + '…' })); })) : h('p', { class: 'small muted', text: 'Sem eventos específicos desta parcela.' }));
    }).catch(handleErr);
    const acts = [];
    if (a.status === 'active' && r === 'buyer' && C.OPEN.includes(s.status) && !s.earlyId) acts.push(h('button', { class: 'btn lime sm', on: { click: () => openPay(id, sid) } }, icon('upload', 16), 'Informar pagamento'));
    if (a.status === 'active' && r === 'buyer' && st === 'overdue' && !s.delayId && !s.earlyId) acts.push(h('button', { class: 'btn ghost sm', on: { click: () => openDelay(id, sid) } }, icon('clock', 16), 'Justificar atraso'));
    if (r === 'seller' && s.status === 'review') acts.push(h('button', { class: 'btn lime sm', on: { click: () => openReview(id, sid) } }, icon('eye', 16), 'Conferir comprovante'));
    if (s.delayId) acts.push(h('button', { class: 'btn ghost sm', on: { click: () => openDelayRespond(id, s.delayId) } }, icon('clock', 16), 'Justificativa'));
    acts.push(h('button', { class: 'btn ghost sm', on: { click: () => { closeSheet(); go('#/acordo/' + id); } } }, 'Abrir acordo', icon('right', 16)));
    const body = h('div', null,
      h('div', { class: 'card glass', style: { marginBottom: '12px' } }, h('div', { class: 'row between wrap' }, h('div', { class: 'eyebrow', text: `${a.title} · ${r === 'seller' ? 'você recebe de' : 'você paga a'} ${other(a).name}` }), pill(...instPill(s))),
        h('div', { style: { fontSize: '26px', fontWeight: 780, letterSpacing: '-.03em' }, text: money(s.amountCents, cur(a)) }),
        kv('Vencimento', date(s.due)), s.originalDue ? kv('Vencimento original', date(s.originalDue) + ' (atraso registrado)') : null, s.period ? kv('Período', `${date(s.period.from)} – ${date(s.period.to)}`) : null, s.paidCents ? kv('Pago', money(s.paidCents, cur(a))) : null, s.paidAt ? kv('Quitada em', date(s.paidAt)) : null, s.discountCents ? kv('Desconto', money(s.discountCents, cur(a))) : null),
      h('div', { class: 'actions', style: { marginBottom: '12px' } }, acts),
      h('div', { class: 'eyebrow', style: { margin: '4px 0 6px' } }, 'Comprovantes'), s.reports.length ? h('div', { class: 'reports', style: { marginTop: 0 } }, s.reports.map((rep) => reportView(a, rep))) : h('p', { class: 'small muted', text: 'Nenhum comprovante enviado.' }),
      (s.overdueRecords || []).length ? [h('div', { class: 'eyebrow', style: { margin: '10px 0 6px' } }, 'Registro de atrasos (preservado)'), s.overdueRecords.map((o) => kv(`Venceu ${date(o.due)}`, `nova data ${date(o.newDate)} · aceita ${U.dateTime(o.resolvedAt)}`))] : null,
      (a.delays || []).filter((d) => d.installmentId === sid).length ? [h('div', { class: 'eyebrow', style: { margin: '10px 0 6px' } }, 'Justificativas'), a.delays.filter((d) => d.installmentId === sid).map((d) => delayCard(a, d, true))] : null,
      h('div', { class: 'eyebrow', style: { margin: '12px 0 6px' } }, 'Histórico desta parcela'), hist);
    sheet(`${isRec(a) ? 'Período' : 'Parcela'} ${instLabel(s)} · ${dateShort(s.due)}`, body);
  }

  /* ---------- Calendário ---------- */
  const CAL_COLORS = [['green', 'Pago'], ['yellow', 'Vence em breve'], ['red', 'Atrasado'], ['blue', 'Em análise'], ['gray', 'Futuro']];
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  function calName(it) { const o = person(it.counterpartId); if (!S.cal.discreet) return o.name; return (o.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 3) + '.'; }
  function calCard(it) {
    const a = findAg(it.agreementId);
    const label = it.kind === 'proposal' ? 'Proposta aguardando aceite' : `${it.billing === 'recurring' ? 'Período' : it.kind === 'fee' ? 'Encargo' : it.kind === 'down' ? 'Entrada' : it.kind === 'extra' ? 'Extra' : 'Parcela'} ${it.seq || ''}`.trim();
    const stTxt = { green: 'Pago', yellow: 'Vence em breve', red: 'Atrasado', blue: it.delayPending ? 'Justificativa em análise' : 'Comprovante em análise', gray: it.kind === 'proposal' ? 'Aguardando aceite' : 'Futuro' }[it.color];
    return h('button', { class: 'cal-card glass c-' + it.color, on: { click: () => (it.installmentId ? openInstallment(it.agreementId, it.installmentId) : go('#/acordo/' + it.agreementId + '/negociacao')) }, 'aria-label': `${a ? a.title : ''}, ${label}, ${money(it.amountCents, cur(a))}, ${stTxt}` },
      h('span', { class: 'cal-stripe', 'aria-hidden': 'true' }),
      S.cal.discreet ? h('span', { class: 'avatar', style: { width: '34px', height: '34px' } }, icon('eyeoff', 15)) : avatar(person(it.counterpartId), 34),
      h('div', { style: { minWidth: 0, flex: 1, textAlign: 'left' } }, h('div', { class: 'cal-t', text: it.title }), h('div', { class: 'cal-d' }, h('span', { class: 'role-tag ' + it.role, text: it.role === 'seller' ? 'Recebe' : 'Paga' }), h('span', { text: `${label} · ${calName(it)}` }))),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'cal-v money', text: money(it.amountCents, cur(a)) }), h('div', { class: 'cal-s', text: stTxt })));
  }
  function calendarPage() {
    const c = S.cal; const td = today();
    c.cursor = c.cursor || td; c.sel = c.sel || td;
    const cd = dOf(c.cursor);
    let from, to, title;
    if (c.view === 'week') { const st = new Date(cd); st.setDate(cd.getDate() - cd.getDay()); const en = new Date(st); en.setDate(st.getDate() + 6); from = isoOf(st); to = isoOf(en); title = `${dateShort(from)} – ${dateShort(to)}`; }
    else { const first = new Date(cd.getFullYear(), cd.getMonth(), 1); const last = new Date(cd.getFullYear(), cd.getMonth() + 1, 0); from = isoOf(first); to = isoOf(last); title = first.toLocaleDateString(U.lang, { month: 'long', year: 'numeric' }); title = title.charAt(0).toUpperCase() + title.slice(1); }
    const gridFrom = c.view === 'month' ? (() => { const f = dOf(from); f.setDate(f.getDate() - f.getDay()); return isoOf(f); })() : from;
    const gridTo = c.view === 'month' ? C.plusDays(gridFrom, 41) : to;
    const items = C.calendarItems(S.ags, meId(), { from: gridFrom, to: gridTo, today: td, role: c.role });
    const byDay = {}; items.forEach((it) => { (byDay[it.date] = byDay[it.date] || []).push(it); });
    const shift = (n) => { const d = dOf(c.cursor); if (c.view === 'week') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n, 1); c.cursor = isoOf(d); render(); };
    const inMonth = items.filter((it) => it.date >= from && it.date <= to);
    const sum = (f) => inMonth.filter(f).reduce((t, it) => t + it.amountCents, 0);
    const toolbar = h('div', { class: 'cal-toolbar' },
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', 'aria-label': 'Anterior', on: { click: () => shift(-1) } }, icon('left', 18)), h('h2', { class: 'cal-title', text: title }), h('button', { class: 'icon-btn', 'aria-label': 'Próximo', on: { click: () => shift(1) } }, icon('right', 18)), h('button', { class: 'btn ghost sm', on: { click: () => { c.cursor = td; c.sel = td; render(); } } }, 'Hoje')),
      h('div', { class: 'row wrap' }, seg([['month', 'Mês'], ['week', 'Semana'], ['list', 'Lista']], c.view, (v) => { c.view = v; render(); }, 'Visualização'),
        h('button', { class: 'btn ghost sm', 'aria-pressed': String(c.discreet), title: 'Oculta nomes para compartilhar a tela', on: { click: () => { c.discreet = !c.discreet; sessionStorage.setItem('pacto8:discreet', c.discreet ? '1' : '0'); render(); } } }, icon(c.discreet ? 'eyeoff' : 'eye', 16), c.discreet ? 'Modo discreto ligado' : 'Modo discreto')));
    const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtro por papel' }, [['all', 'Tudo'], ['seller', 'Recebo'], ['buyer', 'Pago']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(c.role === k), on: { click: () => { c.role = k; render(); } } }, l)));
    const legend = h('div', { class: 'cal-legend', 'aria-label': 'Legenda' }, CAL_COLORS.map(([k, l]) => h('span', null, h('i', { class: 'dot c-' + k }), l)));
    const totals = h('div', { class: 'cal-totals' },
      h('div', { class: 'glass' }, h('span', { class: 'kind-tag forecast', text: 'Previsto' }), h('b', { class: 'money', text: money(sum((it) => it.role === 'seller' && ['yellow', 'gray', 'red', 'blue'].includes(it.color) && it.kind !== 'proposal')) }), h('small', null, 'a receber no período')),
      h('div', { class: 'glass' }, h('span', { class: 'kind-tag received', text: 'Recebido' }), h('b', { class: 'money', text: money(inMonth.filter((it) => it.role === 'seller').reduce((t, it) => t + (it.paidCents || 0), 0)) }), h('small', null, 'confirmado')),
      h('div', { class: 'glass' }, h('span', { class: 'kind-tag open', text: 'A pagar' }), h('b', { class: 'money', text: money(sum((it) => it.role === 'buyer' && ['yellow', 'gray', 'red', 'blue'].includes(it.color) && it.kind !== 'proposal')) }), h('small', null, 'seus vencimentos')),
      h('div', { class: 'glass' }, h('span', { class: 'kind-tag late', text: 'Atrasado' }), h('b', { class: 'money', text: String(inMonth.filter((it) => it.color === 'red').length) }), h('small', null, 'item(ns) no período')));
    let view;
    if (c.view === 'month') {
      const cells = []; for (let i = 0; i < 42; i++) cells.push(C.plusDays(gridFrom, i));
      const grid = h('div', { class: 'cal-grid glass', role: 'grid', 'aria-label': 'Calendário do mês' }, WD.map((w) => h('div', { class: 'cal-wd', role: 'columnheader', text: w })),
        cells.map((d) => { const its = byDay[d] || []; const out = d < from || d > to; return h('button', { class: ['cal-cell', out && 'out', d === td && 'today', d === c.sel && 'sel'], role: 'gridcell', 'aria-label': `${date(d)}: ${its.length} vencimento(s)`, 'aria-selected': String(d === c.sel), on: { click: () => { c.sel = d; render(); } } },
          h('span', { class: 'cal-n', text: String(Number(d.slice(8))) }), its.length ? h('span', { class: 'cal-dots' }, its.slice(0, 4).map((it) => h('i', { class: 'dot c-' + it.color }))) : null, its.length ? h('span', { class: 'cal-sum money', text: U.moneyShort(its.reduce((t, it) => t + it.amountCents, 0)) }) : null); }));
      const sel = byDay[c.sel] || [];
      view = h('div', { class: 'cal-month' }, grid, h('div', { class: 'cal-day' }, h('div', { class: 'section-h' }, h('h2', null, date(c.sel)), h('span', { class: 'small muted', text: sel.length ? `${sel.length} item(ns)` : '' })), sel.length ? h('div', { class: 'stack' }, sel.map(calCard)) : empty('calendar', 'Nada neste dia', 'Toque em um dia com pontos coloridos para ver os vencimentos.')));
    } else if (c.view === 'week') {
      const days = []; for (let i = 0; i < 7; i++) days.push(C.plusDays(from, i));
      view = h('div', { class: 'cal-week' }, days.map((d) => h('div', { class: ['cal-wcol glass', d === td && 'today'] }, h('div', { class: 'cal-wh' }, h('b', { text: WD[dOf(d).getDay()] }), h('span', { text: dateShort(d) })), (byDay[d] || []).length ? (byDay[d] || []).map(calCard) : h('div', { class: 'small muted', style: { padding: '6px 2px' }, text: '—' }))));
    } else {
      const ds = Object.keys(byDay).filter((d) => d >= from && d <= to).sort();
      view = ds.length ? h('div', { class: 'stack' }, ds.map((d) => h('div', null, h('div', { class: 'section-h' }, h('h2', null, date(d) + (d === td ? ' · hoje' : ''))), h('div', { class: 'stack' }, byDay[d].map(calCard))))) : empty('calendar', 'Sem vencimentos neste mês', 'Navegue entre os meses ou mude o filtro.');
    }
    return h('div', null, toolbar, chips, legend, totals, view,
      h('p', { class: 'small muted', style: { margin: '14px 4px' } }, icon('lock', 13), ' Só aparecem contratos dos quais você é parte. Nada do calendário é público — e o PACTO nunca expõe quem está em atraso.'));
  }

  /* ---------- Central de clientes ---------- */
  const CL_ST = { late: ['Em atraso', 'danger'], attention: ['Precisa de atenção', 'warn'], ok: ['Em dia', 'ok'], closed: ['Sem contrato ativo', ''] };
  function clientsPage() {
    const f = S.filters;
    const all = C.clients(S.ags, meId(), today());
    if (!all.length) return empty('users', 'Nenhum cliente ainda', 'Quando alguém aceitar um acordo em que você vende ou presta serviço, a pessoa aparece aqui, como numa agenda de contatos.', h('button', { class: 'btn', on: { click: () => newAgreement() } }, icon('plus', 18), t('newAgreement')));
    const listEl = h('div');
    const paint = () => {
      const q = (f.clq || '').toLowerCase();
      let items = all.filter((c) => f.cl === 'all' || c.status === f.cl).filter((c) => !q || [person(c.id).name, ...c.categories, CL_ST[c.status][0], c.nextDue ? date(c.nextDue) : ''].some((x) => String(x || '').toLowerCase().includes(q)));
      items = items.sort(f.clSort === 'name' ? (x, y) => person(x.id).name.localeCompare(person(y.id).name) : f.clSort === 'open' ? (x, y) => y.openCents - x.openCents : (x, y) => String(x.nextDue || '9999').localeCompare(String(y.nextDue || '9999')));
      const out = []; let last = null;
      items.forEach((c) => {
        const p = person(c.id);
        if (f.clSort === 'name') { const L = (p.name || '?')[0].toUpperCase(); if (L !== last) { out.push(h('div', { class: 'cl-letter', text: L })); last = L; } }
        out.push(h('button', { class: 'cl-card glass lift', on: { click: () => go('#/cliente/' + c.id) } }, avatar(p, 48),
          h('div', { style: { minWidth: 0, flex: 1, textAlign: 'left' } }, h('div', { class: 'row', style: { gap: '8px' } }, h('b', { class: 'cl-name', text: p.name }), pill(...CL_ST[c.status])), h('div', { class: 'cl-cats' }, c.categories.slice(0, 3).map((x) => h('span', { class: 'cl-cat', text: x })), c.billing.includes('recurring') ? h('span', { class: 'cl-cat rec' }, icon('repeat', 11), 'recorrente') : null),
            h('div', { class: 'small muted', text: `${c.activeCount} contrato(s) ativo(s)${c.nextDue ? ' · próximo ' + dateShort(c.nextDue) : ''}` })),
          h('div', { style: { textAlign: 'right' } }, h('div', { class: 'small muted', text: c.overdueCents ? 'Em atraso' : 'Em aberto' }), h('b', { class: 'money', style: { color: c.overdueCents ? 'var(--danger)' : '' }, text: money(c.overdueCents || c.openCents) }))));
      });
      listEl.replaceChildren(...(out.length ? [h('div', { class: 'stack' }, out)] : [empty('search', 'Nenhum cliente encontrado', 'Busque por nome, categoria, situação ou data do próximo vencimento.')]));
    };
    const defs = [['all', 'Todos'], ['late', 'Em atraso'], ['attention', 'Atenção'], ['ok', 'Em dia'], ['closed', 'Encerrados']];
    const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Situação' }, defs.map(([k, l]) => { const n = k === 'all' ? all.length : all.filter((c) => c.status === k).length; return k !== 'all' && !n ? null : h('button', { class: 'chip', 'aria-pressed': String(f.cl === k), on: { click: (e) => { f.cl = k; chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); paint(); } } }, l, h('span', { class: 'count', text: String(n) })); }));
    paint();
    return h('div', { style: { maxWidth: '860px' } }, searchBox(f.clq, (v) => { f.clq = v; paint(); }, 'Buscar por nome, categoria, situação ou vencimento'), chips,
      h('div', { class: 'row between wrap', style: { margin: '8px 0 12px' } }, h('span', { class: 'small muted', text: `${all.length} cliente(s) · só pessoas com acordo com você` }), seg([['next', 'Próximo vencimento'], ['name', 'Nome'], ['open', 'Em aberto']], f.clSort, (v) => { f.clSort = v; render(); }, 'Ordenar')), listEl);
  }
  function clientPage(cid, tab) {
    const ags = S.ags.filter((a) => a.sellerId === meId() && a.buyerId === cid);
    if (!ags.length) return empty('lock', 'Cliente indisponível', 'Você só vê clientes com quem tem acordos.', h('button', { class: 'btn', on: { click: () => go('#/clientes') } }, 'Voltar'));
    const c = C.clients(ags, meId(), today())[0], p = person(cid);
    tab = tab || 'resumo';
    const tabs = [['resumo', 'Resumo'], ['contratos', 'Contratos'], ['pagamentos', 'Pagamentos'], ['comprovantes', 'Comprovantes'], ['observacoes', 'Observações'], ['historico', 'Histórico']];
    const head = h('section', { class: 'detail-head glass' }, h('div', { class: 'row', style: { alignItems: 'center' } }, avatar(p, 64), h('div', { style: { flex: 1, minWidth: 0 } }, h('h2', { style: { margin: '0 0 4px', fontSize: '22px', letterSpacing: '-.035em' }, text: p.name }), h('div', { class: 'row wrap', style: { gap: '6px' } }, pill(...CL_ST[c.status]), c.categories.map((x) => pill(x))),
      h('div', { class: 'small muted', style: { marginTop: '6px' } }, icon('mail', 13), ' ', p.contactEmail ? p.contactEmail : 'Contato não compartilhado por esta pessoa'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', on: { click: () => newAgreement() } }, icon('plus', 18), 'Novo acordo'), c.overdueCount ? h('span', { class: 'small muted', text: 'Atrasos são privados: só você e o cliente veem.' }) : null));
    const tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), on: { click: () => go(`#/cliente/${cid}/${k}`) } }, l)));
    let body;
    const allInst = []; ags.forEach((a) => liveSchedule(a).forEach((s) => allInst.push({ a, s })));
    if (tab === 'resumo') body = h('div', null, h('div', { class: 'stats stats-ind' },
      [['wallet', 'Em aberto', c.openCents, 'open'], ['alert', 'Em atraso', c.overdueCents, 'late'], ['check', 'Já recebido', c.paidCents, 'received']].map(([ic, l, v, k]) => h('div', { class: 'stat glass' }, h('div', { class: 'lbl' }, icon(ic, 14), l), h('div', { class: 'val money', text: U.moneyShort(v) }), h('div', { class: 'ctx' }, h('span', { class: 'kind-tag ' + k, text: KIND_TAG[k] })))),
      h('div', { class: 'stat glass' }, h('div', { class: 'lbl' }, icon('calendar', 14), 'Próximo'), h('div', { class: 'val', text: c.nextDue ? dateShort(c.nextDue) : '—' }), h('div', { class: 'ctx', text: c.lastPaidAt ? 'último pagamento ' + dateShort(c.lastPaidAt) : 'sem pagamentos' }))),
      h('div', { class: 'section-h' }, h('h2', null, 'Próximos vencimentos')), h('div', { class: 'card glass', style: { padding: '6px 14px' } }, allInst.filter((x) => C.OPEN.includes(x.s.status) || x.s.status === 'review').slice(0, 5).map((x) => h('div', null, h('div', { class: 'small muted', style: { marginTop: '6px' }, text: x.a.title }), instRow(x.a, x.s, { showReports: false })))));
    else if (tab === 'contratos') body = h('div', { class: 'list' }, ags.map((a) => agCard(a)));
    else if (tab === 'pagamentos') body = h('div', { class: 'card glass', style: { padding: '6px 14px' } }, allInst.sort((x, y) => x.s.due.localeCompare(y.s.due)).map((x) => h('div', null, h('div', { class: 'small muted', style: { marginTop: '6px' }, text: x.a.title }), instRow(x.a, x.s, { showReports: false }))));
    else if (tab === 'comprovantes') { const reps = []; ags.forEach((a) => a.schedule.forEach((s) => s.reports.forEach((rep) => reps.push({ a, s, rep })))); body = reps.length ? h('div', { class: 'stack' }, reps.reverse().map((x) => h('div', null, h('div', { class: 'small muted', text: `${x.a.title} · ${isRec(x.a) ? 'período' : 'parcela'} ${instLabel(x.s)}` }), reportView(x.a, x.rep)))) : empty('clip', 'Sem comprovantes', 'Os comprovantes enviados pelo cliente aparecem aqui.'); }
    else if (tab === 'observacoes') { const ns = []; ags.forEach((a) => a.notes.forEach((n) => ns.push({ a, n }))); body = h('div', null, ns.length ? h('div', { class: 'card glass' }, ns.sort((x, y) => y.n.at.localeCompare(x.n.at)).map((x) => h('div', { class: 'kv' }, h('span', null, `${x.n.by === meId() ? 'Você' : person(x.n.by).name} · ${x.a.title} · ${U.dateTime(x.n.at)}`), h('b', { style: { fontWeight: 500, textAlign: 'left', flex: 1, marginLeft: '12px' }, text: x.n.text })))) : empty('msg', 'Sem observações', 'Registre observações dentro de cada acordo; elas são visíveis para as duas partes.')); }
    else { body = h('div', null, U.skeleton(2)); api.clientDetail(S.token, cid).then((d) => body.replaceChildren(d.events.length ? h('div', { class: 'feed' }, d.events.map(post).filter(Boolean)) : empty('clock', 'Sem histórico', ''))).catch(handleErr); }
    return h('div', null, h('button', { class: 'link-btn', style: { marginBottom: '8px' }, on: { click: () => go('#/clientes') } }, icon('left', 16), t('clients')), h('div', { style: { maxWidth: '900px' } }, head, tabBar, body));
  }

  /* ---------- Assistente PACTO ---------- */
  const BLOCK = { proof_review: ['Suspenso: comprovante em análise', 'info'], delay_review: ['Suspenso: justificativa em análise', 'info'], muted: ['Silenciado neste contrato', 'muted'], paused: ['Pausado', 'warn'], disabled: ['Desligado', 'muted'], early: ['Em antecipação', ''], closed: ['Concluído', 'ok'] };
  const OBX = { 'payment.due_soon': 'Vencimento próximo', 'payment.due_today': 'Vence hoje', 'payment.overdue': 'Em atraso', 'payment.proof_submitted': 'Comprovante enviado', 'payment.confirmed': 'Pagamento confirmado', 'negotiation.created': 'Negociação criada', 'negotiation.accepted': 'Negociação aceita', 'negotiation.rejected': 'Negociação recusada', 'delay.justification_submitted': 'Justificativa enviada', 'delay.justification_accepted': 'Justificativa aceita', 'security.mfa_changed': 'Alerta de segurança (verificação em duas etapas)' };
  function assistantPage() {
    const p = { ...C.ASSISTANT_DEFAULTS, ...S.me.prefs };
    const save = (patch, msg) => call(() => api.updateProfile(S.token, { prefs: patch }), msg || 'Assistente atualizado.');
    const statusBox = h('div', null, U.skeleton(2)), outBox = h('div', null, U.skeleton(1));
    api.assistantStatus(S.token).then(({ items }) => {
      const byAg = {}; items.forEach((it) => { (byAg[it.agreementId] = byAg[it.agreementId] || []).push(it); });
      const ids = Object.keys(byAg);
      statusBox.replaceChildren(ids.length ? h('div', { class: 'stack' }, ids.map((aid) => { const a = findAg(aid); if (!a) return null; const muted = (p.muted || []).includes(aid); const its = byAg[aid].slice(0, 3);
        return h('div', { class: 'card glass' }, h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, h('span', { class: 'ag-ico' }, icon(agIcon(a), 18)), h('div', null, h('b', { text: a.title }), h('div', { class: 'small muted', text: `${role(a) === 'seller' ? 'Você recebe de' : 'Você paga a'} ${other(a).name}` }))),
          toggle('Lembretes', !muted, (v) => call(() => api.muteAgreement(S.token, aid, !v), v ? 'Lembretes reativados neste contrato.' : 'Contrato silenciado.'))),
          its.map((it) => { const b = it.block ? BLOCK[it.block] : ['Ativo', 'ok']; return h('div', { class: 'kv' }, h('span', { text: `Vence ${date(it.due)}` }), pill(...b)); })); })) : empty('robot', 'Nada para lembrar', 'Sem parcelas abertas nos seus acordos.'));
    }).catch(handleErr);
    api.listOutbox(S.token).then((list) => outBox.replaceChildren(list.length ? h('div', { class: 'card glass', style: { padding: '6px 14px' } }, list.slice(0, 25).map((o) => h('div', { class: 'kv' }, h('span', null, h('code', { class: 'hashline', text: o.type }), ' ', OBX[o.type] || '', h('span', { class: 'muted', text: ' · ' + U.ago(o.at) })), pill('aguardando integração', 'muted')))) : h('p', { class: 'small muted', text: 'Nenhum evento na fila.' }))).catch(handleErr);
    const paused = p.pausedUntil && p.pausedUntil >= today();
    const hours = Array.from({ length: 25 }, (_, i) => i);
    const selFrom = h('select', { 'aria-label': 'Início do horário', on: { change: (e) => save({ hourFrom: Number(e.target.value), hourTo: p.hourTo }) } }, hours.slice(0, 24).map((x) => h('option', { value: String(x), selected: x === p.hourFrom, text: String(x).padStart(2, '0') + 'h' })));
    const selTo = h('select', { 'aria-label': 'Fim do horário', on: { change: (e) => save({ hourFrom: p.hourFrom, hourTo: Number(e.target.value) }) } }, hours.slice(1).map((x) => h('option', { value: String(x), selected: x === p.hourTo, text: String(x).padStart(2, '0') + 'h' })));
    return h('div', { class: 'stack', style: { maxWidth: '820px' } },
      h('section', { class: 'hero assistant-hero' }, h('div', { class: 'row' }, h('span', { class: 'assist-orb', 'aria-hidden': 'true' }, icon('robot', 26)), h('div', null, h('div', { class: 'eyebrow' }, 'Assistente PACTO'), h('div', { class: 'big', style: { fontSize: '24px' } }, p.enabled === false ? 'Desligado' : paused ? 'Pausado até ' + dateShort(p.pausedUntil) : 'Lembrando por você'))),
        h('div', { class: 'when', text: 'Avisa antes do vencimento, no dia e em caso de atraso. Fica em silêncio enquanto um comprovante ou uma justificativa estiver em análise e para quando o pagamento é confirmado. Nunca envia o mesmo aviso duas vezes.' }),
        h('div', { class: 'hero-meta' }, h('span', { class: 'hero-chip' }, icon('bell', 14), 'No app: ativo'), h('span', { class: 'hero-chip' }, icon('mail', 14), 'E-mail: não ativo'), h('span', { class: 'hero-chip' }, icon('phone', 14), 'Push/WhatsApp: não ativo'))),
      h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 10px', fontSize: '16px' } }, 'Configurações'),
        toggle('Assistente ligado', p.enabled !== false, (v) => save({ enabled: v })),
        h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, 'Aviso antecipado'), seg([[3, '3 dias'], [5, '5 dias'], [7, '7 dias'], [10, '10 dias']], p.leadDays, (v) => save({ leadDays: v, d7: true }), 'Antecedência')),
        toggle(`Aviso ${p.leadDays} dias antes`, p.d7, (v) => save({ d7: v })), toggle('Aviso extra 3 dias antes', p.d3, (v) => save({ d3: v })), toggle('No dia do vencimento', p.d0, (v) => save({ d0: v })), toggle('Em caso de atraso', p.overdue, (v) => save({ overdue: v })),
        h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, 'Repetir aviso de atraso'), seg([[1, 'Todo dia'], [3, 'A cada 3 dias'], [7, 'Semanal']], p.overdueEveryDays, (v) => save({ overdueEveryDays: v }), 'Frequência')),
        h('div', { class: 'field' }, h('label', null, 'Horário preferido'), h('div', { class: 'row' }, selFrom, h('span', { class: 'muted', text: 'até' }), selTo), h('small', { class: 'hint', text: 'Fora desse horário, o aviso fica para a próxima verificação.' })),
        h('div', { class: 'actions' }, paused ? h('button', { class: 'btn sm', on: { click: () => save({ pausedUntil: null }, 'Assistente retomado.') } }, icon('play', 16), 'Retomar agora') : [h('button', { class: 'btn ghost sm', on: { click: () => save({ pausedUntil: plusDaysISO(7) }, 'Pausado por 7 dias.') } }, icon('pause', 16), 'Pausar 7 dias'), h('button', { class: 'btn ghost sm', on: { click: () => save({ pausedUntil: plusDaysISO(30) }, 'Pausado por 30 dias.') } }, icon('pause', 16), 'Pausar 30 dias')],
          h('button', { class: 'btn ghost sm', on: { click: () => call(() => api.runReminders(S.token).then((n) => { toast(n ? `${n} lembrete(s) novo(s).` : 'Nenhum lembrete novo agora (sem duplicidade).'); return n; })) } }, icon('refresh', 16), 'Verificar agora'))),
      h('section', null, h('div', { class: 'section-h' }, h('h2', null, 'Por contrato')), statusBox),
      h('section', null, h('div', { class: 'section-h' }, h('h2', null, 'Fila de integrações (outbox)'), pill('nada é enviado nesta fase', 'muted')), h('p', { class: 'small muted', style: { margin: '0 0 8px' }, text: 'Eventos gravados de forma desacoplada para futuras integrações (e-mail, push, Leads, WhatsApp). Nenhuma integração está ativa.' }), outBox),
      h('button', { class: 'btn ghost sm', on: { click: () => go('#/notificacoes') } }, icon('bell', 16), 'Histórico de notificações'));
  }

  /* ---------- Mais (mobile) e categorias ---------- */
  function morePage() {
    const acts = pendingActions().length, nu = unread();
    const items = [['pagamentos', 'wallet', t('payments'), 'Parcelas e comprovantes'], ['clientes', 'users', t('clients'), 'Agenda de quem compra de você'], ['assistente', 'robot', 'Assistente', 'Lembretes e preferências'], ['projecoes', 'chart', t('projections'), 'Contratado, pago e previsto'], ['notificacoes', 'bell', t('notifications'), nu ? `${nu} não lida(s)` : 'Histórico de avisos'], ['unificar', 'layers', 'Unificar dívidas', 'Some saldos sem perder a origem'], ['negociacoes', 'handshake', t('negotiations'), acts ? `${acts} pendência(s)` : 'Propostas e respostas'], ['perfil', 'user', t('profile'), 'Conta, segurança e demonstração']];
    return h('div', { class: 'more-grid' }, items.map(([p, ic, l, d]) => h('button', { class: 'more-tile glass lift sheen', on: { click: () => go('#/' + p) } }, h('span', { class: 'ag-ico' }, icon(ic, 22)), h('b', { text: l }), h('span', { class: 'small muted', text: d }))));
  }
  function categoriesCard() {
    const list = S.me.prefs.customCategories || [];
    return h('section', { class: 'card glass' }, h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, 'Minhas categorias'), h('p', { class: 'small muted', style: { margin: '0 0 8px' }, text: 'Além dos grupos padrão, crie categorias suas no cadastro de um acordo. Elas valem só para você.' }),
      list.length ? h('div', { class: 'row wrap' }, list.map((c, i) => h('span', { class: 'pill' }, icon('tag', 12), `${c.label} · ${(C.CATEGORY_GROUPS.find((g) => g.id === c.group) || {}).label}`, h('button', { class: 'link-btn', 'aria-label': 'Remover ' + c.label, on: { click: () => call(() => api.updateProfile(S.token, { prefs: { customCategories: list.filter((_, j) => j !== i) } }), 'Categoria removida.') } }, icon('x', 12))))) : h('p', { class: 'small muted', text: 'Nenhuma categoria personalizada.' }));
  }

  /* ---------- render / roteamento ---------- */
  function render() {
    const root = $root();
    if (S.rec) { document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; root.replaceChildren(recoveryView()); return; }
    if (!S.token) { document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; root.replaceChildren(authView()); return; }
    if (!S.me) { root.replaceChildren(h('div', { class: 'main', style: { paddingTop: '30px' } }, U.skeleton(4))); return; }
    const r = route(), y = window.scrollY;
    let title, sub, content, fab;
    const nb = () => ({ label: t('newAgreement'), onClick: newAgreement });
    switch (r.page) {
      case 'inicio': title = t('home'); sub = 'PACTO · ' + t('tagline'); content = homePage(); fab = nb(); break;
      case 'acordos': title = t('agreements'); sub = `${S.ags.length} acordo(s) · agrupados por contrato`; content = agreementsPage(); fab = nb(); break;
      case 'acordo': { const a = findAg(r.id); title = a ? a.title : t('agreements'); sub = a ? `${role(a) === 'seller' ? 'Você vende para' : 'Você compra de'} ${other(a).name}` : ''; content = detailPage(r.id, r.sub); break; }
      case 'novo': if (!S.wiz) { newAgreement(); return; } /* carga/recarga direta de #/novo: cria o rascunho e desenha uma única vez */ title = t('newAgreement'); sub = 'Identificação · condições · revisão'; content = wizardPage(); break;
      case 'pagamentos': title = t('payments'); sub = 'Parcelas agrupadas por acordo'; content = paymentsPage(); break;
      case 'negociacoes': title = t('negotiations'); sub = 'Propostas, contrapropostas, unificações e antecipações'; content = negotiationsPage(); break;
      case 'unificar': title = 'Unificar dívidas'; sub = 'Some saldos abertos sem perder a origem'; content = unifyPage(); break;
      case 'projecoes': title = t('projections'); sub = 'Contratado, pago, pendente e previsões'; content = projectionsPage(); break;
      case 'notificacoes': title = t('notifications'); sub = `${unread()} não lida(s)`; content = notificationsPage(); break;
      case 'perfil': title = t('profile'); sub = S.me.email; content = profilePage(); break;
      case 'calendario': title = 'Calendário'; sub = 'Vencimentos dos seus acordos · só você e a outra parte veem'; content = calendarPage(); break;
      case 'clientes': title = t('clients'); sub = 'Quem compra de você, como numa agenda de contatos'; content = clientsPage(); break;
      case 'cliente': { const p = person(r.id); title = p.name || t('clients'); sub = 'Ficha do cliente'; content = clientPage(r.id, r.sub); break; }
      case 'assistente': title = 'Assistente PACTO'; sub = 'Lembretes internos, sem duplicidade'; content = assistantPage(); break;
      case 'mais': title = t('more'); sub = 'Todas as áreas do PACTO'; content = morePage(); break;
      default: location.hash = '#/inicio'; return;
    }
    const prev = root.dataset.route; root.dataset.route = location.hash;
    root.replaceChildren(shell(title, sub, content, { fab }));
    document.title = `${title} · PACTO`;
    if (prev === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }
  addEventListener('hashchange', () => { closeSheet(true); S.menu = false; render(); });
  addEventListener('resize', () => { const b = document.querySelector('.tabbar'); if (b) placeTabPill(b); });
  // sincronização ao vivo entre abas (dois usuários no mesmo aparelho)
  let syncT; (REMOTE ? api._adapter : adapter).subscribe(() => { clearTimeout(syncT); syncT = setTimeout(() => { if (S.token && !S.locked) refresh(); }, 120); });

  function hideSplash() {
    const sp = document.getElementById('splash'); if (!sp || sp.dataset.out) return;
    sp.dataset.out = '1';
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = Math.max(0, (reduce ? 150 : 1150) - (performance.now() - (window.__splashT0 || 0)));
    setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), reduce ? 60 : 420); }, wait);
  }
  async function boot() {
    window.__splashT0 = performance.now();
    if (!(window.crypto && crypto.subtle)) { $root().replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'card glass', style: { maxWidth: '480px' } }, h('h2', null, 'Abra via http://localhost ou https'), h('p', null, 'O PACTO usa WebCrypto (PBKDF2, SHA-256), que o navegador só libera em contexto seguro. Rode “npx serve” ou “python3 -m http.server” na pasta do app.')))); return; }
    if (REMOTE) {
      api.onAuthEvent((ev) => {
        if (ev === 'PASSWORD_RECOVERY') recStart();
        if (ev === 'SIGNED_OUT' && S.token && !S.rec) { signOutLocal(); }
      });
      const AL = parseAuthLink(BOOT_URL);
      if (AL.kind === 'confirm' || AL.kind === 'error') history.replaceState(null, '', location.pathname + '#/nova-senha'); // tira códigos da barra de endereço
      if (AL.kind === 'recovery') { await recStart(); history.replaceState(null, '', location.pathname + '#/nova-senha'); return; } // o supabase-js precisa ler o #access_token antes de limparmos a URL
      if (AL.kind === 'confirm') { S.rec = { stage: 'confirm', tokenHash: AL.tokenHash }; render(); return; }
      if (AL.kind === 'error') { S.rec = { stage: 'error', reason: AL.reason }; render(); return; }
      const pf = sessionStorage.getItem('pacto8:prefill'); if (pf) { S.authEmail = pf; S.authNotice = sessionStorage.getItem('pacto8:notice') || null; sessionStorage.removeItem('pacto8:prefill'); sessionStorage.removeItem('pacto8:notice'); }
      if (/^#(access_token|type|error)=/.test(BOOT_URL.hash) || /[?&](acao|code|token_hash)=/.test(BOOT_URL.search)) history.replaceState(null, '', location.pathname + '#/inicio');
      const r = await api.restore();
      if (r && !S.rec) { setToken(r.token); try { await api.claim(S.token); } catch {} await refresh(); }
      else { S.token = null; sessionStorage.removeItem('pacto8:token'); render(); }
      setInterval(() => { if (S.token && !S.locked) api.runReminders(S.token).then((n) => { if (n) refresh(); }).catch(() => {}); }, 15 * 60000);
      return;
    }
    if (await api.isEmpty()) {
      $root().replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'card glass', style: { textAlign: 'center', maxWidth: '420px' } }, logo(40, { tagline: true }), h('p', { class: 'muted', text: 'Preparando dados fictícios de demonstração (contas, acordos e comprovantes)…' }), U.skeleton(2))));
      hideSplash();
      await navigator.locks.request('pacto8:seed', async () => { if (await api.isEmpty()) await Seed.seed(api, clock); });
    }
    if (S.token) {
      try { await api.sessionInfo(S.token); } catch { S.token = null; sessionStorage.removeItem('pacto8:token'); }
    }
    if (S.token) {
      try { await api.runReminders(S.token); } catch (e) { if (e.code === 'LOCKED') { S.me = await api.sessionInfo(S.token).then(() => null).catch(() => null); } }
      await refresh();
    } else render();
    setInterval(() => { if (S.token && !S.locked) api.runReminders(S.token).then((n) => { if (n) refresh(); }).catch(() => {}); }, 5 * 60000);
  }
  boot().then(hideSplash, (e) => { hideSplash(); console.error(e); toast('Falha ao iniciar: ' + e.message, 'err'); });
})();
