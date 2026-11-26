# PACTO 8.2 · Relatório de revisão de segurança

**Data:** 25/11/2026 (horário de Brasília) · **Ambiente:** Supabase `pacto-homolog-br` (`mionyoxbeaxdjzuoohmd`, São Paulo) · **Função:** `pacto-api` v8 (atualizado no endurecimento pré-homologação: CAPTCHA, JWT curto com renovação, recuperação de MFA, backup restaurável)
**Conclusão curta:** a homologação está **apta para testes externos com dados fictícios**. O PACTO **ainda não está liberado para uso financeiro real**: faltam os itens da seção 7 (plano pago com backup/PITR, ajustes do painel e pendências abaixo).

Regras seguidas: só o projeto `pacto-homolog-br` foi alterado. Nex Benefits (`nex-dev`) e o antigo `pacto-homolog` foram apenas **lidos** (status). Nada foi apagado e nada foi publicado.

---

## 1. O que foi testado de verdade (e o resultado)

| Bateria | Onde | Resultado |
|---|---|---|
| Regras do app (motor compartilhado cliente/servidor) | `node --test tests/*.test.js` | **48/48** (45 anteriores + 3 novos de segurança) |
| Servidor (Postgres temporário + migrações + 3 contas) | `backend/supabase-8.2/run_local_tests.sh` | **13/13** (12 anteriores + 1 de códigos de recuperação com 8 cenários) |
| E2E ao vivo pela API (Ana, Bruno, Carla) | `live-tests/live82.test.mjs` | **3/3**, com MFA real (TOTP) nos aceites e aprovações |
| **Ataques ao vivo** (Ana, Bruno, Carla + anônimo) | `live-tests/attack82.test.mjs` | **14/14 testes · 125/125 verificações** (108 anteriores + 17 de recuperação de MFA; detalhe em `live-tests/attack-results.json`) |
| **Sessão / JWT** ao vivo (token vencido, recusado, refresh inválido, volta ao app) | `live-tests/session82.test.mjs` | **3/3 testes · 8/8 verificações** |
| **CAPTCHA + telas de recuperação** no navegador (chaves de teste da Cloudflare) | `pacto-tools/e2e_captcha82.py` | **9/9** |
| **Backup → restauração local** | `/workspace/pacto-backups/<data>/restore_local.sh` | **16/16 tabelas, 10/10 categorias do catálogo, RLS por usuário idêntico, 21/21 arquivos** |
| E2E no navegador ao vivo (desktop + celular) | `pacto-tools/e2e_live82.py` | **ok**: criar → Realtime → aceite **com pedido de MFA** → ativo; cartão de MFA no Perfil |
| Regressão do modo local (8.0/8.1) | `e2e_ui.py`, `e2e_81.py`, `smoke81.py` | **ok**, sem erros de página |

### Ataques executados (125 verificações, todas recusadas/corretas)

