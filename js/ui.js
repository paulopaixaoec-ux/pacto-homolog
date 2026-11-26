/* PACTO 8.0 · utilitários de interface.
   Renderização 100% via DOM (createElement + textContent). Nenhum dado de usuário passa por innerHTML. */
(function (root) {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple' || k === 'required') el[k] = !!v;
      else if (k.startsWith('on') && typeof v === 'function') throw new Error('use on:{}');
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false || c === true) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    kids.flat(Infinity).forEach((c) => { if (c) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return el;
  }

  /* Ícones (traço 1.75, 24×24) — caminhos constantes, nunca dados do usuário. */
  const P = {
    home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
    doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
    wallet: ['M3 7a2 2 0 0 1 2-2h12v4', 'M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z', 'M16 14h.01'],
    handshake: ['M11 17l2 2a1.4 1.4 0 0 0 2-2', 'M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2L11.7 6.6a3 3 0 0 1 3.6-.4l.5.3a2 2 0 0 0 1.4.3L21 6', 'M21 15V6', 'M3 6l3.3.7a2 2 0 0 0 1.5-.3L9 5.6', 'M3 15V6', 'M7 15l2 2a1.4 1.4 0 0 0 2-2'],
    user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
    users: ['M16 21a6 6 0 0 0-12 0', 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21a5 5 0 0 0-4-4.9', 'M16 4.1a4 4 0 0 1 0 7.8'],
    bell: ['M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
    plus: ['M12 5v14', 'M5 12h14'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'M6 6l12 12'],
    right: ['M9 18l6-6-6-6'], left: ['M15 18l-6-6 6-6'], down: ['M6 9l6 6 6-6'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
    alert: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    clip: ['M21.4 11 12.2 20.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
    moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
    chart: ['M3 3v18h18', 'M7 16v-5', 'M12 16V8', 'M17 16v-8'],
    layers: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
    msg: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    sidebar: ['M3 4h18v16H3z', 'M9 4v16'],
    swap: ['M16 3l4 4-4 4', 'M20 7H4', 'M8 21l-4-4 4-4', 'M4 17h16'],
    building: ['M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17', 'M15 9h4a1 1 0 0 1 1 1v11', 'M2 21h20', 'M8 7h3', 'M8 11h3', 'M8 15h3'],
    phone: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
    car: ['M5 17H3v-5l2-5h11l3 5h2v5h-2', 'M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0', 'M15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0', 'M5 12h14'],
    shirt: ['M20.4 6.6 16 3a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.3 1.2l1.4 3a1 1 0 0 0 1.2.5L8 10.6V20a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-9.4l2.1.7a1 1 0 0 0 1.2-.5l1.4-3a1 1 0 0 0-.3-1.2z'],
    coins: ['M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M18.1 10.4A6 6 0 1 1 10.4 18', 'M7 6h2v4'],
    briefcase: ['M3 7h18v13H3z', 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M3 13h18'],
    box: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'],
    bike: ['M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M18.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M12 17.5V14l-3-3 4-3 2 3h2'],
    laptop: ['M4 5h16v10H4z', 'M2 19h20'],
    spark: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    calendar: ['M4 5h16v16H4z', 'M16 3v4', 'M8 3v4', 'M4 11h16'],
    percent: ['M19 5 5 19', 'M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
    hash: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
    filter: ['M22 3H2l8 9.5V19l4 2v-8.5z'],
    trend: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
    camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    refresh: ['M21 12a9 9 0 0 1-15.5 6.2L3 16', 'M3 12a9 9 0 0 1 15.5-6.2L21 8', 'M21 3v5h-5', 'M3 21v-5h5'],
    globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
    key: ['M15.5 7.5a3.5 3.5 0 1 0-4.9 3.2L3 18.3V21h3v-2h2v-2h2l1.3-1.3a3.5 3.5 0 0 0 4.2-8.2z'],
    more: ['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
    mail: ['M3 5h18v14H3z', 'M3 7l9 6 9-6'],
    repeat: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
    pause: ['M7 4h3v16H7z', 'M14 4h3v16h-3z'],
    play: ['M7 4l13 8-13 8z'],
    grid: ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    week: ['M4 5h16v16H4z', 'M4 11h16', 'M9 11v10', 'M14 11v10', 'M16 3v4', 'M8 3v4'],
    scissors: ['M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M20 4 8.1 15.9', 'M14.5 14.5 20 20', 'M8.1 8.1 12 12'],
    dumbbell: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3 9v6', 'M21 9v6', 'M6.5 12h11'],
    book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
    house: ['M3 10.5 12 3l9 7.5V21H3z', 'M9 21v-6h6v6'],
    store: ['M3 9l1.5-5h15L21 9', 'M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z', 'M5 12v9h14v-9'],
    robot: ['M5 9h14v11H5z', 'M12 4v5', 'M9 14h.01', 'M15 14h.01', 'M9 17h6', 'M12 3.5a.5.5 0 1 0 0 1'],
    outbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z'],
    eyeoff: ['M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9', 'M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2', 'M1 1l22 22'],
    tag: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z', 'M7.5 7.5h.01'],
  };
  function icon(name, size = 20, cls = '') {
    const svg = s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ico ' + cls });
    (P[name] || P.box).forEach((d) => svg.appendChild(s('path', { d })));
    return svg;
  }

  /* Marca PACTO — mesma geometria de brand/pacto-mark.svg (viewBox 116×64).
     Cores por variáveis CSS (--mk-a anel esq., --mk-b anel dir., --mk-c/--mk-d metades da barra),
     então o mesmo SVG serve no claro, no escuro e sobre o petróleo. small=true: versão reduzida 16–32 px. */
  let MK_ID = 0;
  function brandMark(size = 32, { small = size <= 26, label } = {}) {
    const id = 'pmk' + (++MK_ID);
    const attrs = { class: 'brand-mark' + (small ? ' sm' : ''), width: Math.round(size * (small ? 1.6 : 1.8125)), height: size, 'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label || null, focusable: 'false' };
    if (small) {
      const svg = s('svg', Object.assign({ viewBox: '0 0 64 40' }, attrs),
        s('circle', { cx: 20, cy: 20, r: 11.3, fill: 'none', 'stroke-width': 7.4, class: 'mk-a-s' }),
        s('circle', { cx: 44, cy: 20, r: 11.3, fill: 'none', 'stroke-width': 7.4, class: 'mk-b-s' }),
        s('rect', { x: 24, y: 15.4, width: 16, height: 9.2, rx: 4.6, class: 'mk-gap' }),
        s('rect', { x: 25.6, y: 17, width: 12.8, height: 6, rx: 3, class: 'mk-b' }));
      return svg;
    }
    return s('svg', Object.assign({ viewBox: '0 0 116 64' }, attrs),
      s('defs', null, s('mask', { id }, s('rect', { width: 116, height: 64, fill: '#fff' }), s('rect', { x: 38.9, y: 25.4, width: 41.7, height: 13.2, rx: 6.6, fill: '#000' }))),
      s('g', { mask: `url(#${id})` },
        s('circle', { cx: 30, cy: 32, r: 21.2, fill: 'none', 'stroke-width': 9.6, class: 'mk-a-s ring-l' }),
        s('circle', { cx: 86, cy: 32, r: 20.8, fill: 'none', 'stroke-width': 10.4, class: 'mk-b-s ring-r' })),
      s('g', { class: 'mk-bar' },
        s('rect', { x: 40.5, y: 27, width: 22.5, height: 10, rx: 5, class: 'mk-c' }),
        s('rect', { x: 53, y: 27, width: 26, height: 10, rx: 5, class: 'mk-d' }),
        s('rect', { x: 58, y: 27, width: 21, height: 10, rx: 5, class: 'mk-d' })));
  }
  const CAT_ICON = { 'Apartamento': 'building', 'Imóvel': 'building', 'Casa': 'building', 'Veículo': 'car', 'Carro': 'car', 'Moto': 'car', 'Celular': 'phone', 'Camisa': 'shirt', 'Roupa': 'shirt', 'Empréstimo': 'coins', 'Serviço': 'briefcase', 'Bicicleta': 'bike', 'Eletrônico': 'laptop', 'Unificação': 'layers' };
  const GROUP_ICON = { pessoa: 'user', comercio: 'store', servicos: 'briefcase', beleza: 'scissors', saude: 'dumbbell', educacao: 'book', imovel: 'building', veiculo: 'car', domestico: 'house', outros: 'box' };
  const catIcon = (c, g) => CAT_ICON[c] || GROUP_ICON[g] || 'box';

  /* ---------- i18n (interface) ---------- */
  const I18N = {
    'pt-BR': { calendar: 'Agenda', clients: 'Clientes', assistant: 'Assistente', more: 'Mais', recurring: 'Recorrentes', home: 'Início', agreements: 'Acordos', payments: 'Pagamentos', negotiations: 'Negociações', profile: 'Perfil', projections: 'Projeções', notifications: 'Notificações', newAgreement: 'Novo acordo', buying: 'Comprando', selling: 'Vendendo', search: 'Buscar por título, pessoa ou categoria', all: 'Todos', save: 'Salvar', cancel: 'Cancelar', back: 'Voltar', next: 'Continuar', logout: 'Sair', lock: 'Bloquear agora', switchAccount: 'Trocar de conta', language: 'Idioma', theme: 'Aparência', light: 'Claro', dark: 'Escuro', auto: 'Automático', collapse: 'Recolher menu', activity: 'Atividade', pending: 'Pendências', open: 'Abrir', seeAll: 'Ver todos', tagline: 'O combinado tem valor.', markAll: 'Marcar todas como lidas', security: 'Segurança', prefs: 'Avisos', demo: 'Demonstração' },
    en: { calendar: 'Calendar', clients: 'Clients', assistant: 'Assistant', more: 'More', recurring: 'Recurring', home: 'Home', agreements: 'Agreements', payments: 'Payments', negotiations: 'Negotiations', profile: 'Profile', projections: 'Projections', notifications: 'Notifications', newAgreement: 'New agreement', buying: 'Buying', selling: 'Selling', search: 'Search by title, person or category', all: 'All', save: 'Save', cancel: 'Cancel', back: 'Back', next: 'Continue', logout: 'Sign out', lock: 'Lock now', switchAccount: 'Switch account', language: 'Language', theme: 'Appearance', light: 'Light', dark: 'Dark', auto: 'Automatic', collapse: 'Collapse menu', activity: 'Activity', pending: 'To do', open: 'Open', seeAll: 'See all', tagline: 'Agreements that hold value.', markAll: 'Mark all as read', security: 'Security', prefs: 'Alerts', demo: 'Demo' },
    es: { calendar: 'Agenda', clients: 'Clientes', assistant: 'Asistente', more: 'Más', recurring: 'Recurrentes', home: 'Inicio', agreements: 'Acuerdos', payments: 'Pagos', negotiations: 'Negociaciones', profile: 'Perfil', projections: 'Proyecciones', notifications: 'Notificaciones', newAgreement: 'Nuevo acuerdo', buying: 'Comprando', selling: 'Vendiendo', search: 'Buscar por título, persona o categoría', all: 'Todos', save: 'Guardar', cancel: 'Cancelar', back: 'Volver', next: 'Continuar', logout: 'Salir', lock: 'Bloquear ahora', switchAccount: 'Cambiar de cuenta', language: 'Idioma', theme: 'Apariencia', light: 'Claro', dark: 'Oscuro', auto: 'Automático', collapse: 'Contraer menú', activity: 'Actividad', pending: 'Pendientes', open: 'Abrir', seeAll: 'Ver todos', tagline: 'Lo acordado tiene valor.', markAll: 'Marcar todo como leído', security: 'Seguridad', prefs: 'Avisos', demo: 'Demostración' },
  };
  let LANG = 'pt-BR';
  const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N['pt-BR'][k] || k;
  const setLang = (l) => { LANG = I18N[l] ? l : 'pt-BR'; document.documentElement.lang = LANG; };

  /* ---------- formatação ---------- */
  const money = (cents, cur = 'BRL') => new Intl.NumberFormat(LANG, { style: 'currency', currency: cur }).format((cents || 0) / 100);
  const moneyShort = (cents, cur = 'BRL') => new Intl.NumberFormat(LANG, { style: 'currency', currency: cur, notation: Math.abs(cents) >= 10000000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(cents) >= 10000000 ? 1 : 0 }).format((cents || 0) / 100);
  const date = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(LANG, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const dateShort = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(LANG, { day: '2-digit', month: 'short' }) : '—');
  const dateTime = (iso) => (iso ? new Date(iso).toLocaleString(LANG, { dateStyle: 'short', timeStyle: 'short' }) : '—');
  function ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' });
    if (d < 60) return rtf.format(0, 'second');
    if (d < 3600) return rtf.format(-Math.round(d / 60), 'minute');
    if (d < 86400) return rtf.format(-Math.round(d / 3600), 'hour');
    if (d < 86400 * 30) return rtf.format(-Math.round(d / 86400), 'day');
    return date(iso);
  }
  const pct = (v) => new Intl.NumberFormat(LANG, { maximumFractionDigits: 2 }).format(v) + '%';
  const centsToInput = (c) => (c / 100).toFixed(2).replace('.', ',');

  /* ---------- avatar ---------- */
  const HUES = [163, 150, 172, 135, 112, 92]; // só verdes, petróleo e oliva (sem azul)
  function avatar(user, size = 40, extra = '') {
    const name = (user && user.name) || '?';
    const el = h('span', { class: 'avatar ' + extra, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' }, 'aria-hidden': 'true' });
    if (user && user.photo && /^data:image\/(png|jpeg|webp);base64,/.test(user.photo)) el.appendChild(h('img', { src: user.photo, alt: '' }));
    else {
      const hue = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
      el.style.background = `linear-gradient(135deg, hsl(${hue} 45% 38%), hsl(${hue + 14} 52% 26%))`;
      el.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    }
    return el;
  }

  /* ---------- toast, sheet ---------- */
  function toast(msg, kind = 'ok') {
    const host = document.getElementById('toasts');
    const el = h('div', { class: 'toast glass ' + kind, role: kind === 'err' ? 'alert' : 'status' }, icon(kind === 'err' ? 'alert' : 'check', 18), h('span', { text: msg }));
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, kind === 'err' ? 5200 : 3400);
  }
  let lastFocus = null;
  function sheet(title, body, { wide = false, onClose } = {}) {
    closeSheet(true);
    lastFocus = document.activeElement;
    const titleId = 'sheet-t-' + Math.random().toString(36).slice(2, 7);
    const panel = h('div', { class: ['sheet glass-strong', wide && 'wide'], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet-head' }, h('h2', { id: titleId, text: title }), h('button', { class: 'icon-btn', 'aria-label': 'Fechar', on: { click: () => closeSheet() } }, icon('x'))),
      h('div', { class: 'sheet-body' }, body));
    const bg = h('div', { class: 'sheet-bg', on: { mousedown: (e) => { if (e.target === bg) closeSheet(); } } }, panel);
    bg._onClose = onClose;
    const root = document.getElementById('sheetRoot');
    root.replaceChildren(bg);
    document.body.classList.add('has-sheet');
    requestAnimationFrame(() => { bg.classList.add('in'); const f = panel.querySelector('input,select,textarea,button:not(.icon-btn)'); (f || panel).focus({ preventScroll: true }); });
    return panel;
  }
  function closeSheet(immediate) {
    const root = document.getElementById('sheetRoot');
    const bg = root.firstChild;
    if (!bg) return;
    document.body.classList.remove('has-sheet');
    if (bg._onClose) bg._onClose();
    if (immediate) { root.replaceChildren(); return; }
    bg.classList.remove('in');
    setTimeout(() => { if (root.firstChild === bg) root.replaceChildren(); }, 280);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => {
    const root = document.getElementById('sheetRoot');
    if (!root || !root.firstChild) return;
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- pequenos componentes ---------- */
  const pill = (text, kind = '') => h('span', { class: 'pill ' + kind, text });
  function field(label, input, hint) {
    const id = input.id || 'f' + Math.random().toString(36).slice(2, 8);
    input.id = id;
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint ? h('small', { class: 'hint', text: hint }) : null);
  }
  function seg(options, value, onChange, label) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || '' });
    const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    wrap.appendChild(thumb);
    const place = () => { const b = wrap.querySelector('[aria-checked="true"]'); if (b) { thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 4}px)`; } };
    options.forEach(([v, l]) => wrap.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), on: { click: (e) => { wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); place(); onChange(v); } } }, l)));
    requestAnimationFrame(place); setTimeout(place, 120);
    new (window.ResizeObserver || function () { return { observe() {} }; })(place).observe(wrap);
    return wrap;
  }
  function toggle(label, checked, onChange, { disabled = false, badge } = {}) {
    const inp = h('input', { type: 'checkbox', role: 'switch', checked, disabled, on: { change: (e) => onChange(e.target.checked) } });
    return h('label', { class: ['toggle', disabled && 'disabled'] }, h('span', { class: 'toggle-label' }, label, badge ? pill(badge, 'muted') : null), inp, h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }));
  }
  function progress(ratio, label) {
    const r = Math.max(0, Math.min(1, ratio || 0));
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(r * 100)), 'aria-label': label || 'Progresso' }, h('span', { style: { width: (r * 100).toFixed(1) + '%' } }));
  }
  function ring(ratio, size = 64, label = '') {
    const r = (size - 8) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, ratio || 0));
    return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': label },
      s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size },
        s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-bg' }),
        s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-fg', 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` })),
      h('b', { text: Math.round(v * 100) + '%' }));
  }
  function empty(iconName, title, text, action) {
    return h('div', { class: 'empty glass' }, h('div', { class: 'empty-ico' }, icon(iconName, 28)), h('h3', { text: title }), h('p', { text }), action || null);
  }
  function skeleton(n = 3) { return h('div', { class: 'skel-list' }, Array.from({ length: n }, () => h('div', { class: 'skel glass' }, h('i'), h('i'), h('i')))); }

  root.UI = { h, s, append, icon, brandMark, catIcon, t, setLang, I18N, money, moneyShort, date, dateShort, dateTime, ago, pct, centsToInput, avatar, toast, sheet, closeSheet, pill, field, seg, toggle, progress, ring, empty, skeleton, get lang() { return LANG; } };
})(self);
