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

  /** Só desloga quando o servidor recusa o refresh de forma definitiva (token revogado/inexistente). Falha de rede ou 5xx não apaga um refresh token ainda válido. */
  function refreshIsFatal(err) {
    if (!err || err === true) return false;
    const code = String(err.code || err.error || err.name || '');
    const msg = String(err.message || err.error_description || err.error_code || '');
    const blob = code + ' ' + msg;
    // códigos definitivos primeiro — status 0 (erro sem HTTP) não pode mascarar invalid_grant
    if (/invalid_grant|refresh.?token.?not.?found|refresh.?token.?already.?used|session.?not.?found/i.test(blob)) return true;
    const status = Number(err.status || err.statusCode || 0);
    if (status === 0 || status >= 500) return false;
    if (/AuthRetryableFetchError|fetch|network|timeout|Failed to fetch|ECONN|ETIMEDOUT/i.test(blob)) return false;
    return false;
  }

  /** Armazém da marca de bloqueio: localStorage (compartilhado entre abas, com evento `storage`); sem localStorage cai para memória. */
  function defaultLockStore() {
    const KEY = 'pacto82-lock'; let mem = null;
    const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
    return {
      get() { const l = ls(); return l ? l.getItem(KEY) : mem; },
      set(v) { const l = ls(); if (l) l.setItem(KEY, v); else mem = v; },
      del() { const l = ls(); if (l) l.removeItem(KEY); else mem = null; },
      watch(fn) { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) fn(); }); },
    };
  }

  function createRemoteAPI({ supabase: sb, functionsUrl, anonKey, clock = { now: () => new Date() }, redirectTo, functionsRegion, lockStore: lockStoreOpt, proofClient }) {
    const now = () => clock.now();
    // o link de recuperação volta para a mesma página (dentro da lista de URLs permitidas do Supabase) com um marcador de ação
    const recoveryUrl = String(redirectTo || '') + (String(redirectTo || '').includes('?') ? '&' : '?') + 'acao=nova-senha';
    const subs = new Set();
    let LT = null, LKEY = null, lastSeen = Date.now(), locked = false, expiresAt = 0;
    let snap = null, snapP = null, dirty = true, channel = null, rtStatus = 'off', pollT = null;
    const authListeners = new Set();
    const lockListeners = new Set();
    const lockStore = lockStoreOpt || defaultLockStore();
    let stepUpHandler = null; // UI registra: pede o código TOTP e chama api.mfaVerify
    const loginFails = { n: 0, until: 0 }; // atraso progressivo no aparelho (o limite real é o do Supabase Auth)
    const emit = () => { dirty = true; if (locked) return; subs.forEach((fn) => { try { fn(); } catch {} }); };

    const err = (e) => (e instanceof PactoError ? e : new PactoError(e && e.code || 'NETWORK', (e && e.message) || 'Falha de conexão.'));
    const authErr = (e) => {
      const m = String((e && e.message) || '');
      if (/Invalid login credentials/i.test(m)) return new PactoError('BAD_CREDENTIALS', 'E-mail ou senha incorretos.');
      if (/Email not confirmed/i.test(m)) return new PactoError('UNVERIFIED', 'Confirme seu e-mail pelo link que enviamos antes de entrar.');
      if (/already registered|already been registered/i.test(m)) return new PactoError('CONFLICT', 'Já existe uma conta com este e-mail.');
      if (/captcha/i.test(m)) return new PactoError('CAPTCHA', 'Confirme a verificação anti-robô e tente de novo.');
      if (/over_email_send_rate_limit|email rate limit exceeded/i.test(String((e && (e.code || e.error_code)) || '') + ' ' + m)) return new PactoError('RATE_LIMIT', 'Não foi possível enviar o e-mail agora. Aguarde uns minutos e tente de novo.');
      if (/rate limit|too many|only request this after|over_.*_limit/i.test(m) || (e && e.status === 429)) { const sec = /after (\d+) second/i.exec(m); return new PactoError('RATE_LIMIT', sec ? `Muitos pedidos em sequência. Aguarde ${sec[1]} segundos e tente de novo.` : 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'); }
      if (/different from the old password|same_password/i.test(m) || (e && e.code === 'same_password')) return new PactoError('SAME_PASSWORD', 'A nova senha precisa ser diferente da senha atual.');
      if (/AAL2|aal2|insufficient_aal/i.test(m) || (e && e.code === 'insufficient_aal')) return new PactoError('MFA_REQUIRED', 'Confirme com o código do app autenticador para continuar.');
      if (/expired|invalid/i.test(m) && /token|otp|link/i.test(m)) return new PactoError('LINK_INVALID', 'Este link expirou, já foi usado ou não é válido.');
      if (/Password should|weak/i.test(m) || (e && (e.code === 'weak_password' || e.error_code === 'weak_password'))) return new PactoError('WEAK_PASSWORD', 'Senha fraca: use ao menos 10 caracteres com letras e números.');
      return new PactoError('AUTH', m || 'Não foi possível concluir. Tente de novo.');
    };

    const cap = (t) => (t ? { captchaToken: String(t) } : {}); // CAPTCHA (Turnstile/hCaptcha) só quando a tela tiver um token

    /** Estado do bloqueio por inatividade. Fica no aparelho (localStorage), vale para todas as abas e sobrevive a recarregar/fechar o navegador.
        Na dúvida (marca ausente, ilegível, de outra conta ou de “futuro”) o app abre BLOQUEADO. */
    const LOCK_DEFAULT_MIN = 10;
    const lockMin = (v) => (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 240 ? Number(v) : LOCK_DEFAULT_MIN);
    function readLock() {
      let raw = null; try { raw = lockStore.get(); } catch { return { bad: true }; }
      if (raw == null) return null;
      try {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object' && typeof o.uid === 'string' && o.uid && typeof o.locked === 'boolean' && Number.isFinite(o.last) && Number.isFinite(o.min)) return o;
      } catch {}
      return { bad: true };
    }
    function writeLock(patch) {
      const cur = readLock(); const base = cur && !cur.bad ? cur : { uid: lockUid || '', locked: true, last: 0, min: LOCK_DEFAULT_MIN };
      const nx = { ...base, ...patch };
      try { lockStore.set(JSON.stringify(nx)); } catch {}
      return nx;
    }
    let lockUid = '', lastStamp = 0;
    /** atividade real da pessoa (toque, tecla, escrita): atualiza o relógio de inatividade compartilhado entre as abas */
    function stamp(force) {
      const t = Date.now(); lastSeen = t;
      if (locked || !lockUid) return;
      if (!force && t - lastStamp < 4000) return; lastStamp = t;
      writeLock({ last: t });
    }
    function lastActivity() { const r = readLock(); return Math.max(lastSeen, r && !r.bad && r.uid === lockUid ? r.last : 0); }
    function idleExceeded() {
      const r = readLock(); const t = Date.now();
      if (!r || r.bad || r.uid !== lockUid || r.last > t + 60000) return true; // na dúvida, bloqueia
      return t - Math.max(lastSeen, r.last) > lockMin(r.min) * 60000;
    }
    function isLocked() { if (locked) return true; if (!LT) return false; if (idleExceeded()) { applyLock(true); return true; } return false; }
    /** bloqueia: derruba Realtime/polling e descarta os dados em memória; a sessão do Supabase continua viva (renovação automática) */
    function applyLock(persist) {
      locked = true;
      if (persist) { writeLock({ locked: true }); serverLock(); }
      if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; }
      clearInterval(pollT); pollT = null; rtStatus = 'off'; snap = null; snapP = null; dirty = true;
    }
    function lockedErr() { return new PactoError('LOCKED', 'Sessão bloqueada por inatividade.'); }

    /* ---------- t44u · bloqueio imposto pelo SERVIDOR (por sessão do Supabase Auth) ----------
       O servidor guarda a janela de desbloqueio desta sessão (session_id do JWT, que não muda no refresh). Bloqueado, a RLS não
       devolve nenhuma linha, o Realtime não entrega eventos e a pacto-api responde 423. Aqui só acompanhamos o estado. */
    let srv = null, lastSrvTouch = 0, srvTouchP = null;
    function notifyLocked() { lockListeners.forEach((fn) => { try { fn('locked'); } catch {} }); }
    function serverSaysLocked(st) { return !!(st && st.enforced && !st.unlocked); }
    async function serverStatus() {
      try { const { data, error } = await sb.rpc('pacto_lock_status'); if (error || !data) return null; srv = data; return data; } catch { return null; }
    }
    /** bloquear agora também no servidor (todas as abas desta sessão); falha de rede não impede o bloqueio local */
    // se a rede falhar no momento do bloqueio, repete: ao voltar a conexão/aba e a cada 15 s enquanto continuar bloqueado
    let srvLockPending = false, srvLockT = null;
    function serverLock() {
      srvLockPending = true;
      if (!srvLockT) { srvLockT = setInterval(retryServerLock, 15000); if (srvLockT && typeof srvLockT.unref === 'function') srvLockT.unref(); }
      try {
        const r = sb.rpc('pacto_lock');
        if (r && r.then) r.then((x) => { if (!x || !x.error) { srvLockPending = false; clearInterval(srvLockT); srvLockT = null; } }, () => {});
      } catch {}
    }
    function retryServerLock() { if (srvLockPending && locked && LT) serverLock(); else { if (!LT) srvLockPending = false; if (!srvLockPending) { clearInterval(srvLockT); srvLockT = null; } } }
    /** batimento: enquanto a pessoa usa o app, estende a janela no servidor (nunca reabre uma janela vencida) */
    function serverTouch(force) {
      if (!LT || locked || srvTouchP) return srvTouchP;
      const t = Date.now(); if (!force && t - lastSrvTouch < 30000) return null; lastSrvTouch = t;
      srvTouchP = Promise.resolve().then(() => sb.rpc('pacto_unlock_touch')).then(({ data }) => {
        if (data) { srv = data; if (serverSaysLocked(data) && LT && !locked) { applyLock(true); notifyLocked(); } }
        return data;
      }, () => null).finally(() => { srvTouchP = null; });
      return srvTouchP;
    }
    /** pede ao servidor o desbloqueio DESTA sessão. proof: token de sessão temporária (senha recém-confirmada); sem proof: autenticação recém-feita */
    async function serverUnlock(proof) { return invokeOnce('unlock', proof ? [{ proof }] : []); }

    async function startLocal(session, opts = {}) {
      rememberAuth(session);
      LT = C.randomToken(32); LKEY = await C.sha256Hex('session:' + LT);
      lastSeen = opts.last || Date.now(); locked = !!opts.locked; expiresAt = Date.now() + 8 * 3600 * 1000;
      lockUid = session.user.id; lastStamp = 0;
      dirty = true; snap = null;
      if (locked) { writeLock({ uid: lockUid, locked: true }); return LT; } // bloqueado: sem leitura de dados e sem Realtime até a senha ser confirmada
      writeLock({ uid: lockUid, locked: false, last: lastSeen, min: lockMin((readLock() || {}).min) });
      startSync(session.user.id, session.access_token);
      return LT;
    }
    function stopLocal() { LT = null; LKEY = null; snap = null; dirty = true; locked = false; lockUid = ''; try { lockStore.del(); } catch {} if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; } clearInterval(pollT); rtStatus = 'off'; }

    /** Realtime privado: o token do canal precisa acompanhar a sessão (JWT de 600 s). */
    function rtAuth(token) { try { if (token && sb.realtime && typeof sb.realtime.setAuth === 'function') { const r = sb.realtime.setAuth(token); if (r && r.catch) r.catch(() => {}); } } catch {} }
    function startSync(uid, token) {
      if (channel) { try { sb.removeChannel(channel); } catch {} }
      rtAuth(token);
      // canal PRIVADO 'pacto-<uid>': com “Allow public access” desligado, o Realtime só aceita canais privados;
      // a política em realtime.messages só deixa cada pessoa entrar no próprio tópico. Os eventos de tabela seguem o RLS.
      channel = sb.channel('pacto-' + uid, { config: { private: true } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, emit)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'consolidations' }, emit)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, emit)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, emit)
        .subscribe((status) => { rtStatus = status; });
      clearInterval(pollT);
      // reserva: se o Realtime cair, confere a cada 20 s; com Realtime ativo, a cada 2 min
      let tick = 0;
      pollT = setInterval(() => { tick++; if (rtStatus !== 'SUBSCRIBED' || tick % 6 === 0) emit(); }, 20000);
      if (pollT && typeof pollT.unref === 'function') pollT.unref(); // só Node (testes): não segura o processo
      if (typeof window !== 'undefined') window.addEventListener('focus', emit);
    }

    // último par access+refresh que vimos: se getSession() devolver null após uma falha transitória
    // (rede, aba em segundo plano), ainda tentamos renovar com este refresh token em vez de deslogar.
    let lastHeld = null;
    function rememberAuth(s) { if (s && s.refresh_token) lastHeld = s; }
    function heldRefresh() {
      if (lastHeld && lastHeld.refresh_token) return lastHeld;
      if (typeof localStorage === 'undefined') return null;
      try {
        const k = Object.keys(localStorage).find((x) => x === 'pacto82-auth' || x.endsWith('-auth-token'));
        if (!k) return null;
        const raw = JSON.parse(localStorage.getItem(k));
        const sess = raw && (raw.currentSession || raw);
        return (sess && sess.refresh_token) ? sess : null;
      } catch { return null; }
    }
    async function recoverSession(minLeftSec = 0, force = false) {
      let s = null, getErr = null;
      try {
        const { data, error } = await sb.auth.getSession();
        s = data && data.session; getErr = error || null;
        if (s) rememberAuth(s);
      } catch (e) { getErr = e; }
      // force: o servidor já recusou este token (401) — renova mesmo que o relógio do aparelho diga que ainda vale
      if (!force && s && s.expires_at && s.expires_at - Math.floor(Date.now() / 1000) > minLeftSec) return s;
      const hint = s || heldRefresh();
      let r;
      try {
        r = hint && hint.refresh_token
          ? await sb.auth.refreshSession({ refresh_token: hint.refresh_token })
          : await sb.auth.refreshSession();
      } catch (e) { r = { data: { session: null }, error: e }; }
      if (r && r.data && r.data.session) { rememberAuth(r.data.session); rtAuth(r.data.session.access_token); return r.data.session; }
      const err = (r && r.error) || getErr;
      if (refreshIsFatal(err)) { lastHeld = null; stopLocal(); return null; }
      // transiente: devolve a sessão que ainda temos (mesmo com access token vencido) e NÃO desmonta
      return s || hint || null;
    }
    async function requireSession() {
      const s = await recoverSession(0);
      if (s) return s;
      throw new PactoError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.');
    }
    function q(res, what) { if (res.error) throw new PactoError('NETWORK', 'Falha ao ler ' + what + ': ' + res.error.message); return res.data; }

    async function loadSnapshot() {
      if (isLocked()) throw lockedErr();
      const session = await requireSession();
      const uid = session.user.id;
      const [st, me, contacts, ags, cons, evs, nots, obx] = await Promise.all([
        serverStatus(),
        sb.from('profiles').select('*').eq('id', uid).single(),
        sb.rpc('my_contacts'),
        sb.from('agreements').select('doc').order('created_at', { ascending: false }).limit(1000),
        sb.from('consolidations').select('doc').limit(500),
        sb.from('events').select('ev').order('seq', { ascending: false }).limit(1000),
        sb.from('notifications').select('doc,read').order('at', { ascending: false }).limit(600),
        sb.from('outbox').select('doc').order('at', { ascending: false }).limit(500),
      ]);
      // servidor diz que esta sessão está bloqueada: a RLS devolveu listas vazias — descarta tudo e mostra o bloqueio
      if (serverSaysLocked(st)) { applyLock(false); writeLock({ locked: true }); notifyLocked(); throw lockedErr(); }
      const state = buildState({
        me: q(me, 'perfil'), contacts: q(contacts, 'contatos') || [], agreements: (q(ags, 'acordos') || []).map((r) => r.doc),
        consolidations: (q(cons, 'unificações') || []).map((r) => r.doc), events: (q(evs, 'histórico') || []).map((r) => r.ev),
        notifications: q(nots, 'notificações') || [], outbox: (q(obx, 'saída') || []).map((r) => r.doc).reverse(),
      }, { key: LKEY, value: { userId: uid, createdAt: lastSeen, lastSeen, expiresAt, locked, ua: 'web' } });
      if (isLocked()) throw lockedErr(); // bloqueou enquanto lia: descarta
      const mine = state.users[0] && state.users[0].prefs && state.users[0].prefs.autoLockMin;
      if (mine && lockUid === uid) { const r = readLock(); if (r && !r.bad && r.min !== lockMin(mine)) writeLock({ min: lockMin(mine) }); }
      const adapter = API.memoryAdapter();
      adapter.save(state);
      return { api: API.createPactoAPI({ adapter, clock }), adapter, uid, email: session.user.email };
    }
    async function local() {
      if (!LT) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.');
      if (isLocked()) throw lockedErr();
      if (dirty || !snap) {
        if (!snapP) snapP = loadSnapshot().then((s) => { snap = s; dirty = false; snapP = null; return s; }, (e) => { snapP = null; throw e; });
        await snapP;
      }
      // sessão local reflete atividade/bloqueio reais deste aparelho
      const st = snap.adapter.load(); const ses = st.sessions[LKEY];
      if (ses) { ses.lastSeen = lastSeen; ses.locked = locked; ses.expiresAt = expiresAt; snap.adapter.save(st); }
      return snap;
    }

    // sessão: renova o token se faltar pouco para vencer (JWT curto, ex.: 600 s) — usado antes de chamar a função e ao voltar ao app
    async function freshSession(minLeftSec = 60) {
      return recoverSession(minLeftSec);
    }
    async function invoke(method, args, { noStepUp = false } = {}) {
      if (LT && isLocked()) throw lockedErr();
      try { return await invokeOnce(method, args); }
      catch (e0) {
        let e = e0;
        // token vencido ou recusado: renova a sessão e repete UMA vez; se não renovar, pede login de novo
        if (e && (e.code === 'TOKEN_EXPIRED' || e.code === 'UNAUTHENTICATED') && e.httpStatus === 401) {
          const before = e.sentToken;
          const s1 = await recoverSession(0, true);
          // só repete se a renovação trouxe um token NOVO (reenviar o mesmo token recusado não adianta)
          if (s1 && s1.access_token && s1.access_token !== before) {
            try { return await invokeOnce(method, args); } catch (e2) { e = e2; }
          } else {
            throw new PactoError('UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.');
          }
        }
        if (e && e.code === 'MFA_REQUIRED' && stepUpHandler && !noStepUp) {
          const ok = await stepUpHandler(); // reautenticação forte (hoje TOTP; passkey depois) e repete UMA vez
          if (ok) return invokeOnce(method, args);
        }
        throw e;
      }
    }
    async function invokeOnce(method, args) {
      const session = (await freshSession(30)) || await requireSession();
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
        const pe = new PactoError(e.code || 'SERVER', e.message || 'O servidor recusou a operação (' + res.status + ').'); pe.httpStatus = res.status;
        if (res.status === 423 && LT && !locked) { applyLock(true); notifyLocked(); }
        if (res.status === 401) Object.defineProperty(pe, 'sentToken', { value: session.access_token, enumerable: false });
        throw pe;
      }
      return body.result;
    }

    const api = {
      kind: 'supabase',
      today: () => C.brtDate(now()),
      now,
      /* ---------- autenticação (Supabase Auth) ---------- */
      /** Reabre a sessão guardada. Só entra DESBLOQUEADO se a marca de bloqueio for legível, da mesma conta, não estiver bloqueada e a inatividade não passou do limite;
          caso contrário abre bloqueado (sem ler dados e sem Realtime). `fresh`: acabou de autenticar (link de e-mail/recuperação de senha). */
      async restore({ fresh = false } = {}) {
        const { data } = await sb.auth.getSession(); if (!data || !data.session) { try { lockStore.del(); } catch {} return null; }
        const ses = data.session; const r = readLock(); const t = Date.now();
        let ok = fresh || (r && !r.bad && r.uid === ses.user.id && r.locked === false && r.last <= t + 60000 && t - r.last <= lockMin(r.min) * 60000);
        if (fresh) { try { await serverUnlock(null); } catch {} } // link de e-mail/recuperação: autenticação recém-feita desbloqueia esta sessão no servidor
        else if (ok) { const st = await serverStatus(); if (serverSaysLocked(st)) ok = false; } // o servidor manda: janela vencida/sessão bloqueada => abre bloqueado
        else serverLock();
        if (!ok) { lockUid = ses.user.id; lastSeen = 0; }
        const token = await startLocal(ses, { locked: !ok, last: ok && !fresh ? r.last : 0 }); // recarregar NÃO conta como atividade: o relógio de inatividade segue de onde estava
        return { token, locked: !ok };
      },
      isLocked() { return isLocked(); },
      lastActivity() { return lastActivity(); },
      /** atividade da pessoa (a tela chama em toque/tecla/rolagem); barato: grava no máximo a cada 4 s */
      activity() { if (LT && !locked) { stamp(false); serverTouch(false); } },
      /** avisos de outra aba: 'locked' | 'unlocked' */
      onLock(fn) { lockListeners.add(fn); return () => lockListeners.delete(fn); },
      onAuthEvent(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
      async signup({ email, name, password, captchaToken }) {
        email = String(email || '').trim().toLowerCase(); name = C.cleanText(name, 60);
        if (!C.isEmail(email)) throw new PactoError('VALIDATION', 'E-mail inválido.');
        if (name.length < 2) throw new PactoError('VALIDATION', 'Informe seu nome de exibição.');
        const probs = C.passwordProblems(password); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectTo, ...cap(captchaToken) } });
        if (error) throw authErr(error);
        if (data.session) { try { await serverUnlock(null); } catch {} return { token: await startLocal(data.session), user: null, pending: false }; }
        return { pending: true, email };
      },
      async login({ email, password, captchaToken }) {
        const wait = Math.ceil((loginFails.until - Date.now()) / 1000);
        if (wait > 0) throw new PactoError('RATE_LIMIT', `Muitas tentativas. Aguarde ${wait} s para tentar de novo.`);
        const { data, error } = await sb.auth.signInWithPassword({ email: String(email || '').trim().toLowerCase(), password: String(password || ''), options: cap(captchaToken) });
        if (error) {
          loginFails.n++; if (loginFails.n >= 5) loginFails.until = Date.now() + Math.min(300, 15 * 2 ** (loginFails.n - 5)) * 1000;
          throw authErr(error);
        }
        loginFails.n = 0; loginFails.until = 0;
        try { await serverUnlock(null); } catch {} // entrar com senha desbloqueia ESTA sessão no servidor (antes de ler dados ou abrir o Realtime)
        const token = await startLocal(data.session);
        try { await invoke('claim', []); } catch {}
        return { token, user: null };
      },
      async logout() { stopLocal(); try { await sb.auth.signOut({ scope: 'local' }); } catch {} return true; },
      async lock() { if (LT) applyLock(true); return true; },
      async unlock(token, password, captchaToken) {
        const s = await requireSession();
        if (s.user && lockUid && s.user.id !== lockUid) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.');
        let proof = null, ses = s, pc = null;
        if (proofClient) {
          // confere a senha numa sessão TEMPORÁRIA (não substitui a sessão atual, que segue com o mesmo session_id e o mesmo nível AAL);
          // o servidor revoga a temporária logo em seguida (uso único)
          pc = proofClient();
          const { data, error } = await pc.auth.signInWithPassword({ email: s.user.email, password: String(password || ''), options: cap(captchaToken) });
          if (error) throw (/Invalid login/i.test(error.message) ? new PactoError('BAD_CREDENTIALS', 'Senha incorreta.') : authErr(error));
          if (!data || !data.session || data.session.user.id !== s.user.id) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.');
          proof = data.session.access_token;
        } else {
          const { data, error } = await sb.auth.signInWithPassword({ email: s.user.email, password: String(password || ''), options: cap(captchaToken) });
          if (error) throw (/Invalid login/i.test(error.message) ? new PactoError('BAD_CREDENTIALS', 'Senha incorreta.') : authErr(error));
          ses = (data && data.session) || s;
        }
        try { await serverUnlock(proof); }
        catch (e) {
          if (pc) { try { await pc.auth.signOut({ scope: 'local' }); } catch {} } // o servidor não revogou: encerra a sessão temporária daqui
          // sem resposta do servidor: só segue se o servidor ainda NÃO impõe o bloqueio a esta conta (modo desligado/fora do canário)
          const st = await serverStatus();
          if (!(st && !st.enforced)) throw (e && e.code === 'UNLOCK_PROOF' ? new PactoError('BAD_CREDENTIALS', 'Não foi possível confirmar sua senha. Tente de novo.') : err(e));
        }
        if (ses.user && ses.user.id !== lockUid) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.');
        locked = false; srvLockPending = false; lastSeen = Date.now(); lastStamp = 0; lastSrvTouch = Date.now(); writeLock({ uid: lockUid, locked: false, last: lastSeen });
        dirty = true; snap = null;
        const cur = (await freshSession(30)) || ses;
        startSync(cur.user.id, cur.access_token); // só agora volta a ler dados e a assinar o Realtime
        return true;
      },
      async touch() {
        if (!LT) throw new PactoError('UNAUTHENTICATED', 'Entre novamente.'); if (isLocked()) throw lockedErr(); stamp(true);
        const st = await serverTouch(true); if (serverSaysLocked(st)) throw lockedErr();
        return true;
      },
      /** estado do bloqueio no servidor (para a tela e os testes) */
      async lockStatus() { return serverStatus(); },
      async sessionInfo(token) { const s = await local(); return s.api.sessionInfo(LT); },
      async listSessions() { await requireSession(); return [{ current: true, createdAt: lastSeen, lastSeen, ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 80) }]; },
      async revokeOtherSessions() { const { error } = await sb.auth.signOut({ scope: 'others' }); if (error) throw authErr(error); return true; },
      async verifyEmail() { return true; },
      async resendVerification() { const s = await requireSession(); const { error } = await sb.auth.resend({ type: 'signup', email: s.user.email, options: { emailRedirectTo: redirectTo } }); if (error) throw authErr(error); return true; },
      async resendSignup(email, captchaToken) { const { error } = await sb.auth.resend({ type: 'signup', email: String(email || '').trim().toLowerCase(), options: { emailRedirectTo: redirectTo, ...cap(captchaToken) } }); if (error) throw authErr(error); return true; },
      /* ---------- recuperação de senha (Supabase Auth: link por e-mail; o PACTO nunca vê nem envia senhas) ---------- */
      async requestReset(email, captchaToken) {
        email = String(email || '').trim().toLowerCase();
        if (!C.isEmail(email)) throw new PactoError('VALIDATION', 'Digite um e-mail válido.');
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: recoveryUrl, ...cap(captchaToken) });
        if (error) {
          // limite por pessoa (60 s entre pedidos): só existe para contas reais; tratado como “enviado” para não revelar se o e-mail existe (a tela já impõe 60 s de espera)
          if (/only request this after/i.test(String(error.message))) return true;
          const pe = authErr(error);
          // limite, CAPTCHA e rede aparecem para a pessoa; qualquer outra falha vira a mesma resposta genérica (não revela se o e-mail existe)
          if (['RATE_LIMIT', 'CAPTCHA', 'VALIDATION'].includes(pe.code) || (error.status === 0) || /fetch|network/i.test(String(error.message))) throw pe;
          if (typeof console !== 'undefined') console.warn('recuperação: ' + (error.code || error.status || 'erro'));
        }
        return true;
      },
      /** Situação da sessão aberta pelo link de recuperação (sem iniciar o app): e-mail e se falta o código do autenticador (AAL2). */
      async recoveryState() {
        const { data } = await sb.auth.getSession(); const s = data && data.session;
        if (!s) return { ok: false };
        let mfa = false;
        try {
          const f = await sb.auth.mfa.listFactors(); const lvl = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
          mfa = ((f.data && f.data.totp) || []).some((x) => x.status === 'verified') && !(lvl.data && lvl.data.currentLevel === 'aal2');
        } catch { mfa = true; } // na dúvida, exige o segundo fator
        return { ok: true, email: s.user.email, mfa };
      },
      /** Link no formato token_hash (modelo de e-mail recomendado: sobrevive a antivírus que “clicam” nos links). */
      async recoveryFromTokenHash(tokenHash) {
        const { error } = await sb.auth.verifyOtp({ type: 'recovery', token_hash: String(tokenHash || '') });
        if (error) throw new PactoError('LINK_INVALID', 'Este link expirou, já foi usado ou não é válido.');
        return true;
      },
      /** Define a nova senha na sessão de recuperação. Com TOTP ativo, o Supabase só aceita em AAL2; depois encerra os outros aparelhos e esta sessão. */
      async resetPassword({ password }) {
        const probs = C.passwordProblems(password); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const { error } = await sb.auth.updateUser({ password }); if (error) throw authErr(error);
        try { await sb.auth.signOut({ scope: 'others' }); } catch {}
        try { await sb.auth.signOut({ scope: 'local' }); } catch {}
        stopLocal();
        return true;
      },
      /* ---------- tour de boas-vindas: conclusão guardada por pessoa no Supabase (vale em todos os aparelhos) ---------- */
      async tourStatus() {
        const s = await requireSession();
        const { data, error } = await sb.from('user_onboarding').select('tour_status,tour_done_at').eq('user_id', s.user.id).maybeSingle();
        if (error) throw new PactoError('SERVER', 'Não foi possível ler o tour.');
        return data ? { done: true, status: data.tour_status, at: data.tour_done_at } : { done: false };
      },
      async tourMark(status) {
        await requireSession();
        const { data, error } = await sb.rpc('pacto_tour_mark', { p_status: status === 'skipped' ? 'skipped' : 'completed', p_version: 1 });
        if (error) throw new PactoError('SERVER', 'Não foi possível salvar o tour.');
        return { done: true, at: data };
      },
      async recoveryCancel() { stopLocal(); try { await sb.auth.signOut({ scope: 'local' }); } catch {} return true; },
      async changePassword(token, { current, next, captchaToken }) {
        const probs = C.passwordProblems(next); if (probs.length) throw new PactoError('WEAK_PASSWORD', 'Senha fraca: ' + probs.join(', ') + '.');
        const s = await requireSession();
        const re = await sb.auth.signInWithPassword({ email: s.user.email, password: String(current || ''), options: cap(captchaToken) });
        if (re.error) throw new PactoError('BAD_CREDENTIALS', 'Senha atual incorreta.');
        try { await serverUnlock(null); } catch {} // a confirmação abre uma sessão nova: desbloqueia-a no servidor (autenticação recém-feita)
        const { error } = await sb.auth.updateUser({ password: next }); if (error) throw authErr(error);
        try { await sb.auth.signOut({ scope: 'others' }); } catch {}
        return true;
      },
      /* ---------- verificação em duas etapas (Supabase Auth MFA · TOTP) ---------- */
      onStepUp(fn) { stepUpHandler = fn; },
      /* item 3 · PX CORE (antigo Studio): studio.* pela pacto-api com o token da sessão. Devolve { status, body } (o Studio desenha
         a resposta; quem decide fundador/MFA/flag é o servidor). Sem repetição automática por MFA: o Studio pede o código na própria tela. */
      async studio(method, opts) {
        if (!/^studio\.[a-z][a-zA-Z._]*$/.test(String(method || ''))) return { status: 400, body: { error: { code: 'BAD_METHOD', message: 'Operação não permitida.' } } };
        try { return { status: 200, body: { result: await invoke(method, [opts || {}], { noStepUp: true }) } }; }
        catch (e) { return { status: (e && e.httpStatus) || 0, body: { error: { code: (e && e.code) || 'SERVER', message: (e && e.message) || 'Falha' } } }; }
      },
      /* item 5 · PX PRO / either.* : mesma porta da pacto-api. Lançam PactoError (404 quando a flag está desligada). */
      async ws(method, opts) { return invoke(method, [opts || {}]); },
      async px(method, opts) { return invoke(method, [opts || {}]); },
      async either(method, opts) { return invoke(method, [opts || {}]); },
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
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PACTOX ' + new Date().toISOString().slice(0, 10) });
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
      /* recuperação de MFA: códigos de uso único (o servidor guarda só o hash) */
      async mfaRecoveryStatus() { return invoke('mfaRecoveryStatus', []); },
      async mfaRecoveryGenerate() { return invoke('mfaRecoveryGenerate', []); },
      async mfaRecover(code) {
        const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (raw.length !== 16) throw new PactoError('VALIDATION', 'O código de recuperação tem 16 letras e números (ex.: ABCD-EFGH-JKMN-PQRS).');
        const r = await invoke('mfaRecoveryRedeem', [{ code: raw }]);
        await sb.auth.refreshSession().catch(() => {});
        return r;
      },
      /** Chamado ao voltar ao app (aba visível, foco, rede de volta): renova a sessão se estiver perto de vencer. */
      async resumeSession() { if (!LT) return false; try { const s1 = await recoverSession(120); if (!s1) return false; emit(); return true; } catch { return false; } },
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
    WRITE.forEach((m) => { api[m] = async (token, ...args) => {
      if (isLocked()) throw lockedErr();
      if (m !== 'runReminders') stamp(true);
      try { const r = await invoke(m, args); return r; } finally { dirty = true; }
    }; });

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      // supabase-js já renova sozinho (autoRefreshToken); aqui garantimos a renovação ao VOLTAR (celular que dormiu, aba em segundo plano)
      const onResume = () => { retryServerLock(); if (document.visibilityState === 'visible') { try { sb.auth.startAutoRefresh(); } catch {} api.resumeSession(); } };
      document.addEventListener('visibilitychange', onResume);
      window.addEventListener('pageshow', onResume);
      window.addEventListener('online', onResume);
    }
    // outra aba bloqueou/desbloqueou: acompanha na hora (evento storage)
    if (lockStore.watch) lockStore.watch(() => {
      const r = readLock(); if (!LT) return;
      if ((!r || r.bad || r.locked || r.uid !== lockUid) && !locked) { applyLock(false); lockListeners.forEach((fn) => { try { fn('locked'); } catch {} }); }
      else if (r && !r.bad && !r.locked && r.uid === lockUid && locked) { lockListeners.forEach((fn) => { try { fn('unlocked'); } catch {} }); }
    });
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') stopLocal();
      else if (session && session.access_token && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) rtAuth(session.access_token);
      authListeners.forEach((fn) => { try { fn(event, session); } catch {} });
    });
    return api;
  }
  return { createRemoteAPI, buildState, encodeArgs, WRITE, READ, refreshIsFatal };
});