| Área | O que tentamos | Resultado |
|---|---|---|
| JWT (8) | token adulterado, `alg=none`, sem assinatura, `exp` alterado, lixo, de outro projeto | 401 na função e no PostgREST |
| Sessão (2) | reutilizar token depois de "sair de todos os aparelhos" | função: **401**. PostgREST: ainda lê **só os dados da própria pessoa** até o token expirar (limite do Supabase, ver R1) |
| CORS (3) | origem estranha, preflight, sem token | sem `Allow-Origin` para origens fora da lista, 401 sem token |
| IDOR (11) | Carla age em acordo, arquivo, notificação, comprovante de outras pessoas; ids forjados | negado (FORBIDDEN/NOT_FOUND), nada vaza |
| Mass assignment (2) | `sellerId`, `status`, `schedule`, `id`, `emailVerified` extras | ignorados: dono, estado, cronograma e e-mail não mudam |
| Valores (20) | negativo, zero, fração, texto, NaN, Infinity, **1e16**, acima do teto, desconto 0/71/0,5/−10/100/"50"/1e300 % | **recusados (VALIDATION)** depois da correção V1 |
| Uploads (9) | SVG com script, HTML como PDF, PDF poliglota com `<script>`, PNG declarado PDF, `.exe`, `.pdf.html`, > 1,5 MB, `../../../etc/passwd.pdf`, `a/../..\recibo.pdf` | recusados; o caminho com `../` é barrado pelo WAF do Supabase (403) e, na variação que passa, o nome é saneado (`a_._._recibo.pdf`) e gravado em `acordo/arquivo` |
| Replay de escrita (4) | aceitar/aprovar duas vezes | segundo envio recusado; efeito único |
| MFA (6) | aceite com sessão aal1, variação `"ACCEPT"`, conta sem fator, código errado | MFA_REQUIRED / MFA_ENROLL_REQUIRED / BAD_CODE; termos inalterados; recusar continua sem MFA |
| Realtime (2) | Carla assina `agreements`, `events`, `notifications` | **0 eventos** para Carla; Bruno (parte) recebe |
| Storage (13) | ler, listar, assinar URL, enviar, apagar, sobrescrever direto no bucket; URL pública | tudo negado; integridade (SHA-256) intacta |
| PostgREST/RPC (20) | escrever/apagar em todas as tabelas, chamar funções internas, ler tabelas `private`, anônimo | negado; anônimo não lê nada |
| Recuperação de MFA (17) | Carla/Ana usam código do Bruno, anônimo, gerar com aal1, reuso, código revogado, 5 erros + código certo, injeção, PostgREST na tabela | NO_MFA / BAD_CODE / 401 / MFA_REQUIRED / **429 depois de 5 erros**; códigos do Bruno intactos; fator só sai com código válido da própria conta |
| Função (8) | métodos fora da lista, `__proto__`, `constructor`, `_storeFile`, `deleteReport`, cron forjado, corpo > 3 MB | 400 BAD_METHOD / 401; corpo gigante recusado (ver R6) |

### Revisão estática do banco (consulta somente leitura)
- RLS ligado em **todas** as tabelas de `public` e `private`. Políticas só de **leitura** (`SELECT` para `authenticated`) e sempre limitadas às partes do acordo.
- **Nenhuma** permissão de INSERT/UPDATE/DELETE/TRUNCATE para `anon`/`authenticated`: toda escrita passa pela função `pacto-api`.
- Funções SECURITY DEFINER: **todas** com `search_path` fixo. `anon` não executa nenhuma. `authenticated` executa só `is_party`, `is_cons_party` (usadas pelo RLS) e `my_contacts` (intencional: devolve apenas contrapartes com acordo, e o e-mail só se a pessoa permitiu).
- Sem views no esquema público.
- Bucket `receipts` **privado**, limite de 1,5 MB, só PDF/PNG/JPEG/WebP, **sem nenhuma política** em `storage.objects`: só a função lê e grava, e entrega URL assinada de **60 s**.
- Realtime publica só `agreements`, `consolidations`, `events` e `notifications`, todas com RLS (comprovado no ataque acima).

---

## 2. Vulnerabilidades encontradas

