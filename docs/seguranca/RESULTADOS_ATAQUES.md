# PACTO 8.2 · Evidências dos testes de ataque (versão sanitizada)

Ambiente: Supabase `pacto-homolog-br` (São Paulo) · Edge Function `pacto-api` v8 · contas **fictícias** (Ana, Bruno, Carla + anônimo) · 25/11/2026, horário de Brasília.
Sem senhas, tokens, e-mails, ids de usuário, ids de objetos ou códigos: tudo foi trocado por «marcadores». Dados brutos e credenciais ficam só no ambiente privado de testes.

## Resumo: **125/125** verificações de ataque corretas · **8/8** de sessão/JWT

| Área | Verificações | Corretas |
|---|---|---|
| JWT | 8 | 8 |
| Sessão | 2 | 2 |
| CORS | 3 | 3 |
| IDOR | 11 | 11 |
| Mass assignment | 2 | 2 |
| Valores | 20 | 20 |
| Upload | 9 | 9 |
| Replay | 4 | 4 |
| MFA | 6 | 6 |
| Realtime | 2 | 2 |
| Storage | 13 | 13 |
| RPC | 7 | 7 |
| PostgREST | 13 | 13 |
| Função | 8 | 8 |
| MFA-REC | 17 | 17 |
| Sessão/JWT | 8 | 8 |

## JWT

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| função · payload trocado (sub=Ana, aal2 forjado) | 401 | 401 UNAUTHENTICATED | ✅ |
| PostgREST · payload trocado (sub=Ana, aal2 forjado) | 401 | 401 | ✅ |
| função · alg=none | 401 | 401 UNAUTHENTICATED | ✅ |
| PostgREST · alg=none | 401 | 401 | ✅ |
| função · exp alterado | 401 | 401 TOKEN_EXPIRED | ✅ |
| PostgREST · exp alterado | 401 | 401 | ✅ |
| função · lixo | 401 | 401 UNAUTHENTICATED | ✅ |
| PostgREST · lixo | 401 | 401 | ✅ |

## Sessão

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| token revogado na função | 401 | 401 UNAUTHENTICATED | ✅ |
| token revogado no PostgREST até expirar (limite conhecido) | 401 ou só dados da própria Carla | 200 linhas=10 | ✅ |

## CORS

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| preflight de https://evil.example | Allow-Origin ≠ evil | https://paulopaixaoec-ux.github.io | ✅ |
| preflight do GitHub Pages | Allow-Origin = github.io | https://paulopaixaoec-ux.github.io | ✅ |
| POST sem token de outra origem | 401 | 401 | ✅ |

## IDOR

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| Carla → propose no acordo de Ana/Bruno | 403/404 | 400 VALIDATION | ✅ |
| Carla → respond no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → reportPayment no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → reviewPayment no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → addNote no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → muteAgreement no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → proposeDelay no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → proposeEarly no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → getFile no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla → auditLog no acordo de Ana/Bruno | 403/404 | 404 NOT_FOUND | ✅ |
| Carla marca como lida notificação da Ana | sem efeito | read=false | ✅ |

## Mass assignment

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| createAgreement com sellerId/status/schedule/id forjados | vendedor=Ana, proposto, id próprio | true proposed true | ✅ |
| updateProfile com id/email/emailVerified forjados | e-mail e id intactos; canais externos desligados | true true email=false | ✅ |

## Valores

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| createAgreement total negativo | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement total zero | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement total fracionado | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement total gigante | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement total texto | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement parcelas 0 | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement parcelas 10000 | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement juros negativo | VALIDATION | 400 VALIDATION | ✅ |
| createAgreement juros 1000% | VALIDATION | 400 VALIDATION | ✅ |
| reportPayment valor negativo | VALIDATION | 400 VALIDATION | ✅ |
| reportPayment valor fracionado | VALIDATION | 400 VALIDATION | ✅ |
| reportPayment acima do saldo | VALIDATION | 400 VALIDATION | ✅ |
| reportPayment overflow | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 0% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 71% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 0.5% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto -10% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 100% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 50% | VALIDATION | 400 VALIDATION | ✅ |
| proposeEarly desconto 1e+300% | VALIDATION | 400 VALIDATION | ✅ |

