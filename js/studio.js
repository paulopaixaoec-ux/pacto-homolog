/* PACTO Studio · Etapa 1 (WIP LOCAL) · área do fundador.
   Toda decisão de acesso é do SERVIDOR (studio.* na pacto-api): aqui só se desenha o que ele devolve.
   Sem servidor/flag (homolog atual) → whoami = {founder:false} → nada aparece. Renderização só por DOM (sem innerHTML). */
(function (root) {
  'use strict';
  const U = root.UI; if (!U) return;
  const { h, s, icon, pill, toast, sheet, closeSheet, seg } = U;
  const DEV = root.PACTO_STUDIO_DEV || null;
  const ST = { who: null, data: {}, loading: {}, host: null, theme: null, q: '', fp: 'tudo', fb: 'acesso', fs: 'todas', fk: 'todas' };

  /* ---------- transporte ---------- */
  // item 3 (estrutural): no app real, studio.* vai pela pacto-api (functionsUrl) com o token da sessão Supabase, via api.studio()
  // do remote.js. A prévia local (PACTO_STUDIO_DEV, injetado só pelo dev_server) só vale quando NÃO há API remota.
  const REMOTE = () => (ST.host && ST.host.api && typeof ST.host.api.studio === 'function') ? ST.host.api : null;
  async function call(method, opts = {}) {
    const api = REMOTE();
    if (api) return api.studio(method, opts);
    if (!DEV) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Recurso indisponível.' } } }; // modo demonstração: sem servidor, sem Studio
    const r = await fetch(DEV.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-persona': DEV.persona }, body: JSON.stringify({ method, opts }) });
    let body = {}; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  }
  async function need(method, opts) { const r = await call(method, opts); if (r.status !== 200) throw Object.assign(new Error((r.body.error && r.body.error.message) || 'Falha'), { code: r.body.error && r.body.error.code, status: r.status, details: r.body.error && r.body.error.details }); return r.body.result; }
  async function stepUp(code) {
    if (!/^\d{6}$/.test(code)) throw Object.assign(new Error('Digite os 6 números do autenticador.'), { code: 'VALIDATION' });
    const api = REMOTE();
    // MFA real: supabase.auth.mfa.challengeAndVerify (api.mfaVerify) → sessão nova com aal2 e amr totp recente; o SERVIDOR confere a janela
    if (api) { await api.mfaVerify({ code }); return; }
    if (DEV) { await fetch(DEV.endpoint + '/stepup', { method: 'POST', headers: { 'x-studio-persona': DEV.persona }, body: '{}' }); return; }
    throw Object.assign(new Error('Recurso indisponível.'), { code: 'NOT_FOUND' });
  }

  /* ---------- rótulos ---------- */
  const STATUS = { ativa: ['Ativa', 'ok'], pendente: ['Em análise', 'info'], restrita: ['Restrita', 'warn'], suspensa: ['Suspensa', 'danger'], bloqueada: ['Bloqueada', 'danger'] };
  const KIND = { real: 'Real', ficticia: 'Fictícia [TESTE]', reservada_seed: 'Reservada para testes', fundador: 'Fundador', nao_classificada: 'Não classificada' };
  const FUTURE = [['confianca', 'shield', 'Central de Confiança', 3], ['financas', 'chart', 'Finanças e Crescimento', 2], ['inteligencia', 'robot', 'Inteligência', 3], ['laboratorio', 'zap', 'Laboratório', 3], ['coins', 'coins', 'PACTOX Coins', 3]];
  const NODATA = 'sem dados ainda';
  const NODATA_FA = 'Sem dados disponíveis'; // senhas erradas: texto exato até existir fonte confiável (t65u)
  const NOTICE_TEXT = 'O acesso de uma das partes ao PACTOX está temporariamente indisponível. O acordo e seu histórico permanecem preservados. Você será informado caso haja alguma alteração relevante.';
  const nv = (v) => (v === null || v === undefined ? NODATA : String(v));
  const EVENT = { login: ['Entrou', 'logout'], logout: ['Saiu', 'logout'], signup: ['Criou conta', 'user'], invite_accepted: ['Aceitou convite', 'mail'], recovery_requested: ['Pediu recuperação de senha', 'key'], password_updated: ['Trocou a senha', 'key'], mfa_verified: ['Confirmou 2 etapas', 'shield'], user_deleted: ['Conta excluída', 'x'] };
  const INV = { ativo: ['Pendente', 'ok'], usado: ['Aceito', ''], revogado: ['Revogado', 'danger'], expirado: ['Expirado', 'warn'] };
  const POLICY = { open: 'Aberto', invite_only: 'Só por convite', closed: 'Fechado' };
  const SEV = { info: ['Info', ''], atencao: ['Atenção', 'warn'], alta: ['Alta', 'danger'] };
  const ALERT = { novo_cadastro: 'Novo cadastro', cadastro_sem_convite: 'Cadastro sem convite', cadastro_fechado: 'Cadastro com portas fechadas', mfa_falhas: 'Falhas no autenticador', desbloqueio_falhas: 'Falhas no desbloqueio', medida_tentou_entrar: 'Conta com medida tentou entrar', medida_venceu: 'Medida venceu', convite_expirado: 'Convite expirou', acesso_negado_studio: 'Acesso negado ao Studio' };
  const TABS = [['visao', 'grid', 'Visão Geral'], ['acessos', 'users', 'Acessos e Atividade'], ['convites', 'mail', 'Convites'], ['alertas', 'bell', 'Alertas'], ['auditoria', 'shield', 'Auditoria'], ['estudio', 'spark', 'Estúdio Visual']];
  const AURA_TAB = ['aura', 'spark', 'PX AURA'];   // item 7: só aparece quando o servidor diz enabled:true (fundador + flags); PX AURA = Temas Especiais
  const st = (x) => { const [l, k] = STATUS[x] || [x, '']; return pill(l, k); };
  const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
  const dd = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
  const ago = (v) => { if (!v) return 'nunca'; const m = Math.round((Date.now() - new Date(v)) / 60000); if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; const hh = Math.round(m / 60); if (hh < 24) return `há ${hh} h`; return `há ${Math.round(hh / 24)} d`; };
  const initials = (n) => String(n || '?').replace('[TESTE]', '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const card = (title, extra, ...kids) => h('section', { class: 'card glass st-card' }, h('div', { class: 'st-card-h' }, h('h2', { text: title }), extra || null), ...kids);

  /* ---------- dados ---------- */
  const LOADERS = {
    visao: async () => ({ ov: await need('studio.overview') }),
    acessos: async () => ({ acc: await need('studio.accounts', { period: ST.fp, basis: ST.fb, status: ST.fs === 'todas' ? null : ST.fs, kind: ST.fk === 'todas' ? null : ST.fk }), tl: await need('studio.timeline', { limit: 40 }), all: await need('studio.accounts') }),
    convites: async () => ({ inv: await need('studio.invite.list'), ov: await need('studio.overview'), res: await need('studio.accounts', { kind: 'reservada_seed' }) }),
    alertas: async () => ({ al: await need('studio.alerts') }),
    auditoria: async () => ({ au: await need('studio.audit', { limit: 60 }), ret: await need('studio.retention.review') }),
    estudio: async () => ({ themes: await need('studio.theme.list') }),
    aura: async () => ({}),   // o PX AURA carrega os próprios dados (js/aura.js)
    _themes: async () => ({ themes: await need('studio.theme.list') }),
  };
  function load(tab, force) {
    if (!force && (ST.data[tab] || ST.loading[tab])) return;
    ST.loading[tab] = true;
    LOADERS[tab]().then((d) => { ST.data[tab] = d; ST.err = null; }, (e) => { ST.err = e; })
      .finally(() => { ST.loading[tab] = false; ST.host && ST.host.render(); });
  }
  const invalidate = (...tabs) => { (tabs.length ? tabs : Object.keys(ST.data)).forEach((t) => delete ST.data[t]); };

  /* ---------- ação sensível: justificativa + frase + novo código (servidor confere tudo de novo) ---------- */
  function sensitive({ title, method, phrase, intro, fields = [], collect = () => ({}), danger = false, done }) {
    const just = h('textarea', { placeholder: 'Ex.: conta de teste com comportamento repetido fora do combinado', maxlength: '500' });
    const conf = h('input', { autocomplete: 'off', placeholder: phrase, 'aria-describedby': 'st-ph' });
    const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '••••••', class: 'st-otp' });
    const err = h('div', { class: 'err', role: 'alert' });
    const go = h('button', { class: ['btn block', danger ? 'danger' : 'lime'], on: { click: async () => {
      err.textContent = ''; go.disabled = true;
      try {
        await stepUp(code.value.trim());
        const r = await need(method, { ...collect(), justification: just.value, confirm: conf.value });
        closeSheet(); toast('Feito. Registrado na auditoria.'); done && done(r);
      } catch (e) { err.textContent = e.message; } finally { go.disabled = false; }
    } } }, icon('shield', 18), 'Confirmar');
    sheet(title, h('div', { class: 'st-sens' },
      intro ? h('p', { class: 'small muted', text: intro }) : null, ...fields,
      U.field('Justificativa (obrigatória, mín. 15 caracteres)', just),
      h('div', { class: 'field' }, h('label', { text: 'Digite ' + phrase + ' para confirmar' }), conf, h('small', { class: 'hint', id: 'st-ph', text: 'A frase evita cliques acidentais.' })),
      h('div', { class: 'st-otp-box glass' }, h('div', { class: 'row' }, icon('shield', 18), h('b', { text: 'Confirme com o autenticador' })),
        h('p', { class: 'small muted', text: 'Ações sensíveis pedem um código novo (vale 5 min). ' + (DEV && !REMOTE() ? 'Prévia local: qualquer 6 dígitos simulam o código.' : '') }), code),
      err, go));
  }

  /* ---------- gráficos (SVG, sem bibliotecas) ---------- */
  function bars(series, { h: H = 120, label } = {}) {
    const W = 560, n = series.length || 1, max = Math.max(1, ...series.map((x) => x.n)), bw = W / n;
    return h('div', { class: 'st-chart', role: 'img', 'aria-label': label || '' },
      s('svg', { viewBox: `0 0 ${W} ${H + 22}`, preserveAspectRatio: 'none', width: '100%', height: H + 22 },
        s('defs', null, s('linearGradient', { id: 'stb', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#dcfb92' }), s('stop', { offset: '1', 'stop-color': '#9fd34a' }))),
        [0.25, 0.5, 0.75, 1].map((f) => s('line', { x1: 0, x2: W, y1: H - H * f * 0.92, y2: H - H * f * 0.92, class: 'st-grid' })),
        series.map((x, i) => { const bh = Math.max(2, (x.n / max) * H * 0.92); return s('rect', { x: i * bw + bw * 0.18, y: H - bh, width: bw * 0.64, height: bh, rx: 5, fill: 'url(#stb)', class: 'st-bar' }); }),
        series.map((x, i) => (i % 2 === 0 || n < 8) ? s('text', { x: i * bw + bw / 2, y: H + 16, 'text-anchor': 'middle', class: 'st-axis' }, dd(x.day)) : null)));
  }
  function funnel(f) {
    const rows = [['Visitas anônimas', f.visits30], ['Contas criadas', f.signups30], ['Autenticações concluídas', f.logins30]];
    const max = Math.max(1, ...rows.map((r) => r[1] || 0));
    return h('div', { class: 'st-funnel' }, rows.map(([l, v], i) => h('div', { class: 'st-fun-row' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'small', text: l }), h('b', { class: ['num', v === null && 'st-nodata'], text: nv(v) })),
      h('div', { class: 'st-fun-track' }, h('span', { class: 'st-fun-bar f' + i, style: { width: v === null ? '0' : Math.max(3, (v / max) * 100) + '%' } })))));
  }

  /* ---------- módulos: acento próprio de cada módulo SÓ aqui no PX CORE (ícones, títulos, indicadores); o app não muda de cor por módulo ---------- */
  const MODS = [['one', 'PX ONE', 'Acordos pessoais', 'ativo', 'ok'], ['pro', 'PX PRO', 'Espaço de empresas', 'ativo', 'ok'], ['aura', 'PX AURA', 'Temas Especiais', null, null],
    ['lab', 'PX LAB', 'Laboratório · só fundador', 'planejado', 'muted'], ['coin', 'PX COIN', 'Futuro · sem dados ainda', 'futuro', 'muted'], ['link', 'PX LINK', 'Conexões · em estudo', 'planejado', 'muted'], ['core', 'PX CORE', 'Central do fundador', 'ativo', 'ok']];
  function modulesCard() {
    const AC = root.PxCoreAccents; const m = curMode(); let acc = null;
    try { const pal = (PERS.themes[m] && PERS.themes[m].tokens && PERS.themes[m].tokens.palette) || 'jade'; acc = AC && HB ? AC.deriveAll(HB.tokensOf(HB.mapPaletteId ? HB.mapPaletteId(pal) : pal, m), m).modules : null; } catch { acc = null; }
    const AU = root.PactoAura;
    return card('Módulos PACTOX', pill('acentos só no PX CORE', 'muted'), h('div', { class: 'st-mods' }, MODS.map(([id, nm, sub, state, kind]) => {
      const on = id === 'aura' ? !!(AU && AU.enabled) : state === 'ativo'; const lab = id === 'aura' ? (on ? 'ativo' : 'desligado') : state; const k = id === 'aura' ? (on ? 'ok' : 'muted') : kind;
      const el = h('div', { class: ['st-mod', on ? '' : 'st-mod-off'], dataset: { mod: id } }, h('span', { class: 'st-mod-ic', 'aria-hidden': 'true' }, icon(id === 'aura' ? 'spark' : id === 'lab' ? 'robot' : id === 'coin' ? 'chart' : id === 'link' ? 'users' : id === 'core' ? 'shield' : 'grid', 18)),
        h('div', null, h('b', { class: 'st-mod-t', text: nm }), h('div', { class: 'small muted', text: sub })), pill(lab, k));
      if (acc && acc[id] && acc[id].hex) el.style.setProperty('--px-accent', acc[id].hex);
      return el;
    })));
  }

  /* ---------- telas ---------- */
  function vVisao() {
    const d = ST.data.visao; if (!d) return loading();
    const o = d.ov, bs = o.byStatus || {}, w = ST.who, sp = o.accountsSplit || {}, sec = o.security || {}, hl = o.health || {}, inv = o.invites || {};
    const hero = h('section', { class: 'st-hero sheen' },
      h('div', { class: 'st-hero-grid' },
        h('div', null, h('div', { class: 'eyebrow', text: 'PX CORE · Visão Geral' }),
          h('div', { class: 'big num', text: String(o.accounts) }), h('div', { class: 'what', text: 'contas no PACTOX' }),
          h('div', { class: 'when', text: `${bs.ativa || 0} ativas · ${bs.pendente || 0} em análise · ${(bs.restrita || 0) + (bs.suspensa || 0) + (bs.bloqueada || 0)} com medida` })),
        h('div', { class: 'st-split-hero' },
          h('div', { class: 'st-split-k' }, h('span', { class: 'eyebrow', text: 'Reais' }), h('b', { class: 'num', text: String(sp.real ?? NODATA) })),
          h('div', { class: 'st-split-k' }, h('span', { class: 'eyebrow', text: '[TESTE]' }), h('b', { class: 'num', text: String(sp.teste ?? NODATA) }), h('span', { class: 'small', text: (sp.reservadas || 0) + ' reservadas' })),
          sp.naoClassificadas ? h('div', { class: 'st-split-k' }, h('span', { class: 'eyebrow', text: 'A classificar' }), h('b', { class: 'num', text: String(sp.naoClassificadas) })) : null)),
      h('div', { class: 'hero-meta' },
        h('span', { class: 'hero-chip' }, icon('mail', 14), 'Cadastro: ' + (POLICY[o.signupPolicy] || o.signupPolicy)),
        h('span', { class: 'hero-chip' }, icon('lock', 14), 'Bloqueio no servidor: ' + (o.lockMode === 'on' ? 'ligado' : o.lockMode)),
        h('span', { class: 'hero-chip' }, icon('shield', 14), w && w.aal2 ? 'Sessão AAL2 confirmada' : 'Sessão sem AAL2'),
        h('span', { class: 'hero-chip' }, icon('clock', 14), 'Registrado desde ' + dd(o.trackedSince))));
    const stat = (l, v, ic, hint, k) => h('div', { class: ['stat glass lift st-stat', k] }, h('div', { class: 'row' }, h('span', { class: 'st-ic' }, icon(ic, 18)), h('span', { class: 'small muted', text: l })), h('b', { class: ['num', v === null && 'st-nodata'], text: nv(v) }), h('span', { class: 'small muted', text: hint }));
    const per = (obj) => h('div', { class: 'st-per' }, [['d1', 'Hoje'], ['d7', '7 dias'], ['d30', '30 dias']].map(([k, l]) => h('div', null, h('b', { class: 'num', text: nv(obj && obj[k]) }), h('span', { class: 'small muted', text: l }))));
    const stats = h('div', { class: 'st-stats' },
      stat('Ativos em 7 dias', o.active.d7, 'users', 'contas distintas com acesso'), stat('Ativos em 30 dias', o.active.d30, 'trend', 'contas distintas com acesso'),
      stat('Novos cadastros (30 d)', o.signups.d30, 'user', 'contas criadas registradas'), stat('Alertas não lidos', o.alertsUnread, 'bell', o.alertsUnread ? 'abrir Alertas' : 'tudo em ordem', o.alertsUnread ? 'warn' : ''));
    const stats2 = Object.entries(bs).map(([k, n]) => { const [l, c] = STATUS[k] || [k, '']; return h('span', { class: 'pill ' + c }, l + ' · ' + n); });
    const row = (l, v, k, txt) => h('div', { class: 'st-kvrow' }, h('span', { class: 'small', text: l }), h('b', { class: ['num', k, v === null && 'st-nodata'], text: v === null && txt ? txt : nv(v) }));
    return h('div', { class: 'st-page' }, hero, stats, modulesCard(),
      h('div', { class: 'st-grid3' },
        card('Novos cadastros', pill('por período', 'muted'), per(o.signups)),
        card('Fizeram login', pill('contas distintas', 'muted'), per(o.loggedIn)),
        card('Ativos', pill('login, 2 etapas ou senha', 'muted'), per(o.active))),
      h('div', { class: 'st-grid2' },
        card('Entradas por dia', pill('14 dias', 'muted'), bars(o.loginsDaily || [], { label: 'Entradas por dia nos últimos 14 dias' }), h('p', { class: 'small muted st-foot', text: 'Autenticações concluídas vindas do Auth (sem IP, sem aparelho). Renovação de sessão não conta.' })),
        card('Funil · 30 dias', null, funnel(o.funnel), h('p', { class: 'small muted st-foot', text: 'Visita anônima ≠ conta criada ≠ autenticação concluída. Visitas: contador diário sem cookie e sem IP.' }))),
      h('div', { class: 'st-grid3' },
        card('Convites', h('button', { class: 'link-btn', on: { click: () => ST.host.go('#/studio/convites') } }, 'Abrir'),
          row('Enviados', inv.enviados), row('Pendentes', inv.pendentes, 'ok'), row('Aceitos', inv.aceitos), row('Expirados', inv.expirados, 'warn'), row('Revogados', inv.revogados, 'danger')),
        card('Segurança', pill('30 dias', 'muted'),
          row('Acessos negados ao Studio', sec.deniedStudio30), row('Alertas de prioridade alta', sec.alertsHigh, sec.alertsHigh ? 'danger' : ''), row('Contas com medida', sec.measuresActive), row('Revisões abertas', sec.reviewsOpen),
          row('Senhas erradas', null, '', NODATA_FA)),
        card('Funcionamento', pill('ao vivo', 'muted'),
          row('Bloqueio no servidor', hl.lockMode === 'on' ? 'ligado' : hl.lockMode, hl.lockMode === 'on' ? 'ok' : 'warn'),
          row('Última importação de acessos', hl.importLagMin === null || hl.importLagMin === undefined ? null : 'há ' + hl.importLagMin + ' min'),
          row('Convites vencidos aguardando job', hl.pendingInvitesExpired), row('Medidas vencidas aguardando job', hl.measuresOverdue))),
      h('div', { class: 'st-grid2' },
        card('Contas por situação', null, h('div', { class: 'row wrap' }, stats2)),
        card('Segurança desta área', pill('só o fundador', 'lime'), h('ul', { class: 'st-checks' },
          ['Fundador reconhecido pelo identificador permanente, no servidor.', 'Duas etapas obrigatórias (código de até 15 min); ações sensíveis pedem código novo (5 min), justificativa e frase.', 'Sua conta nunca recebe medidas (autoproteção no servidor e no banco).', 'Tudo auditado, inclusive tentativas negadas. Nenhum acordo, comprovante ou valor de terceiros é lido.']
            .map((x) => h('li', null, icon('check', 16), h('span', { text: x })))))),
      h('p', { class: 'small muted st-foot', text: 'Indicadores da operação do PACTOX. Suas finanças pessoais ficam no Início, separadas.' }));
  }

  function accountRow(a) {
    return h('button', { class: 'st-acc glass lift', on: { click: () => openAccount(a.id) } },
      h('span', { class: ['st-av', a.kind === 'fundador' && 'f', a.reserved && 'r'], text: initials(a.name) }),
      h('div', { class: 'st-acc-main' }, h('b', { text: a.name || '(sem nome)' }), h('span', { class: 'small muted' }, a.emailMasked || '', h('span', { class: 'st-id', text: ' · ID ' + a.adminId }))),
      h('div', { class: 'st-acc-pills' }, st(a.status), h('span', { class: ['pill', a.reserved && 'st-res-pill'], text: KIND[a.kind] || a.kind }), a.mfa ? h('span', { class: 'pill ok', title: 'Duas etapas ativas' }, icon('shield', 12), '2 etapas') : null, a.reviewOpen ? pill('em revisão', 'warn') : null),
      h('div', { class: 'st-acc-when small muted' }, h('span', { text: 'cadastro ' + dd(a.createdAt) }), h('span', { text: '1º acesso ' + (a.firstAccess ? dd(a.firstAccess) : 'não registrado') }), h('span', { text: 'último login ' + ago(a.lastSignIn) }), h('span', { class: 'num', text: a.logins + (a.logins === 1 ? ' entrada' : ' entradas') })));
  }
  function vAcessos() {
    const d = ST.data.acessos; if (!d) return loading();
    const q = ST.q.toLowerCase();
    const match = (a) => !q || String(a.name || '').toLowerCase().includes(q) || String(a.adminId || '').includes(q);
    const list = d.acc.filter(match);
    const set = (k, v) => { ST[k] = v; invalidate('acessos'); ST.host.render(); };
    const sel = (k, opts, label) => h('label', { class: 'st-select' }, h('span', { class: 'small muted', text: label }), h('select', { on: { change: (e) => set(k, e.target.value) } }, opts.map(([v, l]) => h('option', { value: v, selected: ST[k] === v || null, text: l }))));
    const search = h('input', { class: 'st-search', type: 'search', placeholder: 'Buscar por nome ou ID', value: ST.q, on: { input: (e) => { ST.q = e.target.value; const c = document.getElementById('st-acc-list'); if (c) c.replaceChildren(...d.acc.filter((a) => !e.target.value || String(a.name || '').toLowerCase().includes(e.target.value.toLowerCase()) || String(a.adminId).includes(e.target.value)).map(accountRow)); } } });
    const tl = d.tl.map((e) => { const [l, ic] = EVENT[e.event] || [e.event, 'clock']; return h('li', { class: 'st-tl' }, h('span', { class: 'st-tl-ic' }, icon(ic, 14)), h('div', null, h('b', { text: e.name || 'Conta' }), h('span', { class: 'small muted', text: ' · ' + l + (e.method ? ' (' + e.method + ')' : '') })), h('span', { class: 'small muted num', text: dt(e.at) })); });
    const tot = { real: 0, teste: 0 }; d.all.forEach((a) => { if (['real', 'fundador'].includes(a.kind)) tot.real++; else if (['ficticia', 'reservada_seed'].includes(a.kind)) tot.teste++; });
    return h('div', { class: 'st-page' },
      h('div', { class: 'st-filters glass' },
        h('div', { class: 'st-filter-row' }, seg([['tudo', 'Todo o período'], ['30d', '30 dias'], ['7d', '7 dias'], ['1d', 'Hoje']], ST.fp, (v) => set('fp', v), 'Período'),
          seg([['acesso', 'por acesso'], ['cadastro', 'por cadastro']], ST.fb, (v) => set('fb', v), 'Base do período')),
        h('div', { class: 'st-filter-row' },
          sel('fs', [['todas', 'Todas'], ['ativa', 'Ativa'], ['pendente', 'Em análise'], ['restrita', 'Restrita'], ['suspensa', 'Suspensa'], ['bloqueada', 'Bloqueada']], 'Situação'),
          sel('fk', [['todas', 'Todos'], ['real', 'Reais'], ['teste', '[TESTE] (fictícias + reservadas)'], ['reservada_seed', 'Reservadas para testes'], ['nao_classificada', 'Não classificadas']], 'Tipo'), search)),
      h('div', { class: 'st-split' },
        h('section', null, h('div', { class: 'st-sub', text: `${list.length} de ${d.all.length} conta(s) · ${tot.real} reais · ${tot.teste} [TESTE] · e-mails mascarados · toque para a ficha` }), h('div', { id: 'st-acc-list', class: 'st-acc-list' }, list.length ? list.map(accountRow) : U.empty('users', 'Nenhuma conta com esses filtros', 'Ajuste período, situação ou tipo.'))),
        h('div', { class: 'st-side' },
          card('Linha do tempo', pill('desde 27/11/2026', 'muted'), h('ul', { class: 'st-tl-list' }, tl), h('p', { class: 'small muted st-foot', text: 'Entradas, cadastros, 2 etapas e recuperações. Sem IP, sem localização, sem conteúdo de acordos.' })),
          card('Tentativas de senha errada', null, h('b', { class: 'st-nodata st-nodata-big', text: NODATA_FA })))));
  }
  async function openAccount(id) {
    let a; try { a = await need('studio.account', { userId: id, purpose: 'ver ficha da conta' }); } catch (e) { return toast(e.message, 'err'); }
    const refresh = () => { invalidate(); ST.host.render(); };
    const untilIn = (days) => h('input', { type: 'date', value: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) });
    const measure = (method, label, phrase, days, danger, txt) => h('button', { class: ['btn sm', danger ? 'danger' : 'ghost'], disabled: a.founder || null, on: { click: () => { const u = days ? untilIn(days) : null; sensitive({ title: label + ' · ' + a.name, method, phrase, danger, intro: txt, fields: u ? [U.field('Até (vence sozinho)', u)] : [], collect: () => ({ userId: a.id, until: u ? new Date(u.value + 'T23:59:00-03:00').toISOString() : undefined }), done: refresh }); } } }, label);
    const kindSeg = seg([['real', 'Real'], ['ficticia', 'Fictícia'], ['reservada_seed', 'Seed']], a.kind, (v) => sensitive({ title: 'Classificar conta', method: 'studio.user.setKind', phrase: 'CLASSIFICAR', collect: () => ({ userId: a.id, kind: v }), done: refresh }), 'Tipo da conta');
    sheet(a.name || 'Conta', h('div', { class: 'st-sheet' },
      h('div', { class: 'row' }, h('span', { class: 'st-av lg', text: initials(a.name) }), h('div', null, h('b', { text: a.email }), h('div', { class: 'small muted', text: 'E-mail completo exibido · registrado na auditoria (finalidade: ver ficha)' }))),
      h('div', { class: 'st-kv' }, [['Situação', st(a.status)], ['Medida até', a.measureUntil ? dt(a.measureUntil) : '—'], ['Conta criada', dt(a.createdAt)], ['E-mail confirmado', a.emailConfirmedAt ? dt(a.emailConfirmedAt) : 'não'], ['Última entrada (Auth)', dt(a.lastSignIn)], ['Tipo', KIND[a.kind] || a.kind]]
        .map(([k, v]) => h('div', null, h('span', { class: 'small muted', text: k }), v instanceof Node ? v : h('b', { text: String(v) })))),
      a.founder ? h('p', { class: 'small st-note', text: 'Conta do fundador: medidas não se aplicam (regra do servidor).' }) : a.protected ? reservedBlock(a, refresh) : [
        h('div', { class: 'eyebrow', text: 'Classificação' }), kindSeg,
        h('div', { class: 'eyebrow', style: { marginTop: '14px' }, text: 'Medidas (nunca alteram acordos, comprovantes ou histórico)' }),
        h('div', { class: 'row wrap' }, measure('studio.user.restrict', 'Restringir', 'RESTRINGIR', 7, false, 'Pode entrar e ver, mas não cria nem altera nada até o prazo.'),
          measure('studio.user.suspend', 'Suspender', 'SUSPENDER', 3, true, 'Não entra até o prazo. Sessões abertas são encerradas.'),
          measure('studio.user.block', 'Bloquear', 'BLOQUEAR', 0, true, 'Não entra. Bloqueio não vence sozinho; só sai com Reativar.'),
          measure('studio.user.reactivate', 'Reativar', 'REATIVAR', 0, false, 'Volta a ativa. Fica registrado no histórico.'))],
      a.founder ? null : reviewBlock(a, refresh),
      h('div', { class: 'eyebrow', style: { marginTop: '14px' }, text: 'Histórico de situação' }),
      a.history.length ? h('ul', { class: 'st-tl-list' }, a.history.map((x) => h('li', { class: 'st-tl' }, h('span', { class: 'st-tl-ic' }, icon('layers', 14)), h('div', null, h('b', { text: (STATUS[x.from] || [x.from || 'nova'])[0] + ' → ' + (STATUS[x.to] || [x.to])[0] }), h('div', { class: 'small muted', text: (x.system ? 'automático · ' : x.byFounder ? 'por você · ' : '') + (x.justification || '') })), h('span', { class: 'small muted', text: dt(x.at) })))) : h('p', { class: 'small muted', text: 'Sem mudanças.' }),
      h('div', { class: 'eyebrow', style: { marginTop: '14px' }, text: 'Acessos recentes' }),
      h('ul', { class: 'st-tl-list' }, (a.timeline || []).slice(0, 8).map((e) => h('li', { class: 'st-tl' }, h('span', { class: 'st-tl-ic' }, icon((EVENT[e.event] || [0, 'clock'])[1], 14)), h('span', { text: (EVENT[e.event] || [e.event])[0] }), h('span', { class: 'small muted', text: dt(e.at) }))))), { wide: true });
  }

  function reservedBlock(a, refresh) {
    const ro = a.reservedOp || { enabled: false, deactivatedAt: null };
    return [
      h('div', { class: 'eyebrow', style: { marginTop: '14px' }, text: 'Conta reservada para testes' }),
      h('div', { class: 'st-protect small' }, icon('lock', 14), h('span', { text: 'Protegida de restringir, suspender e bloquear durante a homologação (regra do servidor e do banco). Sem nenhum privilégio de fundador: não acessa o Studio.' })),
      ro.deactivatedAt
        ? h('div', { class: 'st-reserved-op' }, pill('Desativada · ' + dt(ro.deactivatedAt), 'warn'), h('button', { class: 'btn lime sm', on: { click: () => sensitive({ title: 'Restabelecer conta · ' + a.name, method: 'studio.reserved.restore', phrase: 'RESTABELECER', intro: 'A conta volta a ficar ativa. Nada foi apagado enquanto esteve desativada.', collect: () => ({ userId: a.id }), done: refresh }) } }, icon('refresh', 14), 'Restabelecer conta'))
        : h('div', { class: 'st-reserved-op' },
          h('button', { class: 'btn ghost sm st-danger', disabled: !ro.enabled || null, title: ro.enabled ? '' : 'Operação preparada e desligada por flag', on: { click: () => sensitive({ title: 'Desativar conta fictícia reservada', method: 'studio.reserved.deactivate', phrase: 'DESATIVAR', danger: true, intro: 'A conta fica sem acesso. Nada é apagado: perfil, acordos, comprovantes e histórico permanecem. Dá para restabelecer a qualquer momento.', collect: () => ({ userId: a.id }), done: refresh }) } }, icon('lock', 14), 'Desativar conta fictícia reservada'),
          ro.enabled ? null : pill('Preparado · desligado', 'muted')),
    ];
  }
  const REV = { aberta: ['Em revisão', 'warn'], mantida: ['Medida mantida', ''], revertida: ['Medida revertida', 'ok'] };
  function reviewBlock(a, refresh) {
    const rv = a.reviews || [], open = rv.find((r) => r.status === 'aberta');
    let kind = 'revisao', outcome = 'mantida';
    const btns = [];
    if (open) {
      btns.push(h('button', { class: 'btn ghost sm', on: { click: () => sensitive({ title: 'Decidir revisão · manter medida', method: 'studio.review.decide', phrase: 'DECIDIR', intro: 'A medida continua como está. A decisão fica registrada e não pode ser editada depois.', collect: () => ({ id: open.id, outcome: 'mantida' }), done: refresh }) } }, icon('lock', 14), 'Manter medida'));
      btns.push(h('button', { class: 'btn lime sm', on: { click: () => sensitive({ title: 'Decidir revisão · reverter medida', method: 'studio.review.decide', phrase: 'DECIDIR', intro: 'A conta volta a ativa agora. Acordos e comprovantes nunca foram alterados pela medida.', collect: () => ({ id: open.id, outcome: 'revertida' }), done: refresh }) } }, icon('check', 14), 'Reverter medida'));
    } else if (a.status !== 'ativa' && a.status !== 'pendente') {
      btns.push(h('button', { class: 'btn ghost sm', on: { click: () => sensitive({ title: 'Abrir revisão · ' + a.name, method: 'studio.review.open', phrase: 'REVISAR', intro: 'Revisão: você reavalia a medida. Recurso: registra um pedido da pessoa (canal próprio para ela fica para a Etapa 2).', fields: [h('div', { class: 'field' }, h('label', { text: 'Tipo' }), seg([['revisao', 'Revisão'], ['recurso', 'Recurso da pessoa']], kind, (v) => { kind = v; }, 'Tipo da revisão'))], collect: () => ({ userId: a.id, kind }), done: refresh }) } }, icon('refresh', 14), 'Abrir revisão'));
    }
    return h('div', null,
      h('div', { class: 'eyebrow', style: { marginTop: '14px' }, text: 'Revisão e recurso' }),
      rv.length ? h('ul', { class: 'st-tl-list' }, rv.map((r) => h('li', { class: 'st-tl' }, h('span', { class: 'st-tl-ic' }, icon('shield', 14)),
        h('div', null, h('b', { text: (r.kind === 'recurso' ? 'Recurso' : 'Revisão') + ' · aberta ' + dt(r.openedAt) }), h('div', { class: 'small muted', text: r.reason }), r.decision ? h('div', { class: 'small', text: 'Decisão ' + dt(r.decidedAt) + ': ' + r.decision }) : null),
        pill(REV[r.status][0], REV[r.status][1])))) : h('p', { class: 'small muted', text: a.status === 'ativa' ? 'Sem medida ativa · nada a revisar.' : 'Nenhuma revisão aberta para esta medida.' }),
      btns.length ? h('div', { class: 'row wrap' }, btns) : null,
      h('div', { class: 'st-notice glass' }, h('div', { class: 'row' }, icon('mail', 14), h('b', { class: 'small', text: 'Aviso neutro à outra parte' }), pill(a.noticeEnabled ? 'ligado' : 'desligado', a.noticeEnabled ? 'ok' : 'muted')),
        h('p', { class: 'small', text: '“' + NOTICE_TEXT + '”' }), h('p', { class: 'small muted', text: 'Texto fixo aprovado: nunca inclui motivo, investigação ou medida. Só quando o acesso fica indisponível (suspensão ou bloqueio).' })));
  }

  function vConvites() {
    const d = ST.data.convites; if (!d) return loading();
    const pol = d.ov.signupPolicy;
    const polSeg = seg([['open', 'Aberto'], ['invite_only', 'Só por convite'], ['closed', 'Fechado']], pol, (v) => { if (v === pol) return; sensitive({ title: 'Política de cadastro → ' + POLICY[v], method: 'studio.signup.setPolicy', phrase: 'CONFIRMAR', intro: v === 'open' ? 'Qualquer pessoa cria conta (comportamento atual).' : v === 'invite_only' ? 'Só e-mails com convite ativo criam conta. O servidor do Auth recusa os demais.' : 'Ninguém cria conta. Convites ficam guardados até reabrir.', collect: () => ({ policy: v }), done: () => { invalidate(); ST.host.render(); } }); ST.host.render(); }, 'Política de cadastro');
    const email = h('input', { type: 'email', placeholder: 'nome@exemplo.com', autocomplete: 'off' });
    let kind = 'real';
    const create = h('button', { class: 'btn lime', on: { click: () => sensitive({ title: 'Enviar convite', method: 'studio.invite.create', phrase: 'CONVIDAR', intro: 'Convite individual: vale 72 h, uma única vez, só para este e-mail. Pode ser revogado.', collect: () => ({ email: email.value, kind }), done: () => { invalidate(); ST.host.render(); } }) } }, icon('mail', 18), 'Convidar');
    const row = (v) => h('div', { class: 'st-inv glass' },
      h('div', { class: 'st-acc-main' }, h('b', { text: v.emailMasked }), h('span', { class: 'small muted', text: v.status === 'ativo' ? `pendente · vence ${dt(v.expiresAt)} · reenvios ${v.resends}/3` : v.status === 'usado' ? 'aceito ' + dt(v.usedAt) : v.status === 'revogado' ? 'revogado ' + dt(v.revokedAt) : 'venceu ' + dt(v.expiresAt) })),
      h('div', { class: 'st-acc-pills' }, pill(INV[v.status][0], INV[v.status][1]), h('span', { class: 'pill', text: KIND[v.kind] || v.kind })),
      v.status === 'ativo' ? h('div', { class: 'row' },
        h('button', { class: 'btn ghost sm', disabled: v.resends >= 3 || null, on: { click: () => sensitive({ title: 'Reenviar convite', method: 'studio.invite.resend', phrase: 'REENVIAR', intro: 'Mesmo convite e mesmo prazo de 72 h (até 3 reenvios).', collect: () => ({ id: v.id }), done: () => { invalidate(); ST.host.render(); } }) } }, icon('refresh', 14), 'Reenviar'),
        h('button', { class: 'btn ghost sm st-danger', on: { click: () => sensitive({ title: 'Revogar convite', method: 'studio.invite.revoke', phrase: 'REVOGAR', danger: true, intro: 'O link deixa de valer na hora. Não volta.', collect: () => ({ id: v.id }), done: () => { invalidate(); ST.host.render(); } }) } }, icon('x', 14), 'Revogar')) : h('span'));
    return h('div', { class: 'st-page' },
      h('div', { class: 'st-grid2' },
        card('Política de cadastro', pill(POLICY[pol] || pol, pol === 'open' ? 'ok' : pol === 'closed' ? 'danger' : 'warn'), polSeg,
          h('p', { class: 'small muted st-foot', text: 'Aplicada pelo servidor de autenticação antes de criar a conta (não dá para contornar pelo navegador). Hoje: aberto, como o app atual.' })),
        card('Novo convite', pill('72 h · uso único', 'muted'), U.field('E-mail da pessoa', email),
          h('div', { class: 'field' }, h('label', { text: 'Tipo' }), seg([['real', 'Real'], ['ficticia', 'Fictícia (teste)']], kind, (v) => { kind = v; }, 'Tipo do convite')), create)),
      h('div', { class: 'st-grid2' },
        card('Situação dos convites', pill('estados', 'muted'), h('div', { class: 'st-inv-states' }, [['enviados', 'Enviados', ''], ['pendentes', 'Pendentes', 'ok'], ['aceitos', 'Aceitos', ''], ['expirados', 'Expirados', 'warn'], ['revogados', 'Revogados', 'danger']].map(([k, l, c]) => h('div', { class: 'st-inv-state' }, h('b', { class: 'num', text: nv((d.ov.invites || {})[k]) }), pill(l, c))))),
        card('Contas reservadas para testes', pill(d.res.length + ' reservada(s)', 'muted'),
          d.res.length ? h('div', { class: 'row wrap' }, d.res.map((r) => h('span', { class: 'pill st-res-pill' }, icon('lock', 12), (r.name || 'Conta') + ' · ' + (STATUS[r.status] || [r.status])[0]))) : h('p', { class: 'small muted', text: 'Nenhuma conta marcada como reservada.' }),
          h('p', { class: 'small muted st-foot', text: 'Guardadas para testadores reais: não recebem convite novo, não são reclassificadas sem frase CLASSIFICAR e aparecem como [TESTE] nos totais.' }))),
      card('Convites', pill(d.inv.length + ' no total', 'muted'), h('div', { class: 'st-inv-list' }, d.inv.map(row)), h('p', { class: 'small muted st-foot', text: 'E-mails mascarados na lista. Convites vencidos e usados ficam guardados (nada é apagado automaticamente).' })));
  }

  function vAlertas() {
    const d = ST.data.alertas; if (!d) return loading();
    const ack = (id) => need('studio.alerts.ack', id ? { id } : {}).then(() => { invalidate('alertas', 'visao'); ST.host.render(); }, (e) => toast(e.message, 'err'));
    const unread = d.al.filter((a) => !a.readAt).length;
    return h('div', { class: 'st-page' }, card('Alertas', h('button', { class: 'btn ghost sm', disabled: !unread || null, on: { click: () => ack() } }, icon('check', 14), 'Marcar todos como lidos'),
      d.al.length ? h('div', { class: 'st-inv-list' }, d.al.map((a) => h('div', { class: ['st-inv glass', !a.readAt && 'unread'] },
        h('span', { class: 'st-tl-ic' }, icon(a.severity === 'alta' ? 'alert' : 'bell', 16)),
        h('div', { class: 'st-acc-main' }, h('b', { text: ALERT[a.kind] || a.kind }), h('span', { class: 'small muted', text: a.summary + ' · ' + dt(a.at) })),
        h('div', { class: 'st-acc-pills' }, pill(SEV[a.severity][0], SEV[a.severity][1]), a.readAt ? pill('lido', 'muted') : null),
        a.readAt ? h('span') : h('button', { class: 'btn ghost sm', on: { click: () => ack(a.id) } }, 'Lido')))) : U.empty('bell', 'Sem alertas', 'Nada fora do normal.'),
      h('p', { class: 'small muted st-foot', text: 'Alertas só dentro do Studio nesta etapa (e-mail para o fundador fica para depois do T-MAIL).' })));
  }

  function vAuditoria() {
    const d = ST.data.auditoria; if (!d) return loading();
    const R = { ok: ['ok', 'ok'], negado: ['negado', 'danger'], erro: ['erro', 'warn'] };
    return h('div', { class: 'st-page' },
      card('Guarda dos registros', pill('provisória · revisável', 'warn'), h('p', { class: 'small', text: d.ret.note }),
        h('div', { class: 'st-kv' }, d.ret.groups.map((g) => h('div', null, h('span', { class: 'small muted', text: g.table }), h('b', { text: g.expired + ' vencido(s) para revisão' }))))),
      card('Auditoria', pill('só acréscimo', 'muted'), h('div', { class: 'st-audit' },
        h('div', { class: 'st-audit-h small muted' }, h('span', { text: 'Quando' }), h('span', { text: 'Ação' }), h('span', { text: 'Resultado' }), h('span', { text: 'Motivo / justificativa' })),
        d.au.map((x) => h('div', { class: 'st-audit-r' }, h('span', { class: 'small num', text: dt(x.at) }), h('code', { text: x.action }), pill(R[x.result][0], R[x.result][1]), h('span', { class: 'small muted', text: x.justification || x.reason || x.purpose || '—' }))))));
  }

  /* ---------- Estúdio Visual (base) ---------- */
  /* ---------- Assinatura HINGABEXIT v2.2 (item 6) ----------
     Material FIXO (Liquid Glass da receita Studio): desfoque, vidro, borda, reflexo, luz e cantos NÃO se personalizam. Só as cores.
     Paletas oficiais (Jade, Champagne, Atlantic, Terracotta, Violet, Neutral) vêm do pacote (js/hingabexit.js); as legadas seguem disponíveis. */
  const HB = (typeof globalThis !== 'undefined' && globalThis.Hingabexit) || null;
  const BASE = { '--glass-opacity': 0.58, '--glass-2-opacity': 0.74, '--blur': 22, '--sat': 180, '--glass-edge': 0.78, '--shadow-level': 2, '--r-sm': 12, '--r': 20, '--r-lg': 28, '--sheen': 0.32, '--light-angle': 135 };
  const BASE_D = { ...BASE, '--glass-opacity': 0.44, '--glass-2-opacity': 0.64, '--glass-edge': 0.24, '--sheen': 0.22 };
  const C = (p, l, m, pa, o, i, i2, mu) => ({ '--brand-petrol': p, '--brand-lime': l, '--brand-mint': m, '--paper': pa, '--offwhite': o, '--ink': i, '--ink-2': i2, '--muted': mu });
  const COLOR_KEYS = ['--brand-petrol', '--brand-lime', '--brand-mint', '--paper', '--offwhite', '--ink', '--ink-2', '--muted'];
  const LEGACY_PAL = {
    original: { name: 'Original', light: C('#1b6b5f', '#c8f169', '#5fb3a3', '#fbfaf6', '#f5f4ee', '#0c2a26', '#1e3f3a', '#2f4b46'), dark: C('#1b6b5f', '#c8f169', '#5fb3a3', '#0b2421', '#071a18', '#eaf3ef', '#c3d6d0', '#9db3ad') },
    jade: { name: 'Jade', light: C('#0e6b56', '#c8f169', '#46c19a', '#f8fcf9', '#edf6f1', '#0a2a22', '#1b3d33', '#2c4a40'), dark: C('#12806a', '#c8f169', '#2fa384', '#08241d', '#051a15', '#e6f5ef', '#c0dcd2', '#95b8ac') },
    oceano: { name: 'Oceano', light: C('#1a5f86', '#bff3dd', '#59a7d9', '#f7fafd', '#ebf2f8', '#0a2236', '#1b3a52', '#2d4b63'), dark: C('#2878a8', '#bff3dd', '#2f6f9e', '#0a1d2c', '#06141f', '#e6f1fa', '#c2d6e6', '#97afc2') },
    lavanda: { name: 'Lavanda', light: C('#5a4a8c', '#d6f59a', '#b6a3ea', '#fbf9fe', '#f2eefa', '#211a38', '#342a53', '#483e64'), dark: C('#7a68b8', '#d6f59a', '#6b58a8', '#1a1626', '#120f1c', '#efeaf9', '#d6cdee', '#b4a9d1') },
    grafite: { name: 'Grafite', light: C('#2e3a40', '#c8f169', '#8d9ba3', '#fafafa', '#eef0f1', '#14181b', '#2a3034', '#42494e'), dark: C('#4a5a62', '#c8f169', '#3c474d', '#1a1d1f', '#111315', '#eef1f2', '#cfd5d8', '#a6aeb2') },
  };
  const OFFICIAL_IDS = ['jade', 'champagne', 'atlantic', 'terracotta', 'violet', 'neutral'];
  const pickC = (t) => C(...COLOR_KEYS.map((k) => t[k]));
  const PAL = {};
  if (HB && HB.registry && OFFICIAL_IDS.every((id) => HB.registry[id])) {
    // oficiais primeiro (Oceano passa a ser apelido de Atlantic e Jade nasce da Assinatura); depois as legadas que o pacote não substitui
    OFFICIAL_IDS.forEach((id) => { PAL[id] = { name: HB.registry[id].name, official: true, light: pickC(HB.tokensOf(id, 'light')), dark: pickC(HB.tokensOf(id, 'dark')) }; });
    ['original', 'grafite', 'lavanda'].forEach((id) => { PAL[id] = { ...LEGACY_PAL[id], legacy: true }; });
  } else { Object.assign(PAL, LEGACY_PAL); }   // sem o pacote (ex.: teste isolado) o Studio segue como era
  const palKey = (p) => (p in PAL ? p : (HB && HB.mapPaletteId && PAL[HB.mapPaletteId(p)] ? HB.mapPaletteId(p) : (p === 'esmeralda' ? 'jade' : null)));
  const tokensOf = (pal, mode) => ({ ...(mode === 'dark' ? BASE_D : BASE), ...PAL[palKey(pal) || 'original'][mode], palette: palKey(pal) || 'original' });
  /** só o que o servidor aceita: paleta + cores. O material (vidro, desfoque, cantos...) é fixo e nunca viaja. */
  /* tokens guardados só com { palette } (ex.: salvos pelo servidor/PX AURA) valem a PALETA inteira; só tokens sem paleta completam com o padrão do app */
  const withDef = (m, t) => (HB && t && t.palette ? { ...t } : { ...DEF[m], ...t });
  const wire = (t) => { const o = { palette: t.palette }; COLOR_KEYS.forEach((k) => { if (t[k]) o[k] = t[k]; }); if (t.bg) o.bg = t.bg; return o; };
  const DEF = { light: tokensOf('original', 'light'), dark: tokensOf('original', 'dark') };
  const PROTECTED = ['--info', '--info-bg', '--ok', '--ok-bg', '--warn', '--warn-bg', '--danger', '--danger-bg'];
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
  function mix(hex, hex2, f) { const a = parseInt(hex.slice(1), 16), b = parseInt(hex2.slice(1), 16); const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f)); return `rgb(${c.join(',')})`; }
  function applyLegacy(el, t, mode) {
    const done = []; const set = (k, v) => { done.push(k); el.style.setProperty(k, v); };
    const tint = mode === 'dark' ? mix(t['--paper'], t['--brand-petrol'], 0.25) : '#ffffff';
    const tn = tint.startsWith('#') ? [255, 255, 255] : tint.slice(4, -1).split(',').map(Number);
    set('--petrol-600', t['--brand-petrol']); set('--petrol-700', mix(t['--brand-petrol'], '#000000', 0.25)); set('--petrol-800', mix(t['--brand-petrol'], '#000000', 0.45)); set('--petrol-500', mix(t['--brand-petrol'], '#ffffff', 0.12)); set('--lime', t['--brand-lime']); set('--lime-strong', t['--brand-lime']); set('--st-mint', t['--brand-mint']);
    ['--paper', '--offwhite', '--ink', '--ink-2', '--muted'].forEach((k) => set(k, t[k]));
    set('--glass', `rgba(${tn.join(',')}, ${t['--glass-opacity']})`); set('--glass-2', `rgba(${tn.join(',')}, ${t['--glass-2-opacity']})`);
    set('--glass-edge', `rgba(255,255,255,${t['--glass-edge']})`); set('--blur', t['--blur'] + 'px'); set('--sat', t['--sat'] + '%');
    const lv = t['--shadow-level'], sh = [0, 0.12, 0.28, 0.42][lv];
    set('--glass-shadow', `0 1px 0 rgba(255,255,255,${mode === 'dark' ? 0.12 : 0.9}) inset, 0 ${10 + 6 * lv}px ${24 + 10 * lv}px -18px ${hexA(mode === 'dark' ? '#000000' : t['--ink'], sh * (mode === 'dark' ? 2 : 1.2))}`);
    set('--r-sm', t['--r-sm'] + 'px'); set('--r', t['--r'] + 'px'); set('--r-lg', t['--r-lg'] + 'px');
    set('--st-sheen', String(t['--sheen'] ?? 0.3)); set('--st-light', (t['--light-angle'] ?? 135) + 'deg');
    set('--st-hero-a', t['--brand-petrol']); set('--st-hero-b', mix(t['--brand-petrol'], mode === 'dark' ? '#000000' : t['--ink'], 0.55));
    set('--st-bg', `radial-gradient(120% 90% at 0% 0%, ${hexA(t['--brand-mint'], mode === 'dark' ? 0.35 : 0.55)}, transparent 55%), radial-gradient(90% 80% at 100% 10%, ${hexA(t['--brand-lime'], mode === 'dark' ? 0.16 : 0.45)}, transparent 55%), ${t['--offwhite']}`);
    // tokens protegidos (estado, segurança, valores; "Em análise" = azul): reaplicados POR ÚLTIMO com o valor oficial — o tema não os alcança
    if (el === document.documentElement) PROTECTED.forEach((k) => el.style.removeProperty(k)); // no app todo as cores travadas vêm só da folha de estilo (e trocam sozinhas no claro/escuro)
    else { const cs = getComputedStyle(document.documentElement); PROTECTED.forEach((k) => set(k, cs.getPropertyValue(k).trim())); }
    return done;
  }
  /* caminho Assinatura v2.2: o runtime aplica material fixo + cores + semânticas; aqui só se liga o que é do app (petróleo, destaque, prévia) */
  const textOn = (bg) => (HB.contrast(bg, '#ffffff') >= HB.contrast(bg, '#10181a') ? '#ffffff' : '#10181a');
  function applyHB(el, t, mode) {
    const id = palKey(t.palette) || 'original';
    const hbId = HB.mapPaletteId(id) || (id === 'lavanda' ? 'violet' : 'jade');
    const base = HB.tokensOf(hbId, mode); const tk = { ...base, palette: HB.mapPaletteId(id) ? id : hbId };
    const custom = {}; COLOR_KEYS.forEach((k) => { if (t[k]) { tk[k] = t[k]; if (t[k] !== (PAL[id] ? PAL[id][mode][k] : null)) custom[k] = 1; } });
    if (PAL[id] && !PAL[id].official) { COLOR_KEYS.forEach((k) => { tk[k] = t[k] || PAL[id][mode][k]; }); tk['--wash'] = tk['--brand-mint']; tk['--action'] = tk['--brand-petrol']; tk['--action-ink'] = textOn(tk['--brand-petrol']); tk['--accent-ink'] = textOn(tk['--brand-lime']); }
    if (custom['--brand-petrol']) { tk['--action'] = tk['--brand-petrol']; tk['--action-ink'] = textOn(tk['--brand-petrol']); }
    if (custom['--brand-lime']) tk['--accent-ink'] = textOn(tk['--brand-lime']);
    const done = HB.applyTo(el, tk, mode).slice(); const set = (k, v) => { done.push(k); el.style.setProperty(k, v); };
    const pet = tk['--brand-petrol'], acc = tk['--brand-lime'];
    set('--petrol-600', pet); set('--petrol-700', mix(pet, '#000000', 0.25)); set('--petrol-800', mix(pet, '#000000', 0.45)); set('--petrol-500', mix(pet, '#ffffff', 0.12));
    set('--lime', acc); set('--lime-strong', acc); set('--lime-ink', tk['--accent-ink'] || textOn(acc)); set('--st-mint', tk['--brand-mint']);
    const m = HB.materialOf(tk.palette, mode);
    set('--st-sheen', String(mode === 'dark' ? BASE_D['--sheen'] : BASE['--sheen'])); set('--st-light', '135deg');
    set('--st-hero-a', pet); set('--st-hero-b', mix(pet, mode === 'dark' ? '#000000' : tk['--ink'], 0.55));
    set('--st-bg', `radial-gradient(120% 90% at 0% 0%, ${m.ambient1}, transparent 60%), radial-gradient(90% 80% at 100% 10%, ${m.ambient2}, transparent 55%), ${tk['--offwhite']}`);
    // tokens protegidos (estado, segurança, valores; "Em análise" = azul): sempre os oficiais, reaplicados POR ÚLTIMO
    if (el === document.documentElement) PROTECTED.forEach((k) => el.style.removeProperty(k));
    else { const cs = getComputedStyle(document.documentElement); PROTECTED.forEach((k) => set(k, cs.getPropertyValue(k).trim())); }
    return done;
  }
  const applyTokens = (el, t, mode) => (HB ? applyHB(el, t, mode) : applyLegacy(el, t, mode));
  /* ---------- tema do app pessoal (só fundador, só depois de whoami; o servidor confere de novo) ---------- */
  const PERS = { themes: {}, keys: [], observer: null };
  const bypass = () => { try { return /[?&]tema=original(&|$)/.test(location.search) || sessionStorage.getItem('pacto:tema-original') === '1'; } catch { return false; } };
  function wipePersonal() { const el = document.documentElement; PERS.keys.forEach((k) => el.style.removeProperty(k)); PERS.keys = []; delete el.dataset.founderTheme; delete el.dataset.buildPalette; if (el.removeAttribute) ['data-hb-palette', 'data-hb-mode', 'data-hb-adapt'].forEach((a) => el.removeAttribute(a)); }
  const watchMode = () => { if (!PERS.observer && typeof MutationObserver === 'function') { PERS.observer = new MutationObserver(() => applyLayers()); PERS.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } };
  /* paleta padrão DA BUILD (só homologação, via PACTO_BUILD.defaultPalette): vale para quem não tem tema salvo; nunca grava nada nem substitui um tema salvo; ?tema=original mostra o padrão 8.2 */
  const BUILD_PAL = (() => { try { const p = root.PACTO_BUILD && root.PACTO_BUILD.defaultPalette; return p && HB && palKey(p) ? palKey(p) : null; } catch { return null; } })();
  function applyBuildDefault() {
    if (!BUILD_PAL || bypass()) return;
    const m = curMode(); PERS.keys = applyTokens(document.documentElement, tokensOf(BUILD_PAL, m), m); document.documentElement.dataset.buildPalette = BUILD_PAL; watchMode();
  }
  function clearPersonal() { wipePersonal(); applyBuildDefault(); }
  function applyPersonal() {
    wipePersonal(); if (bypass()) return;   // atalho de emergência: ?tema=original (ou botão no Perfil) mostra o padrão 8.2 sem tocar no servidor
    const m = curMode(), th = PERS.themes[m]; if (!th) { applyBuildDefault(); return; }
    PERS.keys = applyTokens(document.documentElement, withDef(m, th.tokens), m); document.documentElement.dataset.founderTheme = th.name;
    watchMode();
  }
  /* camadas visuais: base do app → tema pessoal do fundador → tema ESPECIAL (temporário; some no término aprovado e devolve o visual anterior) */
  function applyLayers() { applyPersonal(); const AU = root.PactoAura; if (AU) AU.apply(); }
  function loadSpecial() { const AU = root.PactoAura; if (!AU || !REMOTE()) return; AU.loadActive(); AU.startPolling(); if (!PERS.hash) { PERS.hash = true; try { root.addEventListener('hashchange', () => { applyLayers(); }); } catch {} } }
  function loadPersonal() {
    need('studio.theme.personal').then((r) => { PERS.themes = (r && r.founder && r.themes) || {}; applyLayers(); ST.host && ST.host.render(); }, () => { PERS.themes = {}; applyLayers(); });
  }
  function profileCard() {
    if (!ST.who || !ST.who.founder) return null;
    const on = !!PERS.themes[curMode()] && !bypass();
    return h('section', { class: 'card glass st-card st-profile-card' }, h('div', { class: 'st-card-h' }, h('h2', { text: 'Aparência do fundador' }), pill(on ? 'tema pessoal ativo' : 'padrão PACTOX', on ? 'lime' : 'muted')),
      h('p', { class: 'small muted', text: 'Seu tema vale só para a sua conta. Aqui você sempre volta ao visual original do app.' }),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost sm', on: { click: async () => { try { await need('studio.theme.reset', { mode: curMode(), scope: 'pessoal' }); } catch {} try { sessionStorage.removeItem('pacto:tema-original'); } catch {} ST.theme = null; ST.themes = null; loadPersonal(); toast('Visual original do app restaurado.'); } } }, icon('refresh', 14), 'Restaurar original'),
        h('button', { class: 'btn ghost sm', on: { click: () => { try { sessionStorage.setItem('pacto:tema-original', '1'); } catch {} applyLayers(); ST.host.render(); toast('Visual original só nesta sessão.'); } } }, 'Ver original agora')));
  }
  const curMode = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const SCOPES = { studio: ['studio'], pessoal: ['pessoal'], ambos: ['studio', 'pessoal'] };
  const scopeOf = (th) => { const s = (th && th.scopes) || []; return s.includes('studio') && s.includes('pessoal') ? 'ambos' : s.includes('pessoal') ? 'pessoal' : 'studio'; };
  const scopeLabel = (arr) => (arr.includes('studio') && arr.includes('pessoal') ? 'Studio + app pessoal' : arr.includes('pessoal') ? 'App pessoal' : arr.includes('studio') ? 'Studio' : 'não aplicado');
  function activeTheme(mode) { const th = (ST.themes || []).find((x) => x.active && x.mode === mode); return th || null; }
  function vEstudio() {
    const d = ST.data.estudio; if (!d) return loading();
    ST.themes = d.themes;
    if (!ST.theme) { const m = curMode(), act = activeTheme(m); ST.theme = { mode: m, t: act ? withDef(m, act.tokens) : { ...DEF[m] }, name: act ? act.name : '', scope: scopeOf(act), result: null }; ST.theme.base = { ...ST.theme.t }; }
    const T = ST.theme;
    const preview = h('div', { class: 'st-prev', dataset: { mode: T.mode } });
    const out = h('div', { class: 'st-valid', 'aria-live': 'polite' });
    const paint = () => { applyTokens(preview, T.t, T.mode); };
    const okNow = () => !!(T.result && T.result.ok);
    const showResult = (r) => { T.result = r; const sv = document.getElementById('st-apply'); if (sv) sv.disabled = !okNow() || null; out.replaceChildren(r ? h('div', { class: ['st-res', r.ok ? 'ok' : 'bad'] }, h('b', null, icon(r.ok ? 'check' : 'alert', 16), r.ok ? ' Aprovado pelo servidor · contraste AA' : ' Recusado pelo servidor · não pode ser aplicado'), (r.errors || []).map((e) => h('div', { class: 'small', text: '• ' + e })), (r.warnings || []).map((e) => h('div', { class: 'small muted', text: '⚠ ' + e }))) : ''); };
    const validate = async () => { try { showResult(await need('studio.theme.validate', { tokens: wire(T.t), mode: T.mode })); } catch (e) { toast(e.message, 'err'); } };
    let vt; const changed = (custom) => { if (custom) T.custom = true; paint(); clearTimeout(vt); vt = setTimeout(validate, 300); };
    const color = (k, l) => h('label', { class: 'st-color' }, h('input', { type: 'color', value: T.t[k], 'aria-label': l, on: { input: (e) => { T.t[k] = e.target.value; changed(true); } } }), h('span', null, h('b', { text: l }), h('code', { class: 'small muted', text: k })));
    const palBtn = (k) => { const p = PAL[k][T.mode]; return h('button', { class: 'st-pal glass', 'aria-pressed': String(palKey(T.t.palette) === k), on: { click: () => { T.t = { ...T.t, ...PAL[k][T.mode], palette: k }; T.custom = false; ST.host.render(); } } },
      h('span', { class: 'st-pal-sw' }, [p['--brand-petrol'], p['--brand-lime'], p['--brand-mint'], p['--paper']].map((c) => h('i', { style: { background: c } }))), h('b', { text: PAL[k].name })); };
    const name = h('input', { class: 'st-name', maxlength: '40', placeholder: 'Nome do tema (ex.: Jade noturno)', value: T.name || '', on: { input: (e) => { T.name = e.target.value; } } });
    const act = activeTheme(T.mode);
    const controls = h('div', { class: 'st-ctrl' },
      h('div', { class: 'st-ctrl-h' }, seg([['light', 'Claro'], ['dark', 'Escuro']], T.mode, (v) => { const a2 = activeTheme(v); ST.theme = { mode: v, t: a2 ? withDef(v, a2.tokens) : { ...DEF[v], ...PAL[T.t.palette in PAL ? T.t.palette : 'original'][v], palette: T.t.palette in PAL ? T.t.palette : 'original' }, name: a2 ? a2.name : T.name, scope: a2 ? scopeOf(a2) : T.scope, result: null }; ST.theme.base = { ...ST.theme.t }; ST.host.render(); }, 'Modo'),
        h('span', { class: 'small muted', text: 'Studio: ' + (act ? act.name : 'Original PACTOX') + ' · App: ' + ((PERS.themes[T.mode] || {}).name || 'Original PACTOX') })),
      h('div', { class: 'eyebrow', text: 'Paletas' }),
      h('div', { class: 'st-pals' }, Object.keys(PAL).map(palBtn)),
      h('div', { class: 'eyebrow', text: 'Cores (ajuste fino)' }),
      h('div', { class: 'st-colors' }, color('--brand-petrol', 'Principal'), color('--brand-lime', 'Destaque'), color('--brand-mint', 'Luz de fundo'), color('--paper', 'Papel'), color('--offwhite', 'Fundo'), color('--ink', 'Texto')),
      h('div', { class: 'eyebrow', text: 'Liquid Glass · material fixo' }),
      h('p', { class: 'small muted st-fixed', text: 'Desfoque, vidro, bordas, reflexo, luz e cantos seguem a Assinatura HINGABEXIT e não se personalizam. Só as cores mudam.' }),
      h('div', { class: 'st-protect small' }, icon('lock', 14), h('span', { text: 'Travadas: cores de estado, segurança e valores — Em análise (azul), Ativa, Atenção, Bloqueada. Nenhum tema as altera.' })),
      out, U.field('Nome do tema', name),
      h('div', { class: 'eyebrow', text: 'Onde aplicar este tema' }),
      seg([['studio', 'Só no Studio'], ['pessoal', 'Só no meu app'], ['ambos', 'Nos dois']], T.scope, (v) => { T.scope = v; }, 'Escopo do tema'),
      h('p', { class: 'small muted', text: 'Claro e escuro são independentes. O tema vale só para a sua conta (verificada no servidor); ninguém mais vê. Cores de estado, segurança e valores seguem travadas no app.' }),
      h('div', { class: 'st-actions' },
        h('button', { class: 'btn lime sm', id: 'st-apply', disabled: !okNow() || null, on: { click: async () => { try { const nm = (T.name || '').trim() || ((PAL[T.t.palette] || { name: 'Personalizado' }).name + (T.mode === 'dark' ? ' escuro' : ' claro')); await need('studio.theme.save', { name: nm, mode: T.mode, tokens: wire(T.t), activate: true, scopes: SCOPES[T.scope] }); T.name = nm; T.base = { ...T.t }; toast('Tema aplicado em: ' + scopeLabel(SCOPES[T.scope]) + ' (' + (T.mode === 'dark' ? 'escuro' : 'claro') + '). Só você vê.'); invalidate('estudio'); ST.themes = null; loadPersonal(); ST.host.render(); } catch (e) { toast(e.message, 'err'); } } } }, icon('check', 16), 'Aplicar'),
        h('button', { class: 'btn ghost sm', on: { click: () => { T.t = { ...T.base }; T.result = null; ST.host.render(); } } }, icon('x', 16), 'Cancelar'),
        h('button', { class: 'btn ghost sm', on: { click: async () => { try { await need('studio.theme.reset', { mode: T.mode }); ST.theme = null; ST.themes = null; invalidate('estudio'); loadPersonal(); toast('Original PACTOX restaurado no Studio e no app (' + (T.mode === 'dark' ? 'escuro' : 'claro') + ').'); ST.host.render(); } catch (e) { toast(e.message, 'err'); } } } }, icon('refresh', 16), 'Restaurar original')));
    const P = h('div', { class: 'st-prev-in' },
      h('div', { class: 'st-pv-top glass' }, h('span', { class: 'st-pv-logo' }, U.brandMark(22, { small: true })), h('b', { text: 'Início' }), h('span', { class: 'st-pv-dot' })),
      h('div', { class: 'st-pv-hero sheen' }, h('div', { class: 'eyebrow', text: 'Próximo vencimento' }), h('div', { class: 'big num', text: 'R$ 1.250,00' }), h('div', { class: 'small', text: '[TESTE] Notebook usado · 10/12' }), h('button', { class: 'btn lime sm', text: 'Ver acordo' })),
      h('div', { class: 'st-pv-row' }, ['A receber', 'A pagar', 'Em dia'].map((l, i) => h('div', { class: 'glass st-pv-stat' }, h('span', { class: 'small muted', text: l }), h('b', { class: 'num', text: ['R$ 3,4 mil', 'R$ 900', '92%'][i] })))),
      h('div', { class: 'glass sheen st-pv-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { text: 'Aulas de violão' }), pill('Em análise', 'info')), h('div', { class: 'small muted', text: 'Comprovante enviado · aguardando validação' })),
      h('div', { class: 'glass st-pv-card' }, h('div', { class: 'row wrap' }, pill('Ativa', 'ok'), pill('Atenção', 'warn'), pill('Bloqueada', 'danger'), pill('Em análise', 'info'))),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', text: 'Principal' }), h('button', { class: 'btn ghost sm', text: 'Secundário' })));
    preview.append(h('div', { class: 'st-prev-bg' }), h('span', { class: 'st-orb a' }), h('span', { class: 'st-orb b' }), P);
    requestAnimationFrame(() => { paint(); if (!T.result) validate(); else showResult(T.result); });
    return h('div', { class: 'st-page' },
      h('div', { class: 'st-studio' }, card('Estúdio Visual', pill('só para você', 'lime'), controls),
        h('section', { class: 'st-prev-wrap' }, h('div', { class: 'st-sub', text: 'Prévia ao vivo · ' + (T.mode === 'dark' ? 'escuro' : 'claro') + ' · ' + ((PAL[T.t.palette] || { name: 'Personalizada' }).name) + ' · nunca muda o app de outras pessoas' }), preview)),
      d.themes.length ? card('Temas salvos', pill('sincronizados na sua conta', 'muted'), h('div', { class: 'row wrap' }, d.themes.map((t) => h('span', { class: 'pill' + (t.active ? ' lime' : '') }, (t.scopes && t.scopes.length ? '● ' : '') + t.name + ' · ' + (t.mode === 'dark' ? 'escuro' : 'claro') + ' · ' + scopeLabel(t.scopes || []))))) : null);
  }

  function loading() { return h('div', { class: 'st-page' }, ST.err ? U.empty('alert', 'Não foi possível carregar', ST.err.message) : U.skeleton(3)); }
  function gate() {
    const w = ST.who;
    if (!w.mfaEnrolled) return U.empty('shield', 'Ative a verificação em duas etapas', 'O Studio exige um autenticador para a conta do fundador. Ative em Perfil → Segurança.');
    const code = h('input', { inputmode: 'numeric', maxlength: '6', placeholder: '••••••', class: 'st-otp' }); const err = h('div', { class: 'err' });
    return h('div', { class: 'st-gate glass-strong' }, h('span', { class: 'st-gate-ic' }, icon('shield', 30)), h('h2', { text: 'Confirme que é você' }),
      h('p', { class: 'muted', text: 'Para abrir o Studio, digite o código do seu autenticador (vale 15 minutos).' + (DEV && !REMOTE() ? ' Prévia local: qualquer 6 dígitos.' : '') }), code, err,
      h('button', { class: 'btn lime block', on: { click: async () => { try { await stepUp(code.value.trim()); ST.who = await need('studio.whoami'); ST.host.render(); } catch (e) { err.textContent = e.message; } } } }, 'Abrir o Studio'));
  }

  /* whoami primeiro; o tema pessoal só é pedido se o servidor disse founder:true */
  function auraCtx() { return { need, call, sensitive, DEF, tokensOf, applyTokens, withDef, curMode, bypass, remote: REMOTE, render: () => ST.host && ST.host.render(), layers: () => applyLayers(), refreshActive: () => { const AU = root.PactoAura; AU && AU.loadActive(); } }; }
  function whoami() {
    const AU = root.PactoAura; if (AU) AU.init(auraCtx());
    need('studio.whoami').then((w) => {
      ST.who = w;
      if (w.founder) { loadPersonal(); if (AU) AU.probe().then(() => ST.host && ST.host.render()); ST.host.render(); } else { clearPersonal(); PERS.themes = {}; if (AU) AU.reset(); }
      loadSpecial();   // qualquer conta: só desenho do tema ativo (se houver); depois do whoami, que continua sendo a primeira chamada
    }, () => { ST.who = { founder: false }; clearPersonal(); PERS.themes = {}; if (AU) AU.reset(); });
  }

  /* ---------- API para o app ---------- */
  const VIEWS = { visao: vVisao, acessos: vAcessos, convites: vConvites, alertas: vAlertas, auditoria: vAuditoria, estudio: vEstudio, aura: () => (root.PactoAura ? root.PactoAura.view() : U.empty('shield', 'Recurso indisponível', '')) };
  root.PactoStudio = {
    init(host) { ST.host = host; applyBuildDefault(); whoami(); },
    refresh() { whoami(); },
    reset() { clearPersonal(); const AU = root.PactoAura; if (AU) AU.reset(); PERS.themes = {}; ST.who = { founder: false }; ST.data = {}; ST.theme = null; ST.themes = null; },
    profileCard,
    get founder() { return !!(ST.who && ST.who.founder); },
    page(sub) {
      const tab = VIEWS[sub] && (sub !== 'aura' || (root.PactoAura && root.PactoAura.enabled)) ? sub : 'visao';
      const nav = h('nav', { class: 'st-tabs glass', 'aria-label': 'Áreas do Studio' }, TABS.concat(root.PactoAura && root.PactoAura.enabled ? [AURA_TAB] : []).map(([k, ic, l]) => h('button', { class: 'st-tab', 'aria-current': k === tab ? 'page' : null, on: { click: () => ST.host.go('#/studio/' + k) } }, icon(ic, 16), h('span', { text: l }))),
        h('span', { class: 'st-tab-sep', 'aria-hidden': 'true' }),
        FUTURE.map(([k, ic, l, et]) => h('span', { class: 'st-tab st-tab-off', role: 'link', 'aria-disabled': 'true', title: l + ' · planejado para a Etapa ' + et + ' (ainda não existe)' }, icon(ic, 16), h('span', { text: l }), h('em', { class: 'st-plan', text: 'Planejado · Etapa ' + et }))));
      const open = ST.who.totpFresh && ST.who.aal2 && ST.who.mfaEnrolled;
      if (open) load(tab);
      const title = (TABS.concat([AURA_TAB]).find((x) => x[0] === tab) || [])[2];
      if (open && !ST.themes && !ST.loading._themes) { ST.loading._themes = true; need('studio.theme.list').then((x) => { ST.themes = x; ST.loading._themes = false; ST.host.render(); }, () => { ST.themes = []; ST.loading._themes = false; }); }
      const box = h('div', { class: 'studio' }, open ? [nav, VIEWS[tab]()] : gate());
      const at = activeTheme(curMode()); const pm = curMode();
      if (open && at && (at.scopes || []).includes('studio')) { applyTokens(box, withDef(pm, at.tokens), pm); box.classList.add('st-themed'); }
      else if (open && PERS.themes[pm] && !bypass()) { applyTokens(box, { ...DEF[pm] }, pm); box.classList.add('st-themed'); }   // tema só do app pessoal: o Studio fica no visual original
      return { title: 'PX CORE', sub: title + ' · Central do fundador', content: box }; // nome visível (t89u/t90u); identificadores técnicos seguem studio.*
    },
    _st: ST,
  };
})(self);