| # | Severidade | Problema | Situação |
|---|---|---|---|
| V1 | **Alta** | Valores sem teto: `createAgreement` aceitava 1e16 centavos (fora do inteiro seguro do JavaScript, com risco de arredondamento/overflow) | **Corrigido e retestado**: inteiros seguros e teto de **R$ 100 milhões por valor**, em todos os campos de dinheiro (total, entrada, extras, pagamento, taxa, recorrência) |
| V2 | Média | Funções internas (`private`) executáveis por `anon`/`authenticated` pelos privilégios padrão | **Corrigido** (migração `20261125120600`) e retestado (RPC negado) |
| V3 | Média | Faltava confirmação forte nas operações financeiras: uma sessão roubada aceitava acordos | **Corrigido**: MFA TOTP com step-up AAL2 exigido **no servidor** (seção 3) |
| V4 | Média | Método `__proto__` causava erro 500 (exceção interna; abre caminho para ruído/DoS) | **Corrigido**: lista de métodos checada antes de tudo, e `Object.hasOwn` na regra de step-up. Agora 400 |
| V5 | Média | Uploads: SVG/HTML e PDF poliglota com script, extensão divergente do conteúdo, nome com caminho | **Corrigido**: assinatura (magic bytes) + extensão coerente + rejeição de conteúdo ativo + nome saneado |
| V6 | Média | Pagamento marcado como pago sem comprovante aprovado (achado na fase anterior) | **Corrigido antes** (trigger `pacto_guard_payments`) e retestado |
| R1 | Média (restante) | Token revogado continua aceito pelo **PostgREST** até expirar (padrão 1 h), só para **leitura dos próprios dados** | **Cliente pronto:** renovação automática, renovação ao voltar ao app e `401 → renovar → repetir 1×` (testado ao vivo). Falta só o painel: **600 s** (seção 6, passo 4). A função já recusa token revogado ou vencido (`TOKEN_EXPIRED`) |
| R2 | Média (restante) | Sem bloqueio **por conta** no servidor (o Supabase limita por IP; o app só atrasa tentativas no navegador) | **CAPTCHA implementado** (Turnstile/hCaptcha em login, cadastro, recuperação e reenvio de senha, desbloqueio e troca de senha; liga só com a chave de site). Os códigos de recuperação têm limite **por conta** (5/24 h). Falta: chave + segredo e limites no painel (seção 6) |
| R3 | Média (restante) | Proteção contra senhas vazadas desligada (aviso do advisor; recurso de plano pago) | Ligar ao migrar para o plano Pro |
| R4 | Baixa | Canais Realtime *broadcast/presence* aceitam qualquer usuário logado (o PACTO não usa; dados vão só por `postgres_changes` com RLS) | Ligar "somente canais privados" no painel |
| R5 | Baixa | Quem não é parte recebe `MFA_*` em vez de `FORBIDDEN` numa operação sensível | Sem vazamento (nada é lido nem alterado); manter |
| R6 | Baixa | Corpo > 3 MB: o gateway do Supabase responde 503 só depois de ~160 s (a requisição nem chega ao código) | Limite da plataforma; a função também corta acima de 3 MB |

---

## 3. Autenticação

**Senha e sessão.** Senhas com bcrypt no Supabase Auth, e-mail confirmado obrigatório para movimentar acordos, renovação segura do token e bloqueio de tela por inatividade. A função confere a assinatura do JWT com o Auth (`getUser`) e exige `sub` igual ao usuário. Nova regra no app: mínimo de 10 caracteres com letras e números. No servidor ela entra pelo painel (seção 6).

**MFA (TOTP) com step-up AAL2.** O controle fica no **servidor**:
- Exigem código do app autenticador com no máximo **15 min**: aceitar proposta, renegociação, unificação, antecipação/desconto e adiamento, e aprovar comprovante.
- Recusar, contrapropor e pedir correção **não** exigem.
- Sem fator cadastrado, a resposta é `MFA_ENROLL_REQUIRED` e o app leva ao **Perfil → Verificação em duas etapas** (QR code, chave, ativar e desativar).
- Com fator mas sessão aal1, a resposta é `MFA_REQUIRED`. O app abre "Confirme que é você" e refaz o pedido uma única vez.
- Pronto para **passkeys**: os métodos aceitos e a janela vêm de `private.app_config` (`stepup_methods=totp`, `stepup_window_sec=900`). Para valer passkey depois, basta acrescentar `webauthn`.

**Roteiro de teste do MFA**
1. Entre com uma conta de teste → Perfil → *Verificação em duas etapas* → *Ativar* → leia o QR no Google Authenticator/Authy → digite o código.
2. Em outro aparelho, com a outra conta, envie uma proposta. Ao aceitar, o app pede o código. Sem o código, nada muda.
3. Com uma conta sem MFA, tente aceitar: o app avisa e leva ao Perfil.
4. Automático: `live-tests/enroll_mfa.mjs` cadastra o fator (segredo em `/workspace/pacto-secrets/mfa-secrets.json`, permissão 600, **fora** do repositório) e `totp.mjs` gera o código (RFC 6238) usado por `live82` e `attack82`.
5. Perdeu o autenticador: **códigos de recuperação** (10, uso único, guardados só como hash, 5 tentativas/24 h) ou **remoção assistida** com verificação de identidade, espera de 72 h, aviso e registro. Detalhes e testes em `RECUPERACAO_MFA.md`.

