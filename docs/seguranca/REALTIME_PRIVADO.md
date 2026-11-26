# Realtime privado (preparação para desligar "Allow public access")

**O que mudou (8.2):**
- `js/remote.js`: o canal de sincronização é privado (`sb.channel('pacto-<uid>', { config: { private: true } })`) e o Realtime recebe o token da sessão com `realtime.setAuth()` ao assinar, ao iniciar sessão e a cada renovação do JWT (600 s).
- Migração `20261126010000_pacto82_realtime_private.sql` (aditiva): política `pacto_rt_receive_own_topic` em `realtime.messages`, só `SELECT`, só para `authenticated`, só no tópico `pacto-<auth.uid()>`. **Não existe política de INSERT**: nenhum cliente envia broadcast/presença (o app não usa).
- Os eventos de tabela (`postgres_changes`) continuam protegidos pelo RLS das próprias tabelas.

**Passo no painel (Dexter):** Supabase Dashboard → projeto `pacto-homolog-br` → Realtime → Settings → desligar **Allow public access** → Save.
**Desfazer:** mesmo caminho, ligar de novo. O app continua funcionando (canal privado também funciona com o público ligado) e há o polling de 20 s como reserva.
