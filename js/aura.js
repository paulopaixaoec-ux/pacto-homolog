/* PX AURA · Temas Especiais (item 7 do plano estrutural), dentro do PX CORE. Só fundador (o servidor decide por uid: studio.special_theme.*),
   atrás da flag studio_special_themes_enabled (desligada por padrão). Aqui só se desenha o que o servidor devolve; toda regra é conferida de novo no servidor e no banco.
   Camadas visuais: base do app → tema pessoal do fundador → tema especial (temporário, com data de término aprovada; some sozinho e devolve o visual anterior).
   Sem innerHTML; cores só por CSSOM (CSP style-src 'self'). Nenhuma preferência do usuário é tocada (pacto8:*, pacto82-*, profiles.theme). */
(function (root) {
  'use strict';
  const U = root.UI, Eng = root.SpecialThemes, Fix = root.SpecialThemesFixtures, Theme = root.PactoStudioTheme;
  if (!U || !Eng || !Fix || !Theme) return;
  const { h, icon, pill, toast, seg } = U;
  const A = { ctx: null, enabled: false, data: null, loading: false, err: null, sub: 'visao', draftId: null, active: [], activeAt: 0, applied: [], chip: true, fx: null };
  const M = 'studio.special_theme.';
  const SP = 'America/Sao_Paulo';
  const SUBS = [['visao', 'grid', 'Visão geral'], ['sugestoes', 'spark', 'Sugestões'], ['rascunhos', 'list', 'Rascunhos e aprovação'], ['agenda', 'calendar', 'Agenda'], ['historico', 'shield', 'Histórico']];
  const SCOPE_OK = ['app_pessoal', 'app_empresas', 'studio'];   // site público e convites: sem endpoint anônimo nesta etapa (pendente; ver docs)
  const STATUS = { draft: ['Rascunho', 'muted'], approved: ['Aprovado', 'info'], rejected: ['Recusado', 'danger'], scheduled: ['Agendado', 'info'], active: ['No ar', 'ok'], deactivated: ['Desativado', 'muted'], ended: ['Encerrado', 'muted'],
    invalidated: ['Aprovação invalidada', 'warn'], replaced: ['Substituído', 'muted'], cancelled: ['Cancelado', 'muted'] };
  const st = (x) => { const [l, k] = STATUS[x] || [x, '']; return pill(l, k); };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: SP }) : 'sem término');
  const civil = (iso) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: SP }).slice(0, 16).replace(' ', 'T') : '');
  const scopeName = (s) => Eng.SCOPE_LABEL[s] || s;
  const card = (title, extra, ...kids) => h('section', { class: 'card glass st-card' }, h('div', { class: 'st-card-h' }, h('h2', { text: title }), extra || null), ...kids);
  const render = () => A.ctx && A.ctx.render();

  /* ---------- servidor ---------- */
  const reload = () => { A.loading = true; return A.ctx.need(M + 'list').then((d) => { A.data = d; A.err = null; }, (e) => { A.err = e; }).finally(() => { A.loading = false; render(); }); };
  function sens({ title, method, phrase, id, intro, fields, collect, danger, after }) {
    A.ctx.sensitive({ title, method: M + method, phrase, intro, danger, fields: fields || [], collect: () => ({ id, ...(collect ? collect() : {}) }), done: () => { reload(); after && after(); A.ctx.refreshActive(); } });
  }
  const draftsOf = () => (A.data && A.data.drafts) || [];
  const pubsOf = () => (A.data && A.data.publications) || [];
  const dismissed = () => new Set(((A.data && A.data.dismissals) || []).map((d) => d.key));

  /* ---------- camada especial aplicada ao app (qualquer conta; o servidor só devolve o tema ATIVO dos locais pedidos) ---------- */
  const scopeNow = () => ((root.PactoEmpresas && root.PactoEmpresas.active) ? 'app_empresas' : 'app_pessoal');
  function clearSpecial() {
    const el = document.documentElement; const was = !!el.dataset.specialTheme; (A.applied || []).forEach((k) => el.style.removeProperty(k)); A.applied = []; delete el.dataset.specialTheme; if (was) ['data-hb-palette', 'data-hb-mode', 'data-hb-adapt'].forEach((a) => el.removeAttribute(a));   // só desfaz os atributos que ESTA camada pôs
    const old = document.getElementById('aura-layer'); if (old) old.remove();
  }
  function decoNode(d) { return h('span', { class: ['aura-deco', 'aura-' + d.asset, 'aura-at-' + d.placement, d.motion === 'gentle' ? 'aura-gentle' : ''], 'aria-hidden': 'true' }); }
  function applySpecial() {
    clearSpecial();
    const bypass = A.ctx && A.ctx.bypass && A.ctx.bypass(); if (bypass) return false;
    const sc = scopeNow(); const th = (A.active || []).find((x) => x.scope === sc); if (!th) return false;
    const mode = A.ctx.curMode(); const tk = (mode === 'dark' ? th.tokensDark : th.tokens) || th.tokens;
    A.applied = A.ctx.applyTokens(document.documentElement, A.ctx.withDef(mode, tk), mode) || [];
    document.documentElement.dataset.specialTheme = th.name;
    const layer = h('div', { id: 'aura-layer', class: 'aura-layer', 'aria-hidden': 'true' }, (th.decorations || []).map(decoNode),
      A.chip && th.message ? h('div', { class: 'aura-chip', role: 'note' }, h('span', { text: th.message }), h('small', { text: th.signature || 'powered by HINGABEXIT' })) : null);
    document.body.appendChild(layer);
    return true;
  }
  function loadActive() {
    const api = A.ctx && A.ctx.remote && A.ctx.remote();
    if (!api) { A.active = []; return Promise.resolve(applySpecial()); }
    return A.ctx.need(M + 'active', { scopes: ['app_pessoal', 'app_empresas'] }).then((r) => { A.active = (r && r.active) || []; A.activeAt = Date.now(); }, () => { A.active = []; }).then(() => { A.ctx.layers(); });
  }

  /* ---------- visual ---------- */
  function preview(tk, mode, msg) {
    const box = h('div', { class: 'aura-prev glass' }, h('b', { text: 'PACTOX' }), h('small', { class: 'muted', text: 'Prévia · ' + (mode === 'dark' ? 'escuro' : 'claro') }), h('span', { class: 'btn lime sm', text: 'Botão' }), msg ? h('small', { text: msg }) : null);
    const t = A.ctx.withDef(mode, tk); try { A.ctx.applyTokens(box, t, mode); } catch {}
    return box;
  }
  const periodText = (p) => `${fmt(p.startAt)} → ${p.endAt ? fmt(p.endAt) : 'sem término (exceção aprovada)'} · ${(p.scopes || []).map(scopeName).join(', ')}`;

  function pubRow(p) {
    const acts = [];
    if (p.status === 'approved') acts.push(h('button', { class: 'btn lime sm', on: { click: () => sens({ title: 'Agendar tema especial', method: 'schedule', phrase: 'AGENDAR', id: p.id, intro: 'O período e os locais aprovados passam a valer no calendário. Agendar NÃO coloca o tema no ar: a ativação é sempre decisão sua.' }) } }, icon('calendar', 14), 'Agendar'));
    if (p.status === 'approved' || p.status === 'scheduled') acts.push(h('button', { class: 'btn ghost sm', on: { click: () => sens({ title: 'Ativar tema especial', method: 'activate', phrase: 'ATIVAR', id: p.id, intro: 'O tema entra no ar agora, só nos locais aprovados, e volta ao visual anterior sozinho no término aprovado.' }) } }, icon('spark', 14), 'Ativar agora'));
    if (p.status === 'active' || p.status === 'scheduled') acts.push(h('button', { class: 'btn danger sm', on: { click: () => sens({ title: 'Desativar tema especial', method: 'deactivate', phrase: 'DESATIVAR', id: p.id, danger: true, intro: 'O visual anterior volta imediatamente. Preferências dos usuários não são tocadas.' }) } }, 'Desativar'));
    return h('div', { class: 'aura-row' }, h('div', { class: 'aura-row-main' }, h('b', { text: p.name || p.id }), ' ', st(p.status), h('div', { class: 'small muted', text: periodText(p) + ' · v' + p.version }),
      p.restoreReason ? h('div', { class: 'small muted', text: p.restoreReason }) : null, p.invalidatedReason ? h('div', { class: 'small', text: p.invalidatedReason }) : null), h('div', { class: 'row wrap' }, acts));
  }

  function conflictBlock() {
    const cs = (A.data && A.data.conflicts) || []; if (!cs.length) return null;
    return card('Conflito de calendário', pill('decisão necessária', 'warn'), h('p', { class: 'small muted', text: 'Dois temas pedem o mesmo local e período. Nada é substituído automaticamente: escolha.' }),
      ...cs.map((c) => { const p = pubsOf().find((x) => x.id === c.id); if (!p) return null;
        return h('div', { class: 'aura-row' }, h('div', { class: 'aura-row-main' }, h('b', { text: p.name }), h('div', { class: 'small muted', text: 'em conflito com: ' + c.with.map((w) => `${w.name} (${(STATUS[w.status] || [w.status])[0]})`).join(', ') })),
          h('div', { class: 'row wrap' }, [['replace', 'Substituir (o outro é desativado)', 'lime'], ['reschedule', 'Reagendar', 'ghost'], ['cancel', 'Cancelar este', 'ghost']].map(([ch, l, k]) => h('button', { class: 'btn sm ' + k, on: { click: () => {
            const just = ch === 'replace' ? [] : [];
            sens({ title: l, method: 'resolve', phrase: 'RESOLVER', id: p.id, collect: () => ({ choice: ch }), danger: ch === 'replace', intro: ch === 'replace' ? 'O tema em conflito será desativado por decisão expressa sua, com motivo auditado.' : 'Nada muda no tema que já está no ar.', fields: just });
          } } }, l)))); }));
  }

  function vVisao() {
    const d = A.data; if (!d) return null;
    const act = pubsOf().filter((p) => p.status === 'active'), nxt = pubsOf().filter((p) => ['scheduled', 'approved'].includes(p.status));
    return h('div', { class: 'st-stack' },
      card('No ar agora', pill(act.length ? 'tema especial ativo' : 'visual normal', act.length ? 'ok' : 'muted'),
        act.length ? act.map(pubRow) : h('p', { class: 'small muted', text: 'Nenhum tema especial no ar. O app mostra o visual normal de cada pessoa.' }),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost sm', disabled: act.length ? null : 'true', on: { click: () => sens({ title: 'Restaurar visual anterior', method: 'restore', phrase: 'RESTAURAR', danger: true, intro: 'Encerra os temas especiais no ar e confere que as preferências permanentes (profiles.theme) ficaram idênticas.' }) } }, icon('refresh', 14), 'Restaurar visual anterior'))),
      conflictBlock(),
      card('Próximos', null, nxt.length ? nxt.map(pubRow) : h('p', { class: 'small muted', text: 'Nada agendado nem aprovado. Veja as Sugestões para o calendário do Brasil.' })),
      card('Como funciona', null, h('ul', { class: 'small muted' },
        h('li', { text: 'Nada é publicado, agendado nem ativado sem a sua decisão; aprovação vale só para a versão aprovada.' }), h('li', { text: 'O tema só muda cores, vidro e enfeites discretos; nunca valores, parcelas, pagamento, documentos ou alertas de segurança.' }),
        h('li', { text: 'No término aprovado o app volta sozinho ao visual anterior; as escolhas de cada usuário nunca são alteradas.' }), h('li', { text: 'Marca fixa: logo oficial e “powered by HINGABEXIT”.' }))));
  }

  function createFromCatalog(cat, start, end) {
    const body = { name: cat.name, category: cat.category, source: 'catalog', catalogId: cat.id, tokens: cat.tokens, tokensDark: cat.tokensDark, decorations: cat.decorations, messages: cat.messages, acceptedMessages: {},
      scopes: [], country: cat.country || 'BR', regions: cat.regions || [], locale: cat.locale || 'pt-BR', timeZone: cat.timeZone || SP, coverage: cat.coverage || 'national', sensitivity: cat.sensitivity || [],
      culturalNote: cat.culturalNote || '', audiences: cat.audiences, proposedStartAt: start, proposedEndAt: end };
    return A.ctx.need(M + 'draft', { draft: body }).then((r) => { A.draftId = r.draft.id; A.sub = 'rascunhos'; return reload(); }, (e) => toast(e.message, 'err'));
  }
  const dismissBtn = (l, key, kind) => h('button', { class: 'btn ghost sm', on: { click: () => A.ctx.need(M + 'dismiss', { key, kind }).then(() => { toast('Anotado. Você pode desfazer em Histórico.'); reload(); }, (e) => toast(e.message, 'err')) } }, l);
  function vSugestoes() {
    const now = Date.now(), hid = dismissed(); const cat = Fix.catalog();
    const list = cat.filter((c) => c.windowEnd && new Date(c.windowEnd) >= now && !hid.has(c.category) && !hid.has(c.occasionId + ':' + new Date(c.windowStart).getFullYear()))
      .sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
    return h('div', { class: 'st-stack' }, h('p', { class: 'small muted', text: 'Calendário do Brasil (fuso de Brasília). Sugestões são discretas: criar uma proposta só abre um rascunho; nada é publicado.' }),
      list.length ? list.map((c) => card(c.name, pill(Eng.CATEGORIES[c.category] || c.category, 'muted'), h('p', { class: 'small', text: c.description }), h('div', { class: 'small muted', text: c.culturalNote }),
        h('div', { class: 'small muted', text: 'Janela sugerida: ' + fmt(c.windowStart) + ' → ' + fmt(c.windowEnd) }),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn lime sm', on: { click: () => createFromCatalog(c, civil(c.windowStart), civil(c.windowEnd)) } }, icon('spark', 14), 'Criar proposta'),
          dismissBtn('Adiar 7 dias', c.occasionId + ':' + new Date(c.windowStart).getFullYear(), 'snooze'), dismissBtn('Dispensar', c.occasionId + ':' + new Date(c.windowStart).getFullYear(), 'dismiss'),
          dismissBtn('Não sugerir esta categoria', c.category, 'category')))) : U.empty('calendar', 'Nada a sugerir agora', 'Sugestões adiadas ou dispensadas aparecem de novo conforme o calendário.'));
  }

  /* ---------- editor de rascunho ---------- */
  function editor(dr) {
    const F = { name: h('input', { value: dr.name, maxlength: '80' }), start: h('input', { type: 'datetime-local', value: civil(dr.proposedStartAt) || dr.proposedStartAt || '' }), end: h('input', { type: 'datetime-local', value: dr.proposedEndAt ? (dr.proposedEndAt.length > 16 ? civil(dr.proposedEndAt) : dr.proposedEndAt) : '' }),
      noend: h('input', { type: 'checkbox' }), pal: h('select', null, h('option', { value: '', text: 'Cores da proposta (como sugerido)' }), ...['jade', 'champagne', 'atlantic', 'terracotta', 'violet', 'neutral'].map((k) => h('option', { value: k, text: 'Paleta ' + k }))) };
    F.noend.checked = !!dr.manualNoEndException;
    const sc = {}, ms = {}, ac = {}, deco = {};
    const scopeBox = h('div', { class: 'row wrap' }, SCOPE_OK.map((s) => { const i = h('input', { type: 'checkbox' }); i.checked = (dr.scopes || []).includes(s); sc[s] = i; return h('label', { class: 'row small' }, i, ' ' + scopeName(s)); }),
      ...['site_publico', 'convites'].map((s) => h('label', { class: 'row small muted', title: 'Pendente: não há leitura pública anônima nesta etapa (veja o resultado do item 7)' }, h('input', { type: 'checkbox', disabled: 'true' }), ' ' + scopeName(s) + ' (pendente)')));
    const msgBox = h('div', { class: 'st-stack' }, Eng.MESSAGE_SURFACES.map((s) => { const t = h('textarea', { maxlength: '80', rows: '2' }); t.value = (dr.messages || {})[s] || ''; const a = h('input', { type: 'checkbox' }); a.checked = !!(dr.acceptedMessages || {})[s] && (dr.acceptedMessages || {})[s] === (dr.messages || {})[s]; ms[s] = t; ac[s] = a;
      return h('div', { class: 'field' }, h('label', { text: 'Mensagem · ' + (Eng.MESSAGE_SURFACE_LABEL[s] || s) + ' (até 80 caracteres)' }), t, h('label', { class: 'row small' }, a, ' Li e aceito esta mensagem exatamente assim')); }));
    const decoBox = h('div', { class: 'row wrap' }, (dr.decorations || []).map((d, i) => { const c = h('input', { type: 'checkbox' }); c.checked = true; deco[i] = [c, d]; return h('label', { class: 'row small' }, c, ` ${d.asset} · ${d.placement} · ${d.motion || 'none'}`); }));
    const read = () => {
      let tk = dr.tokens, tkd = dr.tokensDark; if (F.pal.value) { tk = A.ctx.tokensOf(F.pal.value, 'light'); tkd = A.ctx.tokensOf(F.pal.value, 'dark'); }
      const messages = {}, accepted = {}; Eng.MESSAGE_SURFACES.forEach((s) => { const v = ms[s].value.trim(); if (v) { messages[s] = v; if (ac[s].checked) accepted[s] = v; } });
      return { name: F.name.value.trim(), tokens: tk, tokensDark: tkd, decorations: Object.values(deco).filter(([c]) => c.checked).map(([, d]) => d), messages, acceptedMessages: accepted,
        scopes: SCOPE_OK.filter((s) => sc[s].checked), proposedStartAt: F.start.value || null, proposedEndAt: F.noend.checked ? null : (F.end.value || null), manualNoEndException: F.noend.checked };
    };
    const err = h('div', { class: 'err', role: 'alert' });
    const save = (then) => A.ctx.need(M + 'draft', { id: dr.id, draft: read() }).then((r) => { A.draftId = r.draft.id; if (r.superseded) toast('Nova versão criada: a aprovação anterior deixou de valer.'); err.textContent = ''; return reload().then(() => r.draft); }, (e) => { err.textContent = e.message + (e.details && e.details.errors ? ' · ' + e.details.errors.join('; ') : ''); throw e; });
    const pv = (m) => preview(m === 'dark' ? (dr.tokensDark || dr.tokens) : dr.tokens, m, (dr.messages || {}).pessoal);
    return card('Editar: ' + dr.name, st(dr.status), h('p', { class: 'small muted', text: 'Versão ' + dr.version + ' · a aprovação é presa a esta versão (período, locais, público e cada mensagem).' }),
      h('div', { class: 'aura-prevs' }, pv('light'), pv('dark')),
      h('div', { class: 'field' }, h('label', { text: 'Nome' }), F.name), h('div', { class: 'field' }, h('label', { text: 'Base de cores (só cores se personalizam; o vidro é fixo)' }), F.pal),
      h('div', { class: 'field' }, h('label', { text: 'Locais (onde o tema pode aparecer)' }), scopeBox),
      h('div', { class: 'row wrap' }, h('div', { class: 'field' }, h('label', { text: 'Início (Brasília)' }), F.start), h('div', { class: 'field' }, h('label', { text: 'Término (Brasília)' }), F.end)),
      h('label', { class: 'row small' }, F.noend, ' Exceção: sem término (só com aprovação expressa; nunca encerra sozinho)'),
      h('div', { class: 'field' }, h('label', { text: 'Enfeites (nunca sobre valores, parcelas, pagamento, documentos ou alertas de segurança)' }), decoBox), msgBox, err,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost sm', on: { click: () => save().then(() => toast('Rascunho salvo.'), () => {}) } }, 'Salvar rascunho'),
        h('button', { class: 'btn lime sm', on: { click: () => save().then((d) => sens({ title: 'Aprovar esta versão', method: 'approve', phrase: 'APROVAR', id: d.id, intro: 'Você aprova ESTA versão: período, locais, público e as mensagens aceitas. Mudou algo depois? Será outra versão e precisa de nova aprovação.' }), () => {}) } }, icon('shield', 14), 'Salvar e aprovar…'),
        h('button', { class: 'btn danger sm', on: { click: () => sens({ title: 'Recusar proposta', method: 'reject', phrase: 'REJEITAR', id: dr.id, danger: true, after: () => { A.draftId = null; } }) } }, 'Recusar')));
  }
  function vRascunhos() {
    const ds = draftsOf().filter((d) => d.status !== 'rejected'), cur = ds.find((d) => d.id === A.draftId) || null;
    return h('div', { class: 'st-stack' },
      h('div', { class: 'row wrap' }, h('button', { class: 'btn lime sm', on: { click: () => A.ctx.need(M + 'draft', { draft: { name: 'Campanha do fundador', category: 'campanhas_fundador', source: 'custom', scopes: [], tokens: A.ctx.tokensOf('jade', 'light'), tokensDark: A.ctx.tokensOf('jade', 'dark'), decorations: [{ asset: 'glow-corner', placement: 'corner-tr', motion: 'none' }], messages: {}, acceptedMessages: {}, audiences: ['pais'] } }).then((r) => { A.draftId = r.draft.id; return reload(); }, (e) => toast(e.message, 'err')) } }, icon('plus', 14), 'Nova campanha')),
      card('Rascunhos', null, ds.length ? ds.map((d) => h('div', { class: 'aura-row' }, h('div', { class: 'aura-row-main' }, h('b', { text: d.name }), ' ', st(d.status), h('div', { class: 'small muted', text: 'v' + d.version })), h('button', { class: 'btn ghost sm', on: { click: () => { A.draftId = d.id; render(); } } }, 'Abrir'))) : h('p', { class: 'small muted', text: 'Nenhum rascunho ainda. Crie a partir de uma sugestão.' })),
      cur ? (cur.status === 'draft' ? editor(cur) : card(cur.name, st(cur.status), h('p', { class: 'small muted', text: 'Versão aprovada: não pode ser editada. Para mudar, abra um novo rascunho (nova versão).' }), h('button', { class: 'btn ghost sm', on: { click: () => A.ctx.need(M + 'draft', { id: cur.id, draft: { name: cur.name + ' (nova versão)' } }).then((r) => { A.draftId = r.draft.id; toast('Nova versão criada: a aprovação anterior deixou de valer.'); return reload(); }, (e) => toast(e.message, 'err')) } }, 'Criar nova versão'))) : null);
  }
  function vAgenda() {
    const ps = pubsOf(); return h('div', { class: 'st-stack' }, conflictBlock(), card('Publicações', null, ps.length ? ps.slice().reverse().map(pubRow) : h('p', { class: 'small muted', text: 'Nada aprovado ainda.' })));
  }
  function vHistorico() {
    if (!A.audit) { A.ctx.need(M + 'audit', { limit: 80 }).then((r) => { A.audit = r; render(); }, (e) => { A.audit = []; }); return U.skeleton(3); }
    const dis = (A.data && A.data.dismissals) || [];
    return h('div', { class: 'st-stack' },
      dis.length ? card('Sugestões adiadas ou dispensadas', null, dis.map((x) => h('div', { class: 'aura-row' }, h('span', { class: 'small', text: `${x.key} · ${x.kind}${x.until ? ' até ' + fmt(x.until) : ''}` }), h('button', { class: 'btn ghost sm', on: { click: () => A.ctx.need(M + 'undismiss', { key: x.key }).then(() => { toast('Sugestão reativada.'); reload(); }) } }, 'Desfazer')))) : null,
      card('Histórico (só de acréscimo)', null, A.audit.length ? h('div', { class: 'st-table' }, A.audit.map((a) => h('div', { class: 'aura-row small' }, h('span', { text: fmt(a.at || a.createdAt) }), h('b', { text: String(a.action).replace('special_theme.', '') }), pill(a.result, a.result === 'ok' ? 'ok' : 'warn'), h('span', { class: 'muted', text: [a.version ? 'v' + a.version : '', (a.scopes || []).join(', '), a.detail && a.detail.reason].filter(Boolean).join(' · ') })))) : h('p', { class: 'small muted', text: 'Sem registros.' })));
  }
  const SUBVIEW = { visao: vVisao, sugestoes: vSugestoes, rascunhos: vRascunhos, agenda: vAgenda, historico: vHistorico };

  root.PactoAura = {
    init(ctx) { A.ctx = ctx; },
    get enabled() { return A.enabled; },
    probe() { if (!A.ctx) return Promise.resolve(false); return A.ctx.need(M + 'status').then((r) => { A.enabled = !!(r && r.enabled); }, () => { A.enabled = false; }); },
    loadActive, apply: applySpecial, clear: clearSpecial,
    startPolling() { if (A.timer) return; A.timer = setInterval(() => { if (A.ctx) loadActive(); }, 5 * 60000); },
    reset() { A.enabled = false; A.data = null; A.audit = null; A.active = []; clearSpecial(); },
    view() {
      if (!A.enabled) return U.empty('shield', 'Recurso indisponível', 'Os Temas Especiais não estão disponíveis para esta conta.');
      if (!A.data && !A.loading && !A.err) reload();
      const nav = h('div', { class: 'st-subtabs row wrap', role: 'tablist' }, SUBS.map(([k, ic, l]) => h('button', { class: 'btn sm ' + (A.sub === k ? 'lime' : 'ghost'), role: 'tab', 'aria-selected': A.sub === k ? 'true' : 'false', on: { click: () => { A.sub = k; if (k === 'historico') A.audit = null; render(); } } }, icon(ic, 14), l)));
      const body = A.err ? U.empty('alert', 'Não foi possível carregar', A.err.message) : (A.data ? SUBVIEW[A.sub]() : U.skeleton(3));
      return h('div', { class: 'st-page aura' }, h('div', { class: 'aura-head' }, h('h2', { text: 'PX AURA' }), h('span', { class: 'small muted', text: 'Temas Especiais · decisão sempre sua · volta sozinho ao visual anterior' })), nav, body);
    },
    _A: A,
  };
})(self);