**CAPTCHA.** Cloudflare Turnstile (ou hCaptcha) no login, cadastro, recuperação de senha, reenvio de confirmação, desbloqueio de tela e troca de senha. O `captchaToken` vai ao Supabase Auth. **Só a chave pública de site** entra no build (`PACTO_CAPTCHA_SITE_KEY`); o `configure.mjs` recusa algo que pareça segredo. Sem a chave, nada muda, e a CSP só libera `challenges.cloudflare.com` quando o CAPTCHA está ligado. Testado no navegador com as chaves de teste: o widget carrega sob CSP + Trusted Types, o token é enviado e, com a chave que sempre reprova, o login nem é enviado.

**JWT curto e renovação.** O `supabase-js` renova sozinho (`autoRefreshToken`). O app renova ao voltar (aba visível, `pageshow`, rede de volta) e antes de cada chamada se faltam < 30 s. Se a função responder `401 TOKEN_EXPIRED`/`UNAUTHENTICATED`, o app renova e **repete uma vez**; se o refresh falhar, pede login sem entrar em laço. Testado ao vivo (`session82`).

---

## 4. Aceite bilateral, logs e comprovantes (reverificado)
- Uma versão só fica ativa com o aceite da outra parte. O trigger confere autor ≠ quem aceita e o hash dos termos, mesmo para o usuário `postgres`. Retestado no replay e no MFA.
- Versões, eventos (cadeia SHA-256), comprovantes e arquivos são **imutáveis**: os triggers `pacto_guard_*` e `pacto_files_immutable` barram UPDATE/DELETE. Ninguém tem permissão de escrita direta, e não há política de DELETE no storage. Retestado: apagar/sobrescrever arquivo, evento e comprovante foi negado.
- Uma parcela só vira "paga" com comprovante **aprovado** pela outra parte. Vencimento só muda por adiamento aceito.

## 5. Logs de segurança e recuperação
- `private.security_events` registra toda recusa relevante: usuário, IP, origem, método, código, status, sem dados sensíveis. Sem acesso para usuários. Agora são **357 eventos** (VALIDATION 151, UNAUTHENTICATED 51, NOT_FOUND 50, MFA_REQUIRED 33, BAD_METHOD 28, MFA_ENROLL_REQUIRED 16, FORBIDDEN 16, TOO_LARGE 6, IMMUTABLE 6).
- Retenção: `private.purge_security_events(dias)`, padrão 180 e mínimo 90. **Não foi agendada**, porque apaga registros: precisa da sua confirmação.
- **Backup/PITR:** a organização "Nex" está no **plano gratuito**. Nele **não há PITR nem backups diários restauráveis pelo painel**, e o projeto pausa depois de 7 dias sem uso. Para dinheiro real: plano **Pro** + add-on **PITR**.
- **Backup restaurável no plano gratuito: feito e testado.** Ver `BACKUP_RESTAURACAO.md`: dados, catálogo, comprovantes, função e configuração, restaurados num Postgres local com contagens, políticas RLS e arquivos idênticos.
- **Runbook antigo** (mantido como referência):
  1. `pg_dump` periódico do banco (`supabase db dump`) e cópia do bucket `receipts` guardados fora do Supabase.
  2. Para restaurar: crie um projeto novo, aplique `backend/supabase-8.2/migrations/*` na ordem e importe o dump de dados.
  3. Copie os objetos do bucket mantendo os caminhos `acordo/arquivo`.
  4. Reimplante `pacto-api` e recrie os segredos da função no painel.
  5. Confira a integridade: *Perfil → Verificar integridade do log* e SHA-256 dos arquivos.
  6. Aponte o app (`config.js`) para o novo projeto.

  Com PITR: *Database → Backups → Point in time* → escolha o horário.

