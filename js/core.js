/* PACTO 8.0 · núcleo de regras (puro, sem DOM). Funciona no navegador (window.PactoCore) e no Node (require).
   Todas as operações financeiras usam CENTAVOS INTEIROS. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PactoCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class PactoError extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = 'PactoError'; }
  }
  const fail = (code, msg) => { throw new PactoError(code, msg); };

  /* ---------- utilitários ---------- */
  // 8.2 · inteiros seguros e teto por valor (R$ 100 milhões = 10^10 centavos): bloqueia overflow/arredondamento
  const MAX_CENTS = 10_000_000_000;
  const isInt = (v) => Number.isSafeInteger(v) && Math.abs(v) <= MAX_CENTS;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  /* Fuso do produto: America/Sao_Paulo (conversão por fuso nomeado, não por deslocamento fixo).
     brtDate(x) → 'AAAA-MM-DD' do calendário de São Paulo para o instante x (Date, número ou texto ISO com fuso).
     brtMonth(x) → 'AAAA-MM'. Instante inválido → ''. */
  const BRT_TZ = 'America/Sao_Paulo';
  let _brtFmt = null;
  function brtDate(x) {
    const t = x instanceof Date ? x.getTime() : typeof x === 'number' ? x : Date.parse(String(x || ''));
    if (!Number.isFinite(t)) return '';
    try {
      _brtFmt = _brtFmt || new Intl.DateTimeFormat('en-US', { timeZone: BRT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
      const p = {}; _brtFmt.formatToParts(new Date(t)).forEach((q) => { p[q.type] = q.value; });
      return `${p.year}-${p.month}-${p.day}`;
    } catch (e) { return new Date(t - 3 * 3600000).toISOString().slice(0, 10); } // sem dados de fuso no ambiente: Brasil sem horário de verão (UTC−3)
  }
  const brtMonth = (x) => brtDate(x).slice(0, 7);
  /* PRB-02: a data efetiva do pagamento não pode ser posterior a HOJE em São Paulo.
     Referência = carimbo `at` gravado pelo SERVIDOR; comparação exata de datas de calendário, sem tolerância:
     22:30 em SP (já é o dia seguinte em UTC) ainda é "hoje" em SP; amanhã em SP é recusado. */
  function paidInFuture(paidAt, at) {
    const today = brtDate(at);
    if (!today) return false; // sem carimbo de tempo confiável (ex.: testes de núcleo) não há referência de "hoje"
    return String(paidAt) > today;
  }
  function isISODate(s) {
    if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  /* ---------- t40u · referência única de "recebido/pago no mês" = DATA EFETIVA DO PAGAMENTO (paidAt) ----------
     Painel, resumo de boas-vindas e projeções usam estas funções. A data de aprovação (reviewedAt) fica separada e só é exibida.
     Só conta pagamento com status 'approved' (em análise, correção solicitada e recusado nunca contam).
     Mês = mês do calendário de `paidAt` (data de calendário AAAA-MM-DD; não depende do fuso do aparelho).
     Reserva para registro antigo sem `paidAt` válido: mês de São Paulo da aprovação (não existe no banco de homologação hoje). */
  const approvedAtOf = (a, r) => (r && (r.reviewedAt || (r.earlyId && (((a && a.early) || []).find((e) => e.id === r.earlyId) || {}).closedAt))) || '';
  const receiptMonth = (a, r) => (r && isISODate(r.paidAt) ? r.paidAt.slice(0, 7) : brtMonth(approvedAtOf(a, r)));
  const confirmedIn = (a, s, month) => ((s && s.reports) || []).filter((x) => x.status === 'approved' && receiptMonth(a, x) === month);
  /** Totais confirmados no mês (data efetiva) por papel. opts.currency filtra a moeda do acordo. */
  function receivedInMonth(agreements, userId, month, opts) {
    const out = { seller: { cents: 0, n: 0 }, buyer: { cents: 0, n: 0 } };
    (agreements || []).filter((a) => isParty(a, userId) && ['active', 'settled', 'consolidated'].includes(a.status)).forEach((a) => {
      if (opts && opts.currency && (a.currency || 'BRL') !== opts.currency) return;
      const b = out[roleOf(a, userId)]; if (!b) return;
      (a.schedule || []).forEach((s) => {
        if (['replaced', 'consolidated'].includes(s.status) && !s.paidCents) return;
        confirmedIn(a, s, month).forEach((x) => { b.cents += x.amountCents || 0; b.n++; });
      });
    });
    return out;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function plusMonths(date, index) {
    const [y, m, d] = date.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + index, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(last, d))}`;
  }
  function plusDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  function daysBetween(a, b) {
    const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86400000);
  }
  const PERIODICITY = { monthly: { days: 30 }, biweekly: { days: 15 }, weekly: { days: 7 } };
  function addPeriod(date, periodicity, i) {
    if (periodicity === 'monthly') return plusMonths(date, i);
    return plusDays(date, PERIODICITY[periodicity].days * i);
  }
  /** Converte "1.234,56", "1234.56" ou número em centavos inteiros. */
  function parseMoney(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
    if (typeof v !== 'string') return NaN;
    let s = v.trim().replace(/[R$\s€US]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
    const [i, f = ''] = s.replace('-', '').split('.');
    const cents = Number(i) * 100 + Number((f + '00').slice(0, 2));
    return s.startsWith('-') ? -cents : cents;
  }
  /** Sanitiza texto livre: remove caracteres de controle, normaliza e limita tamanho. */
  function cleanText(v, max = 200) {
    return String(v ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, max);
  }
  const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  const isEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL.test(e);

  /* ---------- cálculo do parcelamento ---------- */
  const METHODS = ['none', 'simple', 'price'];
  /** Valida e calcula um plano. Retorna {ok, errors, ...}. */
  function calcPlan(t) {
    const errors = [];
    const totalCents = t.totalCents, downCents = t.downCents || 0;
    const extras = (t.extras || []).filter((e) => e && (e.amountCents || e.due));
    const count = t.count, ratePct = Number(t.ratePct || 0), method = t.method, periodicity = t.periodicity || 'monthly';
    if (!isInt(totalCents) || totalCents <= 0) errors.push(typeof totalCents === 'number' && totalCents > MAX_CENTS ? 'Valor acima do limite permitido (R$ 100 milhões).' : 'Informe um valor total positivo.');
    if (!isInt(downCents) || downCents < 0) errors.push('Entrada inválida.');
    if (isInt(totalCents) && downCents >= totalCents) errors.push('A entrada deve ser menor que o total.');
    if (!isInt(count) || count < 1 || count > 600) errors.push('Número de parcelas deve ser de 1 a 600.');
    if (!METHODS.includes(method)) errors.push('Modalidade de cálculo inválida.');
    if (!PERIODICITY[periodicity]) errors.push('Periodicidade inválida.');
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 10) errors.push('Juros devem ficar entre 0% e 10% ao mês.');
    if (method !== 'none' && ratePct === 0 && method) { /* juros zero: tratado como sem juros */ }
    if (!isISODate(t.firstDue)) errors.push('Primeiro vencimento inválido.');
    if (downCents > 0 && !isISODate(t.downDue)) errors.push('Data da entrada inválida.');
    let extrasSum = 0;
    extras.forEach((e, i) => {
      if (!isInt(e.amountCents) || e.amountCents <= 0) errors.push(`Parcela extra ${i + 1}: valor inválido.`);
      if (!isISODate(e.due)) errors.push(`Parcela extra ${i + 1}: data inválida.`);
      extrasSum += e.amountCents || 0;
    });
    if (extras.length > 24) errors.push('No máximo 24 parcelas extras.');
    const principalCents = (totalCents || 0) - downCents - extrasSum;
    if (!errors.length && principalCents <= 0) errors.push('Entrada + extras não podem cobrir todo o total.');
    if (errors.length) return { ok: false, errors };

    const effMethod = ratePct === 0 ? 'none' : method;
    const days = PERIODICITY[periodicity].days;
    const r = ratePct / 100;
    let regular, last, financed;
    if (effMethod === 'none') {
      financed = principalCents;
      regular = Math.round(principalCents / count);
    } else if (effMethod === 'simple') {
      const rp = periodicity === 'monthly' ? r : (r * days) / 30;
      financed = principalCents + Math.round(principalCents * rp * count);
      regular = Math.round(financed / count);
    } else {
      const rp = periodicity === 'monthly' ? r : Math.pow(1 + r, days / 30) - 1;
      const exact = (principalCents * rp) / (1 - Math.pow(1 + rp, -count));
      regular = Math.round(exact);
      financed = Math.round(exact * count);
    }
    last = financed - regular * (count - 1);
    if (regular < 1 || last < 1) return { ok: false, errors: ['Valor muito baixo para este número de parcelas.'] };

    const schedule = [];
    if (downCents > 0) schedule.push({ kind: 'down', due: t.downDue, amountCents: downCents });
    for (let i = 0; i < count; i++) schedule.push({ kind: 'regular', seq: i + 1, due: addPeriod(t.firstDue, periodicity, i), amountCents: i === count - 1 ? last : regular });
    extras.forEach((e) => schedule.push({ kind: 'extra', due: e.due, amountCents: e.amountCents }));
    schedule.sort((a, b) => a.due.localeCompare(b.due) || (a.kind === 'regular' ? 1 : -1));
    const settlementDate = schedule.reduce((m, s) => (s.due > m ? s.due : m), schedule[0].due);
    return {
      ok: true, errors: [], method: effMethod, principalCents, installmentCents: regular, lastCents: last,
      interestCents: financed - principalCents, financedCents: financed, extrasCents: extrasSum, downCents,
      grandTotalCents: downCents + extrasSum + financed, settlementDate, schedule,
    };
  }
  /** Comparação com taxa bancária: só quando a referência é informada E identificada (fonte). Nunca inventa taxa. */
  function compareReference(t, ref) {
    if (!ref || !(ref.pct > 0) || !cleanText(ref.source)) return null;
    const mine = calcPlan(t), bank = calcPlan({ ...t, method: 'price', ratePct: Number(ref.pct) });
    if (!mine.ok || !bank.ok) return null;
    return { source: cleanText(ref.source, 80), pct: Number(ref.pct), bankInterestCents: bank.interestCents, myInterestCents: mine.interestCents, savingCents: bank.interestCents - mine.interestCents };
  }

  /* ---------- acordos e versões ---------- */
  const OPEN = ['pending', 'correction', 'partial'];
  const remainingOf = (s) => s.amountCents - s.paidCents - s.discountCents;
  function isParty(ag, userId) { return !!userId && (ag.sellerId === userId || ag.buyerId === userId); }
  function roleOf(ag, userId) { return ag.sellerId === userId ? 'seller' : ag.buyerId === userId ? 'buyer' : null; }
  function counterpartOf(ag, userId) { return ag.sellerId === userId ? ag.buyerId : ag.sellerId; }
  function assertParty(ag, userId) { if (!isParty(ag, userId)) fail('FORBIDDEN', 'Você não é parte deste acordo.'); }
  function openBalance(ag) {
    return (ag.schedule || []).filter((s) => OPEN.includes(s.status) || s.status === 'review').reduce((a, s) => a + remainingOf(s), 0);
  }
  function totals(ag) {
    const sch = ag.schedule || [];
    const paid = sch.reduce((a, s) => a + s.paidCents, 0);
    const discount = sch.reduce((a, s) => a + s.discountCents, 0);
    const open = sch.filter((s) => OPEN.includes(s.status) || s.status === 'review').reduce((a, s) => a + remainingOf(s), 0);
    if (ag.terms && ag.terms.mode === 'recurring') {
      const gen = sch.filter((s) => !['replaced', 'consolidated'].includes(s.status)).reduce((a, s) => a + s.amountCents, 0);
      return { paid, discount, open, contracted: gen, interest: 0, recurring: true };
    }
    const contracted = ag.terms ? calcPlan(ag.terms) : null;
    return { paid, discount, open, contracted: contracted && contracted.ok ? contracted.grandTotalCents : 0, interest: contracted && contracted.ok ? contracted.interestCents : 0 };
  }
  function installmentStatus(s, today) {
    if (OPEN.includes(s.status) && s.due < today) return 'overdue';
    return s.status;
  }
  function validateMeta(m) {
    const meta = { title: cleanText(m.title, 80), category: cleanText(m.category, 40), description: cleanText(m.description, 600), currency: ['BRL', 'USD', 'EUR'].includes(m.currency) ? m.currency : 'BRL' };
    if (meta.title.length < 2) fail('VALIDATION', 'Informe o que foi vendido.');
    if (!meta.category) meta.category = 'Outro';
    meta.billing = BILLING.includes(m.billing) ? m.billing : 'installment';
    meta.group = CATEGORY_GROUPS.some((g) => g.id === m.group) ? m.group : groupOfCategory(meta.category);
    meta.fields = cleanFields(m.fields);
    if (m.fromAgreementId) meta.fromAgreementId = cleanText(m.fromAgreementId, 60);
    return meta;
  }
  function normalizeTerms(t) {
    if (t && t.mode === 'recurring') return normalizeRecurring(t);
    const terms = {
      totalCents: t.totalCents, downCents: t.downCents || 0, downDue: t.downCents ? t.downDue : null,
      extras: (t.extras || []).map((e) => ({ due: e.due, amountCents: e.amountCents })),
      count: t.count, method: t.method, ratePct: Math.round(Number(t.ratePct || 0) * 10000) / 10000,
      periodicity: t.periodicity || 'monthly', firstDue: t.firstDue,
      bankRef: t.bankRef && t.bankRef.pct > 0 && cleanText(t.bankRef.source) ? { pct: Number(t.bankRef.pct), source: cleanText(t.bankRef.source, 80) } : null,
    };
    const plan = calcPlan(terms);
    if (!plan.ok) fail('VALIDATION', plan.errors[0]);
    return terms;
  }
  function pendingVersion(ag) { return ag.versions.find((v) => v.status === 'pending') || null; }
  function summarizeTerms(t) {
    if (!t) return null;
    if (t.mode === 'recurring') return { mode: 'recurring', totalCents: t.amountCents, amountCents: t.amountCents, count: 0, ratePct: 0, method: 'none', installmentCents: t.amountCents, firstDue: t.startDate, periodicity: t.periodicity, intervalDays: t.intervalDays, endDate: t.endDate, suspended: t.suspended, cancelled: t.cancelled };
    const p = calcPlan(t);
    return { totalCents: t.totalCents, count: t.count, ratePct: t.ratePct, method: t.method, installmentCents: p.ok ? p.installmentCents : null, firstDue: t.firstDue };
  }

  function createAgreement({ id, sellerId, buyerId, buyerEmail, meta, terms, at, termsHash, reason }) {
    if (!sellerId) fail('VALIDATION', 'Vendedor obrigatório.');
    if (buyerId && buyerId === sellerId) fail('VALIDATION', 'Comprador e vendedor devem ser pessoas diferentes.');
    const vm = validateMeta(meta);
    if (vm.billing === 'recurring' && !(terms && terms.mode === 'recurring')) fail('VALIDATION', 'Serviço recorrente exige condições de recorrência.');
    if (vm.billing !== 'recurring' && terms && terms.mode === 'recurring') fail('VALIDATION', 'Condições recorrentes só valem para serviço recorrente.');
    if (vm.billing === 'single' && (terms.count !== 1 || terms.method !== 'none' || terms.downCents || (terms.extras || []).length)) fail('VALIDATION', 'Serviço avulso gera uma única cobrança, sem juros.');
    const ag = {
      id, ...vm, sellerId, buyerId: buyerId || null, buyerEmail: buyerEmail || null,
      createdBy: sellerId, createdAt: at, status: 'proposed', versions: [], currentVersion: null, terms: null,
      schedule: [], early: [], origins: [], consolidatedInto: null, notes: [], delays: [],
    };
    ag.versions.push({ no: 1, authorId: sellerId, at, kind: 'proposal', terms: normalizeTerms(terms), termsHash, reason: cleanText(reason || 'Criação do acordo', 300), before: null, status: 'pending', acceptedBy: [{ userId: sellerId, at, termsHash }] });
    return ag;
  }
  function canRenegotiate(ag) {
    if (ag.lockedBy) fail('CONFLICT', 'Este acordo está em uma proposta de unificação pendente.');
    if (ag.status !== 'active') return;
    if (ag.schedule.some((s) => s.status === 'review')) fail('CONFLICT', 'Há comprovante em análise. Conclua a conferência antes de renegociar.');
    if (ag.early.some((e) => ['awaiting_buyer', 'awaiting_seller', 'accepted', 'review'].includes(e.status))) fail('CONFLICT', 'Há uma antecipação em andamento neste acordo.');
    if ((ag.delays || []).some((d) => d.status === 'pending')) fail('CONFLICT', 'Há uma justificativa de atraso em análise. Responda-a antes de renegociar.');
  }
  /** Proposta nova (sem pendência) ou contraproposta (responde à pendência, que vira 'superseded'). */
  function proposeVersion(ag, { userId, terms, reason, at, termsHash }) {
    assertParty(ag, userId);
    if (!['proposed', 'active', 'refused'].includes(ag.status)) fail('CONFLICT', 'Este acordo não aceita novas propostas.');
    if (!ag.buyerId) fail('CONFLICT', 'O comprador ainda não entrou no PACTOX.');
    canRenegotiate(ag);
    const pend = pendingVersion(ag);
    let kind = 'proposal';
    if (pend) {
      if (pend.authorId === userId) fail('CONFLICT', 'Sua proposta anterior ainda aguarda resposta.');
      pend.status = 'superseded'; pend.closedAt = at; pend.closedBy = userId;
      kind = 'counter';
    }
    if ((ag.billing === 'recurring') !== (terms && terms.mode === 'recurring')) fail('VALIDATION', 'O tipo de cobrança do acordo não pode mudar; crie um novo acordo para converter.');
    if (ag.billing === 'single' && (terms.count !== 1 || terms.method !== 'none' || terms.downCents || (terms.extras || []).length)) fail('VALIDATION', 'Serviço avulso gera uma única cobrança, sem juros. Para pacote ou recorrência, crie um novo acordo.');
    if (ag.billing === 'recurring' && ag.status === 'active' && terms.startDate !== ag.terms.startDate) fail('VALIDATION', 'A data de início não muda depois de ativado; ajustes valem só para os próximos períodos.');
    const why = cleanText(reason, 300);
    if (ag.status === 'active' && why.length < 3) fail('VALIDATION', 'Explique o motivo da mudança.');
    const no = ag.versions.length + 1;
    const v = { no, authorId: userId, at, kind, change: null, terms: normalizeTerms(terms), termsHash, reason: why || (kind === 'counter' ? 'Contraproposta' : 'Nova proposta'), before: summarizeTerms(pend ? pend.terms : ag.terms), respondsTo: pend ? pend.no : null, status: 'pending', acceptedBy: [{ userId, at, termsHash }] };
    if (v.terms.mode === 'recurring') v.change = recurringChange(ag.status === 'active' ? ag.terms : null, v.terms);
    ag.versions.push(v);
    if (ag.status === 'refused') ag.status = 'proposed';
    return v;
  }
  function respondVersion(ag, { userId, versionNo, action, reason, at, termsHash, newIds, today }) {
    assertParty(ag, userId);
    const v = pendingVersion(ag);
    if (!v) fail('CONFLICT', 'Não há proposta pendente.');
    if (v.no !== versionNo) fail('STALE', 'Esta versão não é mais a vigente para aceite.');
    if (v.authorId === userId) fail('FORBIDDEN', 'Quem propôs não pode aceitar a própria proposta.');
    if (action === 'refuse') {
      v.status = 'refused'; v.closedAt = at; v.closedBy = userId; v.refuseReason = cleanText(reason, 300);
      if (ag.status === 'proposed') ag.status = 'refused';
      return v;
    }
    if (action !== 'accept') fail('VALIDATION', 'Ação inválida.');
    if (termsHash !== v.termsHash) fail('INTEGRITY', 'As condições foram alteradas após a proposta. Aceite bloqueado.');
    if (!ag.buyerId) fail('CONFLICT', 'Comprador ainda não vinculado.');
    canRenegotiate(ag);
    v.acceptedBy.push({ userId, at, termsHash });
    v.status = 'accepted'; v.closedAt = at; v.closedBy = userId;
    applyTerms(ag, v, at, newIds, today);
    return v;
  }
  function makeInstallments(plan, versionNo, newIds) {
    return plan.schedule.map((s) => ({ id: newIds(), kind: s.kind, seq: s.seq || null, due: s.due, amountCents: s.amountCents, paidCents: 0, discountCents: 0, status: 'pending', reports: [], earlyId: null, versionNo }));
  }
  function applyTerms(ag, v, at, newIds, today) {
    if (v.terms.mode === 'recurring') return applyRecurring(ag, v, at, newIds, today);
    const plan = calcPlan(v.terms);
    if (ag.status === 'active') {
      ag.schedule.forEach((s) => { if (OPEN.includes(s.status)) { s.status = 'replaced'; s.replacedBy = v.no; } });
    }
    ag.schedule.push(...makeInstallments(plan, v.no, newIds));
    ag.terms = v.terms; ag.currentVersion = v.no; ag.status = 'active'; ag.activatedAt = ag.activatedAt || at;
    refreshStatus(ag);
  }
  function refreshStatus(ag) {
    if (ag.billing === 'recurring' && !(ag.terms && (ag.terms.cancelled || (ag.recurring && ag.recurring.ended)))) return;
    if (ag.status === 'active' && ag.schedule.length && ag.schedule.every((s) => ['paid', 'replaced', 'consolidated'].includes(s.status))) ag.status = 'settled';
  }

  /* ---------- pagamentos e comprovantes ---------- */
  const MAX_FILE = 1.5 * 1024 * 1024;
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  const EXT_OK = { 'application/pdf': ['pdf'], 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'] };
  /** Detecta o tipo real pelos bytes iniciais (não confia na extensão nem no MIME do navegador). */
  function sniffType(bytes) {
    const b = bytes;
    if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
  }
  function validateAttachment({ name, size, declaredType, bytes }) {
    if (!bytes || !size) fail('VALIDATION', 'Anexe um comprovante em PDF ou imagem.');
    if (size > MAX_FILE) fail('VALIDATION', 'Arquivo acima de 1,5 MB.');
    const real = sniffType(bytes);
    if (!real || !ALLOWED_TYPES.includes(real)) fail('VALIDATION', 'Use PDF, PNG, JPG ou WebP. O conteúdo do arquivo não corresponde a esses formatos.');
    if (declaredType && declaredType !== real && !(declaredType === 'image/jpg' && real === 'image/jpeg')) fail('VALIDATION', 'A extensão/tipo do arquivo não confere com o conteúdo.');
    // 8.2 · extensão na lista permitida e coerente com o conteúdo real
    const clean = cleanText(name, 120).replace(/[\\/]/g, '_').replace(/\.{2,}/g, '.').replace(/^[.\s]+/, '');
    const ext = (clean.match(/\.([a-z0-9]{1,8})$/i) || [])[1];
    if (ext && !(EXT_OK[real] || []).includes(ext.toLowerCase())) fail('VALIDATION', 'A extensão do arquivo não é permitida ou não confere com o conteúdo (use .pdf, .png, .jpg ou .webp).');
    // 8.2 · recusa conteúdo ativo disfarçado (SVG/HTML/script embutido no começo do arquivo)
    const head = String.fromCharCode.apply(null, Array.from(bytes.subarray ? bytes.subarray(0, 1024) : bytes.slice(0, 1024))).toLowerCase();
    if (/<\s*(svg|html|script|iframe|object|embed)\b|javascript:/.test(head)) fail('VALIDATION', 'Arquivo recusado: contém conteúdo ativo (SVG/HTML/script).');
    return { type: real, name: clean || 'comprovante' };
  }
  function findInst(ag, id) { const s = ag.schedule.find((x) => x.id === id); if (!s) fail('NOT_FOUND', 'Parcela não encontrada.'); return s; }
  function reportPayment(ag, { userId, installmentId, amountCents, paidAt, comment, attachment, at, reportId }) {
    assertParty(ag, userId);
    if (ag.buyerId !== userId) fail('FORBIDDEN', 'Só o comprador informa pagamentos.');
    if (ag.status !== 'active') fail('CONFLICT', 'Acordo não está ativo.');
    const s = findInst(ag, installmentId);
    if (!OPEN.includes(s.status)) fail('CONFLICT', 'Esta parcela não está aberta para pagamento.');
    if (s.earlyId) fail('CONFLICT', 'Parcela incluída em antecipação. Use o fluxo da antecipação.');
    if (!attachment || !attachment.fileId || !attachment.sha256) fail('VALIDATION', 'O comprovante (PDF ou imagem) é obrigatório.');
    if (!isInt(amountCents) || amountCents <= 0 || amountCents > remainingOf(s)) fail('VALIDATION', 'Valor informado inválido para esta parcela.');
    if (!isISODate(paidAt)) fail('VALIDATION', 'Data do pagamento inválida.');
    if (paidInFuture(paidAt, at)) fail('VALIDATION', 'A data do pagamento não pode ser no futuro.');
    const r = { id: reportId, by: userId, at, amountCents, paidAt, comment: cleanText(comment, 400), attachment: { ...attachment }, status: 'review', locked: false };
    s.reports.push(r); s.status = 'review';
    return r;
  }
  function reviewPayment(ag, { userId, installmentId, reportId, decision, reason, at }) {
    assertParty(ag, userId);
    if (ag.sellerId !== userId) fail('FORBIDDEN', 'Só o vendedor confere comprovantes.');
    const s = findInst(ag, installmentId);
    const r = s.reports.find((x) => x.id === reportId);
    if (!r) fail('NOT_FOUND', 'Comprovante não encontrado.');
    if (r.locked || r.status === 'approved') fail('IMMUTABLE', 'Comprovante aprovado não pode ser alterado.');
    if (r.status !== 'review' || s.status !== 'review') fail('CONFLICT', 'Este comprovante não está em análise.');
    const why = cleanText(reason, 300);
    if (decision !== 'approve' && why.length < 5) fail('VALIDATION', 'Escreva uma justificativa (mín. 5 caracteres).');
    r.reviewedAt = at; r.reviewedBy = userId; r.reviewReason = why;
    if (decision === 'approve') {
      r.status = 'approved'; r.locked = true;
      s.paidCents += r.amountCents;
      s.status = remainingOf(s) <= 0 ? 'paid' : 'partial';
      if (s.status === 'paid') { s.paidAt = r.paidAt; s.paidConfirmedAt = at; closeDelayOnPaid(ag, s, at); }
    } else if (decision === 'correction') { r.status = 'correction'; s.status = 'correction'; }
    else if (decision === 'refuse') { r.status = 'refused'; s.status = s.paidCents > 0 ? 'partial' : 'pending'; }
    else fail('VALIDATION', 'Decisão inválida.');
    refreshStatus(ag);
    return r;
  }

  /* ---------- antecipação com desconto ---------- */
  function earlyEligible(ag, today) {
    if (ag.billing === 'recurring') return [];
    return ag.schedule.filter((s) => s.status === 'pending' && s.paidCents === 0 && s.discountCents === 0 && !s.earlyId && s.due > today).sort((a, b) => a.due.localeCompare(b.due));
  }
  function earlyCalc(ag, ids, pct) {
    const rows = ag.schedule.filter((s) => ids.includes(s.id));
    const gross = rows.reduce((a, s) => a + s.amountCents, 0);
    const p = pct == null ? 0 : pct;
    const discount = Math.round((gross * p) / 100);
    return { rows, grossCents: gross, pct: pct, discountCents: discount, netCents: gross - discount, balanceAfterCents: openBalance(ag) - gross };
  }
  const EARLY_ACTIVE = ['awaiting_buyer', 'awaiting_seller', 'accepted', 'review'];
  function activeEarly(ag) { return ag.early.find((e) => EARLY_ACTIVE.includes(e.status)) || null; }
  function checkEarlySelection(ag, ids, today) {
    if (!Array.isArray(ids) || !ids.length) fail('VALIDATION', 'Selecione ao menos uma parcela.');
    if (new Set(ids).size !== ids.length) fail('VALIDATION', 'Parcela repetida.');
    const ok = earlyEligible(ag, today).map((s) => s.id);
    if (!ids.every((id) => ok.includes(id))) fail('CONFLICT', 'Há parcela não elegível (vencida, paga, em análise ou já com desconto).');
  }
  function checkPct(pct) { if (!isInt(pct) || pct < 1 || pct > 70) fail('VALIDATION', 'O desconto deve ser de 1% a 70%.'); }
  function proposeEarly(ag, { userId, installmentIds, pct, at, today, id }) {
    assertParty(ag, userId);
    if (ag.status !== 'active') fail('CONFLICT', 'Acordo não está ativo.');
    if (activeEarly(ag)) fail('CONFLICT', 'Já existe uma antecipação em andamento.');
    if (ag.lockedBy) fail('CONFLICT', 'Este acordo está em uma proposta de unificação pendente.');
    if (pendingVersion(ag)) fail('CONFLICT', 'Há uma renegociação pendente neste acordo.');
    checkEarlySelection(ag, installmentIds, today);
    const seller = ag.sellerId === userId;
    if (seller) checkPct(pct); else pct = null; // o desconto é definido pelo vendedor
    const e = { id, createdBy: userId, at, status: seller ? 'awaiting_buyer' : 'awaiting_seller', rounds: [{ by: userId, at, installmentIds: [...installmentIds], pct }], installmentIds: [...installmentIds], pct, report: null, reports: [] };
    ag.early.push(e);
    return e;
  }
  function findEarly(ag, id) { const e = ag.early.find((x) => x.id === id); if (!e) fail('NOT_FOUND', 'Antecipação não encontrada.'); return e; }
  function respondEarly(ag, { userId, earlyId, action, installmentIds, pct, at, today, reason }) {
    assertParty(ag, userId);
    const e = findEarly(ag, earlyId);
    const role = roleOf(ag, userId);
    const awaiting = e.status === 'awaiting_buyer' ? 'buyer' : e.status === 'awaiting_seller' ? 'seller' : null;
    if (!awaiting) fail('CONFLICT', 'Esta antecipação não aguarda resposta.');
    if (awaiting !== role) fail('FORBIDDEN', 'Aguardando a outra parte.');
    if (action === 'refuse') { e.status = 'refused'; e.closedAt = at; e.reason = cleanText(reason, 300); return e; }
    if (action === 'accept') {
      if (e.pct == null) fail('CONFLICT', 'O vendedor precisa definir o desconto antes do aceite.');
      checkEarlySelection(ag, e.installmentIds, today);
      e.status = 'accepted'; e.acceptedAt = at;
      e.installmentIds.forEach((id) => { findInst(ag, id).earlyId = e.id; });
      const c = earlyCalc(ag, e.installmentIds, e.pct);
      e.grossCents = c.grossCents; e.discountCents = c.discountCents; e.netCents = c.netCents;
      return e;
    }
    if (action === 'counter') {
      const ids = installmentIds || e.installmentIds;
      checkEarlySelection(ag, ids, today);
      if (role === 'seller') { checkPct(pct); e.status = 'awaiting_buyer'; }
      else { pct = null; e.status = 'awaiting_seller'; }
      e.installmentIds = [...ids]; e.pct = pct;
      e.rounds.push({ by: userId, at, installmentIds: [...ids], pct });
      return e;
    }
    fail('VALIDATION', 'Ação inválida.');
  }
  function reportEarlyPayment(ag, { userId, earlyId, paidAt, comment, attachment, at, reportId }) {
    assertParty(ag, userId);
    if (ag.buyerId !== userId) fail('FORBIDDEN', 'Só o comprador informa o pagamento.');
    const e = findEarly(ag, earlyId);
    if (e.status !== 'accepted') fail('CONFLICT', 'A antecipação precisa estar aceita pelas duas partes.');
    if (!attachment || !attachment.fileId || !attachment.sha256) fail('VALIDATION', 'O comprovante (PDF ou imagem) é obrigatório.');
    if (!isISODate(paidAt)) fail('VALIDATION', 'Data do pagamento inválida.');
    if (paidInFuture(paidAt, at)) fail('VALIDATION', 'A data do pagamento não pode ser no futuro.');
    const r = { id: reportId, by: userId, at, amountCents: e.netCents, paidAt, comment: cleanText(comment, 400), attachment: { ...attachment }, status: 'review', locked: false };
    e.reports.push(r); e.status = 'review';
    return r;
  }
  function reviewEarlyPayment(ag, { userId, earlyId, decision, reason, at }) {
    assertParty(ag, userId);
    if (ag.sellerId !== userId) fail('FORBIDDEN', 'Só o vendedor confere comprovantes.');
    const e = findEarly(ag, earlyId);
    const r = e.reports[e.reports.length - 1];
    if (!r || e.status !== 'review' || r.status !== 'review') fail('CONFLICT', 'Nada em análise.');
    const why = cleanText(reason, 300);
    r.reviewedAt = at; r.reviewedBy = userId; r.reviewReason = why;
    if (decision === 'approve') {
      r.status = 'approved'; r.locked = true;
      // distribui o desconto proporcionalmente; a última parcela absorve o arredondamento
      const rows = e.installmentIds.map((id) => findInst(ag, id));
      let left = e.discountCents;
      rows.forEach((s, i) => {
        if (s.discountCents > 0) fail('IMMUTABLE', 'Desconto já aplicado nesta parcela.');
        const d = i === rows.length - 1 ? left : Math.round((e.discountCents * s.amountCents) / e.grossCents);
        left -= d;
        s.discountCents = d; s.paidCents = s.amountCents - d; s.status = 'paid'; s.paidAt = r.paidAt;
        s.reports.push({ id: r.id + ':' + s.id, by: r.by, at: r.at, amountCents: s.paidCents, paidAt: r.paidAt, comment: 'Antecipação', attachment: r.attachment, status: 'approved', locked: true, earlyId: e.id, reviewedAt: at, reviewedBy: userId });
      });
      e.status = 'settled'; e.closedAt = at;
      refreshStatus(ag);
    } else if (decision === 'correction') {
      if (why.length < 5) fail('VALIDATION', 'Escreva uma justificativa (mín. 5 caracteres).');
      r.status = 'correction'; e.status = 'accepted';
    } else fail('VALIDATION', 'Decisão inválida.');
    return r;
  }
  function releaseEarlyLocks(ag, e) { if (['refused'].includes(e.status)) ag.schedule.forEach((s) => { if (s.earlyId === e.id) s.earlyId = null; }); }

  /* ---------- unificação de dívidas ---------- */
  function consolidationEligible(agreements, sellerId, buyerId) {
    return agreements.filter((a) => a.sellerId === sellerId && a.buyerId === buyerId && a.status === 'active' && a.billing !== 'recurring' && !pendingVersion(a) && !a.schedule.some((s) => s.status === 'review') && !activeEarly(a) && !a.lockedBy && openBalance(a) > 0);
  }
  function consolidationSnapshot(agreements) {
    return agreements.map((a) => ({ agreementId: a.id, title: a.title, category: a.category, openCents: openBalance(a), openInstallments: a.schedule.filter((s) => OPEN.includes(s.status)).length, nextInstallmentCents: (a.schedule.filter((s) => OPEN.includes(s.status)).sort((x, y) => x.due.localeCompare(y.due))[0] || {}).amountCents || 0 }));
  }
  function consolidationPreview(origins, terms) {
    const principal = origins.reduce((a, o) => a + o.openCents, 0);
    const plan = calcPlan({ ...terms, totalCents: principal, downCents: 0, extras: [] });
    return { principalCents: principal, beforeMonthlyCents: origins.reduce((a, o) => a + o.nextInstallmentCents, 0), plan };
  }
  function proposeConsolidation(all, { id, userId, originIds, terms, at, termsHash, reason }) {
    const origins = originIds.map((oid) => all.find((a) => a.id === oid));
    if (origins.length < 2 || origins.some((a) => !a)) fail('VALIDATION', 'Selecione ao menos duas dívidas.');
    if (new Set(originIds).size !== originIds.length) fail('VALIDATION', 'Dívida repetida.');
    origins.forEach((a) => assertParty(a, userId));
    const sellerId = origins[0].sellerId, buyerId = origins[0].buyerId;
    if (sellerId !== userId) fail('FORBIDDEN', 'Só o vendedor propõe unificação.');
    const eligible = consolidationEligible(all, sellerId, buyerId).map((a) => a.id);
    if (!originIds.every((x) => eligible.includes(x))) fail('CONFLICT', 'Há dívida não elegível (pendências, comprovante em análise ou antecipação).');
    const snap = consolidationSnapshot(origins);
    const principal = snap.reduce((a, o) => a + o.openCents, 0);
    const t = normalizeTerms({ ...terms, totalCents: principal, downCents: 0, extras: [] });
    origins.forEach((a) => { a.lockedBy = id; });
    return { id, sellerId, buyerId, createdAt: at, status: 'pending', originIds: [...originIds], snapshot: snap, title: cleanText(terms.title || 'Dívidas unificadas', 80), versions: [{ no: 1, authorId: userId, at, terms: t, termsHash, reason: cleanText(reason || 'Proposta de unificação', 300), status: 'pending', acceptedBy: [{ userId, at, termsHash }] }] };
  }
  function respondConsolidation(c, all, { userId, versionNo, action, terms, reason, at, termsHash, newIds, newAgreementId }) {
    if (c.sellerId !== userId && c.buyerId !== userId) fail('FORBIDDEN', 'Você não é parte desta unificação.');
    if (c.status !== 'pending') fail('CONFLICT', 'Unificação encerrada.');
    const v = c.versions.find((x) => x.status === 'pending');
    if (v.no !== versionNo) fail('STALE', 'Esta versão não é mais a vigente.');
    if (v.authorId === userId) fail('FORBIDDEN', 'Quem propôs não pode aceitar a própria proposta.');
    const origins = c.originIds.map((id) => all.find((a) => a.id === id));
    const unlock = () => origins.forEach((a) => { if (a && a.lockedBy === c.id) delete a.lockedBy; });
    if (action === 'refuse') { v.status = 'refused'; v.closedAt = at; c.status = 'refused'; c.reason = cleanText(reason, 300); unlock(); return { c }; }
    if (action === 'counter') {
      v.status = 'superseded'; v.closedAt = at;
      const t = normalizeTerms({ ...terms, totalCents: v.terms.totalCents, downCents: 0, extras: [] });
      const nv = { no: c.versions.length + 1, authorId: userId, at, terms: t, termsHash, reason: cleanText(reason || 'Contraproposta', 300), respondsTo: v.no, status: 'pending', acceptedBy: [{ userId, at, termsHash }] };
      c.versions.push(nv);
      return { c, version: nv };
    }
    if (action !== 'accept') fail('VALIDATION', 'Ação inválida.');
    if (termsHash !== v.termsHash) fail('INTEGRITY', 'Condições alteradas após a proposta.');
    // saldo de origem não pode ter mudado desde a proposta (sem duplicar valores quitados)
    const snapNow = consolidationSnapshot(origins);
    snapNow.forEach((s, i) => { if (s.openCents !== c.snapshot[i].openCents) fail('STALE', 'O saldo de uma dívida de origem mudou. Refaça a proposta.'); });
    v.status = 'accepted'; v.closedAt = at; v.acceptedBy.push({ userId, at, termsHash });
    const plan = calcPlan(v.terms);
    const ag = {
      id: newAgreementId, title: c.title, category: 'Unificação', description: 'Unificação de: ' + c.snapshot.map((s) => s.title).join(', '), currency: origins[0].currency,
      sellerId: c.sellerId, buyerId: c.buyerId, buyerEmail: null, createdBy: c.sellerId, createdAt: at, status: 'active', activatedAt: at,
      versions: [{ ...v, kind: 'consolidation' }], currentVersion: 1, terms: v.terms, schedule: makeInstallments(plan, 1, newIds), early: [],
      origins: c.snapshot.map((s) => ({ ...s })), consolidationId: c.id, consolidatedInto: null, notes: [],
    };
    ag.versions[0].no = 1;
    origins.forEach((a) => {
      a.schedule.forEach((s) => { if (OPEN.includes(s.status)) { s.status = 'consolidated'; s.consolidatedInto = ag.id; } });
      a.status = 'consolidated'; a.consolidatedInto = ag.id; delete a.lockedBy;
    });
    c.status = 'accepted'; c.resultAgreementId = ag.id;
    return { c, agreement: ag };
  }


  /* =====================================================================
   * PACTOX 8.1 — categorias, modalidades de cobrança, recorrência,
   * justificativa de atraso, Assistente, calendário, clientes, painéis.
   * ===================================================================== */
  const BILLING = ['installment', 'recurring', 'single'];
  const BILLING_LABEL = { installment: 'Venda parcelada', recurring: 'Serviço recorrente', single: 'Serviço avulso' };
  const F = (key, label, type = 'text', opt) => ({ key, label, type, optional: !!opt });
  /** Categorias editáveis e expansíveis: grupos padrão + campos leves específicos. */
  const CATEGORY_GROUPS = [
    { id: 'pessoa', label: 'Pessoa física', billing: 'installment', items: ['Venda entre pessoas', 'Empréstimo', 'Bem usado'], fields: [F('bem', 'Bem ou valor negociado'), F('relacao', 'Relação entre as partes', 'text', 1)] },
    { id: 'comercio', label: 'Comércio', billing: 'installment', items: ['Roupas e acessórios', 'Eletrônicos', 'Móveis', 'Alimentos'], fields: [F('produto', 'Produto'), F('garantia', 'Garantia', 'text', 1)] },
    { id: 'servicos', label: 'Serviços', billing: 'single', items: ['Design', 'Manutenção', 'Consultoria', 'Fotografia'], fields: [F('servico', 'Serviço prestado'), F('entrega', 'Data de entrega', 'date', 1)] },
    { id: 'beleza', label: 'Beleza e estética', billing: 'recurring', items: ['Manicure', 'Cabeleireiro', 'Estética'], fields: [F('servico', 'Serviço realizado'), F('dataAtendimento', 'Data do atendimento', 'date', 1)] },
    { id: 'saude', label: 'Saúde e esporte', billing: 'recurring', items: ['Personal trainer', 'Nutrição', 'Fisioterapia'], fields: [F('plano', 'Plano contratado'), F('inicio', 'Início', 'date', 1), F('termino', 'Término', 'date', 1)] },
    { id: 'educacao', label: 'Educação', billing: 'recurring', items: ['Aulas particulares', 'Cursos', 'Idiomas'], fields: [F('disciplina', 'Disciplina ou curso'), F('turma', 'Turma/horário', 'text', 1)] },
    { id: 'imovel', label: 'Imóvel', billing: 'installment', items: ['Imóvel', 'Aluguel', 'Terreno'], fields: [F('imovel', 'Identificação do imóvel'), F('prazo', 'Prazo contratual', 'text', 1)] },
    { id: 'veiculo', label: 'Veículo', billing: 'installment', items: ['Veículo', 'Moto', 'Bicicleta'], fields: [F('modelo', 'Modelo'), F('placa', 'Placa', 'text', 1)] },
    { id: 'domestico', label: 'Serviços domésticos', billing: 'recurring', items: ['Diarista', 'Jardinagem', 'Cuidador'], fields: [F('servico', 'Serviço'), F('frequencia', 'Dias combinados', 'text', 1)] },
    { id: 'outros', label: 'Outros', billing: 'installment', items: ['Outro'], fields: [F('detalhe', 'Detalhe do combinado', 'text', 1)] },
  ];
  const LEGACY_GROUP = { 'Imóvel': 'imovel', 'Veículo': 'veiculo', 'Eletrônicos': 'comercio', 'Roupas': 'comercio', 'Serviço': 'servicos', 'Empréstimo': 'pessoa', 'Unificação': 'outros', 'Outro': 'outros' };
  function groupOfCategory(cat) {
    if (LEGACY_GROUP[cat]) return LEGACY_GROUP[cat];
    const g = CATEGORY_GROUPS.find((x) => x.items.includes(cat));
    return g ? g.id : 'outros';
  }
  function categoryFields(groupId) { const g = CATEGORY_GROUPS.find((x) => x.id === groupId); return g ? g.fields : []; }
  function cleanFields(f) {
    const out = {};
    if (!f || typeof f !== 'object') return out;
    Object.keys(f).slice(0, 8).forEach((k) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,23}$/.test(k)) return;
      const v = cleanText(f[k], 120);
      if (v) out[k] = v;
    });
    return out;
  }
  /** Categoria personalizada criada pelo usuário (lista dele, até 30). */
  function cleanCustomCategories(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.slice(0, 30).map((c) => ({ label: cleanText(c && c.label, 40), group: CATEGORY_GROUPS.some((g) => g.id === (c && c.group)) ? c.group : 'outros' }))
      .filter((c) => c.label.length >= 2 && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()));
  }

  /* ---------- recorrência ---------- */
  const REC_PERIODS = { weekly: 7, biweekly: 14, monthly: null, custom: null };
  function normalizeRecurring(t) {
    const r = {
      mode: 'recurring', amountCents: t.amountCents, periodicity: t.periodicity, intervalDays: t.periodicity === 'custom' ? Number(t.intervalDays) : null,
      startDate: t.startDate, endDate: t.endDate || null, suspended: !!t.suspended, cancelled: !!t.cancelled,
    };
    if (!isInt(r.amountCents) || r.amountCents <= 0 || r.amountCents > 100000000000) fail('VALIDATION', 'Valor por período inválido.');
    if (!(r.periodicity in REC_PERIODS)) fail('VALIDATION', 'Periodicidade inválida.');
    if (r.periodicity === 'custom' && (!Number.isInteger(r.intervalDays) || r.intervalDays < 1 || r.intervalDays > 365)) fail('VALIDATION', 'Intervalo personalizado entre 1 e 365 dias.');
    if (!isISODate(r.startDate)) fail('VALIDATION', 'Data da primeira cobrança inválida.');
    if (r.endDate && (!isISODate(r.endDate) || r.endDate < r.startDate)) fail('VALIDATION', 'Data de término inválida.');
    if (r.suspended && r.cancelled) fail('VALIDATION', 'Contrato não pode estar suspenso e cancelado ao mesmo tempo.');
    return r;
  }
  function recurringDate(anchor, t, k) {
    if (t.periodicity === 'monthly') return plusMonths(anchor, k);
    return plusDays(anchor, (t.periodicity === 'custom' ? t.intervalDays : REC_PERIODS[t.periodicity]) * k);
  }
  /** Classifica a mudança proposta: suspensão, retomada, reajuste, cancelamento, renovação. */
  const RECURRING_CHANGES = ['start', 'suspend', 'resume', 'readjust', 'cancel', 'renew'];
  function recurringChange(prev, next) {
    if (!prev) return 'start';
    if (next.cancelled && !prev.cancelled) return 'cancel';
    if (!next.cancelled && prev.cancelled) return 'renew';
    if (next.suspended && !prev.suspended) return 'suspend';
    if (!next.suspended && prev.suspended) return 'resume';
    if ((next.endDate || '9999') > (prev.endDate || '9999')) return 'renew';
    return 'readjust';
  }
  function applyRecurring(ag, v, at, newIds, today) {
    const prev = ag.status === 'active' ? ag.terms : null;
    const t = v.terms;
    ag.terms = t; ag.currentVersion = v.no; ag.status = 'active'; ag.activatedAt = ag.activatedAt || at;
    if (!ag.recurring || !prev) ag.recurring = { anchor: t.startDate, k: 0, ended: false, history: [] };
    const R = ag.recurring;
    const ch = v.change || recurringChange(prev, t);
    const cursor = recurringDate(R.anchor, prev || t, R.k);
    const periodChanged = prev && (prev.periodicity !== t.periodicity || prev.intervalDays !== t.intervalDays);
    if (periodChanged) { R.anchor = cursor; R.k = 0; }
    if ((ch === 'resume' || ch === 'renew') && today) {
      let a = recurringDate(R.anchor, t, R.k), k = 0;
      while (a < today && k < 1000) { k++; a = recurringDate(R.anchor, t, R.k + k); }
      R.anchor = a; R.k = 0; R.ended = false;
    }
    R.history.push({ at, versionNo: v.no, change: ch, amountCents: t.amountCents, periodicity: t.periodicity });
    if (today) generateRecurring(ag, today, newIds);
    refreshStatus(ag);
  }
  /** Gera SOMENTE as cobranças do período corrente/próximo (até `horizon` dias). Nunca a dívida futura inteira. */
  function generateRecurring(ag, today, newIds, horizon = 7) {
    if (ag.billing !== 'recurring' || ag.status !== 'active' || !ag.recurring) return [];
    const t = ag.terms; const R = ag.recurring;
    if (t.suspended || t.cancelled || R.ended) return [];
    const limit = plusDays(today, horizon); const out = [];
    for (let guard = 0; guard < 120; guard++) {
      const due = recurringDate(R.anchor, t, R.k);
      if (t.endDate && due > t.endDate) { R.ended = true; break; }
      if (due > limit) break;
      const next = recurringDate(R.anchor, t, R.k + 1);
      const seq = ag.schedule.filter((s) => s.kind === 'recurring').length + 1;
      const inst = { id: newIds(), kind: 'recurring', seq, due, amountCents: t.amountCents, paidCents: 0, discountCents: 0, status: 'pending', reports: [], earlyId: null, versionNo: ag.currentVersion, period: { from: due, to: plusDays(next, -1) } };
      ag.schedule.push(inst); out.push(inst); R.k++;
    }
    refreshStatus(ag);
    return out;
  }
  /** Valor mensal equivalente (previsão, nunca soma como recebido). */
  function monthlyEquivalent(t) {
    if (!t || t.mode !== 'recurring' || t.suspended || t.cancelled) return 0;
    const days = t.periodicity === 'monthly' ? null : t.periodicity === 'custom' ? t.intervalDays : REC_PERIODS[t.periodicity];
    return days ? Math.round(t.amountCents * 30 / days) : t.amountCents;
  }

  /* ---------- justificativa de atraso (versionada e bilateral) ---------- */
  function pendingDelay(ag, installmentId) { return (ag.delays || []).find((d) => d.status === 'pending' && (!installmentId || d.installmentId === installmentId)) || null; }
  function proposeDelay(ag, { id, userId, installmentId, newDate, reason, note, attachment, at, today }) {
    assertParty(ag, userId);
    if (ag.buyerId !== userId) fail('FORBIDDEN', 'Só o comprador justifica um atraso.');
    if (ag.status !== 'active') fail('CONFLICT', 'Acordo não está ativo.');
    const s = findInst(ag, installmentId);
    if (!OPEN.includes(s.status) || s.earlyId) fail('CONFLICT', 'Esta parcela não está aberta.');
    if (!(s.due < today)) fail('CONFLICT', 'Só é possível justificar uma parcela já vencida.');
    if (pendingDelay(ag, installmentId)) fail('CONFLICT', 'Já existe uma justificativa em análise para esta parcela.');
    const why = cleanText(reason, 300);
    if (why.length < 5) fail('VALIDATION', 'Explique o motivo do atraso (mín. 5 caracteres).');
    if (!isISODate(newDate) || newDate <= today) fail('VALIDATION', 'Informe uma nova data futura para pagamento.');
    if (newDate > plusDays(today, 180)) fail('VALIDATION', 'Nova data até 180 dias.');
    if (attachment && (!attachment.fileId || !attachment.sha256)) fail('VALIDATION', 'Anexo inválido.');
    ag.delays = ag.delays || [];
    const d = { id, installmentId, status: 'pending', createdAt: at, originalDue: s.due, overdueSince: s.due,
      versions: [{ no: 1, authorId: userId, at, newDate, feeCents: 0, reason: why, note: cleanText(note, 400), attachment: attachment ? { ...attachment } : null, status: 'pending' }] };
    ag.delays.push(d); s.delayId = id;
    return d;
  }
  function respondDelay(ag, { userId, delayId, action, newDate, feeCents = 0, reason, at, today, newIds }) {
    assertParty(ag, userId);
    const d = (ag.delays || []).find((x) => x.id === delayId);
    if (!d) fail('NOT_FOUND', 'Justificativa não encontrada.');
    if (d.status !== 'pending') fail('CONFLICT', 'Esta justificativa já foi concluída.');
    const v = d.versions[d.versions.length - 1];
    if (v.authorId === userId) fail('FORBIDDEN', 'Quem propôs não pode responder à própria proposta.');
    const s = findInst(ag, d.installmentId);
    if (!OPEN.includes(s.status)) fail('CONFLICT', 'A parcela mudou de situação. Atualize a tela.');
    const why = cleanText(reason, 300);
    if (action === 'refuse') {
      if (why.length < 5) fail('VALIDATION', 'Escreva o motivo da recusa (mín. 5 caracteres).');
      v.status = 'refused'; d.status = 'refused'; d.closedAt = at; d.closedBy = userId; d.refuseReason = why; s.delayId = null;
      return { d, v };
    }
    if (action === 'counter') {
      if (!isISODate(newDate) || newDate <= today) fail('VALIDATION', 'Informe uma nova data futura.');
      if (!isInt(feeCents) || feeCents < 0 || feeCents > s.amountCents) fail('VALIDATION', 'Encargo inválido (até o valor da parcela).');
      v.status = 'superseded';
      const nv = { no: v.no + 1, authorId: userId, at, newDate, feeCents, reason: why || 'Contraproposta', note: '', attachment: null, status: 'pending' };
      d.versions.push(nv);
      return { d, v: nv };
    }
    if (action !== 'accept') fail('VALIDATION', 'Ação inválida.');
    v.status = 'accepted'; d.status = 'accepted'; d.closedAt = at; d.closedBy = userId;
    s.overdueRecords = s.overdueRecords || [];
    s.overdueRecords.push({ due: s.due, overdueSince: d.overdueSince, resolvedAt: at, delayId: d.id, newDate: v.newDate });
    s.originalDue = s.originalDue || s.due;
    s.due = v.newDate; s.delayId = null;
    if (v.feeCents > 0) ag.schedule.push({ id: newIds(), kind: 'fee', seq: null, due: v.newDate, amountCents: v.feeCents, paidCents: 0, discountCents: 0, status: 'pending', reports: [], earlyId: null, versionNo: ag.currentVersion, feeFor: s.id });
    return { d, v };
  }
  function closeDelayOnPaid(ag, s, at) {
    const d = pendingDelay(ag, s.id);
    if (d) { d.status = 'closed_paid'; d.closedAt = at; d.versions[d.versions.length - 1].status = 'closed'; }
    s.delayId = null;
  }

  /* ---------- Assistente PACTOX: preferências e regras ---------- */
  const ASSISTANT_DEFAULTS = { enabled: true, pausedUntil: null, leadDays: 7, d7: true, d3: true, d0: true, overdue: true, overdueEveryDays: 3, hourFrom: 8, hourTo: 20, muted: [] };
  function cleanAssistant(p, base) {
    const a = { ...ASSISTANT_DEFAULTS, ...(base || {}) };
    if (!p) return a;
    ['enabled', 'd7', 'd3', 'd0', 'overdue'].forEach((k) => { if (typeof p[k] === 'boolean') a[k] = p[k]; });
    if (Number.isInteger(p.leadDays) && p.leadDays >= 1 && p.leadDays <= 15) a.leadDays = p.leadDays;
    if ([1, 3, 7].includes(p.overdueEveryDays)) a.overdueEveryDays = p.overdueEveryDays;
    if (Number.isInteger(p.hourFrom) && Number.isInteger(p.hourTo) && p.hourFrom >= 0 && p.hourTo <= 24 && p.hourFrom < p.hourTo) { a.hourFrom = p.hourFrom; a.hourTo = p.hourTo; }
    if (p.pausedUntil === null || isISODate(p.pausedUntil)) a.pausedUntil = p.pausedUntil;
    if (Array.isArray(p.muted)) a.muted = p.muted.filter((x) => typeof x === 'string' && x.length < 60).slice(0, 200);
    return a;
  }
  /** Por que o Assistente está calado para esta parcela (ou null se deve lembrar). */
  function reminderBlock(a, s, prefs, today) {
    if (prefs.enabled === false) return 'disabled';
    if (prefs.pausedUntil && prefs.pausedUntil >= today) return 'paused';
    if ((prefs.muted || []).includes(a.id)) return 'muted';
    if (s.status === 'review') return 'proof_review';
    if (s.delayId) return 'delay_review';
    if (!OPEN.includes(s.status)) return 'closed';
    if (s.earlyId) return 'early';
    return null;
  }

  /* ---------- calendário (somente acordos autorizados do usuário) ---------- */
  function calendarColor(s, today, soonDays = 7) {
    if (s.status === 'paid') return 'green';
    if (s.status === 'review' || s.delayId) return 'blue';
    if (OPEN.includes(s.status) && s.due < today) return 'red';
    if (OPEN.includes(s.status) && daysBetween(today, s.due) <= soonDays) return 'yellow';
    return 'gray';
  }
  function calendarItems(agreements, userId, { from, to, today, role = 'all', soonDays = 7 }) {
    const out = [];
    agreements.filter((a) => isParty(a, userId) && ['active', 'settled', 'consolidated', 'proposed'].includes(a.status))
      .filter((a) => role === 'all' || roleOf(a, userId) === role).forEach((a) => {
        const r = roleOf(a, userId);
        if (a.status === 'proposed') {
          const pv = pendingVersion(a);
          const d = pv && (pv.terms.firstDue || pv.terms.startDate);
          if (d && (!from || d >= from) && (!to || d <= to)) out.push({ date: d, kind: 'proposal', agreementId: a.id, title: a.title, role: r, counterpartId: counterpartOf(a, userId), amountCents: pv.terms.totalCents || pv.terms.amountCents, color: 'gray', status: 'proposal' });
          return;
        }
        a.schedule.filter((s) => !['replaced', 'consolidated'].includes(s.status)).forEach((s) => {
          if ((from && s.due < from) || (to && s.due > to)) return;
          out.push({ date: s.due, kind: s.kind, agreementId: a.id, installmentId: s.id, seq: s.seq, title: a.title, category: a.category, billing: a.billing || 'installment', role: r, counterpartId: counterpartOf(a, userId), amountCents: remainingOf(s) || s.amountCents, paidCents: s.paidCents, color: calendarColor(s, today, soonDays), status: installmentStatus(s, today), originalDue: s.originalDue || null, delayPending: !!s.delayId });
        });
      });
    return out.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
  }

  /* ---------- central de clientes ---------- */
  function clients(agreements, userId, today) {
    const map = new Map();
    agreements.filter((a) => a.sellerId === userId && a.buyerId && ['active', 'settled', 'consolidated', 'proposed', 'refused'].includes(a.status)).forEach((a) => {
      const c = map.get(a.buyerId) || { id: a.buyerId, agreementIds: [], categories: new Set(), billing: new Set(), activeCount: 0, paidCents: 0, openCents: 0, overdueCents: 0, overdueCount: 0, reviewCount: 0, nextDue: null, lastPaidAt: null };
      c.agreementIds.push(a.id); c.categories.add(a.category); c.billing.add(a.billing || 'installment');
      if (a.status === 'active') c.activeCount++;
      a.schedule.forEach((s) => {
        c.paidCents += s.paidCents;
        if (s.paidAt && (!c.lastPaidAt || s.paidAt > c.lastPaidAt)) c.lastPaidAt = s.paidAt;
        if (s.status === 'review') c.reviewCount++;
        if (OPEN.includes(s.status) || s.status === 'review') {
          c.openCents += remainingOf(s);
          if (OPEN.includes(s.status) && s.due < today) { c.overdueCents += remainingOf(s); c.overdueCount++; }
          else if (!c.nextDue || s.due < c.nextDue) c.nextDue = s.due;
        }
      });
      map.set(a.buyerId, c);
    });
    return [...map.values()].map((c) => ({ ...c, categories: [...c.categories], billing: [...c.billing], status: c.overdueCount ? 'late' : c.reviewCount || (c.nextDue && daysBetween(today, c.nextDue) <= 3) ? 'attention' : c.activeCount ? 'ok' : 'closed' }));
  }

  /* ---------- painéis por perfil (previsto ≠ recebido; cada número tem composição) ---------- */
  function dashboards(agreements, userId, today) {
    const month = today.slice(0, 7);
    const item = (a, s, extra) => ({ agreementId: a.id, installmentId: s && s.id, title: a.title, counterpartId: counterpartOf(a, userId), due: s && s.due, amountCents: s ? remainingOf(s) : 0, ...extra });
    const box = () => ({ cents: 0, count: 0, items: [] });
    const add = (b, it, cents) => { b.cents += cents; b.count++; b.items.push({ ...it, amountCents: cents }); };
    const seller = { forecastMonth: box(), receivedMonth: box(), overdue: box(), review: box(), attention: [] };
    const buyer = { dueMonth: box(), next: null, paidTotal: box(), remaining: box(), overdue: box() };
    const recurring = { forecastMonthly: box(), receivedMonth: box(), pending: box(), activeClients: box(), history: [] };
    const mine = agreements.filter((a) => isParty(a, userId) && ['active', 'settled', 'consolidated'].includes(a.status));
    mine.forEach((a) => {
      const r = roleOf(a, userId); const rec = a.billing === 'recurring';
      a.schedule.forEach((s) => {
        if (['replaced', 'consolidated'].includes(s.status) && !s.paidCents) return;
        const open = OPEN.includes(s.status) || s.status === 'review';
        const rem = remainingOf(s);
        // t40u (docs/SEMANTICA_DATAS.md): "Recebido no mês" = mês da DATA EFETIVA do pagamento (paidAt) de relatórios APROVADOS; a aprovação (reviewedAt) é só informação.
        const conf = confirmedIn(a, s, month);
        const paidThisMonth = conf.reduce((t, x) => t + x.amountCents, 0);
        const rcpt = { paidAt: conf.map((x) => x.paidAt).sort().pop() || null, approvedAt: conf.map((x) => approvedAtOf(a, x)).sort().pop() || null };
        if (r === 'seller') {
          if (open && s.due.slice(0, 7) === month) add(seller.forecastMonth, item(a, s), rem);
          if (paidThisMonth) add(seller.receivedMonth, item(a, s, { paid: true, ...rcpt }), paidThisMonth);
          if (OPEN.includes(s.status) && s.due < today) add(seller.overdue, item(a, s), rem);
          if (s.status === 'review') add(seller.review, item(a, s), rem);
          if (rec) {
            if (open) add(recurring.pending, item(a, s), rem);
            if (paidThisMonth) add(recurring.receivedMonth, item(a, s, { paid: true, ...rcpt }), paidThisMonth);
            if (s.paidCents) recurring.history.push(item(a, s, { amountCents: s.paidCents, paidAt: s.paidAt }));
          }
        } else {
          if (open && s.due.slice(0, 7) === month) add(buyer.dueMonth, item(a, s), rem);
          if (s.paidCents) add(buyer.paidTotal, item(a, s, { paid: true }), s.paidCents);
          if (open) add(buyer.remaining, item(a, s), rem);
          if (OPEN.includes(s.status) && s.due < today) add(buyer.overdue, item(a, s), rem);
          if (OPEN.includes(s.status) && s.due >= today && (!buyer.next || s.due < buyer.next.due)) buyer.next = item(a, s);
        }
      });
      if (r === 'seller' && rec && a.status === 'active') {
        const me = monthlyEquivalent(a.terms);
        if (me) add(recurring.forecastMonthly, { agreementId: a.id, title: a.title, counterpartId: a.buyerId, periodicity: a.terms.periodicity }, me);
        if (!a.terms.cancelled) recurring.activeClients.items.some((x) => x.counterpartId === a.buyerId) || add(recurring.activeClients, { agreementId: a.id, title: a.title, counterpartId: a.buyerId }, 0);
      }
    });
    seller.attention = clients(agreements, userId, today).filter((c) => c.status === 'late' || c.status === 'attention');
    recurring.history.sort((x, y) => (y.paidAt || '').localeCompare(x.paidAt || ''));
    const hasRecurring = mine.some((a) => a.sellerId === userId && a.billing === 'recurring');
    return { seller, buyer, recurring, hasRecurring, month };
  }

  /* ---------- outbox desacoplada (integrações futuras: e-mail, push, WhatsApp, Leads) ---------- */
  const OUTBOX_TYPES = ['payment.due_soon', 'payment.due_today', 'payment.overdue', 'payment.proof_submitted', 'payment.confirmed', 'negotiation.created', 'negotiation.accepted', 'negotiation.rejected', 'delay.justification_submitted', 'delay.justification_accepted'];

  /* ---------- notificações de vencimento ---------- */
  /** Gera lembretes (sem duplicidade: chave única por parcela+janela). */
  function dueReminders(agreements, userId, prefsIn, today, hour) {
    const prefs = cleanAssistant(null, prefsIn || {});
    const out = [];
    if (prefs.enabled === false || (prefs.pausedUntil && prefs.pausedUntil >= today)) return out;
    if (Number.isInteger(hour) && (hour < prefs.hourFrom || hour >= prefs.hourTo)) return out; // fora do horário preferido: fica para depois
    const lead = prefs.leadDays || 7;
    const windows = [...new Set([prefs.d0 ? 0 : null, prefs.d3 ? 3 : null, prefs.d7 ? lead : null].filter((x) => x !== null))].sort((a, b) => a - b);
    agreements.filter((a) => a.status === 'active' && isParty(a, userId)).forEach((a) => {
      const role = roleOf(a, userId);
      a.schedule.forEach((s) => {
        if (reminderBlock(a, s, prefs, today)) return;
        const diff = daysBetween(today, s.due);
        const amt = remainingOf(s);
        const base = { agreementId: a.id, installmentId: s.id, days: diff, amountCents: amt, due: s.due, role, title: a.title };
        const w = windows.find((x) => diff >= 0 && diff <= x);
        if (w !== undefined) out.push({ ...base, key: `due:${s.id}${s.originalDue ? ':' + s.due : ''}:${w}`, type: 'due', event: diff === 0 ? 'payment.due_today' : 'payment.due_soon' });
        if (diff < 0 && prefs.overdue) {
          const b = Math.floor((-diff - 1) / (prefs.overdueEveryDays || 1));
          out.push({ ...base, key: `overdue:${s.id}${s.originalDue ? ':' + s.due : ''}` + (b ? `:${b}` : ''), type: 'overdue', event: 'payment.overdue' });
        }
      });
    });
    return out;
  }

  /* ---------- projeções ---------- */
  function projections(agreements, userId, { role = 'all', agreementId = null, counterpartId = null, from = null, to = null, today }) {
    const list = agreements.filter((a) => isParty(a, userId) && ['active', 'settled', 'consolidated'].includes(a.status))
      .filter((a) => role === 'all' || roleOf(a, userId) === role)
      .filter((a) => !agreementId || a.id === agreementId)
      .filter((a) => !counterpartId || counterpartOf(a, userId) === counterpartId);
    const res = { contracted: 0, paid: 0, pending: 0, interest: 0, discount: 0, overdue: 0, overdueCount: 0, settlement: null, monthly: {}, yearly: {}, agreements: list.length };
    list.forEach((a) => {
      const t = totals(a);
      if (a.status !== 'consolidated') { res.contracted += t.contracted; res.interest += t.interest; }
      res.discount += t.discount;
      a.schedule.forEach((s) => {
        if (from && s.due < from) return; if (to && s.due > to) return;
        const m = s.due.slice(0, 7), y = s.due.slice(0, 4);
        res.monthly[m] = res.monthly[m] || { paid: 0, open: 0 };
        res.yearly[y] = res.yearly[y] || { paid: 0, open: 0 };
        res.paid += s.paidCents;
        // t40u: "pago" por mês = mês da DATA EFETIVA do pagamento (paidAt) dos relatórios aprovados; "a pagar" segue o vencimento. A soma continua igual a s.paidCents.
        let rest = s.paidCents;
        (s.reports || []).filter((x) => x.status === 'approved').forEach((x) => {
          const pm = receiptMonth(a, x); if (!pm || rest <= 0) return;
          const v = Math.min(x.amountCents, rest); rest -= v;
          const py = pm.slice(0, 4);
          res.monthly[pm] = res.monthly[pm] || { paid: 0, open: 0 }; res.yearly[py] = res.yearly[py] || { paid: 0, open: 0 };
          res.monthly[pm].paid += v; res.yearly[py].paid += v;
        });
        if (rest > 0) { res.monthly[m].paid += rest; res.yearly[y].paid += rest; } // sem comprovante datado (não ocorre no banco atual): fica no mês do vencimento
        if (OPEN.includes(s.status) || s.status === 'review') {
          const r = remainingOf(s);
          res.pending += r; res.monthly[m].open += r; res.yearly[y].open += r;
          if (s.due < today && s.status !== 'review') { res.overdue += r; res.overdueCount++; }
          if (!res.settlement || s.due > res.settlement) res.settlement = s.due;
        }
      });
    });
    return res;
  }

  /* ---------- integridade: JSON canônico + hash encadeado ---------- */
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  function getSubtle() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new PactoError('CRYPTO', 'WebCrypto indisponível. Abra o app via http://localhost ou https.');
    return c.subtle;
  }
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha256Hex(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return hex(await getSubtle().digest('SHA-256', bytes));
  }
  const GENESIS = '0'.repeat(64);
  async function appendEvent(log, ev) {
    const prev = log.length ? log[log.length - 1] : null;
    const body = { seq: prev ? prev.seq + 1 : 1, at: ev.at, actorId: ev.actorId || null, agreementId: ev.agreementId || null, type: ev.type, data: ev.data || {}, prevHash: prev ? prev.hash : GENESIS };
    const hash = await sha256Hex(canonical(body));
    const e = Object.freeze({ ...body, hash });
    log.push(e);
    return e;
  }
  async function verifyChain(log) {
    let prevHash = GENESIS;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      const { hash, ...body } = e;
      if (body.seq !== i + 1 || body.prevHash !== prevHash) return { ok: false, brokenAt: i + 1, reason: 'Encadeamento quebrado' };
      if ((await sha256Hex(canonical(body))) !== hash) return { ok: false, brokenAt: i + 1, reason: 'Conteúdo alterado' };
      prevHash = hash;
    }
    return { ok: true, count: log.length, head: prevHash };
  }

  /* ---------- senhas (PBKDF2-SHA256) ---------- */
  const b64 = { enc: (u8) => { let s = ''; u8.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }, dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)) };
  function randomBytes(n) { const u = new Uint8Array(n); globalThis.crypto.getRandomValues(u); return u; }
  function randomToken(n = 32) { return hex(randomBytes(n)); }
  async function hashPassword(password, saltB64, iterations) {
    const subtle = getSubtle();
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64.dec(saltB64), iterations }, key, 256);
    return b64.enc(new Uint8Array(bits));
  }
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }
  function passwordProblems(p) {
    const out = [];
    if (typeof p !== 'string' || p.length < 10) out.push('mínimo de 10 caracteres');
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) out.push('letras e números');
    if (/^(12345|senha|password|qwerty)/i.test(p || '')) out.push('não use senhas óbvias');
    return out;
  }

  return {
    PactoError, fail, brtDate, brtMonth, BRT_TZ, approvedAtOf, receiptMonth, receivedInMonth, isISODate, plusMonths, plusDays, addPeriod, daysBetween, parseMoney, cleanText, isEmail,
    calcPlan, compareReference, isParty, roleOf, counterpartOf, assertParty, openBalance, totals, installmentStatus, remainingOf, OPEN,
    createAgreement, proposeVersion, respondVersion, pendingVersion, summarizeTerms, normalizeTerms,
    sniffType, validateAttachment, MAX_FILE, ALLOWED_TYPES, MAX_CENTS, reportPayment, reviewPayment,
    earlyEligible, earlyCalc, proposeEarly, respondEarly, reportEarlyPayment, reviewEarlyPayment, releaseEarlyLocks, activeEarly,
    consolidationEligible, consolidationSnapshot, consolidationPreview, proposeConsolidation, respondConsolidation,
    dueReminders, projections,
    BILLING, BILLING_LABEL, CATEGORY_GROUPS, groupOfCategory, categoryFields, cleanFields, cleanCustomCategories,
    normalizeRecurring, recurringDate, recurringChange, RECURRING_CHANGES, generateRecurring, monthlyEquivalent,
    pendingDelay, proposeDelay, respondDelay, ASSISTANT_DEFAULTS, cleanAssistant, reminderBlock,
    calendarColor, calendarItems, clients, dashboards, OUTBOX_TYPES, canonical, sha256Hex, appendEvent, verifyChain, GENESIS,
    hashPassword, timingSafeEqual, randomToken, randomBytes, b64, passwordProblems,
  };
});
