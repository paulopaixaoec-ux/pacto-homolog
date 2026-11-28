/* PACTOX estrutural · item 5 · PX PRO (Empresas) no app real.
   Só aparece com empresas_enabled=true (o servidor decide). Reaproveita o registro de áreas e o visual do protótipo.
   Identificadores técnicos (ws.*, contacts.*, routes internas) inalterados; rótulos visíveis: PX ONE / PX PRO. */
(function (root) {
  'use strict';
  const U = root.UI; if (!U) return;
  const CAT = root.PXCAT || { AREAS: [], BY_ID: {} };
  const { h, icon, brandMark, money, avatar, toast, seg } = U;

  const ST = {
    host: null, enabled: false, list: [],
    ctx: (function () { try { return sessionStorage.getItem('pacto8:ctx') || 'pessoal'; } catch { return 'pessoal'; } })(),
    area: (function () { try { return sessionStorage.getItem('pacto8:area') || null; } catch { return null; } })(),
    contacts: null, appts: null, quotes: null, wags: [], fields: {}, form: null, passo: 1, diaSel: null,
  };
  const persist = () => { try { sessionStorage.setItem('pacto8:ctx', ST.ctx); if (ST.area) sessionStorage.setItem('pacto8:area', ST.area); } catch {} };
  const api = () => ST.host && ST.host.api;
  const me = () => ST.host && ST.host.me && ST.host.me();
  const A = () => CAT.BY_ID[ST.area] || CAT.AREAS[0] || { id: 'outros', curto: 'Outros', nome: 'Outros', icone: 'grid', termos: { cliente: 'Cliente', clientes: 'Clientes', compromisso: 'Compromisso', agenda: 'Agenda' }, camposCliente: [], tiposCompromisso: [], modelo: { titulo: 'Orçamento', itens: [['Serviço', 10000]], parcelas: 1, sinal: 0 }, acoes: [], widgets: [], ferramentas: [], etapas: [] };
  const emp = () => (ST.list || []).find((w) => w.kind === 'empresas') || null;
  const pes = () => (ST.list || []).find((w) => w.kind === 'pessoal') || null;
  const active = () => !!(ST.enabled && ST.ctx === 'empresas' && emp());
  const wsId = () => emp() && emp().id;
  const areaOf = () => ST.area || (emp() && emp().profile && emp().profile.activeArea) || (emp() && emp().profile && emp().profile.areas && emp().profile.areas[0]) || 'outros';

  async function boot() {
    const a = api(); if (!a || typeof a.ws !== 'function') { ST.enabled = false; return; }
    if (!(me && me())) return; // init roda antes do login; refresh() depois da sessão é quem liga o módulo
    try {
      ST.list = await a.ws('ws.list', {});
      ST.enabled = true;
      ST.area = areaOf();
      if (ST.ctx === 'empresas' && !emp()) ST.ctx = 'pessoal';
    } catch (e) {
      if (e && e.code === 'NOT_FOUND') { ST.enabled = false; ST.list = []; if (ST.ctx === 'empresas') ST.ctx = 'pessoal'; }
      else if (e && e.code === 'UNAUTHENTICATED') return; // ainda sem sessão (ou expirou); não assusta no console
      else console.warn('PX PRO', e);
    }
  }
  const invalidate = () => { ST.contacts = ST.appts = ST.quotes = null; ST.wags = []; ST.fields = {}; };
  async function loadContacts() { if (!active()) return []; if (!ST.contacts) ST.contacts = await api().px('contacts.list', { workspaceId: wsId() }); return ST.contacts; }
  async function loadAppts(from, to) { if (!active()) return []; ST.appts = await api().px('appointments.list', { workspaceId: wsId(), from, to }); return ST.appts; }
  async function loadQuotes() { if (!active()) return []; if (!ST.quotes) ST.quotes = await api().px('quotes.list', { workspaceId: wsId() }); return ST.quotes; }

  const pillSt = { pago: ['ok', 'Pago'], analise: ['info', 'Em análise'], hoje: ['warn', 'Vence hoje'], atrasado: ['danger', 'Atrasada'], avencer: ['', 'A vencer'],
    feito: ['ok', 'Concluído'], confirmado: ['ok', 'Confirmado'], agendado: ['', 'Agendado'], cancelado: ['muted', 'Cancelado'],
    rascunho: ['', 'Rascunho'], enviado: ['info', 'Enviado'], aceito: ['ok', 'Virou acordo'], recusado: ['danger', 'Recusado'], proposed: ['info', 'Aguardando aceite'], active: ['ok', 'Ativo'] };
  const pill = (st) => { const [c, l] = pillSt[st] || ['', st]; return h('span', { class: 'pill ' + c, text: l }); };
  const card = (...kids) => h('section', { class: 'glass px-card' }, ...kids);
  const head = (t, extra) => h('div', { class: 'px-card-head' }, h('h2', { text: t }), extra || null);
  const dShort = (iso) => { const s = String(iso || '').slice(0, 10); if (!s) return '—'; return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch { return ''; } };

  function switcher() {
    if (!ST.enabled) return null;
    const on = ST.ctx === 'empresas';
    return h('button', { class: 'px-ctx-btn', title: 'Trocar entre PX ONE e PX PRO', on: { click: (e) => { e.stopPropagation(); toggleMenu(); } } },
      h('span', { class: 'px-ctx-dot ' + ST.ctx }),
      h('span', { class: 'px-ctx-txt' }, h('b', { text: on ? 'PX PRO' : 'PX ONE' }), h('small', { text: on ? (A().curto) : 'Finanças pessoais' })));
  }
  function toggleMenu() {
    const goEmp = () => {
      if (!emp()) { ST.ctx = 'empresas'; persist(); ST.host.go('#/areas'); return; }
      ST.ctx = 'empresas'; persist();
      const stay = (ST.host.go && (location.hash === '#/inicio' || location.hash === '#/experiencia' || !location.hash));
      refreshLists().then(() => { if (stay) ST.host.go('#/inicio'); ST.host.render(); });
    };
    const goPes = () => { ST.ctx = 'pessoal'; persist(); ST.host.go('#/inicio'); ST.host.render(); };
    // troca direta ao clicar (menu curto)
    if (ST.ctx === 'empresas') goPes(); else goEmp();
  }

  function experiencia() {
    const opt = (ctx, ic, kicker, nome, txt, bullets, extra) => h('button', { class: ['glass px-exp sheen lift', ST.ctx === ctx && 'on'], 'aria-pressed': String(ST.ctx === ctx), dataset: { ctx }, on: { click: () => { ST.ctx = ctx; persist(); if (ctx === 'empresas' && !emp()) ST.host.go('#/areas'); else if (ctx === 'empresas') refreshLists().then(() => { if (!location.hash || location.hash === '#/experiencia' || location.hash === '#/inicio') ST.host.go('#/inicio'); ST.host.render(); }); else ST.host.go('#/inicio'); } } },
      h('span', { class: 'px-exp-ico' }, icon(ic, 26)),
      h('span', { class: 'px-exp-name' }, h('small', { text: kicker }), nome),
      h('span', { class: 'px-exp-txt', text: txt }),
      h('ul', null, bullets.map((b) => h('li', null, icon('check', 14), b))),
      extra || null,
      h('span', { class: 'px-exp-go' }, 'Entrar no ' + nome, icon('right', 16)));
    return h('div', { class: 'px-welcome' }, h('div', { class: 'px-welcome-in' },
      h('span', { class: 'logo px-logo with-tag', role: 'img', 'aria-label': 'PACTOX' }, brandMark(46), h('span', { class: 'logo-text' }, h('span', { class: 'logo-word', text: 'PACTOX' }), h('span', { class: 'logo-tag', text: 'O combinado tem valor.' }))),
      h('h1', { text: 'Como você quer usar o PACTOX?' }),
      h('p', { class: 'px-lead', text: 'É a mesma conta e o mesmo login. Você troca quando quiser, pelo seletor no topo.' }),
      h('div', { class: 'px-exp-grid' },
        opt('pessoal', 'handshake', 'PX ONE', 'Finanças pessoais', 'Para combinar com pessoas de confiança.', ['Empréstimos e acordos entre pessoas', 'Compras e vendas parceladas', 'Parcelas, comprovantes e histórico']),
        opt('empresas', 'briefcase', 'PX PRO', 'Gestão de negócios', 'Sua secretária digital para trabalhar por conta própria.', ['Clientes, agenda e orçamentos', 'Contratos, cobranças e recebimentos', 'O acordo continua o mesmo do PACTOX'],
          h('span', { class: 'px-exp-note' }, icon('shield', 13), 'CNPJ é opcional.'))),
      h('div', { class: 'px-welcome-foot' }, icon('lock', 14), 'Os dados pessoais e os do negócio ficam separados no servidor.')));
  }

  function areasPage() {
    if (!ST.areaForm) ST.areaForm = { areas: ((emp() && emp().profile && emp().profile.areas) || []).slice(), name: (emp() && emp().name) || '', cnpj: '' };
    const F = ST.areaForm;
    const toggle = (id) => { const i = F.areas.indexOf(id); if (i >= 0) F.areas.splice(i, 1); else F.areas.push(id); ST.host.render(); };
    const save = async () => {
      try {
        if (!F.areas.length) { toast('Marque ao menos uma área.', 'err'); return; }
        if (emp()) await api().ws('ws.updateProfile', { workspaceId: emp().id, areas: F.areas, name: F.name || emp().name });
        else await api().ws('ws.createEmpresas', { name: F.name || 'Meu negócio', areas: F.areas, cnpj: F.cnpj || undefined });
        await boot(); ST.area = F.areas[0]; ST.ctx = 'empresas'; persist(); invalidate(); await refreshLists(); toast('PX PRO pronto.'); ST.host.go('#/inicio');
      } catch (e) { toast(e.message || 'Não foi possível salvar.', 'err'); }
    };
    return h('div', { class: 'px-areas' },
      h('p', { class: 'px-lead', text: 'Marque uma ou mais áreas. A tela inicial, os campos do cliente e a agenda se ajustam a cada uma.' }),
      h('div', { class: 'px-area-grid', role: 'group', 'aria-label': 'Áreas de atuação' },
        CAT.AREAS.map((a) => h('button', { class: ['glass px-area lift', F.areas.includes(a.id) && 'on'], 'aria-pressed': String(F.areas.includes(a.id)), on: { click: () => toggle(a.id) } },
          h('span', { class: 'px-area-ico' }, icon(a.icone, 22)), h('span', { class: 'px-area-check' }, icon('check', 14)),
          h('b', { text: a.nome }), h('small', { text: a.exemplo })))),
      card(head('Dados do negócio', h('span', { class: 'pill', text: 'CNPJ opcional' })),
        h('div', { class: 'px-form2' },
          h('label', null, 'Nome do negócio', h('input', { class: 'field', value: F.name, on: { input: (e) => { F.name = e.target.value; } }, placeholder: 'Ex.: Estúdio Ana' })),
          h('label', null, 'CNPJ (opcional)', h('input', { class: 'field', value: F.cnpj, on: { input: (e) => { F.cnpj = e.target.value; } }, placeholder: 'somente se houver' })))),
      h('div', { class: 'px-actions' }, h('button', { class: 'btn lime', on: { click: save } }, icon('check', 16), emp() ? 'Salvar áreas' : 'Criar espaço Empresas')));
  }

  function inicioEmpresas() {
    const a = A(), cts = ST.contacts || [], qs = ST.quotes || [], ap = ST.appts || [];
    const today = new Date(); const ini = new Date(today); ini.setHours(0, 0, 0, 0); const fim = new Date(ini); fim.setDate(fim.getDate() + 1);
    const hoje = ap.filter((x) => x.status !== 'cancelado' && new Date(x.startsAt) < fim && new Date(x.endsAt) > ini);
    const wags = ST.wags || [];
    return h('div', { class: 'px-grid' },
      h('section', { class: 'px-hero glass sheen', dataset: { area: a.id } },
        h('div', { class: 'px-hero-mark', 'aria-hidden': 'true' }, brandMark(150)),
        h('div', { class: 'px-hero-top' }, h('span', { class: 'px-hero-ico' }, icon(a.icone, 22)), h('div', null, h('small', { text: (emp() && emp().name) + ' · ' + a.nome }), h('h2', { text: 'Olá, ' + ((me() && me().name) || '') }))),
        (emp() && emp().profile && emp().profile.areas && emp().profile.areas.length > 1) ? h('div', { class: 'px-hero-areas' }, emp().profile.areas.map((id) => h('button', { class: 'chip sm', 'aria-pressed': String(id === a.id), on: { click: () => { ST.area = id; persist(); ST.host.render(); } } }, icon((CAT.BY_ID[id] || {}).icone || 'grid', 14), (CAT.BY_ID[id] || {}).curto || id))) : null,
        h('div', { class: 'px-widgets' }, h('div', { class: 'px-w' }, h('b', { class: 'num', text: String(hoje.length) }), h('span', { text: a.termos.agenda + ' hoje' })), h('div', { class: 'px-w' }, h('b', { class: 'num', text: String(cts.length) }), h('span', { text: a.termos.clientes })), h('div', { class: 'px-w' }, h('b', { class: 'num', text: String((wags || []).length) }), h('span', { text: 'Acordos deste espaço' }))),
        h('div', { class: 'px-actions' },
          h('button', { class: 'btn sm lime', on: { click: () => ST.host.go('#/agenda') } }, icon('plus', 16), 'Agendar'),
          h('button', { class: 'btn sm ghost', on: { click: () => ST.host.go('#/orcamento') } }, icon('list', 16), 'Novo orçamento'),
          h('button', { class: 'btn sm ghost', on: { click: () => ST.host.go('#/clientes') } }, icon('users', 16), a.termos.clientes))),
      card(head('Hoje', h('button', { class: 'px-link', on: { click: () => ST.host.go('#/agenda') } }, 'Ver agenda', icon('right', 14))),
        hoje.length ? h('ul', { class: 'px-list' }, hoje.map((x) => h('li', { class: 'px-row', on: { click: () => ST.host.go('#/cliente/' + x.contactId) } }, h('span', { class: 'px-time num', text: hhmm(x.startsAt) }), h('span', { class: 'px-row-main' }, h('b', { text: x.kind }), h('small', { text: x.contactName })), pill(x.status)))) : h('p', { class: 'small muted', text: 'Nenhum compromisso para hoje.' })),
      card(head('Orçamentos'), (qs.length ? h('ul', { class: 'px-list' }, qs.slice(0, 5).map((q) => h('li', { class: 'px-row', on: { click: () => { openQuote(q); ST.host.go('#/orcamento'); } } }, h('span', { class: 'px-row-main' }, h('b', { text: q.title }), h('small', { text: q.contactName })), h('span', { class: 'num', text: money(q.totalCents) }), pill(q.status)))) : h('p', { class: 'small muted', text: 'Nenhum orçamento ainda.' }))),
      h('div', { class: 'note ok' }, icon('layers', 16), 'Os acordos deste espaço usam o mesmo motor do PACTOX (aceite, parcelas, comprovantes). A contraparte vê só o acordo, nunca a ficha ou a agenda.'));
  }

  function clientes() {
    const a = A(), list = ST.contacts || [];
    const openNew = () => { ST.form = { displayName: '', email: '', phoneHint: '', tags: ['cliente'] }; ST.host.go('#/cliente/novo'); };
    return h('div', { class: 'px-stack' },
      h('div', { class: 'note ok' }, icon('handshake', 16), a.termos.clientes + ' ficam na sua Minha Rede deste espaço. Não existe busca pública.'),
      h('div', { class: 'px-actions' }, h('button', { class: 'btn lime sm', on: { click: openNew } }, icon('plus', 16), 'Novo ' + a.termos.cliente.toLowerCase())),
      card(list.length ? h('ul', { class: 'px-list' }, list.map((c) => h('li', { class: 'px-row tall', on: { click: () => ST.host.go('#/cliente/' + c.id) } }, avatar({ name: c.displayName }, 40),
        h('span', { class: 'px-row-main' }, h('b', { text: c.displayName }), h('small', { text: c.email || 'sem e-mail' })), icon('right', 16)))) : h('p', { class: 'small muted', text: 'Nenhum contato ainda.' })));
  }

  function cliente(id) {
    const a = A();
    const isNew = id === 'novo';
    const c = isNew ? (ST.form || { displayName: '', email: '', tags: ['cliente'] }) : (ST.contacts || []).find((x) => x.id === id);
    if (!isNew && !c) return h('p', { class: 'muted', text: 'Contato não encontrado.' });
    const F = isNew ? c : (ST.form && ST.form.id === id ? ST.form : (ST.form = { id, displayName: c.displayName, email: c.email || '', phoneHint: c.phoneHint || '', tags: c.tags || ['cliente'] }));
    if (!isNew && ST.fields[id] === undefined && !ST._loadingFields) {
      ST._loadingFields = true;
      api().px('contacts.fields', { workspaceId: wsId(), contactId: id }).then((r) => {
        ST.fields[id] = Array.isArray(r) ? r : [];
        ST._loadingFields = false;
        const got = ST.fields[id].find((f) => f.areaId === a.id) || { data: {}, sensitive: {} };
        if (ST.form && ST.form.id === id) {
          ST.form.data = { ...got.data, ...(ST.form.data || {}) };
          ST.form.sensitive = { ...got.sensitive, ...(ST.form.sensitive || {}) };
        }
        ST.host.render();
      }).catch(() => { ST.fields[id] = []; ST._loadingFields = false; });
    }
    const fields = (!isNew && ST.fields[id]) || [];
    const cur = fields.find((f) => f.areaId === a.id) || { data: {}, sensitive: {} };
    if (!ST.form) ST.form = F;
    if (!ST.form.data) { ST.form.data = { ...cur.data }; ST.form.sensitive = { ...cur.sensitive }; }
    const save = async () => {
      try {
        const up = await api().px('contacts.upsert', { workspaceId: wsId(), id: isNew ? undefined : id, displayName: F.displayName, email: F.email || undefined, phoneHint: F.phoneHint || undefined, tags: F.tags });
        if (a.camposCliente && a.camposCliente.length) {
          const data = {}, sensitive = {};
          a.camposCliente.forEach((f) => { const v = (ST.form.data && ST.form.data[f.k]) || ''; if (f.sensivel) sensitive[f.k] = v; else data[f.k] = v; });
          await api().px('contacts.setFields', { workspaceId: wsId(), contactId: up.id, areaId: a.id, data, sensitive });
        }
        ST.contacts = null; ST.fields = {}; ST.form = null; toast('Contato salvo.'); ST.host.go('#/cliente/' + up.id); await refreshLists(); ST.host.render();
      } catch (e) { toast(e.message, 'err'); }
    };
    return h('div', { class: 'px-grid' },
      h('section', { class: 'glass px-card px-client-head px-span' }, avatar({ name: F.displayName || '?' }, 64),
        h('div', { style: { flex: 1 } },
          h('label', null, 'Nome', h('input', { class: 'field', value: F.displayName, on: { input: (e) => { F.displayName = e.target.value; } } })),
          h('label', null, 'E-mail (para orçamento virar acordo)', h('input', { class: 'field', type: 'email', value: F.email, on: { input: (e) => { F.email = e.target.value; } } })),
          h('label', null, 'Telefone (opcional)', h('input', { class: 'field', value: F.phoneHint || '', on: { input: (e) => { F.phoneHint = e.target.value; } } }))),
        h('div', { class: 'px-actions' }, h('button', { class: 'btn lime sm', on: { click: save } }, icon('check', 16), 'Salvar'),
          !isNew ? h('button', { class: 'btn sm ghost', on: { click: () => { ST.form = { contactId: id, quote: null }; ST.host.go('#/orcamento'); } } }, icon('list', 16), 'Orçamento') : null,
          !isNew ? h('button', { class: 'btn sm ghost', on: { click: () => ST.host.go('#/agenda') } }, icon('calendar', 16), 'Agendar') : null)),
      a.camposCliente && a.camposCliente.length ? card(head('Ficha de ' + a.curto.toLowerCase()),
        h('dl', { class: 'px-dl' }, a.camposCliente.map((f) => [h('dt', null, f.label, f.sensivel ? h('span', { class: 'px-lock' }, icon('lock', 12), 'só você vê') : null),
          h('dd', null, h('input', { class: 'field', value: (f.sensivel ? (ST.form.sensitive || {})[f.k] : (ST.form.data || {})[f.k]) || '', placeholder: f.ex || '', on: { input: (e) => { if (f.sensivel) { ST.form.sensitive = ST.form.sensitive || {}; ST.form.sensitive[f.k] = e.target.value; } else { ST.form.data = ST.form.data || {}; ST.form.data[f.k] = e.target.value; } } } }))])),
        a.camposCliente.some((f) => f.sensivel) ? h('div', { class: 'note warn', style: { marginTop: '10px' } }, icon('shield', 16), 'Anote só o que o cliente informou e permitiu. Esse campo nunca vai para a outra parte nem para o PX CORE.') : null) : null);
  }

  function agenda() {
    const a = A(), list = (ST.appts || []).filter((x) => x.status !== 'cancelado');
    const byDay = {};
    list.forEach((x) => { const d = new Date(x.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); (byDay[d] = byDay[d] || []).push(x); });
    const days = Object.keys(byDay).sort();
    const F = ST.form && ST.form.appt ? ST.form : (ST.form = { appt: true, contactId: (ST.contacts && ST.contacts[0] && ST.contacts[0].id) || '', kind: a.tiposCompromisso[0] || 'Compromisso', start: '', dur: 60 });
    const save = async () => {
      try {
        if (!F.contactId || !F.start) { toast('Escolha o contato e o horário.', 'err'); return; }
        const start = new Date(F.start);
        const end = new Date(start.getTime() + (Number(F.dur) || 60) * 60000);
        await api().px('appointments.upsert', { workspaceId: wsId(), contactId: F.contactId, areaId: a.id, kind: F.kind || 'Compromisso', startsAt: start.toISOString(), endsAt: end.toISOString() });
        ST.appts = null; ST.form = null; toast('Compromisso agendado.'); await refreshLists(); ST.host.render();
      } catch (e) { toast(e.message, 'err'); }
    };
    return h('div', { class: 'px-stack' },
      h('div', { class: 'px-legend' }, (a.tiposCompromisso || []).map((t) => h('span', { class: 'chip sm', text: t }))),
      card(head('Agendar ' + a.termos.compromisso.toLowerCase()),
        h('div', { class: 'px-form2' },
          h('label', null, a.termos.cliente, h('select', { class: 'field', on: { change: (e) => { F.contactId = e.target.value; } } },
            h('option', { value: '', text: 'Escolha…' }), ...(ST.contacts || []).map((c) => h('option', { value: c.id, selected: c.id === F.contactId || null, text: c.displayName })))),
          h('label', null, 'Tipo', h('input', { class: 'field', value: F.kind, on: { input: (e) => { F.kind = e.target.value; } } })),
          h('label', null, 'Início', h('input', { class: 'field', type: 'datetime-local', value: F.start, on: { input: (e) => { F.start = e.target.value; } } })),
          h('label', null, 'Duração (min)', h('input', { class: 'field', type: 'number', value: String(F.dur), on: { input: (e) => { F.dur = e.target.value; } } }))),
        h('div', { class: 'px-actions' }, h('button', { class: 'btn lime sm', on: { click: save } }, icon('plus', 16), 'Agendar'))),
      card(head(a.termos.agenda), days.length ? days.map((d) => h('div', { class: 'px-day' }, h('div', { class: 'px-day-h' }, h('b', { text: dShort(d) })),
        h('ul', { class: 'px-list' }, byDay[d].map((x) => h('li', { class: 'px-row', on: { click: () => ST.host.go('#/cliente/' + x.contactId) } }, h('span', { class: 'px-time num', text: hhmm(x.startsAt) }), h('span', { class: 'px-row-main' }, h('b', { text: x.kind }), h('small', { text: x.contactName })), pill(x.status)))))) : h('p', { class: 'small muted', text: 'Nenhum compromisso neste período.' })));
  }

  function openQuote(q) {
    if (!q) return;
    const passo = q.status === 'aceito' ? 4 : q.status === 'enviado' ? 2 : q.status === 'rascunho' ? 1 : 2;
    ST.passo = passo;
    ST.form = { quoteReady: true, contactId: q.contactId, title: q.title, items: q.items || [], installments: q.installments, downPaymentCents: q.downPaymentCents || 0, firstDue: q.firstDue || '', passo, current: q, agreement: q.agreementId ? { id: q.agreementId, status: q.status === 'aceito' ? 'proposed' : '' } : null };
  }

  function orcamento() {
    const a = A();
    const F = (ST.form && ST.form.quoteReady) ? ST.form : (ST.form = {
      quoteReady: true, contactId: (ST.form && ST.form.contactId) || (ST.contacts && ST.contacts[0] && ST.contacts[0].id) || '',
      title: a.modelo.titulo, items: (a.modelo.itens || [['Serviço', 10000]]).map(([l, c]) => ({ label: l, cents: c })),
      installments: a.modelo.parcelas || 3, downPaymentCents: a.modelo.sinal || 0, firstDue: '', passo: ST.passo || 1, current: null,
    });
    const total = F.items.reduce((s, i) => s + (Number(i.cents) || 0), 0);
    const contact = (ST.contacts || []).find((c) => c.id === F.contactId);
    const goStep = (n) => { F.passo = n; ST.passo = n; ST.host.render(); };
    const enviar = async () => {
      try {
        if (!F.contactId) { toast('Escolha o cliente.', 'err'); return; }
        if (!F.firstDue) { toast('Informe o primeiro vencimento.', 'err'); return; }
        const q = await api().px('quotes.upsert', { workspaceId: wsId(), contactId: F.contactId, areaId: a.id, title: F.title, items: F.items, installments: Number(F.installments) || 1, downPaymentCents: Number(F.downPaymentCents) || 0, firstDue: F.firstDue, downDue: F.downPaymentCents ? F.firstDue : undefined });
        const sent = await api().px('quotes.send', { workspaceId: wsId(), quoteId: q.id });
        F.current = sent; ST.quotes = null; goStep(2); toast('Orçamento enviado (ainda não é dívida).');
      } catch (e) { toast(e.message, 'err'); }
    };
    const virar = async () => {
      try {
        const r = await api().px('quotes.toAgreement', { workspaceId: wsId(), quoteId: F.current.id });
        F.current = r.quote; F.agreement = r.agreement; ST.quotes = null; goStep(4); toast('Virou acordo. A outra parte ainda precisa aceitar.');
      } catch (e) { toast(e.message, 'err'); }
    };
    const steps = ['Orçamento', 'Enviado', 'Gerar acordo', 'Acordo'];
    const stepper = h('ol', { class: 'px-stepper' }, steps.map((s, i) => h('li', { class: [i + 1 < F.passo && 'done', i + 1 === F.passo && 'cur'] }, h('i', null, i + 1 < F.passo ? icon('check', 12) : String(i + 1)), h('span', { text: s }))));
    const itens = h('table', { class: 'px-table' }, h('tbody', null, F.items.map((it) => h('tr', null, h('td', { text: it.label }), h('td', { class: 'num', text: money(it.cents) }))), h('tr', { class: 'tot' }, h('td', { text: 'Total' }), h('td', { class: 'num', text: money(total) }))));
    let body;
    if (F.passo === 1) body = [
      h('div', { class: 'px-form2' },
        h('label', null, a.termos.cliente, h('select', { class: 'field', on: { change: (e) => { F.contactId = e.target.value; } } }, h('option', { value: '', text: 'Escolha…' }), ...(ST.contacts || []).map((c) => h('option', { value: c.id, selected: c.id === F.contactId || null, text: c.displayName + (c.email ? '' : ' (sem e-mail)') })))),
        h('label', null, 'Título', h('input', { class: 'field', value: F.title, on: { input: (e) => { F.title = e.target.value; } } })),
        h('label', null, 'Parcelas', h('input', { class: 'field', type: 'number', value: String(F.installments), on: { input: (e) => { F.installments = e.target.value; } } })),
        h('label', null, 'Primeiro vencimento', h('input', { class: 'field', type: 'date', value: F.firstDue, on: { input: (e) => { F.firstDue = e.target.value; } } }))),
      itens, h('div', { class: 'px-actions' }, h('button', { class: 'btn lime', on: { click: enviar } }, 'Enviar orçamento', icon('right', 16)))];
    else if (F.passo === 2) body = [h('div', { class: 'note ok' }, icon('clock', 16), 'Orçamento enviado. Nada é cobrado antes do aceite do acordo. A contraparte não vê este orçamento, só o acordo quando ele for gerado.'), itens, h('div', { class: 'px-actions' }, h('button', { class: 'btn lime', on: { click: () => goStep(3) } }, 'Gerar o acordo', icon('right', 16)))];
    else if (F.passo === 3) body = [h('div', { class: 'note ok' }, icon('layers', 16), 'Isso chama o mesmo createAgreement da 8.2 e coloca o acordo neste espaço Empresas. A outra parte aceita pelo fluxo usual (com verificação em duas etapas).'), itens, h('div', { class: 'px-actions' }, h('button', { class: 'btn lime', on: { click: virar } }, 'Gerar acordo', icon('right', 16)))];
    else body = [
      h('div', { class: 'px-agree glass' }, h('div', { class: 'px-agree-h' }, brandMark(26), h('div', null, h('b', { text: F.title }), h('small', { text: 'Acordo ' + (F.agreement && F.agreement.id || '') + ' · ' + (contact && contact.displayName || '') }))), pill((F.agreement && F.agreement.status) || 'proposed')),
      h('div', { class: 'note ok' }, icon('handshake', 16), 'É o mesmo acordo do PACTOX. Ele aparece no PX PRO para você e no PX ONE (Pessoal) para a outra parte, até ela escolher outro contexto.'),
      h('div', { class: 'px-actions' }, h('button', { class: 'btn ghost', on: { click: () => ST.host.go('#/acordo/' + (F.agreement && F.agreement.id)) } }, 'Abrir o acordo'), h('button', { class: 'btn ghost', on: { click: () => { ST.form = null; ST.passo = 1; ST.host.go('#/orcamento'); } } }, 'Novo orçamento'))];
    return h('div', { class: 'px-stack px-narrow' }, stepper, card(head(F.title), h('div', { class: 'small muted', style: { margin: '-6px 0 12px' }, text: contact ? ('Para ' + contact.displayName) : 'Escolha o cliente' }), body));
  }

  async function refreshLists() {
    if (!active()) return;
    const now = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 1);
    const to = new Date(now); to.setDate(to.getDate() + 21);
    try {
      const jobs = [loadContacts(), loadAppts(from.toISOString(), to.toISOString()), loadQuotes()];
      const wags = api().ws('ws.agreements', { workspaceId: wsId() }).then((r) => { ST.wags = r || []; });
      await Promise.all([...jobs, wags]);
    } catch (e) { console.warn(e); }
  }

  const PAGES = { experiencia: () => ({ title: 'Como você quer usar o PACTOX?', sub: 'PX ONE ou PX PRO · mesma conta', content: experiencia(), bare: true }),
    areas: () => ({ title: 'Áreas de atuação', sub: 'PX PRO · personalize sua tela', content: areasPage() }),
    inicio: () => ({ title: A().curto, sub: 'PX PRO · ' + (emp() && emp().name || 'Gestão de negócios'), content: inicioEmpresas() }),
    clientes: () => ({ title: A().termos.clientes, sub: 'Contatos da sua Minha Rede neste espaço', content: clientes() }),
    cliente: (id) => ({ title: id === 'novo' ? 'Novo contato' : 'Ficha', sub: A().termos.cliente + ' · ' + A().curto, content: cliente(id) }),
    agenda: () => ({ title: A().termos.agenda, sub: 'Compromissos deste espaço · fuso de Brasília', content: agenda() }),
    orcamento: () => ({ title: 'Orçamento → acordo', sub: 'O orçamento preenche o acordo comum do PACTOX', content: orcamento() }),
  };

  root.PactoEmpresas = {
    init(host) { ST.host = host; if (host.me && host.me()) boot().then(() => host.render && host.render(), () => {}); },
    refresh() { return boot().then(refreshLists); },
    reset() { ST.enabled = false; ST.list = []; ST.contacts = ST.appts = ST.quotes = null; ST.wags = []; ST.fields = {}; ST.form = null; ST.areaForm = null; ST.passo = 1; ST.ctx = 'pessoal'; try { sessionStorage.setItem('pacto8:ctx', 'pessoal'); } catch {} },
    get enabled() { return ST.enabled; },
    get active() { return active(); },
    get ctx() { return ST.ctx; },
    enterEmpresas() { if (!ST.enabled || !emp()) return false; ST.ctx = 'empresas'; persist(); return true; },
    switcher,
    handles(page) {
      if (!ST.enabled) return false;
      if (page === 'experiencia' || page === 'areas') return true;
      return active() && ['inicio', 'clientes', 'cliente', 'agenda', 'orcamento'].includes(page);
    },
    page(page, id) {
      const fn = PAGES[page] || PAGES.inicio;
      return fn(id);
    },
    moreItems() {
      if (!active()) return ST.enabled ? [['experiencia', 'swap', 'PX ONE / PX PRO', 'Trocar a experiência']] : [];
      const a = A();
      return [['agenda', 'calendar', a.termos.agenda, 'Compromissos deste espaço'], ['orcamento', 'list', 'Orçamentos', 'Vira o acordo comum do PACTOX'], ['areas', 'grid', 'Áreas de atuação', 'Personalize o PX PRO'], ['experiencia', 'swap', 'Trocar para PX ONE', 'Finanças pessoais']];
    },
  };
})(self);