## 6. Ajustes no painel (passo a passo, só você pode fazer · um passo por linha)
**Ordem importa:** o CAPTCHA só pode ser ligado no Supabase **depois** que o site publicado já tiver a chave de site. Senão, ninguém entra.

**A. Cloudflare Turnstile**
1. Em dash.cloudflare.com → **Turnstile** → **Add widget**.
2. *Widget name*: `PACTO homolog`.
3. *Hostname*: `paulopaixaoec-ux.github.io`. Acrescente `localhost` só se quiser testar localmente.
4. *Widget mode*: **Managed**. *Pre-clearance*: **No**.
5. **Create**. Copie a **Site Key** (`0x4…`, pública) e guarde a **Secret Key** só no gerenciador de senhas.
6. Gere o site com a chave pública: `PACTO_ANON=<anon> PACTO_CAPTCHA_PROVIDER=turnstile PACTO_CAPTCHA_SITE_KEY=0x4… bash tools/build_homolog.sh`. Também pode me mandar **só a Site Key**, que é pública.
7. Publique o site e confira que o login abre normalmente.

**B. Supabase (`pacto-homolog-br`)**

8. **Authentication → Attack Protection** → **Enable CAPTCHA protection**: ligar.
9. *Choose CAPTCHA provider*: **Turnstile by Cloudflare**.
10. *CAPTCHA secret*: cole a **Secret Key** → **Save**.
11. **Authentication → Sessions → Access Tokens** → *Access token expiry time*: **600** → **Save**.
12. **Authentication → Rate Limits** → *Rate limit for sign ups and sign ins*: **20** (por 5 min, por IP).
13. Mesma tela → *Rate limit for token verifications*: **15** (por 5 min, por IP).
14. Mesma tela → *Rate limit for token refreshes*: **150** (manter; com JWT de 600 s cada aparelho renova cerca de 6 vezes por hora).
15. Mesma tela → *Rate limit for anonymous users*: manter (login anônimo está desligado) → **Save**.
16. *Rate limit for sending emails*: fica em **2/h** com o SMTP padrão (só muda com SMTP próprio, passo 22).
17. **Authentication → Sign In / Providers → Email** → *Minimum password length*: **10**.
18. Mesma tela → *Password requirements*: **Letters and digits** → **Save**.
19. **Authentication → Multi-Factor** → *TOTP*: manter **Enabled**.
20. **Realtime → Settings** → desligar *Allow public access* (só canais privados) → **Save**.
21. **Authentication → URL Configuration** → *Site URL*: `https://paulopaixaoec-ux.github.io/pacto-homolog/`. *Redirect URLs*: só esse endereço → **Save**.
22. **Authentication → Emails → SMTP Settings** → SMTP próprio, **antes de convidar os 3 testadores**: com o padrão, 2 e-mails por hora podem atrasar as confirmações de cadastro.
23. Se aparecer **Authentication → Emails → Security notifications**: ligue *Password changed* e *MFA factor enrolled/removed*.

**C. Antes de rodar as baterias automáticas com o CAPTCHA ligado**

24. As baterias ao vivo (`live82`, `attack82`, `session82`) entram por senha sem navegador, então o CAPTCHA as recusa. Para rodar: desligue o passo 8, rode, e **ligue de novo** em seguida.

## 7. O que falta antes de uso financeiro real
1. Plano Pro + PITR. O backup lógico restaurável já existe e foi testado (`BACKUP_RESTAURACAO.md`), mas não substitui o PITR para dinheiro real.
2. Passos 1–23 da seção 6 aplicados e conferidos.
3. Organização separada para o PACTO. Hoje divide a organização "Nex" com o Nex Benefits: bancos, usuários, storage e chaves **já são separados**, mas membros e cobrança são comuns.
4. ~~Recuperação de MFA~~ **feita** (`RECUPERACAO_MFA.md`). Passkeys/Face ID depois da homologação. Ligar o canal de **e-mail**, para que os avisos de segurança da fila `outbox` saiam de verdade.
5. Política de retenção dos logs aprovada e agendada.
6. Limpeza dos dados de teste. **Impacto:** 34 acordos fictícios, 18 arquivos no bucket, 124 eventos e 357 eventos de segurança, todos de teste. **Não executada**: precisa da sua confirmação.
7. Revisão jurídica (LGPD: termos, privacidade, base legal para guardar comprovantes) e um pentest externo.

