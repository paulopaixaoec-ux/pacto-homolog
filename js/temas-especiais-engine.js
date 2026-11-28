/* PACTOX · PX AURA (Temas Especiais) — motor de regras. Origem: pactox-temas-especiais-wip @ 2c6cf4f (reaproveitado; única mudança: grafia da assinatura).
   Roda no servidor (functions/pacto-api/aura.js, sobre o estado lido do banco) e no cliente (só prévia).
   Nenhum tema é ativado automaticamente. Publicação exige aprovação expressa do fundador. */
(function (root) {
  'use strict';
  const Theme = (typeof module !== 'undefined' && module.exports)
    ? (root.PactoStudioTheme || require('./studio-theme-lib.js'))
    : root.PactoStudioTheme;

  const FLAG = 'studio_special_themes_enabled';
  const CATEGORIES = {
    nacionais: 'Datas comemorativas nacionais',
    internacionais: 'Datas comemorativas internacionais',
    culturais_sazonais: 'Eventos culturais e sazonais',
    marcos_pactox: 'Aniversário e marcos do PACTOX',
    campanhas_fundador: 'Campanhas próprias do fundador',
  };
  /* Locais de exibição do tema especial (distintos do escopo 'pessoal' dos temas tradicionais do fundador). */
  const SCOPES = ['app_pessoal', 'app_empresas', 'site_publico', 'convites', 'studio'];
  const SCOPE_LABEL = {
    app_pessoal: 'Pessoal',
    app_empresas: 'Empresas',
    site_publico: 'Site institucional',
    convites: 'Convites',
    studio: 'Ambiente administrativo',
  };
  const MESSAGE_SURFACES = ['pessoal', 'empresas', 'invite', 'site', 'studio'];
  const MESSAGE_SURFACE_LABEL = { pessoal: 'Pessoal', empresas: 'Empresas', invite: 'Convites', site: 'Site institucional', studio: 'Ambiente administrativo' };
  const SIGNATURE_TEXT = 'powered by HINGABEXIT';   // item 6: grafia oficial da Assinatura v2 (HINGABEXIT em maiúsculas)
  const SLOGAN = 'O combinado tem valor';
  const GENERIC_MESSAGES = ['feliz natal!', 'feliz natal', 'boas festas!', 'boas festas', 'feliz ano novo!', 'feliz ano novo', 'merry christmas', 'happy new year', 'congratulations'];
  const SNOOZE_DAYS = 7;
  const ISO_3166_1 = /^[A-Z]{2}$/;
  const ISO_3166_2 = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
  const BCP_47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;
  const IANA_TZ = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?$/;
  const DEFAULT_TZ = 'America/Sao_Paulo';
  const DEFAULT_LOCALE = 'pt-BR';
  const SENSITIVITY = ['cultural', 'religious', 'seasonal', 'national-civic', 'regional', 'brand'];
  const COVERAGE = ['national', 'regional'];
  /* Pacotes de calendário plugáveis. Só o do Brasil está carregado; outros países entram depois, sem i18n agora. */
  const PACKS = {
    BR: { country: 'BR', name: 'Brasil', locales: ['pt-BR'], defaultLocale: 'pt-BR', defaultTimeZone: 'America/Sao_Paulo', regions: [] },
  };
  const COUNTRIES = Object.keys(PACKS);
  const AUDIENCES = ['pais'];
  const AUDIENCE_LABEL = { pais: 'Público do país' };
  const PROTECTED_ZONES = ['valor', 'parcela', 'botao_pagamento', 'documento', 'alerta_seguranca'];
  const SAFE_PLACEMENTS = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'margin-top', 'margin-bottom', 'background-wash'];
  const ASSETS = ['flake-discreet', 'glow-corner', 'garland-thin', 'spark-soft', 'confetti-still', 'ribbon-corner'];
  const USER_PREF_KEYS = ['pacto8:theme', 'pacto8:ui:collapsed', 'pacto8:homeRole', 'pacto8:discreet', 'pacto:tema-original'];
  const SENSITIVE = new Set(['approve', 'reject', 'schedule', 'activate', 'deactivate', 'restore', 'publish']);
  const OCCASION_ONCE = 'once_per_occasion';

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const iso = (d) => new Date(d).toISOString();
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
  const packOf = (country) => PACKS[country] || null;
  const loadedPacks = () => Object.keys(PACKS);
  const defaultTimeZoneFor = (country) => (packOf(country) && packOf(country).defaultTimeZone) || DEFAULT_TZ;

  function tzOffsetMinutes(timeZone, date) {
    const label = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', year: 'numeric' }).formatToParts(date).find((p) => p.type === 'timeZoneName');
    const m = label && label.value.match(/([+\-])(\d{1,2})(?::?(\d{2}))/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  }
  /* Interpreta data civil no fuso IANA informado e devolve o instante UTC (ms). */
  function zonedCivilToUtcMs(civil, timeZone) {
    const tz = timeZone || DEFAULT_TZ;
    if (!civil) return NaN;
    const s = String(civil);
    if (/[zZ]$/.test(s) || /[+\-]\d{2}:\d{2}$/.test(s)) return Date.parse(s);
    const [date, time = '00:00:00'] = s.split('T');
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm, ss] = (time.length === 5 ? time + ':00' : time).split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, hh, mm, ss || 0);
    let off = tzOffsetMinutes(tz, new Date(guess));
    let utc = guess - off * 60000;
    const off2 = tzOffsetMinutes(tz, new Date(utc));
    if (off2 !== off) utc = guess - off2 * 60000;
    return utc;
  }
  function zonedToIso(civil, timeZone) {
    const ms = zonedCivilToUtcMs(civil, timeZone);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  function sameInstant(a, b, timeZone) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return zonedCivilToUtcMs(a, timeZone) === zonedCivilToUtcMs(b, timeZone);
  }
  function campaignSnapshot(draft) {
    const country = draft.country || (draft.countries && draft.countries[0]) || 'BR';
    return {
      name: draft.name || '',
      tokens: draft.tokens || {},
      tokensDark: draft.tokensDark || {},
      decorations: draft.decorations || [],
      messages: draft.messages || {},
      scopes: [...(draft.scopes || [])].sort(),
      country,
      countries: [country],
      regions: [...(draft.regions || [])].sort(),
      locale: draft.locale || defaultLocaleOf(country),
      timeZone: draft.timeZone || defaultTimeZoneFor(country),
      audiences: [...(draft.audiences || [])].sort(),
      proposedStartAt: draft.proposedStartAt || null,
      proposedEndAt: draft.proposedEndAt || null,
      manualNoEndException: !!draft.manualNoEndException,
      acceptedMessages: Object.fromEntries(Object.entries(draft.acceptedMessages || {}).sort()),
    };
  }
  function defaultLocaleOf(country) { return (packOf(country) && packOf(country).defaultLocale) || DEFAULT_LOCALE; }
  function fingerprint(draft) { return JSON.stringify(campaignSnapshot(draft)); }

  function occasionKey(occasionId, year) { return occasionId + ':' + year; }

  function normalizeMessages(messages) {
    const out = { ...(messages || {}) };
    if (out.app && !out.pessoal) out.pessoal = out.app;
    delete out.app;
    return out;
  }
  function syncAcceptedMessages(draft) {
    draft.messages = normalizeMessages(draft.messages);
    const acc = draft.acceptedMessages || {};
    const next = {};
    for (const [k, v] of Object.entries(draft.messages || {})) {
      if (typeof v === 'string' && v && acc[k] === v) next[k] = v;
    }
    draft.acceptedMessages = next;
    return draft;
  }
  function normMsg(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function isGenericMessage(text) {
    const n = normMsg(text);
    if (!n) return false;
    return GENERIC_MESSAGES.includes(n);
  }
  function reviewMessages(state, draft, { ignorePublicationId } = {}) {
    const errs = [];
    const msgs = normalizeMessages(draft.messages);
    const acc = draft.acceptedMessages || {};
    for (const [k, v] of Object.entries(msgs)) {
      if (!MESSAGE_SURFACES.includes(k)) { errs.push('mensagem em superfície desconhecida: ' + k); continue; }
      if (typeof v !== 'string' || !v.trim()) continue;
      if (acc[k] !== v) errs.push('a mensagem de ' + (MESSAGE_SURFACE_LABEL[k] || k) + ' precisa ser revista e aceita nesta versão');
      if (isGenericMessage(v)) errs.push('mensagem de ' + (MESSAGE_SURFACE_LABEL[k] || k) + ': evite frases genéricas e repetitivas; o tom deve respeitar “O combinado tem valor”');
    }
    const used = new Set();
    for (const pub of state.publications || []) {
      if (ignorePublicationId && pub.id === ignorePublicationId) continue;
      if (!['approved', 'scheduled', 'active'].includes(pub.status)) continue;
      const snapMsgs = (pub.approvedSnapshot && pub.approvedSnapshot.messages) || {};
      for (const v of Object.values(snapMsgs)) {
        if (v) used.add(normMsg(v));
      }
    }
    for (const [k, v] of Object.entries(msgs)) {
      if (!v || acc[k] !== v) continue;
      const n = normMsg(v);
      if (used.has(n)) errs.push('mensagem de ' + (MESSAGE_SURFACE_LABEL[k] || k) + ': este texto já foi aprovado em outra campanha; escolha uma variação');
    }
    return { ok: errs.length === 0, errors: errs };
  }
  function acceptMessage(state, draftId, surface, text) {
    const draft = state.drafts.find((d) => d.id === draftId);
    if (!draft) return { ok: false, message: 'rascunho não encontrado' };
    if (!MESSAGE_SURFACES.includes(surface)) return { ok: false, message: 'superfície de mensagem desconhecida' };
    const value = String(text == null ? ((draft.messages || {})[surface] || '') : text);
    if (looksUnsafe(value) || /https?:\/\//i.test(value)) return { ok: false, message: 'mensagem: sem HTML ou URL' };
    if (value && isGenericMessage(value)) return { ok: false, message: 'evite frases genéricas e repetitivas; o tom deve respeitar “O combinado tem valor”' };
    const messages = normalizeMessages({ ...(draft.messages || {}), [surface]: value });
    const acceptedMessages = { ...(draft.acceptedMessages || {}), [surface]: value };
    return updateDraft(state, draftId, { messages, acceptedMessages });
  }
  function acceptAllSuggestedMessages(state, draftId) {
    const draft = state.drafts.find((d) => d.id === draftId);
    if (!draft) return { ok: false, message: 'rascunho não encontrado' };
    const messages = normalizeMessages(draft.messages);
    const acceptedMessages = { ...(draft.acceptedMessages || {}) };
    for (const [k, v] of Object.entries(messages)) {
      if (v && !isGenericMessage(v)) acceptedMessages[k] = v;
    }
    return updateDraft(state, draftId, { messages, acceptedMessages });
  }
  function suggestMessageAlternatives(base, surface) {
    const seed = String((base && (base[surface] || base.pessoal || base.site)) || '').trim();
    const alts = [
      'O combinado tem valor.',
      seed && seed !== 'O combinado tem valor.' ? seed : null,
      'O combinado, com clareza, tem valor.',
    ].filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const a of alts) {
      const n = normMsg(a);
      if (seen.has(n) || isGenericMessage(a)) continue;
      seen.add(n);
      out.push(a);
    }
    return out;
  }
  function signatureStyle(tokens, mode) {
    const t = tokens || (Theme.DEF[mode || 'light']);
    const bg = t['--paper'] || t['--offwhite'] || (mode === 'dark' ? '#0c1f1c' : '#f5f4ee');
    const ink = t['--ink'] || t['--ink-2'] || (mode === 'dark' ? '#eefaf5' : '#0c2a26');
    const muted = t['--ink-2'] || ink;
    const paper = t['--offwhite'] || t['--paper'] || (mode === 'dark' ? '#081614' : '#fbfaf6');
    const candidates = [ink, muted, paper, '#0c2a26', '#eefaf5', '#16332e', '#d7efe6'];
    let best = candidates[0], bestR = -1;
    for (const c of candidates) {
      if (!c || !/^#[0-9a-fA-F]{6}$/.test(c)) continue;
      const r = Theme.contrast(c, bg);
      if (r >= 4.5) return { text: SIGNATURE_TEXT, color: c, background: bg, contrast: r, ok: true, placement: 'margin-bottom', zoneSafe: true };
      if (r > bestR) { bestR = r; best = c; }
    }
    return { text: SIGNATURE_TEXT, color: best, background: bg, contrast: bestR, ok: bestR >= 4.5, placement: 'margin-bottom', zoneSafe: true };
  }
  function listSuggestionBlocks(state) {
    const occasions = Object.entries((state.blocks && state.blocks.occasions) || {}).map(([key, row]) => ({ type: 'occasion', key, ...row }));
    const categories = Object.entries((state.blocks && state.blocks.categories) || {}).map(([key, row]) => ({ type: 'category', key, ...row }));
    const snoozed = (state.suggestions || []).filter((s) => s.status === 'snoozed' && s.snoozeUntil && new Date(s.snoozeUntil) > new Date(state.now))
      .map((s) => ({ type: 'snooze', key: s.occasionKey, suggestionId: s.id, until: s.snoozeUntil }));
    return { occasions, categories, snoozed, all: [...snoozed, ...occasions, ...categories] };
  }
  function unblockOccasion(state, key) {
    if (state.blocks && state.blocks.occasions) delete state.blocks.occasions[key];
    for (const sug of state.suggestions) {
      if (sug.occasionKey === key && sug.status === 'dismissed' && sug.blockType === 'occasion') {
        sug.status = 'open'; sug.blockType = null; sug.dismissedAt = null;
      }
    }
    audit(state, 'special_theme.unblock_occasion', 'ok', { themeId: key });
    return { ok: true };
  }
  function unblockCategory(state, key) {
    if (state.blocks && state.blocks.categories) delete state.blocks.categories[key];
    for (const sug of state.suggestions) {
      const cat = state.catalog.find((c) => c.id === sug.catalogId);
      if (cat && cat.category === key && sug.status === 'dismissed' && sug.blockType === 'category') {
        sug.status = 'open'; sug.blockType = null; sug.dismissedAt = null;
      }
    }
    audit(state, 'special_theme.unblock_category', 'ok', { themeId: key });
    return { ok: true };
  }
  function clearSnooze(state, suggestionId) {
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return { ok: false, message: 'sugestão não encontrada' };
    sug.status = 'open'; sug.snoozeUntil = null;
    audit(state, 'special_theme.clear_snooze', 'ok', { themeId: sug.catalogId });
    return { ok: true, suggestion: sug };
  }
  function findConflicts(state, pub) {
    const out = [];
    if (!pub) return out;
    for (const other of state.publications) {
      if (other.id === pub.id) continue;
      if (!['approved', 'scheduled', 'active'].includes(other.status)) continue;
      const share = (other.scopes || []).some((s) => (pub.scopes || []).includes(s));
      if (share && overlap(pub.startAt, pub.endAt, other.startAt, other.endAt)) out.push(other);
    }
    return out;
  }


  function emptyState(now, flagOn) {
    return {
      flag: { [FLAG]: !!flagOn },
      now: now || '2026-11-27T17:13:00-03:00',
      catalog: [],
      suggestions: [],
      drafts: [],
      publications: [],
      audit: [],
      snapshots: {},
      userPrefs: { theme: 'light', reduceMotion: false, keys: { 'pacto8:theme': 'light', 'pacto8:ui:collapsed': '0', 'pacto8:homeRole': 'buyer', 'pacto8:discreet': '0' } },
      founderPersonal: { light: null, dark: null },
      calendarPack: 'BR',
      timeZone: DEFAULT_TZ,
      blocks: { occasions: {}, categories: {} },
      session: { founder: true, aal2: true, totpFresh: true, mfaEnrolled: true, actorId: '00000000-0000-4000-a000-000000000001', actorName: 'Dexter [TESTE]' },
    };
  }

  function authorize(state, action) {
    const s = state.session || {};
    if (!s.founder) return { ok: false, code: 'NOT_FOUNDER', message: 'Somente o fundador, reconhecido pelo identificador permanente no servidor, pode autorizar alterações públicas.' };
    if (!s.mfaEnrolled || !s.aal2) return { ok: false, code: 'MFA_REQUIRED', message: 'O Studio exige verificação em duas etapas (AAL2).' };
    if (SENSITIVE.has(action) && !s.totpFresh) return { ok: false, code: 'STEPUP', message: 'Confirme com o código do autenticador para esta ação sensível.' };
    if (action === 'publish' && !state.flag[FLAG]) return { ok: false, code: 'FLAG_OFF', message: 'A flag studio_special_themes_enabled está desligada. Nada é publicado.' };
    return { ok: true };
  }

  function audit(state, action, result, extra) {
    const row = {
      id: uid('aud'),
      at: iso(state.now),
      actorId: (state.session && state.session.actorId) || null,
      actorName: (state.session && state.session.actorName) || null,
      action,
      result,
      version: extra && extra.version != null ? extra.version : null,
      scopes: (extra && extra.scopes) || [],
      countries: (extra && extra.countries) || [],
      audiences: (extra && extra.audiences) || [],
      startAt: (extra && extra.startAt) || null,
      endAt: (extra && extra.endAt) || null,
      themeId: (extra && extra.themeId) || null,
      justification: (extra && extra.justification) || null,
      reason: (extra && extra.reason) || null,
    };
    state.audit.unshift(row);
    return row;
  }

  function looksUnsafe(value) {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return /<script|<\/?[a-z][\s\S]*>|javascript:|data:text\/html|expression\s*\(|url\s*\(\s*['"]?\s*https?:|@import|eval\s*\(|Function\s*\(/i.test(s || '');
  }

  function validateSpecialTheme(spec, mode) {
    const errs = [];
    if (!spec || typeof spec !== 'object') return { ok: false, errors: ['especificação inválida'] };
    if (looksUnsafe(spec)) return { ok: false, errors: ['a especificação não pode conter CSS, JavaScript, HTML ou URL externa'] };
    const tokens = spec.tokens || {};
    const tv = Theme.validateThemeTokens(tokens, mode || 'light');
    if (!tv.ok) errs.push(...tv.errors);
    if (spec.css != null || spec.javascript != null || spec.js != null || spec.style != null || spec.stylesheet != null) {
      errs.push('CSS ou JavaScript arbitrário não é permitido; use apenas tokens declarativos');
    }
    if (spec.externalResources || spec.cdn || spec.href) errs.push('recursos externos não aprovados não são permitidos');
    if (spec.logo && spec.logo !== 'official') errs.push('o logotipo oficial do PACTOX deve ser preservado (logo: official)');
    const decos = spec.decorations || [];
    if (!Array.isArray(decos) || decos.length > 6) errs.push('decorações: no máximo 6 itens da lista branca');
    for (const d of decos) {
      if (!d || typeof d !== 'object') { errs.push('decoração inválida'); continue; }
      if (!ASSETS.includes(d.asset)) errs.push(`recurso não aprovado: ${d.asset}`);
      if (d.src || d.href || d.url || (typeof d.asset === 'string' && /^https?:/i.test(d.asset))) errs.push('decorações só podem usar arquivos locais da lista branca');
      if (!SAFE_PLACEMENTS.includes(d.placement)) errs.push(`posição inválida: ${d.placement}`);
      const zones = d.zones || [];
      if (zones.some((z) => PROTECTED_ZONES.includes(z))) errs.push('a decoração não pode incidir sobre valores, parcelas, botões de pagamento, documentos ou alertas de segurança');
      if (d.motion && !['none', 'gentle'].includes(d.motion)) errs.push('movimento: none ou gentle');
    }
    const msgs = normalizeMessages(spec.messages || {});
    for (const [k, v] of Object.entries(msgs)) {
      if (!MESSAGE_SURFACES.includes(k)) errs.push(`mensagem em superfície desconhecida: ${k}`);
      if (typeof v !== 'string' || v.length > 80) errs.push(`mensagem ${k}: texto de no máximo 80 caracteres`);
      if (looksUnsafe(v) || /https?:\/\//i.test(v || '')) errs.push(`mensagem ${k}: sem HTML ou URL`);
    }
    if (spec.signature && spec.signature.placement && !SAFE_PLACEMENTS.includes(spec.signature.placement) && spec.signature.placement !== 'margin-bottom') {
      errs.push('a assinatura tecnológica não pode incidir sobre zonas protegidas');
    }
    if (spec.signature && (spec.signature.zones || []).some((z) => PROTECTED_ZONES.includes(z))) {
      errs.push('a assinatura tecnológica não pode incidir sobre valores, parcelas, botões de pagamento, documentos ou alertas de segurança');
    }
    const scopes = spec.scopes || [];
    if (scopes.some((s) => !SCOPES.includes(s))) errs.push('escopo desconhecido');
    const country = spec.country || (spec.countries && spec.countries[0]) || null;
    const countries = spec.countries && spec.countries.length ? spec.countries : (country ? [country] : []);
    for (const c of countries) {
      if (!ISO_3166_1.test(c)) errs.push('país: use ISO 3166-1 alpha-2 (ex.: BR)');
      else if (!packOf(c)) errs.push('pacote de calendário não carregado para ' + c + ' (neste momento só o pacote BR existe)');
    }
    const regions = spec.regions || [];
    for (const r of regions) {
      if (!ISO_3166_2.test(r)) errs.push('região: use ISO 3166-2 (ex.: BR-SP)');
      else if (country && !r.startsWith(country + '-')) errs.push('região deve pertencer ao país ' + country);
    }
    if (spec.locale && !BCP_47.test(spec.locale)) errs.push('idioma/localidade: use BCP 47 (ex.: pt-BR)');
    const pack = country && packOf(country);
    if (spec.locale && pack && pack.locales && !pack.locales.includes(spec.locale)) errs.push('localidade fora do pacote ' + country);
    const tz = spec.timeZone || (pack && pack.defaultTimeZone) || DEFAULT_TZ;
    if (!IANA_TZ.test(tz)) errs.push('fuso horário: use um identificador IANA (ex.: America/Sao_Paulo)');
    if (spec.coverage && !COVERAGE.includes(spec.coverage)) errs.push('abrangência: national ou regional');
    if (spec.coverage === 'regional' && !regions.length) errs.push('data regional exige ao menos uma região ISO 3166-2');
    const tags = spec.sensitivity || [];
    if (tags.some((x) => !SENSITIVITY.includes(x))) errs.push('etiqueta cultural desconhecida');
    if (spec.culturalNote && (typeof spec.culturalNote !== 'string' || spec.culturalNote.length > 200 || looksUnsafe(spec.culturalNote))) {
      errs.push('nota cultural: texto curto, sem HTML');
    }
    const audiences = spec.audiences || [];
    if (audiences.some((a) => !AUDIENCES.includes(a))) errs.push('público desconhecido');
    if (spec.category && !CATEGORIES[spec.category]) errs.push('categoria desconhecida');
    if (spec.proposedStartAt && Number.isNaN(zonedCivilToUtcMs(spec.proposedStartAt, tz))) errs.push('início do período inválido para o fuso informado');
    if (spec.proposedEndAt && Number.isNaN(zonedCivilToUtcMs(spec.proposedEndAt, tz))) errs.push('término do período inválido para o fuso informado');
    if (spec.proposedStartAt && spec.proposedEndAt && zonedCivilToUtcMs(spec.proposedEndAt, tz) <= zonedCivilToUtcMs(spec.proposedStartAt, tz)) {
      errs.push('o término deve ser posterior ao início, no fuso da campanha');
    }
    return { ok: errs.length === 0, errors: errs, warnings: tv.warnings || [], schemaVersion: 2 };
  }

  function resolveVisual(state, { scope, mode, special } = {}) {
    const m = mode || (state.userPrefs.theme === 'dark' ? 'dark' : 'light');
    const base = clone(Theme.DEF[m]);
    const personal = state.founderPersonal && state.founderPersonal[m];
    const under = personal ? { ...base, ...personal.tokens } : base;
    const layer = special && special.tokens ? special.tokens : null;
    const reduce = !!(state.userPrefs.reduceMotion || (layer && layer.reduceMotion) || (special && special.tokens && special.tokens.reduceMotion));
    const decorations = (special && special.decorations && !reduce) ? special.decorations : [];
    const messages = (special && special.messages) || {};
    return {
      mode: m,
      tokens: layer ? { ...under, ...layer } : under,
      decorations,
      messages,
      logo: 'official',
      userPrefs: clone(state.userPrefs),
      layered: !!layer,
      scope: scope || null,
    };
  }

  function prefsUnchanged(before, after) {
    if (before.theme !== after.theme) return false;
    if (before.reduceMotion !== after.reduceMotion) return false;
    for (const k of USER_PREF_KEYS) {
      if ((before.keys || {})[k] !== (after.keys || {})[k]) return false;
    }
    return true;
  }

  function matchingSuggestions(state, { country, audience } = {}) {
    const now = new Date(state.now);
    const year = now.getFullYear();
    const out = [];
    for (const sug of state.suggestions) {
      if (sug.status === 'dismissed' || sug.status === 'rejected' || sug.status === 'accepted') continue;
      if (sug.status === 'snoozed' && sug.snoozeUntil && new Date(sug.snoozeUntil) > now) continue;
      if (sug.status === 'snoozed' && sug.snoozeUntil && new Date(sug.snoozeUntil) <= now) sug.status = 'open';
      const cat = state.catalog.find((c) => c.id === sug.catalogId);
      if (!cat) continue;
      const okKey = occasionKey(cat.occasionId, year);
      if (state.blocks && state.blocks.occasions && state.blocks.occasions[okKey]) continue;
      if (state.blocks && state.blocks.categories && state.blocks.categories[cat.category]) continue;
      if (country && cat.countries && cat.countries.length && !cat.countries.includes(country)) continue;
      if (audience && cat.audiences && cat.audiences.length && !cat.audiences.includes(audience) && !cat.audiences.includes('pais')) continue;
      const start = new Date(cat.windowStart);
      const end = new Date(cat.windowEnd);
      if (now < start || now > end) continue;
      out.push({ ...sug, catalog: cat, occasionKey: occasionKey(cat.occasionId, year) });
    }
    return out;
  }

  function suggestFromCatalog(state, catalogId) {
    const cat = state.catalog.find((c) => c.id === catalogId);
    if (!cat) return { ok: false, error: 'catálogo não encontrado' };
    const packCountry = cat.country || (cat.countries && cat.countries[0]);
    if (packCountry && !packOf(packCountry)) return { ok: false, error: 'pacote de calendário não carregado para ' + packCountry };
    const year = new Date(state.now).getFullYear();
    const key = occasionKey(cat.occasionId, year);
    const existing = state.suggestions.find((s) => s.occasionKey === key);
    if (existing) return { ok: true, suggestion: existing, deduped: true };
    const sug = { id: uid('sug'), catalogId, occasionKey: key, status: 'open', snoozeUntil: null, seenAt: null, createdAt: iso(state.now) };
    state.suggestions.push(sug);
    audit(state, 'special_theme.suggest', 'ok', { themeId: catalogId, reason: 'sugestão discreta; nenhuma publicação' });
    return { ok: true, suggestion: sug, deduped: false };
  }

  function dismissSuggestion(state, suggestionId, mode) {
    const auth = authorize(state, 'dismiss');
    if (!auth.ok) { audit(state, 'special_theme.dismiss', 'negado', { reason: auth.message }); return auth; }
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return { ok: false, message: 'sugestão não encontrada' };
    const cat = state.catalog.find((c) => c.id === sug.catalogId);
    state.blocks = state.blocks || { occasions: {}, categories: {} };
    if (mode === 'snooze') {
      const until = new Date(state.now); until.setDate(until.getDate() + SNOOZE_DAYS);
      sug.status = 'snoozed'; sug.snoozeUntil = until.toISOString(); sug.blockType = 'snooze';
      audit(state, 'special_theme.snooze', 'ok', { themeId: sug.catalogId, reason: 'adiada por 7 dias' });
      return { ok: true, suggestion: sug, mode: 'snooze', until: sug.snoozeUntil };
    }
    if (mode === 'category' || mode === 'never') {
      if (!cat) return { ok: false, message: 'categoria da sugestão não encontrada' };
      state.blocks.categories[cat.category] = { at: iso(state.now), category: cat.category, reversible: true };
      sug.status = 'dismissed'; sug.dismissedAt = iso(state.now); sug.blockType = 'category';
      audit(state, 'special_theme.block_category', 'ok', { themeId: cat.category, reason: 'não sugerir novamente esta categoria' });
      return { ok: true, suggestion: sug, mode: 'category' };
    }
    /* occasion (também aceita o antigo 'dismiss') */
    const key = sug.occasionKey || (cat && occasionKey(cat.occasionId, new Date(state.now).getFullYear()));
    state.blocks.occasions[key] = { at: iso(state.now), occasionKey: key, catalogId: sug.catalogId, reversible: true };
    sug.status = 'dismissed'; sug.dismissedAt = iso(state.now); sug.blockType = 'occasion'; sug.occasionKey = key;
    audit(state, 'special_theme.dismiss_occasion', 'ok', { themeId: sug.catalogId, reason: 'ocasião dispensada nesta instância' });
    return { ok: true, suggestion: sug, mode: 'occasion' };
  }

  function markSeen(state, suggestionId) {
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    if (sug && !sug.seenAt) sug.seenAt = iso(state.now);
    return sug;
  }

  function createDraft(state, payload) {
    const auth = authorize(state, 'draft');
    if (!auth.ok) { audit(state, 'special_theme.draft', 'negado', { reason: auth.message }); return auth; }
    const spec = {
      name: (payload.name || '').trim(),
      category: payload.category || 'campanhas_fundador',
      source: payload.source || 'custom',
      catalogId: payload.catalogId || null,
      tokens: payload.tokens || clone(Theme.DEF.light),
      tokensDark: payload.tokensDark || clone(Theme.DEF.dark),
      decorations: payload.decorations || [],
      messages: normalizeMessages(payload.messages || {}),
      acceptedMessages: payload.acceptedMessages || {},
      scopes: payload.scopes || [],
      manualNoEndException: !!payload.manualNoEndException,
      country: payload.country || (payload.countries && payload.countries[0]) || 'BR',
      countries: payload.countries && payload.countries.length ? payload.countries : [payload.country || 'BR'],
      regions: payload.regions || [],
      locale: payload.locale || defaultLocaleOf(payload.country || (payload.countries && payload.countries[0]) || 'BR'),
      timeZone: payload.timeZone || defaultTimeZoneFor(payload.country || (payload.countries && payload.countries[0]) || 'BR'),
      coverage: payload.coverage || 'national',
      sensitivity: payload.sensitivity || [],
      culturalNote: payload.culturalNote || '',
      audiences: payload.audiences || ['pais'],
      proposedStartAt: payload.proposedStartAt || null,
      proposedEndAt: payload.proposedEndAt || null,
      logo: 'official',
    };
    spec.countries = [spec.country];
    syncAcceptedMessages(spec);
    if (!spec.name) return { ok: false, message: 'dê um nome à campanha ou ao tema' };
    const vL = validateSpecialTheme(spec, 'light');
    const vD = validateSpecialTheme({ ...spec, tokens: spec.tokensDark }, 'dark');
    if (!vL.ok || !vD.ok) return { ok: false, message: 'validação recusada', errors: [...(vL.errors || []), ...(vD.errors || [])] };
    const draft = { id: uid('dft'), ...spec, version: 1, status: 'draft', createdAt: iso(state.now), updatedAt: iso(state.now), authorId: state.session.actorId };
    state.drafts.push(draft);
    audit(state, 'special_theme.draft', 'ok', { themeId: draft.id, version: 1, scopes: draft.scopes });
    return { ok: true, draft };
  }

  function updateDraft(state, draftId, patch) {
    const draft = state.drafts.find((d) => d.id === draftId);
    if (!draft) return { ok: false, message: 'rascunho não encontrado' };
    if (draft.status !== 'draft' && draft.status !== 'rejected') {
      const next = { ...clone(draft), ...patch, id: uid('dft'), version: draft.version + 1, status: 'draft', createdAt: iso(state.now), updatedAt: iso(state.now), parentId: draft.id, approvedAt: null, approvedBy: null, approvalJustification: null, approvedFingerprint: null };
      if (next.country) next.countries = [next.country];
      syncAcceptedMessages(next);
      const v = validateSpecialTheme(next, 'light');
      if (!v.ok) return { ok: false, message: 'validação recusada', errors: v.errors };
      state.drafts.push(next);
      for (const pub of state.publications) {
        if (pub.draftId === draft.id && (pub.status === 'approved' || pub.status === 'scheduled')) {
          pub.status = 'invalidated';
          pub.invalidatedAt = iso(state.now);
          pub.invalidatedReason = 'a campanha mudou; a aprovação valia só para a versão anterior';
          audit(state, 'special_theme.approval_invalidated', 'ok', { themeId: draft.id, version: draft.version, scopes: draft.scopes, reason: pub.invalidatedReason });
        }
      }
      audit(state, 'special_theme.new_version', 'ok', { themeId: next.id, version: next.version, scopes: next.scopes });
      return { ok: true, draft: next, superseded: true };
    }
    Object.assign(draft, patch, { updatedAt: iso(state.now), logo: 'official' });
    if (draft.country) draft.countries = [draft.country];
    syncAcceptedMessages(draft);
    const v = validateSpecialTheme(draft, 'light');
    if (!v.ok) return { ok: false, message: 'validação recusada', errors: v.errors };
    return { ok: true, draft };
  }

  function rejectDraft(state, draftId, justification) {
    const auth = authorize(state, 'reject');
    if (!auth.ok) { audit(state, 'special_theme.reject', 'negado', { reason: auth.message, themeId: draftId }); return auth; }
    const draft = state.drafts.find((d) => d.id === draftId);
    if (!draft) return { ok: false, message: 'proposta não encontrada' };
    draft.status = 'rejected';
    draft.rejectedAt = iso(state.now);
    draft.rejectionJustification = justification || '';
    const sug = state.suggestions.find((s) => s.catalogId === draft.catalogId && s.status === 'open');
    if (sug) sug.status = 'rejected';
    audit(state, 'special_theme.reject', 'ok', { themeId: draft.id, version: draft.version, justification, scopes: draft.scopes });
    return { ok: true, draft };
  }

  function approveDraft(state, draftId, justification) {
    const auth = authorize(state, 'approve');
    if (!auth.ok) { audit(state, 'special_theme.approve', 'negado', { reason: auth.message, themeId: draftId }); return auth; }
    if (!justification || String(justification).trim().length < 15) return { ok: false, message: 'a aprovação exige justificativa (mínimo 15 caracteres).' };
    const draft = state.drafts.find((d) => d.id === draftId);
    if (!draft) return { ok: false, message: 'proposta não encontrada' };
    if (draft.status === 'rejected') return { ok: false, message: 'proposta recusada; crie uma nova versão' };
    const vL = validateSpecialTheme(draft, 'light');
    const vD = validateSpecialTheme({ ...draft, tokens: draft.tokensDark }, 'dark');
    if (!vL.ok || !vD.ok) return { ok: false, message: 'validação recusada', errors: [...(vL.errors || []), ...(vD.errors || [])] };
    if (!draft.scopes.length) return { ok: false, message: 'escolha ao menos um local de exibição' };
    if (!(draft.audiences || []).length) return { ok: false, message: 'escolha o público desta campanha' };
    const tz = draft.timeZone || defaultTimeZoneFor(draft.country || 'BR');
    if (!draft.proposedStartAt) return { ok: false, message: 'a aprovação inclui o período; informe o início (com o fuso da campanha).' };
    if (Number.isNaN(zonedCivilToUtcMs(draft.proposedStartAt, tz))) return { ok: false, message: 'início do período inválido para o fuso informado' };
    if (!draft.proposedEndAt && !draft.manualNoEndException) {
      return { ok: false, message: 'campanhas programadas precisam de início e término. A ativação manual sem término é uma exceção e precisa ser indicada nesta versão.' };
    }
    if (draft.proposedEndAt && zonedCivilToUtcMs(draft.proposedEndAt, tz) <= zonedCivilToUtcMs(draft.proposedStartAt, tz)) {
      return { ok: false, message: 'o término deve ser posterior ao início, no fuso da campanha' };
    }
    const msgRev = reviewMessages(state, draft);
    if (!msgRev.ok) return { ok: false, message: msgRev.errors[0], errors: msgRev.errors };
    const snap = campaignSnapshot(draft);
    const fp = fingerprint(draft);
    draft.status = 'approved';
    draft.timeZone = tz;
    draft.approvedAt = iso(state.now);
    draft.approvedBy = state.session.actorId;
    draft.approvalJustification = String(justification).trim();
    draft.approvedFingerprint = fp;
    const startAt = zonedToIso(draft.proposedStartAt, tz);
    const endAt = draft.proposedEndAt ? zonedToIso(draft.proposedEndAt, tz) : null;
    const pub = {
      id: uid('pub'),
      draftId: draft.id,
      version: draft.version,
      status: 'approved',
      scopes: clone(draft.scopes),
      country: snap.country,
      countries: clone(snap.countries),
      regions: clone(snap.regions),
      locale: snap.locale,
      timeZone: tz,
      audiences: clone(draft.audiences),
      startAt,
      endAt,
      endApproved: !!endAt,
      manualNoEndException: !!draft.manualNoEndException,
      proposedStartAt: draft.proposedStartAt,
      proposedEndAt: draft.proposedEndAt || null,
      approvedFingerprint: fp,
      approvedSnapshot: snap,
      previousVisual: null,
      approvedBy: state.session.actorId,
      approvedAt: iso(state.now),
      justification: draft.approvalJustification,
    };
    state.publications.push(pub);
    const sug = state.suggestions.find((s) => s.catalogId === draft.catalogId && (s.status === 'open' || s.status === 'snoozed'));
    if (sug) sug.status = 'accepted';
    audit(state, 'special_theme.approve', 'ok', { themeId: draft.id, version: draft.version, scopes: pub.scopes, countries: pub.countries, startAt, endAt, justification: pub.justification });
    return { ok: true, draft, publication: pub };
  }

  function overlap(aStart, aEnd, bStart, bEnd) {
    const as = new Date(aStart).getTime(), ae = aEnd ? new Date(aEnd).getTime() : Infinity;
    const bs = new Date(bStart).getTime(), be = bEnd ? new Date(bEnd).getTime() : Infinity;
    return as < be && bs < ae;
  }

  function schedulePublication(state, publicationId, opts = {}) {
    const { startAt, endAt, timeZone, justification } = opts;
    const auth = authorize(state, 'schedule');
    if (!auth.ok) { audit(state, 'special_theme.schedule', 'negado', { reason: auth.message, themeId: publicationId }); return auth; }
    const pub = state.publications.find((p) => p.id === publicationId);
    if (!pub) return { ok: false, message: 'publicação não encontrada' };
    if (pub.status === 'invalidated') return { ok: false, code: 'APPROVAL_INVALIDATED', message: 'a aprovação desta versão foi invalidada; aprove novamente a campanha.' };
    if (pub.status !== 'approved' && pub.status !== 'scheduled') return { ok: false, message: 'só é possível agendar após a aprovação expressa desta versão' };
    const draft = publicationSpec(state, pub);
    if (!draft || draft.status !== 'approved' || fingerprint(draft) !== pub.approvedFingerprint) {
      if (pub.status !== 'invalidated') { pub.status = 'invalidated'; pub.invalidatedReason = 'a campanha mudou depois da aprovação'; }
      audit(state, 'special_theme.schedule', 'negado', { themeId: pub.draftId, version: pub.version, reason: 'aprovação não corresponde mais a esta versão' });
      return { ok: false, code: 'APPROVAL_INVALIDATED', message: 'esta versão mudou depois da aprovação; é preciso aprovar de novo.' };
    }
    const tz = pub.timeZone || timeZone || DEFAULT_TZ;
    const wantStart = startAt || pub.startAt;
    const wantEnd = endAt !== undefined ? endAt : pub.endAt;
    if (!sameInstant(wantStart, pub.startAt, tz) || !sameInstant(wantEnd, pub.endAt, tz)) {
      return { ok: false, code: 'PERIOD_LOCKED', message: 'o período precisa ser exatamente o aprovado nesta versão; qualquer alteração exige nova aprovação.' };
    }
    if ((timeZone && timeZone !== tz)) {
      return { ok: false, code: 'PERIOD_LOCKED', message: 'o fuso horário precisa ser o aprovado nesta versão; qualquer alteração exige nova aprovação.' };
    }
    if (!pub.endAt) {
      return { ok: false, code: 'END_REQUIRED', message: 'campanhas programadas precisam de início e término. Sem término, só a ativação manual excepcional, já aprovada nesta versão.' };
    }
    const conflicts = findConflicts(state, pub);
    if (conflicts.length) {
      return {
        ok: false,
        code: 'OVERLAP',
        message: 'já existe um tema especial no mesmo local e período. Escolha substituir, reagendar ou cancelar. Nada é substituído automaticamente.',
        conflicts,
        conflict: conflicts[0],
        choices: ['replace', 'reschedule', 'cancel'],
      };
    }
    pub.status = 'scheduled';
    pub.scheduleJustification = justification || pub.justification;
    audit(state, 'special_theme.schedule', 'ok', {
      themeId: pub.draftId, version: pub.version, scopes: pub.scopes, countries: pub.countries,
      startAt: pub.startAt, endAt: pub.endAt, justification: pub.scheduleJustification,
    });
    return { ok: true, publication: pub };
  }

  function resolveConflict(state, publicationId, choice, opts = {}) {
    const auth = authorize(state, 'schedule');
    if (!auth.ok) { audit(state, 'special_theme.conflict', 'negado', { reason: auth.message }); return auth; }
    const pub = state.publications.find((p) => p.id === publicationId);
    if (!pub) return { ok: false, message: 'publicação não encontrada' };
    const conflicts = findConflicts(state, pub);
    if (!conflicts.length) return { ok: true, action: 'none', publication: pub };
    if (choice === 'cancel') {
      audit(state, 'special_theme.conflict_cancel', 'ok', { themeId: pub.draftId, version: pub.version, scopes: pub.scopes, reason: 'fundador cancelou diante do conflito; a campanha já aprovada permanece' });
      return { ok: true, action: 'cancel', publication: pub, conflicts };
    }
    if (choice === 'reschedule') {
      audit(state, 'special_theme.conflict_reschedule', 'ok', { themeId: pub.draftId, version: pub.version, scopes: pub.scopes, reason: 'fundador vai reagendar; a campanha já aprovada não foi substituída' });
      return { ok: true, action: 'reschedule', publication: pub, conflicts };
    }
    if (choice === 'replace') {
      const justification = opts.justification || '';
      if (!justification || String(justification).trim().length < 15) {
        return { ok: false, message: 'substituir uma campanha já aprovada exige justificativa expressa (mínimo 15 caracteres). Nada é substituído automaticamente.' };
      }
      for (const other of conflicts) {
        if (other.status === 'active' || other.status === 'scheduled') {
          restorePrevious(state, other, { reason: 'substituída por decisão expressa do fundador: ' + justification.trim(), manual: true });
        } else {
          other.status = 'replaced';
          other.replacedAt = iso(state.now);
          other.replacedBy = pub.id;
          other.replacedReason = justification.trim();
          audit(state, 'special_theme.replaced', 'ok', { themeId: other.draftId, version: other.version, scopes: other.scopes, reason: other.replacedReason });
        }
      }
      const sch = schedulePublication(state, pub.id, { justification });
      if (!sch.ok) return sch;
      audit(state, 'special_theme.conflict_replace', 'ok', { themeId: pub.draftId, version: pub.version, scopes: pub.scopes, justification });
      return { ok: true, action: 'replace', publication: pub, replaced: conflicts };
    }
    return { ok: false, message: 'escolha substituir, reagendar ou cancelar' };
  }

  function tryActivate(state, publicationId, { auto } = {}) {
    const pub = state.publications.find((p) => p.id === publicationId);
    if (!pub) return { ok: false, message: 'publicação não encontrada' };
    if (auto) {
      audit(state, 'special_theme.auto_activate', 'negado', { themeId: pub.draftId, version: pub.version, reason: 'nenhum tema pode ser ativado automaticamente' });
      return { ok: false, code: 'NO_AUTO', message: 'Nenhum tema pode ser ativado automaticamente. A decisão de publicar é exclusivamente do fundador.' };
    }
    const auth = authorize(state, 'activate');
    if (!auth.ok) { audit(state, 'special_theme.activate', 'negado', { reason: auth.message, themeId: pub.draftId }); return auth; }
    if (!state.flag[FLAG]) return { ok: false, code: 'FLAG_OFF', message: 'A flag está desligada.' };
    if (pub.status === 'invalidated') return { ok: false, code: 'APPROVAL_INVALIDATED', message: 'a aprovação desta versão foi invalidada.' };
    const manualException = pub.status === 'approved' && pub.manualNoEndException && !pub.endAt;
    if (pub.status !== 'scheduled' && !manualException) {
      return { ok: false, message: 'ative apenas um tema aprovado e já agendado nesta versão, ou a exceção manual sem término já aprovada' };
    }
    if (!pub.endAt && !pub.manualNoEndException) {
      return { ok: false, code: 'END_REQUIRED', message: 'campanhas programadas precisam de início e término' };
    }
    const conflicts = findConflicts(state, pub);
    if (conflicts.length) {
      return { ok: false, code: 'OVERLAP', message: 'já existe um tema especial no mesmo local e período. Escolha substituir, reagendar ou cancelar. Nada é substituído automaticamente.', conflicts, conflict: conflicts[0], choices: ['replace', 'reschedule', 'cancel'] };
    }
    if (pub.startAt && new Date(state.now).getTime() < zonedCivilToUtcMs(pub.startAt, pub.timeZone || DEFAULT_TZ)) return { ok: false, message: 'o período ainda não começou; o tema permanece apenas agendado' };
    const beforePrefs = clone(state.userPrefs);
    pub.previousVisual = {
      recordedAt: iso(state.now),
      founderPersonal: clone(state.founderPersonal),
      userPrefs: clone(state.userPrefs),
      base: { light: clone(Theme.DEF.light), dark: clone(Theme.DEF.dark) },
    };
    pub.status = 'active';
    pub.activatedAt = iso(state.now);
    pub.activatedBy = state.session.actorId;
    if (!prefsUnchanged(beforePrefs, state.userPrefs)) throw new Error('preferências do usuário foram alteradas — isso não pode acontecer');
    audit(state, 'special_theme.activate', 'ok', {
      themeId: pub.draftId, version: pub.version, scopes: pub.scopes, countries: pub.countries,
      startAt: pub.startAt, endAt: pub.endAt, justification: pub.justification,
    });
    return { ok: true, publication: pub, userPrefs: clone(state.userPrefs) };
  }

  function tick(state) {
    const now = new Date(state.now);
    const ended = [];
    for (const pub of state.publications) {
      const tz = pub.timeZone || DEFAULT_TZ;
      if (pub.status === 'scheduled' && pub.startAt && now.getTime() >= zonedCivilToUtcMs(pub.startAt, tz)) {
        /* nunca ativa sozinho: permanece agendado até o fundador confirmar a entrada no ar */
        pub.dueToStart = true;
      }
      if (pub.status === 'active' && pub.endAt && now.getTime() >= zonedCivilToUtcMs(pub.endAt, tz)) {
        if (pub.endApproved) {
          restorePrevious(state, pub, { reason: 'término agendado e aprovado' });
          ended.push(pub);
        } else {
          pub.dueToEnd = true;
        }
      }
    }
    return { ended, dueToStart: state.publications.filter((p) => p.dueToStart && p.status === 'scheduled') };
  }

  function restorePrevious(state, pub, { reason, manual } = {}) {
    const snap = pub.previousVisual;
    if (snap && snap.userPrefs) {
      /* restaura o visual base registrado; não reescreve preferências permanentes se já tiverem mudado por outro caminho do usuário */
      state.founderPersonal = clone(snap.founderPersonal || state.founderPersonal);
    }
    pub.status = manual ? 'deactivated' : 'ended';
    pub.deactivatedAt = iso(state.now);
    pub.deactivatedBy = state.session.actorId;
    pub.restoreReason = reason || (manual ? 'desativação manual' : 'término');
    audit(state, manual ? 'special_theme.deactivate' : 'special_theme.auto_revert', 'ok', {
      themeId: pub.draftId, version: pub.version, scopes: pub.scopes, startAt: pub.startAt, endAt: pub.endAt, reason: pub.restoreReason,
    });
    return { ok: true, publication: pub, restored: !!snap };
  }

  function deactivate(state, publicationId, justification) {
    const auth = authorize(state, 'deactivate');
    if (!auth.ok) { audit(state, 'special_theme.deactivate', 'negado', { reason: auth.message }); return auth; }
    const pub = state.publications.find((p) => p.id === publicationId);
    if (!pub) return { ok: false, message: 'publicação não encontrada' };
    if (pub.status !== 'active' && pub.status !== 'scheduled') return { ok: false, message: 'não há tema especial ativo ou agendado para desativar' };
    return restorePrevious(state, pub, { reason: justification || 'desativação manual pelo fundador', manual: true });
  }

  function restoreNow(state, publicationId) {
    const auth = authorize(state, 'restore');
    if (!auth.ok) { audit(state, 'special_theme.restore', 'negado', { reason: auth.message }); return auth; }
    const pub = state.publications.find((p) => p.id === publicationId);
    if (!pub || pub.status !== 'active') return { ok: false, message: 'não há tema especial ativo para restaurar o visual anterior' };
    return restorePrevious(state, pub, { reason: 'restauração imediata do visual anterior', manual: true });
  }

  function activeFor(state, scope, country, audience) {
    return state.publications.find((p) => {
      if (p.status !== 'active') return false;
      if (scope && !(p.scopes || []).includes(scope)) return false;
      if (country && p.countries && p.countries.length && !p.countries.includes(country)) return false;
      if (audience && p.audiences && p.audiences.length && !p.audiences.includes(audience) && !p.audiences.includes('pais')) return false;
      return true;
    }) || null;
  }

  function publicationSpec(state, pub) {
    if (!pub) return null;
    const draft = state.drafts.find((d) => d.id === pub.draftId);
    return draft || null;
  }

  const api = {
    FLAG, CATEGORIES, SCOPES, SCOPE_LABEL, COUNTRIES, AUDIENCES, AUDIENCE_LABEL,
    PACKS, DEFAULT_TZ, DEFAULT_LOCALE, SENSITIVITY, COVERAGE,
    MESSAGE_SURFACES, MESSAGE_SURFACE_LABEL, SIGNATURE_TEXT, SLOGAN, SNOOZE_DAYS,
    PROTECTED_ZONES, SAFE_PLACEMENTS, ASSETS, USER_PREF_KEYS, OCCASION_ONCE,
    emptyState, authorize, audit, validateSpecialTheme, resolveVisual, prefsUnchanged,
    matchingSuggestions, suggestFromCatalog, dismissSuggestion, markSeen,
    createDraft, updateDraft, rejectDraft, approveDraft, schedulePublication,
    tryActivate, tick, deactivate, restoreNow, activeFor, publicationSpec, occasionKey, clone,
    packOf, loadedPacks, defaultTimeZoneFor, zonedCivilToUtcMs, zonedToIso, sameInstant,
    campaignSnapshot, fingerprint,
    acceptMessage, acceptAllSuggestedMessages, reviewMessages, suggestMessageAlternatives,
    signatureStyle, listSuggestionBlocks, unblockOccasion, unblockCategory, clearSnooze,
    findConflicts, resolveConflict, normalizeMessages,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpecialThemes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