## Upload

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| SVG com script | recusado | 400 VALIDATION | ✅ |
| HTML como PDF | recusado | 400 VALIDATION | ✅ |
| PDF poliglota com <script> | recusado | 400 VALIDATION | ✅ |
| PNG verdadeiro declarado PDF | recusado | 400 VALIDATION | ✅ |
| extensão .exe com conteúdo PDF | recusado | 400 VALIDATION | ✅ |
| extensão .html com conteúdo PDF | recusado | 400 VALIDATION | ✅ |
| acima de 1,5 MB | recusado | 400 VALIDATION | ✅ |
| nome "../../../etc/passwd.pdf" | bloqueado (WAF do Supabase) ou nome saneado | 403 sem código PACTO | ✅ |
| nome com ../ e \ (path traversal) | nome saneado; caminho = acordo/arquivo | a_._._recibo.pdf / agr_«id»/file_«id» | ✅ |

## Replay

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| primeira aprovação (com TOTP) | ok | ok | ✅ |
| mesma aprovação de novo | IMMUTABLE/CONFLICT | IMMUTABLE | ✅ |
| reaceitar versão já aceita | CONFLICT | CONFLICT | ✅ |
| valor pago da parcela 1 | = valor da parcela (sem dobrar) | 30000 | ✅ |

## MFA

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| aceite com sessão aal1 (fator cadastrado) | 403 MFA_REQUIRED | 403 MFA_REQUIRED | ✅ |
| variação "ACCEPT" para fugir da regra | 403 MFA_REQUIRED | 403 MFA_REQUIRED | ✅ |
| Carla (sem fator) aceita a própria proposta | 403 MFA_ENROLL_REQUIRED | 403 MFA_ENROLL_REQUIRED | ✅ |
| código TOTP errado | BAD_CODE | BAD_CODE | ✅ |
| termos após tentativas | inalterados (90000) | 90000 | ✅ |
| recusar não exige MFA | 200 | 200 | ✅ |

## Realtime

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| Carla escutando agreements/events/notifications | 0 eventos | 0 | ✅ |
| Bruno (parte) escutando agreements | ≥1 evento | 1 | ✅ |

## Storage

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| bruno baixa pelo caminho | erro | erro | ✅ |
| bruno gera link assinado próprio (1 h) | erro | erro | ✅ |
| bruno lista a pasta do acordo | vazio/erro | n=0 | ✅ |
| bruno sobrescreve comprovante | erro | erro | ✅ |
| bruno apaga comprovante | nada apagado | n=0 | ✅ |
| carla baixa pelo caminho | erro | erro | ✅ |
| carla gera link assinado próprio (1 h) | erro | erro | ✅ |
| carla lista a pasta do acordo | vazio/erro | n=0 | ✅ |
| carla sobrescreve comprovante | erro | erro | ✅ |
| carla apaga comprovante | nada apagado | n=0 | ✅ |
| arquivo continua íntegro após ataques (SHA-256) | íntegro | true | ✅ |
| URL pública do bucket | ≥400 | 400 | ✅ |
| Carla cria bucket público | erro | erro | ✅ |

## RPC

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| Carla chama is_party | ≥400 | 404 | ✅ |
| Carla chama purge_security_events | ≥400 | 404 | ✅ |
| Carla chama call_reminders | ≥400 | 404 | ✅ |
| Carla chama rls_auto_enable | ≥400 | 404 | ✅ |
| Carla chama sync_profile | ≥400 | 404 | ✅ |
| Carla chama version_ok | ≥400 | 404 | ✅ |
| anônimo chama my_contacts | ≥400 | 401 | ✅ |

## PostgREST

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| Carla lê private.security_events | ≥400 | 406 | ✅ |
| Carla lê private.app_config | ≥400 | 406 | ✅ |
| Carla lê private.rate_limits | ≥400 | 406 | ✅ |
| anônimo lê agreements | 401/0 linhas | 401  | ✅ |
| anônimo lê events | 401/0 linhas | 401  | ✅ |
| anônimo lê files | 401/0 linhas | 401  | ✅ |
| anônimo lê notifications | 401/0 linhas | 401  | ✅ |
| anônimo lê outbox | 401/0 linhas | 401  | ✅ |
| anônimo lê consolidations | 401/0 linhas | 401  | ✅ |
| anônimo lê profiles | 401/0 linhas | 401  | ✅ |
| Ana apaga o próprio acordo | 403 | 403 | ✅ |
| Ana edita o histórico | 403 | 403 | ✅ |
| Bruno apaga registro do comprovante | 403 | 403 | ✅ |