## 8. Isolamento do Nex Benefits
- `nex-dev` (`hltkyjmosdmnrobfygxs`): **INACTIVE (pausado)**, us-east-1. Só li o status. **Não restaurei nem despausei**, então tabelas e migrações não puderam ser listadas (exigem o projeto ativo).
- `pacto-homolog` antigo (`ymycqtsgfmdsagzbxwlb`): ativo, só leitura de status, nada alterado.
- O PACTO não usa nada desses projetos: URL, chave, banco, usuários e bucket são só do `pacto-homolog-br`.

## 9. Segredos (varredura)
- `/workspace/pacto-site-homolog` (o que vai para o GitHub) e o código do cliente: **nenhuma** `service_role`, `sb_secret_`, JWT com papel diferente de `anon`, senha de conta de teste ou segredo TOTP. Único JWT presente: a chave **anon** pública.
- A senha da demonstração local **saiu do build público**: lá ela é sorteada a cada carregamento. No modo Supabase a demonstração local nem aparece.
- Credenciais de teste ficam só em `/workspace/pacto-secrets/` (permissão 600), fora do app e do site.

## 10. Advisors do Supabase (depois das correções)
- **Segurança:**
  - *RLS sem política* em `private.app_config`, `private.delivery_log`, `private.rate_limits`, `private.security_events`, `private.mfa_recovery_codes`, `private.mfa_recovery_attempts` e `public.whatsapp_templates`: intencional, negar tudo.
  - `my_contacts` SECURITY DEFINER executável: intencional e filtrado por `auth.uid()`.
  - *Senhas vazadas desligada*: R3.
- **Desempenho:** só índices ainda não usados, por causa do volume baixo de teste. Manter.

## 11. Arquivos alterados nesta revisão
- `js/core.js`: teto e inteiros seguros nos valores; uploads mais rígidos.
- `js/remote.js`: MFA e step-up.
- `js/app.js`: diálogo "Confirme que é você" e cartão de MFA no Perfil.
- `backend/supabase-8.2/functions/pacto-api/index.ts`:
  - lista de métodos antes de tudo
  - step-up
  - leitura de corpo com limite
  - `security_events`
- `stepup.js`
- `migrations/20261125120600_pacto82_security_hardening.sql`
- `tests/security82.test.js`, `tests/stepup.test.mjs`
- `live-tests/attack82.test.mjs`, `live82.test.mjs`
- `tools/build_homolog.sh`: remove a senha demo, refaz os `.b64` e não leva `READY.txt`.
- **Endurecimento pré-homologação:**
  - `js/remote.js`: `captchaToken`, renovação ao voltar ao app, `401 → renovar → repetir`, métodos de recuperação.
  - `js/app.js`: CAPTCHA nos formulários; telas de códigos e "Perdi meu autenticador".
  - `js/ui.js`: ícone `copy`.
  - `tools/configure.mjs` e `tools/build_homolog.sh`: chave de site, CSP condicional, `<script>` estático.
  - `functions/pacto-api/index.ts` e o novo `recovery.js`: `TOKEN_EXPIRED` e recuperação.
  - `migrations/20261125120700_pacto82_mfa_recovery.sql`.
  - `tests/recovery.test.mjs`, `live-tests/session82.test.mjs`, `live-tests/attack82.test.mjs` (+17).
  - `backend/supabase-8.2/backup/*`, `pacto-tools/e2e_captcha82.py`.
  - `RECUPERACAO_MFA.md`, `BACKUP_RESTAURACAO.md`.
