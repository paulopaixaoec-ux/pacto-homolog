/* PACTO 8.2 · API remota (Supabase). Mesma assinatura da PactoAPI local:
   - LEITURAS rodam o mesmo motor (api.js) sobre um retrato do banco filtrado por RLS (só o que é seu);
   - ESCRITAS vão para a Edge Function `pacto-api`, que aplica as regras no servidor numa transação;
   - autenticação real pelo Supabase Auth (cadastro com confirmação de e-mail, login, recuperação, sessão);
   - sincronização entre aparelhos por Realtime (com verificação periódica de reserva). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./api.js'));
  else root.PactoRemote = factory(root.PactoCore, root.PactoAPI);
})(typeof self !== 'undefined' ? self : this, function (C, API) {
  'use strict';
  const { PactoError } = API;
  const WRITE = ['claim', 'updateProfile', 'createAgreement', 'propose', 'respond', 'addNote', 'reportPayment', 'reviewPayment', 'proposeEarly', 'respondEarly', 'reportEarly', 'reviewEarly', 'proposeConsolidation', 'respondConsolidation', 'runReminders', 'muteAgreement', 'proposeDelay', 'respondDelay', 'markRead', 'findUserByEmail', 'auditLog', 'verifyLog'];
  const READ = ['me', 'contacts', 'listAgreements', 'getAgreement', 'listConsolidations', 'assistantStatus', 'listOutbox', 'calendar', 'clients', 'clientDetail', 'dashboards', 'listNotifications', 'feed', 'projections'];

  /** Monta o estado que o motor de regras entende a partir das linhas visíveis (RLS). */
  function buildState({ me, contacts = [], agreements = [], consolidations = [], events = [], notifications = [], outbox = [] }, session) {
    const self = { id: me.id, email: me.email, name: me.name, handle: me.handle || '', photo: me.photo || '', lang: me.lang, theme: me.theme, prefs: me.prefs || {}, emailVerified: !!me.email_verified, createdAt: me.created_at, demo: false };
    const others = contacts.map((c) => ({ id: c.id, email: c.contact_email || '', name: c.name, handle: c.handle || '', photo: c.photo || '', lang: 'pt-BR', theme: 'auto', prefs: { shareContact: !!c.share_contact }, emailVerified: true, createdAt: '' }));
    const evs = events.slice().sort((a, b) => a.seq - b.seq);
    return {
      schema: 'pacto-8', rev: 0, users: [self, ...others],
      agreements, consolidations, events: evs,
      notifications: notifications.map((n) => ({ ...n.doc, read: n.read })),
      outbox, sessions: session ? { [session.key]: session.value } : {}, attempts: {}, mailbox: [], codes: {},
    };
  }

  function encodeArgs(args) {
    return args.map((a) => {
      if (a && typeof a === 'object' && a.file && a.file.bytes) return { ...a, file: { name: a.file.name, type: a.file.type, size: a.file.size, bytesB64: C.b64.enc(a.file.bytes) } };
      return a;
    });
  }

  function createRemoteAPI({ supabase: sb, functionsUrl, anonKey, clock = { now: () => new Date() }, redirectTo, functionsRegion }) {
    const now = () => clock.now();
    const subs = new Set();
    let LT = null, LKEY = null, lastSeen = Date.now(), locked = false, expiresAt = 0;
    let snap = null, snapP = null, dirty = true, channel = null, rtStatus = 'off', pollT = null;
    const authListeners = new Set();
    let stepUpHandler = null; // UI registra: pede o código TOTP e chama api.mfaVerify
    const loginFails = { n: 0, until: 0 }; // atraso progressivo no aparelho (o limite real é o do Supabase Auth)
    const emit = () => { dirty = true; subs.forEach((fn) => { try { fn(); } catch {} }); };

    const err = (e) => (e instanceof PactoError ? e : new PactoError(e && e.code || 'NETWORK', (e && e.message) || 'Falha de conexão.'));
    const authErr = (e) => {
      const m = String((e && e.message) || '');
      if (/Invalid login credentials/i.test(m)) return new PactoError('BAD_CREDENTIALS', 'E-mail ou senha incorretos.');
      if (/Email not confirmed/i.test(m)) return new PactoError('UNVERIFIED', 'Confirme seu e-mail pelo link que enviamos antes de entrar.');
      if (/already registered|already been registered/i.test(m)) return new PactoError('CONFLICT', 'Já existe uma conta com este e-mail.');
      if (/rate limit|too many/i.test(m)) return new PactoError('RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos.');
      if (/Password should|weak/i.test(m)) return new PactoError('WEAK_PASSWORD', 'Senha fraca: use ao menos 10 caracteres com letras e números.');
      return new PactoError('AUTH', m || 'Não foi possível concluir. Tente de novo.');
    };

    async function startLocal(session) {
      LT = C.randomToken(32); LKEY = await C.sha256Hex('session:' + LT);
      lastSeen = Date.now(); locked = false; expiresAt = Date.now() + 8 * 3600 * 1000;
      dirty = true; snap = null;
      startSync(session.user.id);
      return LT;
    }
    function stopLocal() { LT = null; LKEY = null; snap = null; dirty = true; if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; } clearInterval(pollT); rtStatus = 'off'; }

    function startSync(uid) {
      if (channel) { try { sb.removeChannel(channel); } catch {} }
      channel = sb.channel('pacto-' + uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, emit)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'consolidations' }, emit)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, emit)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, emit)
        .subscribe((status) => { rtStatus = status; });
      clearInterval(pollT);
      // reserva: se o Realtime cair, confere a cada 20 s; com Realtime ativo, a cada 2 min
      let tick = 0;
      pollT = setInterval(() => { tick++; if (rtStatus !== 'SUBSCRIBED' || tick % 6 === 0) emit(); }, 20000);
      if (typeof window !== 'undefined') window.addEventListener('focus', emit);
    }

    async function requireSession() {
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) { stopLocal(); throw new PactoError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.'); }
      return data.session;
    }
    function q(res, what) { if (res.error) throw new PactoError('NETWORK', 'Falha ao ler ' + what + ': ' + res.error.message); return res.data; }

    async function loadSnapshot() {
      const session = await requireSession();
      const uid = session.user.id;
      const [me, contacts, ags, cons, evs, nots, obx] = await Promise.all([
        sb.from('profiles').select('*').eq('id', uid).single(),
        sb.rpc('my_contacts'),
        sb.from('agreements').select('doc').order('created_at', { ascending: false }).limit(1000),
        sb.from('consolidations').select('doc').limit(500),
        sb.from('events').select('ev').order('seq', { ascending: false }).limit(1000),
        sb.from('notifications').select('doc,read').order('at', { ascending: false }).limit(600),
        sb.from('outbox').select('doc').order('at', { ascending: false }).limit(500),
      ]);
      const state = buildState({
        me: q(me, 'perfil'), contacts: q(contacts, 'contatos') || [], agreements: (q(ags, 'acordos') || []).map((r) => r.doc),
        consolidations: (q(cons, 'unificações') || []).map((r) => r.doc), events: (q(evs, 'histórico') || []).map((r) => r.ev),
        notifications: q(nots, 'notificações') || [], outbox: (q(obx, 'saída') || []).map((r) => r.doc).reverse(),
      }, { key: LKEY, value: { userId: uid, createdAt: lastSeen, lastSeen, expiresAt, locked, ua: 'web' } });
      const adapter = API.memoryAdapter();
      adapter.save(state);
      return { api: API.createPactoAPI({ adapter, clock }), adapter, uid, email: session.user.email };
    }
    async function local() {
      if (!LT) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.');
      if (dirty || !snap) {
        if (!snapP) snapP = loadSnapshot().then((s) => { snap = s; dirty = false; snapP = null; return s; }, (e) => { snapP = null; throw e; });
        await snapP;
      }
      // sessão local reflete atividade/bloqueio reais deste aparelho
      const st = snap.adapter.load(); const ses = st.sessions[LKEY];
      if (ses) { ses.lastSeen = lastSeen; ses.locked = locked; ses.expiresAt = expiresAt; snap.adapter.save(st); }
      return snap;
    }

    async function invoke(method, args) {
      try { return await invokeOnce(method, args); }
      catch (e) {
        if (e && e.code === 'MFA_REQUIRED' && stepUpHandler) {
          const ok = await stepUpHandler(); // reautenticação forte (hoje TOTP; passkey depois) e repete UMA vez
          if (ok) return invokeOnce(method, args);
        }
        throw e;
      }
    }
    async function invokeOnce(method, args) {
      const session = await requireSession();
      let res;
      try {
        res = await fetch(functionsUrl.replace(/\/$/, '') + '/pacto-api', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: anonKey },
            // executa a função na mesma região do banco (cada comando faz várias consultas: evita ida e volta intercontinental)
            functionsRegion ? { 'x-region': functionsRegion } : {}),
          body: JSON.stringify({ method, args: encodeArgs(args) }),
        });
      } catch (e) { throw new PactoError('NETWORK', 'Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
      let body = null; try { body = await res.json(); } catch {}
      if (!res.ok || !body || body.error) {
        const e = (body && body.error) || {};
        throw new PactoError(e.code || 'SERVER', e.message || 'O servidor recusou a operação (' + res.status + ').');
      }
      return body.result;
    }

    const api = {
      kind: 'supabase',
      today: () => { const d = now(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
      now,
      /* ---------- autenticação (Supabase Auth) ---------- */
      async restore() { const { data } = await sb.auth.getSession(); if (!data || !data.session) return null; return { token: await startLocal(data.session) }; },
      onAuthEvent(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
      async signup({ email, name, password }) {
        email = String(email || '').trim().toLowerCase(); name = C.cleanText(name, 60);
        if (!C.isEmail(email)) throw new PactoError('VALIDATION', 'E-mail inválido.');
        if (name.length < 2) throw new PactoError('VALIDATION', 'Informe seu nome de exibição.');
        const probs = C.passwordProblems(password); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectTo } });
        if (error) throw authErr(error);
        if (data.session) return { token: await startLocal(data.session), user: null, pending: false };
        return { pending: true, email };
      },
      async login({ email, password }) {
        const wait = Math.ceil((loginFails.until - Date.now()) / 1000);
        if (wait > 0) throw new PactoError('RATE_LIMIT', `Muitas tentativas. Aguarde ${wait} s para tentar de novo.`);
        const { data, error } = await sb.auth.signInWithPassword({ email: String(email || '').trim().toLowerCase(), password: String(password || '') });
        if (error) {
          loginFails.n++; if (loginFails.n >= 5) loginFails.until = Date.now() + Math.min(300, 15 * 2 ** (loginFails.n - 5)) * 1000;
          throw authErr(error);
        }
        loginFails.n = 0; loginFails.until = 0;
        const token = await startLocal(data.session);
        try { await invoke('claim', []); } catch {}
        return { token, user: null };
      },
      async logout() { stopLocal(); try { await sb.auth.signOut({ scope: 'local' }); } catch {} return true; },
      async lock() { locked = true; return true; },
      async unlock(token, password) {
        const s = await requireSession();
        const { error } = await sb.auth.signInWithPassword({ email: s.user.email, password: String(password || '') });
        if (error) throw (/Invalid login/i.test(error.message) ? new PactoError('BAD_CREDENTIALS', 'Senha incorreta.') : authErr(error));
        locked = false; lastSeen = Date.now(); return true;
      },
      async touch() { if (!LT) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.'); if (!locked) lastSeen = Date.now(); return true; },
      async sessionInfo(token) { const s = await local(); return s.api.sessionInfo(LT); },
      async listSessions() { await requireSession(); return [{ current: true, createdAt: lastSeen, lastSeen, ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 80) }]; },
      async revokeOtherSessions() { const { error } = await sb.auth.signOut({ scope: 'others' }); if (error) throw authErr(error); return true; },
      async verifyEmail() { return true; },
      async resendVerification() { const s = await requireSession(); const { error } = await sb.auth.resend({ type: 'signup', email: s.user.email, options: { emailRedirectTo: redirectTo } }); if (error) throw authErr(error); return true; },
      async resendSignup(email) { const { error } = await sb.auth.resend({ type: 'signup', email: String(email || '').trim().toLowerCase(), options: { emailRedirectTo: redirectTo } }); if (error) throw authErr(error); return true; },
      async requestReset(email) { const { error } = await sb.auth.resetPasswordForEmail(String(email || '').trim().toLowerCase(), { redirectTo }); if (error) throw authErr(error); return true; },
      async resetPassword({ password }) {
        const probs = C.passwordProblems(password); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const { error } = await sb.auth.updateUser({ password }); if (error) throw authErr(error);
        try { await sb.auth.signOut({ scope: 'others' }); } catch {}
        return true;
      },
      async changePassword(token, { current, next }) {
        const probs = C.passwordProblems(next); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const s = await requireSession();
        const re = await sb.auth.signInWithPassword({ email: s.user.email, password: String(current || '') });
        if (re.error) throw new PactoError('BAD_CREDENTIALS', 'Senha atual incorreta.');
        const { error } = await sb.auth.updateUser({ password: next }); if (error) throw authErr(error);
        try { await sb.auth.signOut({ scope: 'others' }); } catch {}
        return true;
      },
      /* ---------- verificação em duas etapas (Supabase Auth MFA · TOTP) ---------- */
      onStepUp(fn) { stepUpHandler = fn; },
      async mfaStatus() {
        const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw authErr(error);
        const lvl = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        const totp = (data.totp || []).filter((f) => f.status === 'verified');
        return { enabled: totp.length > 0, factors: totp.map((f) => ({ id: f.id, name: f.friendly_name || 'App autenticador', createdAt: f.created_at })), level: lvl.data && lvl.data.currentLevel, next: lvl.data && lvl.data.nextLevel };
      },
      async mfaEnroll() {
        // limpa tentativas de cadastro não concluídas deste usuário (fatores não verificados)
        const ls = await sb.auth.mfa.listFactors();
        for (const f of ((ls.data && ls.data.all) || []).filter((x) => x.status !== 'verified')) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch {} }
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PACTO ' + new Date().toISOString().slice(0, 10) });
        if (error) throw authErr(error);
        return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
      },
      async mfaVerify({ factorId, code }) {
        code = String(code || '').replace(/\D/g, '');
        if (code.length !== 6) throw new PactoError('VALIDATION', 'Digite os 6 dígitos do app autenticador.');
        let id = factorId;
        if (!id) { const { data } = await sb.auth.mfa.listFactors(); const f = (data.totp || []).find((x) => x.status === 'verified'); if (!f) throw new PactoError('MFA_ENROLL_REQUIRED', 'Ative a verificação em duas etapas primeiro.'); id = f.id; }
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: id, code });
        if (error) throw (/invalid|expired/i.test(error.message) ? new PactoError('BAD_CODE', 'Código inválido ou expirado. Confira o relógio do celular e tente de novo.') : authErr(error));
        return true;
      },
      async mfaUnenroll(factorId) {
        const { error } = await sb.auth.mfa.unenroll({ factorId }); if (error) throw (/aal2|AAL2/.test(error.message) ? new PactoError('MFA_REQUIRED', 'Confirme com o código atual antes de desativar.') : authErr(error));
        await sb.auth.refreshSession().catch(() => {});
        return true;
      },
      async demoMailbox() { return []; },
      async demoAccounts() { return []; },
      async isEmpty() { return false; },
      async resetAll() { return false; },
      async rev() { return dirty ? -1 : 0; },
      /* ---------- arquivos: URL assinada (60 s) + conferência de integridade no aparelho ---------- */
      async getFile(token, fileId) {
        const f = await invoke('getFile', [fileId]);
        let bytes;
        try { const r = await fetch(f.signedUrl); if (!r.ok) throw new Error(String(r.status)); bytes = new Uint8Array(await r.arrayBuffer()); }
        catch (e) { throw new PactoError('NETWORK', 'Não foi possível baixar o comprovante agora.'); }
        const integrity = (await C.sha256Hex(bytes)) === f.sha256;
        return { ...f, dataB64: C.b64.enc(bytes), integrity };
      },
      async deleteReport() { throw new PactoError('IMMUTABLE', 'Comprovantes não podem ser excluídos. Aprovados são permanentes.'); },
      _adapter: { kind: 'supabase', subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } },
      get realtimeStatus() { return rtStatus; },
    };
    READ.forEach((m) => { api[m] = async (token, ...args) => { try { const s = await local(); return await s.api[m](LT, ...args); } catch (e) { throw err(e); } }; });
    const idleLocked = () => { const st = snap && snap.adapter.load(); const me = st && st.users[0]; const min = (me && me.prefs && me.prefs.autoLockMin) || 10; return locked || Date.now() - lastSeen > min * 60000; };
    WRITE.forEach((m) => { api[m] = async (token, ...args) => {
      if (idleLocked()) { locked = true; throw new PactoError('LOCKED', 'Sessão bloqueada por inatividade.'); }
      if (m !== 'runReminders') lastSeen = Date.now();
      try { const r = await invoke(m, args); return r; } finally { dirty = true; }
    }; });

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') stopLocal();
      authListeners.forEach((fn) => { try { fn(event, session); } catch {} });
    });
    return api;
  }
  return { createRemoteAPI, buildState, encodeArgs, WRITE, READ };
});
