/* PACTO 8.0/8.1 · camada de dados/API.
   Toda regra de acesso é aplicada AQUI (não apenas na interface): cada função exige sessão válida e
   verifica se o usuário é parte do acordo. Esta API foi desenhada para ser trocada por chamadas a um
   backend (Supabase/Postgres + RLS) mantendo a mesma assinatura. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.PactoAPI = factory(root.PactoCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const { PactoError, fail } = C;
  const SCHEMA = 'pacto-8';
  const SESSION_TTL_MS = 8 * 3600 * 1000;
  const DEFAULT_PREFS = { ...C.ASSISTANT_DEFAULTS, email: false, push: false, shareContact: false, customCategories: [] };

  function emptyState() {
    return { schema: SCHEMA, rev: 0, users: [], agreements: [], consolidations: [], notifications: [], events: [], sessions: {}, attempts: {}, mailbox: [], codes: {}, outbox: [] };
  }
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  /* ---------- adaptadores de armazenamento ---------- */
  function memoryAdapter() {
    let state = null; const files = new Map(); const subs = new Set();
    return {
      kind: 'memory',
      load: () => (state ? clone(state) : null), save: (s) => { state = clone(s); },
      getFile: (id) => clone(files.get(id) || null), putFile: (id, f) => files.set(id, clone(f)), deleteFile: (id) => files.delete(id),
      subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
      withLock: async (fn) => fn(), _tamper: (fn) => { fn(state); },
      clear: () => { state = null; files.clear(); },
    };
  }
  function localStorageAdapter(prefix = 'pacto8') {
    const KEY = prefix + ':db', FILE = prefix + ':file:';
    return {
      kind: 'localStorage',
      load: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
      save: (s) => {
        try { localStorage.setItem(KEY, JSON.stringify(s)); }
        catch { fail('STORAGE_FULL', 'Espaço do navegador esgotado. Use arquivos menores ou reinicie a demonstração.'); }
      },
      getFile: (id) => { try { return JSON.parse(localStorage.getItem(FILE + id)); } catch { return null; } },
      putFile: (id, f) => { try { localStorage.setItem(FILE + id, JSON.stringify(f)); } catch { fail('STORAGE_FULL', 'Espaço do navegador esgotado para anexos (limite ~5 MB).'); } },
      deleteFile: (id) => localStorage.removeItem(FILE + id),
      subscribe: (fn) => { const h = (e) => { if (e.key === KEY) fn(); }; window.addEventListener('storage', h); return () => window.removeEventListener('storage', h); },
      withLock: (fn) => (navigator.locks ? navigator.locks.request(prefix + ':lock', fn) : fn()),
      clear: () => Object.keys(localStorage).filter((k) => k.startsWith(prefix + ':')).forEach((k) => localStorage.removeItem(k)),
    };
  }

  function createPactoAPI({ adapter = memoryAdapter(), clock = { now: () => new Date() }, iterations = 210000, idleDefaultMin = 10 } = {}) {
    const now = () => clock.now();
    const at = () => now().toISOString();
    const today = () => { const d = now(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const uid = (p) => p + '_' + C.randomToken(9);
    const load = () => {
      const s = adapter.load();
      if (!s || s.schema !== SCHEMA) return emptyState();
      // migração 8.0 → 8.1 (sem perder nada)
      s.outbox = s.outbox || [];
      s.agreements.forEach((a) => { a.billing = a.billing || 'installment'; a.delays = a.delays || []; a.fields = a.fields || {}; a.group = a.group || C.groupOfCategory(a.category); });
      s.users.forEach((u) => { u.prefs = { ...DEFAULT_PREFS, ...u.prefs }; });
      return s;
    };
    async function read(fn) { return fn(load()); }
    async function mutate(fn) {
      return adapter.withLock(async () => {
        const s = load();
        let r;
        try { r = await fn(s); }
        catch (e) { if (e && e.commit) { s.rev = (s.rev || 0) + 1; adapter.save(s); } throw e; }
        s.rev = (s.rev || 0) + 1;
        adapter.save(s);
        return clone(r);
      });
    }
    async function log(s, type, actorId, agreementId, data) { return C.appendEvent(s.events, { at: at(), actorId, agreementId, type, data }); }
    function notify(s, userId, n) {
      if (!userId) return;
      if (n.key && s.notifications.some((x) => x.userId === userId && x.key === n.key)) return; // sem duplicidade
      s.notifications.unshift({ id: uid('ntf'), userId, at: at(), read: false, channels: { inApp: 'delivered', email: 'not_active', push: 'not_active' }, ...n });
      if (s.notifications.length > 600) s.notifications.length = 600;
    }

    /** Outbox desacoplada: eventos persistidos para integrações futuras (nada é enviado nesta fase). */
    function emit(s, type, { recipientId, agreementId = null, installmentId = null, data = {}, key = null }) {
      if (!C.OUTBOX_TYPES.includes(type) || !recipientId) return null;
      const dedupe = key ? type + '|' + recipientId + '|' + key : null;
      if (dedupe && s.outbox.some((o) => o.dedupeKey === dedupe)) return null;
      const o = { id: uid('obx'), type, at: at(), recipientId, agreementId, installmentId, payload: data, dedupeKey: dedupe, status: 'pending_integration', channel: null, attempts: 0 };
      s.outbox.push(o);
      if (s.outbox.length > 2000) s.outbox.splice(0, s.outbox.length - 2000);
      return o;
    }
    function tickRecurring(s, onlyUserId) {
      const created = [];
      s.agreements.filter((a) => a.billing === 'recurring' && a.status === 'active' && (!onlyUserId || C.isParty(a, onlyUserId))).forEach((a) => {
        C.generateRecurring(a, today(), () => uid('ins')).forEach((inst) => {
          created.push(inst);
          notify(s, a.buyerId, { key: 'gen:' + inst.id, type: 'charge', title: 'Nova cobrança do período', body: `${a.title} · período ${inst.seq}`, agreementId: a.id, amountCents: inst.amountCents, due: inst.due });
        });
      });
      return created;
    }
    const findAg = (s, id, u) => { const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id); return a; };

    /* ---------- sessão ---------- */
    async function tokenKey(token) { return C.sha256Hex('session:' + token); }
    async function session(s, token, { allowLocked = false } = {}) {
      if (typeof token !== 'string' || token.length < 32) fail('UNAUTHENTICATED', 'Entre novamente.');
      const key = await tokenKey(token);
      const ses = s.sessions[key];
      if (!ses) fail('UNAUTHENTICATED', 'Sessão inválida. Entre novamente.');
      const t = now().getTime();
      if (t > ses.expiresAt) fail('EXPIRED', 'Sessão expirada. Entre novamente.');
      const user = s.users.find((u) => u.id === ses.userId);
      if (!user) fail('UNAUTHENTICATED', 'Conta não encontrada.');
      const idleMs = (user.prefs.autoLockMin || idleDefaultMin) * 60000;
      if (!allowLocked && (ses.locked || t - ses.lastSeen > idleMs)) fail('LOCKED', 'Sessão bloqueada por inatividade.');
      return { user, ses, key };
    }
    async function authed(token, fn, opts) { return mutate(async (s) => { const ctx = await session(s, token, opts); ctx.ses.lastSeen = now().getTime(); return fn(s, ctx.user, ctx); }); }
    async function authedRead(token, fn) { return read(async (s) => { const { user } = await session(s, token); return clone(await fn(s, user)); }); }
    function requireVerified(u) { if (!u.emailVerified) fail('UNVERIFIED', 'Confirme seu e-mail antes de movimentar acordos.'); }
    async function newSession(s, user) {
      const token = C.randomToken(32);
      const t = now().getTime();
      s.sessions[await tokenKey(token)] = { userId: user.id, createdAt: t, lastSeen: t, expiresAt: t + SESSION_TTL_MS, locked: false, ua: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 80) : 'node' };
      // limpeza de sessões expiradas
      Object.keys(s.sessions).forEach((k) => { if (s.sessions[k].expiresAt < t) delete s.sessions[k]; });
      return token;
    }
    function publicUser(u, self) {
      const p = { id: u.id, name: u.name, photo: u.photo || '', handle: u.handle };
      if (self) Object.assign(p, { email: u.email, emailVerified: u.emailVerified, lang: u.lang, theme: u.theme, prefs: u.prefs, createdAt: u.createdAt, demo: !!u.demo });
      return p;
    }
    function mail(s, to, subject, body) { s.mailbox.unshift({ id: uid('mail'), to, subject, body, at: at(), simulated: true }); s.mailbox.length = Math.min(s.mailbox.length, 100); }
    async function issueCode(s, purpose, email) {
      const code = String(100000 + (C.randomBytes(4).reduce((a, b) => a * 256 + b, 0) % 900000));
      s.codes[purpose + ':' + email] = { hash: await C.sha256Hex(purpose + code), exp: now().getTime() + 30 * 60000, tries: 0 };
      return code;
    }
    async function checkCode(s, purpose, email, code) {
      const k = purpose + ':' + email, c = s.codes[k];
      if (!c || c.exp < now().getTime()) fail('INVALID_CODE', 'Código expirado. Solicite outro.');
      if (++c.tries > 5) { delete s.codes[k]; failCommit('RATE_LIMIT', 'Muitas tentativas. Solicite outro código.'); }
      if (!C.timingSafeEqual(await C.sha256Hex(purpose + String(code).trim()), c.hash)) failCommit('INVALID_CODE', 'Código incorreto.');
      delete s.codes[k];
    }
    function claimInvites(s, user) {
      s.agreements.forEach((a) => { if (!a.buyerId && a.buyerEmail === user.email && a.sellerId !== user.id) { a.buyerId = user.id; a.buyerEmail = null; notify(s, a.sellerId, { type: 'joined', title: 'Comprador entrou no PACTO', body: `${user.name} agora pode responder a “${a.title}”.`, agreementId: a.id }); notify(s, user.id, { type: 'proposal', title: 'Você tem uma proposta de acordo', body: `“${a.title}” aguarda sua resposta.`, agreementId: a.id, key: 'claim:' + a.id }); } });
    }
    function limiter(s, email) {
      const a = s.attempts[email] || { fails: 0, until: 0 };
      if (a.until > now().getTime()) fail('RATE_LIMIT', `Muitas tentativas. Aguarde ${Math.ceil((a.until - now().getTime()) / 1000)} s.`);
      return a;
    }
    function registerFail(s, email) {
      const a = s.attempts[email] || { fails: 0, until: 0 };
      a.fails++;
      if (a.fails >= 5) a.until = now().getTime() + Math.min(15 * 60000, 30000 * Math.pow(2, a.fails - 5));
      s.attempts[email] = a;
    }
    const failCommit = (code, msg) => { const e = new PactoError(code, msg); e.commit = true; throw e; };
    const normEmail = (e) => C.cleanText(e, 254).toLowerCase();

    const api = {
      today, now,
      /* ----- contas ----- */
      async signup({ email, name, password, demo = false, verified = false }) {
        email = normEmail(email); name = C.cleanText(name, 60);
        if (!C.isEmail(email)) fail('VALIDATION', 'E-mail inválido.');
        if (name.length < 2) fail('VALIDATION', 'Informe seu nome de exibição.');
        const probs = C.passwordProblems(password);
        if (probs.length) fail('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const salt = C.b64.enc(C.randomBytes(16));
        const hash = await C.hashPassword(password, salt, iterations);
        return mutate(async (s) => {
          if (s.users.some((u) => u.email === email)) fail('CONFLICT', 'Já existe uma conta com este e-mail neste ambiente.');
          const user = { id: uid('usr'), email, name, handle: email.split('@')[0].replace(/[^a-z0-9._]/g, '').slice(0, 20), photo: '', lang: 'pt-BR', theme: 'auto', prefs: { ...DEFAULT_PREFS, autoLockMin: idleDefaultMin }, pwd: { algo: 'PBKDF2-SHA256', iterations, salt, hash }, emailVerified: !!verified, createdAt: at(), demo };
          s.users.push(user);
          let code = null;
          if (!verified) { code = await issueCode(s, 'verify', email); mail(s, email, 'Confirme seu e-mail no PACTO', `Seu código de verificação é ${code}. Ele expira em 30 minutos.`); }
          else claimInvites(s, user);
          await log(s, 'account.created', user.id, null, { name });
          const token = await newSession(s, user);
          return { token, user: publicUser(user, true) };
        });
      },
      async login({ email, password }) {
        email = normEmail(email);
        // 1ª fase: rate limit + leitura do hash
        const pre = await read(async (s) => { limiter(s, email); const u = s.users.find((x) => x.email === email); return u ? { pwd: u.pwd } : null; });
        const ok = pre ? C.timingSafeEqual(await C.hashPassword(String(password || ''), pre.pwd.salt, pre.pwd.iterations), pre.pwd.hash) : (await C.hashPassword('x', C.b64.enc(C.randomBytes(16)), Math.min(iterations, 1000)), false);
        return mutate(async (s) => {
          limiter(s, email);
          if (!ok) { registerFail(s, email); failCommit('BAD_CREDENTIALS', 'E-mail ou senha incorretos.'); }
          delete s.attempts[email];
          const user = s.users.find((x) => x.email === email);
          const token = await newSession(s, user);
          await log(s, 'auth.login', user.id, null, {});
          return { token, user: publicUser(user, true) };
        });
      },
      async logout(token) { return mutate(async (s) => { try { delete s.sessions[await tokenKey(token)]; } catch {} return true; }); },
      async lock(token) { return mutate(async (s) => { const { ses } = await session(s, token, { allowLocked: true }); ses.locked = true; return true; }); },
      async unlock(token, password) {
        const pre = await read(async (s) => { const { user } = await session(s, token, { allowLocked: true }); limiter(s, user.email); return { pwd: user.pwd, email: user.email }; });
        const ok = C.timingSafeEqual(await C.hashPassword(String(password || ''), pre.pwd.salt, pre.pwd.iterations), pre.pwd.hash);
        return mutate(async (s) => {
          const { ses } = await session(s, token, { allowLocked: true });
          if (!ok) { registerFail(s, pre.email); failCommit('BAD_CREDENTIALS', 'Senha incorreta.'); }
          delete s.attempts[pre.email];
          ses.locked = false; ses.lastSeen = now().getTime(); return true;
        });
      },
      async touch(token) { return authed(token, () => true); },
      /** 8.2: associa convites pendentes (acordos enviados ao e-mail) à conta já confirmada. */
      async claim(token) { return authed(token, (s, u) => { if (u.emailVerified) claimInvites(s, u); return true; }); },
      async me(token) { return authedRead(token, (s, u) => publicUser(u, true)); },
      async sessionInfo(token) { return read(async (s) => { const { ses } = await session(s, token, { allowLocked: true }); const u = s.users.find((x) => x.id === ses.userId); return { expiresAt: ses.expiresAt, lastSeen: ses.lastSeen, locked: ses.locked || now().getTime() - ses.lastSeen > (u.prefs.autoLockMin || idleDefaultMin) * 60000, autoLockMin: u.prefs.autoLockMin }; }); },
      async listSessions(token) { return read(async (s) => { const { user, key } = await session(s, token); return Object.entries(s.sessions).filter(([, v]) => v.userId === user.id).map(([k, v]) => ({ current: k === key, createdAt: v.createdAt, lastSeen: v.lastSeen, expiresAt: v.expiresAt, ua: v.ua })); }); },
      async revokeOtherSessions(token) { return authed(token, async (s, u, { key }) => { Object.keys(s.sessions).forEach((k) => { if (k !== key && s.sessions[k].userId === u.id) delete s.sessions[k]; }); await log(s, 'auth.sessions_revoked', u.id, null, {}); return true; }); },
      async verifyEmail(token, code) { return authed(token, async (s, u) => { if (u.emailVerified) return true; await checkCode(s, 'verify', u.email, code); u.emailVerified = true; claimInvites(s, u); await log(s, 'account.email_verified', u.id, null, {}); return true; }); },
      async resendVerification(token) { return authed(token, async (s, u) => { const code = await issueCode(s, 'verify', u.email); mail(s, u.email, 'Novo código PACTO', `Seu código de verificação é ${code}.`); return true; }); },
      async requestReset(email) {
        email = normEmail(email);
        return mutate(async (s) => { limiter(s, 'reset:' + email); registerFail(s, 'reset:' + email); if (s.users.some((u) => u.email === email)) { const code = await issueCode(s, 'reset', email); mail(s, email, 'Recuperação de senha PACTO', `Use o código ${code} para criar uma nova senha. Se não foi você, ignore.`); } return true; /* resposta idêntica exista ou não a conta */ });
      },
      async resetPassword({ email, code, password }) {
        email = normEmail(email);
        const probs = C.passwordProblems(password); if (probs.length) fail('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const salt = C.b64.enc(C.randomBytes(16)); const hash = await C.hashPassword(password, salt, iterations);
        return mutate(async (s) => {
          await checkCode(s, 'reset', email, code);
          const u = s.users.find((x) => x.email === email); if (!u) fail('INVALID_CODE', 'Código incorreto.');
          u.pwd = { algo: 'PBKDF2-SHA256', iterations, salt, hash };
          Object.keys(s.sessions).forEach((k) => { if (s.sessions[k].userId === u.id) delete s.sessions[k]; });
          await log(s, 'auth.password_reset', u.id, null, {}); return true;
        });
      },
      async changePassword(token, { current, next }) {
        const probs = C.passwordProblems(next); if (probs.length) fail('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const pre = await authedRead(token, (s, u) => u.pwd);
        if (!C.timingSafeEqual(await C.hashPassword(String(current || ''), pre.salt, pre.iterations), pre.hash)) fail('BAD_CREDENTIALS', 'Senha atual incorreta.');
        const salt = C.b64.enc(C.randomBytes(16)); const hash = await C.hashPassword(next, salt, iterations);
        return authed(token, async (s, u, { key }) => { u.pwd = { algo: 'PBKDF2-SHA256', iterations, salt, hash }; Object.keys(s.sessions).forEach((k) => { if (k !== key && s.sessions[k].userId === u.id) delete s.sessions[k]; }); await log(s, 'auth.password_changed', u.id, null, {}); return true; });
      },
      async updateProfile(token, patch) {
        return authed(token, async (s, u) => {
          if (patch.name != null) { const n = C.cleanText(patch.name, 60); if (n.length < 2) fail('VALIDATION', 'Nome muito curto.'); u.name = n; }
          if (patch.lang && ['pt-BR', 'en', 'es'].includes(patch.lang)) u.lang = patch.lang;
          if (patch.theme && ['light', 'dark', 'auto'].includes(patch.theme)) u.theme = patch.theme;
          if (patch.prefs) {
            const p = patch.prefs;
            const a = C.cleanAssistant(p, u.prefs);
            Object.assign(u.prefs, a);
            if ([5, 10, 15, 30].includes(p.autoLockMin)) u.prefs.autoLockMin = p.autoLockMin;
            if (typeof p.shareContact === 'boolean') u.prefs.shareContact = p.shareContact;
            if (p.customCategories) u.prefs.customCategories = C.cleanCustomCategories(p.customCategories);
            u.prefs.email = false; u.prefs.push = false; // canais externos: não ativos nesta fase
          }
          if (patch.photo !== undefined) {
            if (patch.photo === '') u.photo = '';
            else {
              const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(patch.photo));
              if (!m) fail('VALIDATION', 'Foto deve ser PNG, JPG ou WebP.');
              const bytes = C.b64.dec(m[3]); if (bytes.length > 300 * 1024) fail('VALIDATION', 'Foto acima de 300 KB.');
              if (C.sniffType(bytes) !== m[1]) fail('VALIDATION', 'Conteúdo da foto não confere com o formato.');
              u.photo = patch.photo;
            }
          }
          return publicUser(u, true);
        });
      },
      /** Caixa de e-mail SIMULADA (demonstração): permite ler códigos de verificação/recuperação sem servidor de e-mail. */
      async demoMailbox(email) { return read((s) => clone(s.mailbox.filter((m) => m.to === normEmail(email)).slice(0, 10))); },
      async demoAccounts() { return read((s) => s.users.filter((u) => u.demo).map((u) => ({ email: u.email, name: u.name, photo: u.photo }))); },

      /* ----- diretório (mínimo necessário) ----- */
      async findUserByEmail(token, email) { return authedRead(token, (s, u) => { const e = normEmail(email); const f = s.users.find((x) => x.email === e && x.emailVerified); return f && f.id !== u.id ? publicUser(f) : null; }); },
      /** Só retorna perfis de quem divide algum acordo com o usuário. */
      async contacts(token) {
        return authedRead(token, (s, u) => {
          const ids = new Set([u.id]);
          s.agreements.forEach((a) => { if (C.isParty(a, u.id)) { ids.add(a.sellerId); if (a.buyerId) ids.add(a.buyerId); } });
          return s.users.filter((x) => ids.has(x.id)).map((x) => { const p = publicUser(x, x.id === u.id); if (x.id !== u.id && x.prefs.shareContact) p.contactEmail = x.email; return p; });
        });
      },

      /* ----- acordos ----- */
      async listAgreements(token) { return authedRead(token, (s, u) => s.agreements.filter((a) => C.isParty(a, u.id))); },
      async getAgreement(token, id) { return authedRead(token, (s, u) => { const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id); return a; }); },
      async createAgreement(token, { meta, buyerEmail, terms, reason }) {
        const t = C.normalizeTerms(terms); const termsHash = await C.sha256Hex(C.canonical(t));
        return authed(token, async (s, u) => {
          requireVerified(u);
          let origin = null;
          if (meta && meta.fromAgreementId) {
            origin = s.agreements.find((x) => x.id === meta.fromAgreementId);
            if (!origin) fail('NOT_FOUND', 'Acordo de origem não encontrado.');
            C.assertParty(origin, u.id);
            if (origin.sellerId !== u.id) fail('FORBIDDEN', 'Só quem presta o serviço converte o acordo.');
            if (!origin.buyerId) fail('CONFLICT', 'O cliente do acordo de origem ainda não entrou no PACTO.');
            if (!buyerEmail) buyerEmail = s.users.find((x) => x.id === origin.buyerId).email;
            else if (normEmail(buyerEmail) !== s.users.find((x) => x.id === origin.buyerId).email) fail('VALIDATION', 'A conversão é feita com o mesmo cliente do acordo de origem.');
          }
          const e = normEmail(buyerEmail); if (!C.isEmail(e)) fail('VALIDATION', 'E-mail do comprador inválido.');
          if (e === u.email) fail('VALIDATION', 'Você não pode criar um acordo com você mesmo.');
          const buyer = s.users.find((x) => x.email === e && x.emailVerified);
          const ag = C.createAgreement({ id: uid('agr'), sellerId: u.id, buyerId: buyer ? buyer.id : null, buyerEmail: buyer ? null : e, meta, terms: t, at: at(), termsHash, reason });
          s.agreements.unshift(ag);
          await log(s, 'agreement.proposed', u.id, ag.id, { version: 1, title: ag.title, billing: ag.billing, totalCents: t.totalCents || t.amountCents, count: t.count || 0, termsHash, fromAgreementId: ag.fromAgreementId || null });
          if (buyer) { notify(s, buyer.id, { type: 'proposal', title: 'Nova proposta de acordo', body: `${u.name} propôs “${ag.title}” · versão 1.`, agreementId: ag.id, amountCents: t.totalCents || t.amountCents }); emit(s, 'negotiation.created', { recipientId: buyer.id, agreementId: ag.id, data: { version: 1, billing: ag.billing } }); }
          else mail(s, e, 'Você recebeu uma proposta no PACTO', `${u.name} propôs um acordo: ${ag.title}. Crie sua conta com este e-mail para responder.`);
          return ag;
        });
      },
      async propose(token, id, { terms, reason }) {
        const t = C.normalizeTerms(terms); const termsHash = await C.sha256Hex(C.canonical(t));
        return authed(token, async (s, u) => {
          requireVerified(u);
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.');
          C.assertParty(a, u.id);
          const v = C.proposeVersion(a, { userId: u.id, terms: t, reason, at: at(), termsHash });
          await log(s, v.kind === 'counter' ? 'agreement.countered' : 'agreement.proposed', u.id, a.id, { version: v.no, respondsTo: v.respondsTo, before: v.before, after: C.summarizeTerms(t), reason: v.reason, termsHash });
          const CH = { suspend: 'Proposta de suspensão', resume: 'Proposta de retomada', readjust: 'Proposta de reajuste', cancel: 'Proposta de cancelamento', renew: 'Proposta de renovação' };
          notify(s, C.counterpartOf(a, u.id), { type: v.kind === 'counter' ? 'counter' : 'proposal', title: v.kind === 'counter' ? 'Contraproposta recebida' : (CH[v.change] || 'Nova proposta'), body: `${a.title} · versão ${v.no} · ${v.reason}`, agreementId: a.id, amountCents: t.totalCents || t.amountCents });
          emit(s, 'negotiation.created', { recipientId: C.counterpartOf(a, u.id), agreementId: a.id, data: { version: v.no, kind: v.kind, change: v.change } });
          return a;
        });
      },
      async respond(token, id, { versionNo, action, reason }) {
        return authed(token, async (s, u) => {
          requireVerified(u);
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.');
          C.assertParty(a, u.id);
          const pv = C.pendingVersion(a);
          const hashNow = pv ? await C.sha256Hex(C.canonical(pv.terms)) : null;
          const v = C.respondVersion(a, { userId: u.id, versionNo, action, reason, at: at(), termsHash: hashNow, newIds: () => uid('ins'), today: today() });
          await log(s, action === 'accept' ? 'agreement.accepted' : 'agreement.refused', u.id, a.id, { version: v.no, termsHash: v.termsHash, reason: v.refuseReason || '', change: v.change || null });
          emit(s, action === 'accept' ? 'negotiation.accepted' : 'negotiation.rejected', { recipientId: v.authorId, agreementId: a.id, data: { version: v.no, change: v.change || null } });
          if (action === 'accept' && a.billing === 'recurring') tickRecurring(s, u.id);
          notify(s, v.authorId, { type: action === 'accept' ? 'accepted' : 'refused', title: action === 'accept' ? 'Acordo aceito pelos dois lados' : 'Proposta recusada', body: `${a.title} · versão ${v.no}`, agreementId: a.id });
          return a;
        });
      },
      async addNote(token, id, text) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          const t = C.cleanText(text, 500); if (t.length < 2) fail('VALIDATION', 'Escreva uma observação.');
          a.notes.push({ id: uid('note'), by: u.id, at: at(), text: t });
          await log(s, 'agreement.note', u.id, a.id, { text: t });
          notify(s, C.counterpartOf(a, u.id), { type: 'note', title: 'Nova observação', body: `${a.title}: ${t.slice(0, 80)}`, agreementId: a.id });
          return a;
        });
      },

      /* ----- arquivos (comprovantes) ----- */
      async _storeFile(s, u, a, file) {
        const v = C.validateAttachment({ name: file.name, size: file.size, declaredType: file.type, bytes: file.bytes });
        const sha256 = await C.sha256Hex(file.bytes);
        const id = uid('file');
        adapter.putFile(id, { id, agreementId: a.id, ownerId: u.id, name: v.name, type: v.type, size: file.size, sha256, at: at(), dataB64: C.b64.enc(file.bytes) });
        return { fileId: id, name: v.name, type: v.type, size: file.size, sha256 };
      },
      async getFile(token, fileId) {
        return authedRead(token, async (s, u) => {
          const f = adapter.getFile(fileId); if (!f) fail('NOT_FOUND', 'Arquivo não encontrado.');
          const a = s.agreements.find((x) => x.id === f.agreementId); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.');
          C.assertParty(a, u.id);
          const ok = (await C.sha256Hex(C.b64.dec(f.dataB64))) === f.sha256;
          return { ...f, integrity: ok };
        });
      },

      /* ----- pagamentos ----- */
      async reportPayment(token, id, { installmentId, amountCents, paidAt, comment, file }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.');
          C.assertParty(a, u.id);
          if (a.buyerId !== u.id) fail('FORBIDDEN', 'Só o comprador informa pagamentos.');
          if (!file || !file.bytes) fail('VALIDATION', 'O comprovante (PDF ou imagem) é obrigatório.');
          const inst = a.schedule.find((x) => x.id === installmentId); if (!inst) fail('NOT_FOUND', 'Parcela não encontrada.');
          if (!C.OPEN.includes(inst.status)) fail('CONFLICT', 'Esta parcela não está aberta para pagamento.');
          const att = await api._storeFile(s, u, a, file);
          const r = C.reportPayment(a, { userId: u.id, installmentId, amountCents, paidAt, comment, attachment: att, at: at(), reportId: uid('rep') });
          await log(s, 'payment.reported', u.id, a.id, { installmentId, amountCents, paidAt, fileSha256: att.sha256 });
          notify(s, a.sellerId, { type: 'payment', title: 'Comprovante aguardando conferência', body: `${a.title} · ${u.name} informou pagamento.`, agreementId: a.id, amountCents });
          emit(s, 'payment.proof_submitted', { recipientId: a.sellerId, agreementId: a.id, installmentId, data: { amountCents, reportId: r.id } });
          return { agreement: a, report: r };
        });
      },
      async reviewPayment(token, id, { installmentId, reportId, decision, reason }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.');
          C.assertParty(a, u.id);
          const r = C.reviewPayment(a, { userId: u.id, installmentId, reportId, decision, reason, at: at() });
          await log(s, 'payment.' + (decision === 'approve' ? 'approved' : decision === 'correction' ? 'correction_requested' : 'refused'), u.id, a.id, { installmentId, reportId, amountCents: r.amountCents, reason: r.reviewReason, fileSha256: r.attachment.sha256 });
          if (decision === 'approve') emit(s, 'payment.confirmed', { recipientId: a.buyerId, agreementId: a.id, installmentId, data: { amountCents: r.amountCents, reportId } });
          notify(s, a.buyerId, { type: 'review', title: decision === 'approve' ? 'Pagamento confirmado' : decision === 'correction' ? 'Comprovante precisa de correção' : 'Comprovante recusado', body: `${a.title}${r.reviewReason ? ' · ' + r.reviewReason : ''}`, agreementId: a.id, amountCents: r.amountCents });
          if (a.status === 'settled') { await log(s, 'agreement.settled', u.id, a.id, {}); notify(s, a.buyerId, { type: 'settled', title: 'Acordo quitado 🎉', body: a.title, agreementId: a.id }); }
          return a;
        });
      },
      /** Comprovantes aprovados são imutáveis: não existe rota de edição/exclusão; esta função sempre recusa. */
      async deleteReport() { fail('IMMUTABLE', 'Comprovantes não podem ser excluídos. Aprovados são permanentes.'); },

      /* ----- antecipação ----- */
      async proposeEarly(token, id, { installmentIds, pct }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          const e = C.proposeEarly(a, { userId: u.id, installmentIds, pct, at: at(), today: today(), id: uid('erl') });
          const c = C.earlyCalc(a, e.installmentIds, e.pct);
          await log(s, 'early.proposed', u.id, a.id, { earlyId: e.id, installments: e.installmentIds.length, pct: e.pct, grossCents: c.grossCents });
          notify(s, C.counterpartOf(a, u.id), { type: 'early', title: e.pct ? `Proposta de antecipação com ${e.pct}% de desconto` : 'Pedido de antecipação', body: `${a.title} · ${e.installmentIds.length} parcela(s)`, agreementId: a.id, amountCents: c.netCents });
          return a;
        });
      },
      async respondEarly(token, id, { earlyId, action, installmentIds, pct, reason }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          const e = C.respondEarly(a, { userId: u.id, earlyId, action, installmentIds, pct, at: at(), today: today(), reason });
          C.releaseEarlyLocks(a, e);
          await log(s, 'early.' + (action === 'accept' ? 'accepted' : action === 'refuse' ? 'refused' : 'countered'), u.id, a.id, { earlyId, pct: e.pct, netCents: e.netCents || null });
          notify(s, C.counterpartOf(a, u.id), { type: 'early', title: action === 'accept' ? 'Antecipação aceita' : action === 'refuse' ? 'Antecipação recusada' : 'Contraproposta de antecipação', body: a.title, agreementId: a.id });
          return a;
        });
      },
      async reportEarly(token, id, { earlyId, paidAt, comment, file }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          if (a.buyerId !== u.id) fail('FORBIDDEN', 'Só o comprador informa o pagamento.');
          if (!file || !file.bytes) fail('VALIDATION', 'O comprovante (PDF ou imagem) é obrigatório.');
          const att = await api._storeFile(s, u, a, file);
          const r = C.reportEarlyPayment(a, { userId: u.id, earlyId, paidAt, comment, attachment: att, at: at(), reportId: uid('rep') });
          await log(s, 'early.payment_reported', u.id, a.id, { earlyId, amountCents: r.amountCents, fileSha256: att.sha256 });
          notify(s, a.sellerId, { type: 'payment', title: 'Comprovante de antecipação para conferir', body: a.title, agreementId: a.id, amountCents: r.amountCents });
          return a;
        });
      },
      async reviewEarly(token, id, { earlyId, decision, reason }) {
        return authed(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === id); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          const r = C.reviewEarlyPayment(a, { userId: u.id, earlyId, decision, reason, at: at() });
          await log(s, decision === 'approve' ? 'early.settled' : 'early.correction_requested', u.id, a.id, { earlyId, amountCents: r.amountCents, reason: r.reviewReason });
          notify(s, a.buyerId, { type: 'review', title: decision === 'approve' ? 'Antecipação quitada' : 'Comprovante da antecipação precisa de correção', body: a.title, agreementId: a.id, amountCents: r.amountCents });
          return a;
        });
      },

      /* ----- unificação ----- */
      async listConsolidations(token) { return authedRead(token, (s, u) => s.consolidations.filter((c) => c.sellerId === u.id || c.buyerId === u.id)); },
      async proposeConsolidation(token, { originIds, terms, reason }) {
        return authed(token, async (s, u) => {
          requireVerified(u);
          const id = uid('cns');
          const probe = C.normalizeTerms({ ...terms, totalCents: 100000, downCents: 0, extras: [] }); void probe;
          const c = C.proposeConsolidation(s.agreements, { id, userId: u.id, originIds, terms, at: at(), termsHash: 'pending', reason });
          c.versions[0].termsHash = await C.sha256Hex(C.canonical(c.versions[0].terms)); c.versions[0].acceptedBy[0].termsHash = c.versions[0].termsHash;
          s.consolidations.unshift(c);
          for (const oid of originIds) await log(s, 'consolidation.origin_locked', u.id, oid, { consolidationId: id });
          await log(s, 'consolidation.proposed', u.id, null, { consolidationId: id, origins: originIds, principalCents: c.versions[0].terms.totalCents, buyerId: c.buyerId, sellerId: c.sellerId });
          notify(s, c.buyerId, { type: 'consolidation', title: 'Proposta de unificação de dívidas', body: `${c.snapshot.map((x) => x.title).join(' + ')}`, consolidationId: id, amountCents: c.versions[0].terms.totalCents });
          return c;
        });
      },
      async respondConsolidation(token, id, { versionNo, action, terms, reason }) {
        let counterHash = null;
        if (action === 'counter') counterHash = 'calc';
        return authed(token, async (s, u) => {
          requireVerified(u);
          const c = s.consolidations.find((x) => x.id === id); if (!c) fail('NOT_FOUND', 'Unificação não encontrada.');
          if (c.sellerId !== u.id && c.buyerId !== u.id) fail('FORBIDDEN', 'Você não é parte desta unificação.');
          const pv = c.versions.find((x) => x.status === 'pending');
          let hash = null;
          if (action === 'accept' && pv) hash = await C.sha256Hex(C.canonical(pv.terms));
          if (counterHash && pv) hash = await C.sha256Hex(C.canonical(C.normalizeTerms({ ...terms, totalCents: pv.terms.totalCents, downCents: 0, extras: [] })));
          const res = C.respondConsolidation(c, s.agreements, { userId: u.id, versionNo, action, terms, reason, at: at(), termsHash: hash, newIds: () => uid('ins'), newAgreementId: uid('agr') });
          const other = c.sellerId === u.id ? c.buyerId : c.sellerId;
          if (res.agreement) {
            s.agreements.unshift(res.agreement);
            for (const oid of c.originIds) await log(s, 'agreement.consolidated', u.id, oid, { into: res.agreement.id });
            await log(s, 'consolidation.accepted', u.id, res.agreement.id, { consolidationId: id, origins: c.originIds, principalCents: res.agreement.terms.totalCents });
          } else {
            await log(s, 'consolidation.' + (action === 'refuse' ? 'refused' : 'countered'), u.id, null, { consolidationId: id, version: res.version ? res.version.no : versionNo, sellerId: c.sellerId, buyerId: c.buyerId });
          }
          notify(s, other, { type: 'consolidation', title: action === 'accept' ? 'Unificação aceita' : action === 'refuse' ? 'Unificação recusada' : 'Contraproposta de unificação', body: c.title, consolidationId: id, agreementId: res.agreement ? res.agreement.id : undefined });
          return res;
        });
      },

      /* ----- notificações ----- */
      async runReminders(token) {
        return authed(token, async (s, u) => {
          tickRecurring(s, u.id);
          const list = C.dueReminders(s.agreements, u.id, u.prefs, today(), now().getHours());
          let n = 0;
          list.forEach((r) => {
            const before = s.notifications.length;
            const verb = r.role === 'buyer' ? 'Pagamento' : 'Recebimento';
            notify(s, u.id, { key: r.key, type: r.type, event: r.event, source: 'assistant', title: r.type === 'overdue' ? `${verb} em atraso` : r.days === 0 ? `${verb} vence hoje` : `${verb} vence em ${r.days} dia(s)`, body: `${r.title}`, agreementId: r.agreementId, installmentId: r.installmentId, amountCents: r.amountCents, due: r.due });
            if (s.notifications.length > before) { n++; emit(s, r.event, { recipientId: u.id, agreementId: r.agreementId, installmentId: r.installmentId, key: r.key, data: { amountCents: r.amountCents, due: r.due, role: r.role, days: r.days } }); }
          });
          return n;
        });
      },
      /** Estado do Assistente por parcela aberta: por que está ativo ou suspenso. */
      async assistantStatus(token) {
        return authedRead(token, (s, u) => {
          const prefs = C.cleanAssistant(null, u.prefs); const out = [];
          s.agreements.filter((a) => a.status === 'active' && C.isParty(a, u.id)).forEach((a) => a.schedule.filter((x) => C.OPEN.includes(x.status) || x.status === 'review').forEach((x) => {
            out.push({ agreementId: a.id, installmentId: x.id, title: a.title, due: x.due, role: C.roleOf(a, u.id), block: C.reminderBlock(a, x, prefs, today()), muted: prefs.muted.includes(a.id) });
          }));
          return { prefs, items: out.sort((x, y) => x.due.localeCompare(y.due)) };
        });
      },
      async muteAgreement(token, agreementId, muted) {
        return authed(token, (s, u) => {
          findAg(s, agreementId, u);
          const set = new Set(u.prefs.muted || []); if (muted) set.add(agreementId); else set.delete(agreementId);
          u.prefs.muted = [...set];
          return u.prefs.muted;
        });
      },
      async listOutbox(token) { return authedRead(token, (s, u) => s.outbox.filter((o) => o.recipientId === u.id).slice(-300).reverse()); },

      /* ----- 8.1: justificativa de atraso ----- */
      async proposeDelay(token, id, { installmentId, newDate, reason, note, file }) {
        return authed(token, async (s, u) => {
          requireVerified(u);
          const a = findAg(s, id, u);
          if (a.buyerId !== u.id) fail('FORBIDDEN', 'Só o comprador justifica um atraso.');
          const att = file && file.bytes ? await api._storeFile(s, u, a, file) : null;
          const d = C.proposeDelay(a, { id: uid('dly'), userId: u.id, installmentId, newDate, reason, note, attachment: att, at: at(), today: today() });
          await log(s, 'delay.submitted', u.id, a.id, { delayId: d.id, installmentId, originalDue: d.originalDue, newDate, reason: d.versions[0].reason, fileSha256: att ? att.sha256 : null });
          notify(s, a.sellerId, { type: 'delay', title: 'Justificativa de atraso recebida', body: `${a.title} · nova data proposta`, agreementId: a.id, due: newDate });
          emit(s, 'delay.justification_submitted', { recipientId: a.sellerId, agreementId: a.id, installmentId, data: { delayId: d.id, newDate } });
          return { agreement: a, delay: d };
        });
      },
      async respondDelay(token, id, { delayId, action, newDate, feeCents = 0, reason }) {
        return authed(token, async (s, u) => {
          requireVerified(u);
          const a = findAg(s, id, u);
          const { d, v } = C.respondDelay(a, { userId: u.id, delayId, action, newDate, feeCents, reason, at: at(), today: today(), newIds: () => uid('ins') });
          const other = C.counterpartOf(a, u.id);
          await log(s, 'delay.' + (action === 'accept' ? 'accepted' : action === 'refuse' ? 'refused' : 'countered'), u.id, a.id, { delayId, installmentId: d.installmentId, version: v.no, newDate: v.newDate, feeCents: v.feeCents, reason: C.cleanText(reason, 300) });
          notify(s, other, { type: 'delay', title: action === 'accept' ? 'Nova data aceita pelos dois lados' : action === 'refuse' ? 'Justificativa recusada' : 'Contraproposta de nova data', body: a.title, agreementId: a.id, due: v.newDate });
          if (action === 'accept') emit(s, 'delay.justification_accepted', { recipientId: other, agreementId: a.id, installmentId: d.installmentId, data: { delayId, newDate: v.newDate, feeCents: v.feeCents } });
          else emit(s, action === 'refuse' ? 'negotiation.rejected' : 'negotiation.created', { recipientId: other, agreementId: a.id, installmentId: d.installmentId, data: { delayId, version: v.no, context: 'delay' } });
          return { agreement: a, delay: d };
        });
      },

      /* ----- 8.1: calendário, clientes, painéis ----- */
      async calendar(token, { from, to, role = 'all' } = {}) { return authedRead(token, (s, u) => C.calendarItems(s.agreements, u.id, { from, to, role, today: today() })); },
      async clients(token) { return authedRead(token, (s, u) => C.clients(s.agreements, u.id, today())); },
      async clientDetail(token, clientId) {
        return authedRead(token, (s, u) => {
          const ags = s.agreements.filter((a) => a.sellerId === u.id && a.buyerId === clientId);
          if (!ags.length) fail('FORBIDDEN', 'Você não tem acordos com esta pessoa.');
          const c = C.clients(ags, u.id, today())[0];
          const x = s.users.find((y) => y.id === clientId);
          return { client: c, profile: { ...publicUser(x), contactEmail: x.prefs.shareContact ? x.email : null }, agreements: ags, events: s.events.filter((e) => ags.some((a) => a.id === e.agreementId)).slice(-80).reverse() };
        });
      },
      async dashboards(token) { return authedRead(token, (s, u) => C.dashboards(s.agreements, u.id, today())); },

      async listNotifications(token) { return authedRead(token, (s, u) => s.notifications.filter((n) => n.userId === u.id)); },
      async markRead(token, ids) { return authed(token, (s, u) => { s.notifications.forEach((n) => { if (n.userId === u.id && (ids === 'all' || ids.includes(n.id))) n.read = true; }); return true; }); },

      /* ----- feed, auditoria, projeções ----- */
      async feed(token, limit = 60) {
        return authedRead(token, (s, u) => {
          const mine = new Set(s.agreements.filter((a) => C.isParty(a, u.id)).map((a) => a.id));
          const myCons = new Set(s.consolidations.filter((c) => c.sellerId === u.id || c.buyerId === u.id).map((c) => c.id));
          return s.events.filter((e) => (e.agreementId && mine.has(e.agreementId)) || (e.data && e.data.consolidationId && myCons.has(e.data.consolidationId) && !e.agreementId) || (!e.agreementId && !e.data.consolidationId && e.actorId === u.id && e.type.startsWith('account'))).slice(-limit).reverse();
        });
      },
      async auditLog(token, agreementId) {
        return authedRead(token, async (s, u) => {
          const a = s.agreements.find((x) => x.id === agreementId); if (!a) fail('NOT_FOUND', 'Acordo não encontrado.'); C.assertParty(a, u.id);
          const v = await C.verifyChain(s.events);
          return { events: s.events.filter((e) => e.agreementId === agreementId), chain: v };
        });
      },
      async verifyLog(token) { return authedRead(token, async (s) => C.verifyChain(s.events)); },
      async projections(token, filters) { return authedRead(token, (s, u) => C.projections(s.agreements, u.id, { ...filters, today: today() })); },
      async rev() { return read((s) => s.rev); },

      /* ----- demonstração ----- */
      async isEmpty() { return read((s) => s.users.length === 0); },
      async resetAll() { adapter.clear(); return true; },
      _adapter: adapter,
    };
    return api;
  }
  return { createPactoAPI, memoryAdapter, localStorageAdapter, PactoError, emptyState };
});