## Função

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| método __proto__ | 400 | 400 BAD_METHOD | ✅ |
| método constructor | 400 | 400 BAD_METHOD | ✅ |
| método resetAll | 400 | 400 BAD_METHOD | ✅ |
| método _storeFile | 400 | 400 BAD_METHOD | ✅ |
| método cron.reminders | 400 | 400 BAD_METHOD | ✅ |
| método deleteReport | 400 | 400 BAD_METHOD | ✅ |
| corpo > 3 MB | recusado (413 na função ou 503 no gateway do Supabase) | 503 | ✅ |
| cron com segredo falso | 401 | 401 | ✅ |

## MFA-REC

| Ataque | Esperado | Obtido | OK |
|---|---|---|---|
| Bruno gera códigos (após TOTP) | 10 códigos «código» | 10 true | ✅ |
| gerar códigos só com senha (aal1) | 403 MFA_REQUIRED | 403 MFA_REQUIRED | ✅ |
| Carla (sem TOTP) usa código do Bruno | 409 NO_MFA | 409 NO_MFA | ✅ |
| Carla (com TOTP) usa código do Bruno | 400 BAD_CODE (ou 429 se o bloqueio de uma rodada anterior ainda vale) | 429 RATE_LIMIT | ✅ |
| códigos do Bruno intactos após ataque | 10 ativos | 10 | ✅ |
| Ana usa código do Bruno | 400 BAD_CODE | 400 BAD_CODE | ✅ |
| anônimo usa código | 401 | 401 | ✅ |
| PostgREST lê tabela de códigos | negado | 404 | ✅ |
| Carla usa o próprio código (normalizado) | ok, TOTP removido | true fatores=0 | ✅ |
| demais códigos revogados após uso | 0 ativos | 0 | ✅ |
| reutilizar código já usado | 400 BAD_CODE | 400 BAD_CODE | ✅ |
| usar código revogado | 400 BAD_CODE | 400 BAD_CODE | ✅ |
| 5 códigos errados | 5× 400 BAD_CODE | 400 BAD_CODE / 400 BAD_CODE / 400 BAD_CODE / 400 BAD_CODE / 400 BAD_CODE | ✅ |
| código certo após 5 erros | 429 RATE_LIMIT | 429 RATE_LIMIT | ✅ |
| bloqueio não removeu o TOTP | 1 fator | 1 | ✅ |
| injeção no código | 400/429 sem efeito | 429 RATE_LIMIT | ✅ |
| Carla volta ao estado inicial (sem TOTP) | 0 fatores | 0 | ✅ |

## Sessão / JWT (`session82.test.mjs`)

| Verificação | Obtido | OK |
|---|---|---|
| validade do JWT atual (s) | 3600 | ✅ |
| token vencido → renovado antes da chamada | ok=true novo=true exp>agora=true | ✅ |
| sem 401 desnecessário | 200 | ✅ |
| função com token vencido | 401 TOKEN_EXPIRED | ✅ |
| função com token de assinatura inválida | 401 UNAUTHENTICATED | ✅ |
| app: 401 → renovar → repetir 1x | 401,200 | ✅ |
| refresh inválido → UNAUTHENTICATED sem laço | UNAUTHENTICATED chamadas=401 | ✅ |
| resumeSession renovou | ok=true novo=true | ✅ |

## Outras baterias (mesma data)

| Bateria | Resultado |
|---|---|
| Regras do app (`node --test tests/*.test.js`) | 48/48 |
| Servidor em Postgres temporário (`run_local_tests.sh`) | 13/13 |
| E2E ao vivo pela API (`live82.test.mjs`) | 3/3 |
| E2E ao vivo no navegador (`e2e_live82.py`) | ok (criar → Realtime → aceite com MFA → ativo) |
| CAPTCHA + telas de recuperação no navegador (`e2e_captcha82.py`) | 9/9 |
| Regressão do modo local (`e2e_ui.py`, `e2e_81.py`, `smoke81.py`) | ok, sem erros de página |
| Backup → restauração local | 16/16 tabelas · 10/10 categorias de catálogo · RLS por usuário idêntico · 21/21 arquivos |
