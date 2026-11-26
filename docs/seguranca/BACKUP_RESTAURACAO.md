# PACTO 8.2 · Backup e restauração no plano gratuito

**Por que existe:** a organização está no **plano gratuito** do Supabase, que não tem PITR nem backup restaurável pelo painel. Este procedimento gera um backup completo **fora do Supabase** e prova que ele restaura.

**Último backup:** `/workspace/pacto-backups/20261125-2308/` (25/11/2026 23:08, horário de Brasília). Pasta com permissão **700**, arquivos com **600**. **Nunca** vai para o repositório: contém hashes de senha (bcrypt), o `cron_secret` e dados (fictícios) de teste.

## O que tem no backup
| Pasta | Conteúdo |
|---|---|
| `data/` | **Todas as linhas** de `public` (9 tabelas) e `private` (6 tabelas, inclusive `app_config`, `security_events` e os hashes dos códigos de recuperação) em JSON, mais `auth.users` (colunas essenciais, com hash bcrypt), `auth.identities`, metadados de `storage.objects` e `storage.buckets`, e `counts.json` com as contagens ao vivo no momento da cópia |
| `schema/` | Migrações 8.2 na ordem (`2026112512*.sql`), o stub do ambiente Supabase para um Postgres comum e `90_platform_rls_auto_enable.sql` (gatilho `ensure_rls`, criado pela plataforma no projeto) |
| `storage/` | Os **21 objetos** do bucket `receipts`, nos caminhos `acordo/arquivo`, e `MANIFEST.json` com o sha256 de cada um, conferido contra `public.files.sha256` |
| `functions/pacto-api/` | Código-fonte da Edge Function **v8**: `index.ts`, `handler.js`, `core.js`, `api.js`, `stepup.js`, `recovery.js`, `deno.json`, `deno.lock` |
| `config/live_config.json` | Job do cron (`pacto-reminders`, `5 * * * *`), extensões e versões, migrações aplicadas, configuração do bucket (privado, 1,5 MB, PDF/PNG/JPEG/WebP), versão do Postgres (17) e da função (v8, `verify_jwt=false`) |
| `catalog/` | Retrato do catálogo ao vivo (impressões digitais md5 e lista completa: colunas, constraints, funções, ACLs, índices, políticas, gatilhos, RLS, grants, publicação Realtime) e as contagens que cada usuário enxerga pelo RLS |
| `restore_local.sh`, `make_load_sql.py`, `verify.py`, `backup_storage.mjs` | Restauração e conferência automáticas |

**Fica de fora, de propósito:**
- os **segredos TOTP** (`auth.mfa_factors`; guardamos só os metadados): depois de restaurar, quem usa MFA ativa de novo e gera códigos novos;
- os segredos da função, que o Supabase preenche sozinho (`SUPABASE_URL`, chaves, `SUPABASE_DB_URL`);
- as configurações do painel de Auth: refazer pela lista em `RELATORIO_SEGURANCA.md`, seção 6.

## Como o backup é feito (sem senha do banco)
Não usamos `pg_dump`, que exigiria a senha do banco. Os dados saem pelo MCP do Supabase (`execute_sql`, **somente leitura**):
1. As consultas de `backend/supabase-8.2/backup/export_queries/parte1..6.sql` devolvem cada tabela como JSON **comprimido** (`pgp_sym_encrypt` com zlib; a senha `transporte` é só embalagem para caber no limite de resposta, não protege nada) e em base64.
2. `catalogo.sql` faz o retrato do catálogo.
3. `decode_export.py <pasta> <respostas...>` abre tudo num Postgres local e grava `data/*.json` com permissão 600.
4. `backup_storage.mjs` baixa cada comprovante **pela própria função** (URL assinada de 60 s, entrando com as contas de teste que são parte de cada acordo) e confere o sha256.
5. Copie as migrações, o stub e `functions/pacto-api` para a pasta. Rode `chmod -R go-rwx /workspace/pacto-backups`.

Frequência sugerida durante a homologação: **diária**, e sempre antes de qualquer migração. Guarde as 7 últimas.

## Teste de restauração (feito em 25/11/2026, Postgres 17 **local e temporário**, nenhum projeto Supabase tocado)
```
cd /workspace/pacto-backups/20261125-2308 && ./restore_local.sh        # --keep deixa o banco de pé na porta 54360
```
Resultado: **RESTAURAÇÃO CONFERIDA**.
- **Linhas:** 16/16 tabelas idênticas ao ao vivo (`auth.users` 4, `agreements` 38, `events` 142, `files` 21, `notifications` 146, `outbox` 136, `profiles` 4, `whatsapp_templates` 6, `security_events` 450, `mfa_recovery_codes` 30, `mfa_recovery_attempts` 10, `app_config` 9, `rate_limits` 4, e as 3 vazias).
- **Catálogo:** 10/10 categorias idênticas (md5): colunas 112, constraints 61, funções 18, ACL de funções 18, índices 37, **políticas RLS 8**, gatilhos 9, RLS ligado 15/15, grants 8, publicação Realtime 4.
- **RLS em ação:** contagem do que **cada um dos 4 usuários** enxerga como `authenticated` em 8 tabelas: idêntica ao ao vivo.
- **Arquivos:** 21/21 com sha256 igual ao registrado no banco.
- Também conferido: o decodificador reproduz os mesmos JSON a partir das respostas originais.

## Restaurar de verdade num projeto Supabase novo (só se o atual se perder)
> Não foi executado: criar projeto e escrever dados é decisão sua. Não use `nex-dev` nem o `pacto-homolog` antigo.
1. Crie um projeto novo no plano gratuito, região São Paulo, numa organização **só do PACTO**.
2. Em *SQL Editor*, rode as migrações de `schema/2026112512*.sql` **na ordem**. O `00_local_stub.sql` serve **só** para Postgres local; num projeto Supabase não rode.
3. Restaure os usuários (`auth.users` e `auth.identities` do backup, mesmos `id`) antes dos dados. O `make_load_sql.py` gera os `insert` (rode com `session_replication_role = replica` para não disparar os gatilhos de imutabilidade).
4. Carregue `public` e `private` com o mesmo script. Depois **troque** o `cron_secret` em `private.app_config` e o `functions_url` para o novo projeto.
5. Recrie o bucket `receipts` (privado, 1,5 MB, PDF/PNG/JPEG/WebP) e envie os arquivos de `storage/` **com os mesmos caminhos**.
6. Publique `functions/pacto-api` (`verify_jwt=false`, import map `deno.json`) e refaça os ajustes do painel (CAPTCHA, JWT 600 s, limites).
7. Aponte o site para o novo projeto: `build_homolog.sh` com a URL e a chave anon novas.
8. **Conferência:**
   1. rode `verify.py` adaptado (contagens e impressões digitais);
   2. no app, use *Perfil → Verificar integridade do log*;
   3. as pessoas com MFA ativam de novo e geram **códigos de recuperação novos**.

## Limites
- É uma cópia **lógica** com ponto no tempo do momento da exportação (cerca de 2 min entre a primeira e a última parte). Não é PITR.
- Para dinheiro real: **plano Pro + PITR** continua sendo a recomendação.
