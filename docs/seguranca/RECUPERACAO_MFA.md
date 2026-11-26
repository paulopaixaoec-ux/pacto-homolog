# PACTO 8.2 · Recuperação segura da verificação em duas etapas (MFA)

**Situação:** implementado e testado ao vivo em `pacto-homolog-br` (função `pacto-api` v8, migração `20261125120700_pacto82_mfa_recovery`).
Há dois caminhos: **(A) códigos de recuperação**, feito pela própria pessoa, e **(B) remoção assistida pelo suporte**, para quem perdeu também os códigos.

---

## A. Códigos de recuperação (autoatendimento)

### Como a pessoa usa
1. **Perfil → Verificação em duas etapas → Gerar códigos de recuperação.**
   - O app pede o código do autenticador (step-up AAL2 de até 15 min).
   - Mostra **10 códigos** `XXXX-XXXX-XXXX-XXXX` **uma única vez**, com as opções *Copiar* e *Baixar .txt*.
   - Depois de *Já guardei*, só aparece a contagem ("10 válidos").
2. Gerar de novo **revoga todos os anteriores** (o app pede confirmação).
3. Perdeu o celular:
   1. Entre com e-mail e senha.
   2. Na hora de confirmar uma operação, toque em **"Perdi meu autenticador"**. O link também fica no Perfil e no diálogo "Confirme que é você".
   3. Digite um código.
   4. O app desvincula o autenticador e encerra as outras sessões da conta.
   5. Ative a verificação de novo com o aparelho novo.

### Como é protegido (servidor)
| Controle | Implementação |
|---|---|
| Nada em texto puro | Só `sha256(sal:usuário:código)` em `private.mfa_recovery_codes`, com sal aleatório por código. O código é mostrado uma vez e nunca mais pode ser lido. |
| Força do código | 16 caracteres de um alfabeto de 30 símbolos sem ambíguos (0/O, 1/I/L, U). São cerca de 78 bits, gerados com `crypto.getRandomValues`. |
| Vinculado à conta | O hash inclui o `user_id`. A comparação é feita só contra os códigos **ativos da própria conta**, em tempo constante. Um código de outra conta nunca confere. |
| Uso único | `used_at` é gravado uma vez (`WHERE used_at IS NULL`). Ao usar um código, **todos os outros são revogados**. Um trigger impede apagar códigos, alterar o hash e "desusar". |
| Limite de tentativas | **5 erros em 24 h** bloqueiam (`429 RATE_LIMIT`), **mesmo com o código certo**. O contador só zera quando a pessoa, já autenticada com TOTP, gera códigos novos. As tentativas vão para `private.mfa_recovery_attempts`, só de acréscimo. Valores em `private.app_config`: `mfa_recovery_max_fails`, `mfa_recovery_window_sec`, `mfa_recovery_count`. |
| Quem pode gerar | Só a dona da conta, com **fator TOTP ativo** e **AAL2 recente**. Sem fator, a resposta é `MFA_ENROLL_REQUIRED`; com sessão só por senha, `MFA_REQUIRED`. |
| Quem pode resgatar | Só a dona da conta, logada por senha. Exige uma **conta com fator ativo** (sem fator, a resposta é `409 NO_MFA`). |
| Atomicidade | O código é marcado e o fator é removido (Admin API) **na mesma transação**. Se a remoção falhar, nada é consumido. |
| Depois do resgate | As outras sessões são encerradas (`signOut(jwt,'others')`). Ficam registrados `security_events` (`MFA_RECOVERED` / `MFA_RECOVERY_CODES_NEW`, e `BAD_CODE` / `RATE_LIMIT` nas falhas), um **aviso no app** (tipo `security`) e um **e-mail na fila** (`security.mfa_changed`, status `pending_integration`). O e-mail sai quando o canal for ligado. |
| Sem acesso direto | As tabelas ficam em `private`, com RLS ligado e sem política. Não há nenhum GRANT para `anon`/`authenticated` (o PostgREST responde 404). |

### Testes
- **Servidor local** (`tests/recovery.test.mjs`, dentro de `run_local_tests.sh` 13/13):
  - formato e unicidade dos códigos; só hash gravado;
  - Carla não usa código do Bruno; código normalizado (minúsculas e espaços) funciona;
  - uso único e revogação; falha na remoção não consome o código;
  - 5 erros bloqueiam e gerar de novo zera o contador;
  - triggers bloqueiam DELETE e UPDATE indevidos.
- **Ataque ao vivo** (`live-tests/attack82.test.mjs`, área `MFA-REC`, **17/17**):

| Ataque | Resultado |
|---|---|
| gerar com sessão aal1 | 403 MFA_REQUIRED |
| Carla sem TOTP usa código do Bruno | 409 NO_MFA |
| Carla com TOTP usa código do Bruno | 400 BAD_CODE, ou 429 se o bloqueio de 24 h de uma rodada anterior ainda vale (observado na 2ª rodada: **o bloqueio persiste entre sessões**). Os códigos do Bruno continuam 10 |
| Ana usa código do Bruno | 400 BAD_CODE |
| anônimo | 401 |
| PostgREST lê a tabela de códigos | 404 |
| Carla usa o próprio código | ok, fator removido, os outros revogados |
| reusar código usado / usar código revogado | 400 BAD_CODE |
| 5 errados, depois o certo | 5× BAD_CODE, depois **429 RATE_LIMIT** (o TOTP continua) |
| injeção SQL no código | sem efeito |

  No fim, a Carla volta a ficar sem TOTP, como esperado pelo resto da bateria.
- **Navegador** (`pacto-tools/e2e_captcha82.py`): gerar códigos pede TOTP, mostra 10 códigos uma vez e depois só a contagem. O diálogo "Perdi meu autenticador" valida o formato.

---

## B. Remoção assistida (perdeu o celular **e** os códigos)

É uma operação **destrutiva**: remove o fator de outra pessoa. Só o administrador (Dexter) executa, no painel, seguindo este roteiro **sem pular etapas**.

1. **Pedido só pelo e-mail da conta.** Responda pedindo, no mesmo fio:
   1. nome completo;
   2. os **2 últimos acordos** (título e valor) e a contraparte de um deles;
   3. a data aproximada do cadastro.

   Nunca peça senha, código ou foto de documento por chat.
2. **Conferência:**
   1. Confira as respostas no banco (somente leitura): *SQL Editor* → `select doc->>'title' titulo, (doc->'versions'->-1->'terms'->>'totalCents')::bigint/100.0 valor from public.agreements where seller_id = '<id>' or buyer_id = '<id>' order by created_at desc limit 2;`.
   2. Se alguma resposta não bater, **recuse** e registre (passo 6, `MFA_ASSIST_DENIED`).
3. **Aviso prévio e espera de 72 h:**
   1. Mande para o e-mail da conta: "Recebemos um pedido para remover a verificação em duas etapas da sua conta. Se não foi você, responda **até <data+72h>** e troque sua senha."
   2. Registre o início com `MFA_ASSIST_REQUESTED` (passo 6).
4. **Cancelamento:** se a pessoa (ou alguém pela conta) contestar durante as 72 h, **cancele** e registre `MFA_ASSIST_DENIED`.
5. **Remoção** (depois das 72 h, sem contestação): *Authentication → Users* → abra a conta → seção **MFA factors** → **Delete** no fator. Em seguida, use **Sign out user** na mesma tela, para encerrar todas as sessões.
6. **Registro no log de segurança** (SQL Editor; um insert por etapa, sem dado sensível no `detail`):
   ```sql
   insert into private.security_events (user_id, ip, origin, method, code, status, detail)
   values ('<id da conta>', null, 'painel', 'admin.mfa', 'MFA_ASSIST_REMOVED', 200,
           'remoção assistida: identidade conferida por e-mail; espera 72h cumprida; pedido em <data>');
   ```
   Códigos: `MFA_ASSIST_REQUESTED`, `MFA_ASSIST_DENIED`, `MFA_ASSIST_REMOVED`.
7. **Notificação final** por e-mail: "A verificação em duas etapas foi removida. Ative de novo em Perfil e **gere novos códigos de recuperação**."
8. Os códigos antigos da conta já não servem sem fator (`NO_MFA`). Ao reativar e gerar códigos novos, os antigos são revogados.

> Por que 72 h: um invasor que tomou o e-mail da vítima não consegue tirar a proteção na hora. A dona da conta tem 3 dias para perceber o aviso e contestar.

## Limites conhecidos
- O **e-mail** de aviso ainda não sai sozinho: o canal de e-mail do PACTO não está ligado. Fica na fila `public.outbox` e o aviso **no app** é entregue. Até ligar o canal, o passo B depende do e-mail manual do suporte.
- Quem tem a **senha e um código** da vítima consegue remover o fator. Esse é o modelo esperado de códigos de recuperação. Os avisos e o encerramento das outras sessões ajudam a perceber.
- **Passkeys** ficam para depois da homologação (o step-up já aceita configurar `webauthn`).
