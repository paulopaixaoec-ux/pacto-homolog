/* PACTOX · item 5 · registro de áreas do Empresas / PX PRO (reaproveitado do protótipo, só configuração) (configuração, não lógica).
   Cada área só descreve rótulos, campos extras do cliente, ferramentas, ações rápidas, widgets e modelos.
   Todas as ferramentas apontam para UM dos módulos comuns (campo `modulo`): agenda, clientes, orcamentos,
   acordos, cobrancas, acompanhamento, historico, rede, relatorios. Nenhuma área tem motor próprio de acordo,
   parcela ou comprovante — isso continua no motor central (core.js / pacto-api). */
(function (root) {
  'use strict';
  const MOD = {
    agenda: 'Agenda', clientes: 'Clientes', orcamentos: 'Orçamentos', acordos: 'Acordos', cobrancas: 'Cobranças',
    acompanhamento: 'Acompanhamento', historico: 'Histórico', rede: 'Minha Rede', relatorios: 'Relatórios',
  };
  const AREAS = [
    {
      id: 'beleza', nome: 'Beleza e estética', curto: 'Beleza', icone: 'scissors', hue: 158,
      exemplo: 'Salão, barbearia, manicure, estética, maquiagem, design de sobrancelhas',
      termos: { cliente: 'Cliente', clientes: 'Clientes', servico: 'Atendimento', compromisso: 'Horário', agenda: 'Horários' },
      camposCliente: [
        { k: 'pref', label: 'Preferências', ex: 'Café sem açúcar; prefere manhãs' },
        { k: 'tipo', label: 'Tipo de cabelo / pele', ex: 'Cacheado 3B · pele mista' },
        { k: 'sens', label: 'Sensibilidades informadas pelo cliente', ex: 'Relata alergia a amônia', sensivel: true },
        { k: 'ultimo', label: 'Último procedimento', ex: 'Hidratação + corte, 08/11' },
      ],
      ferramentas: [
        { nome: 'Agenda de horários', icone: 'calendar', modulo: 'agenda', desc: 'Encaixes, duração por serviço e confirmação' },
        { nome: 'Pacotes de sessões', icone: 'layers', modulo: 'acordos', desc: 'Pacote vira acordo com parcelas' },
        { nome: 'Lembrete de retorno', icone: 'repeat', modulo: 'acompanhamento', desc: 'Avisa quando é hora de voltar' },
        { nome: 'Antes e depois', icone: 'camera', modulo: 'historico', desc: 'Fotos só com consentimento do cliente' },
      ],
      acoes: [['Novo horário', 'plus', 'agenda'], ['Vender pacote', 'layers', 'orcamento'], ['Lembrar retorno', 'bell', 'cobrancas']],
      widgets: [['Horários hoje', 'hoje'], ['Retornos a lembrar', 'acomp'], ['A receber no mês', 'receber']],
      tiposCompromisso: ['Corte', 'Coloração', 'Manicure', 'Sobrancelha'],
      modelo: { titulo: 'Pacote 4 sessões · hidratação profunda', itens: [['4 sessões de hidratação', 48000], ['Kit de manutenção em casa', 9000]], parcelas: 3, sinal: 0 },
      etapas: ['Sessão 1', 'Sessão 2', 'Sessão 3', 'Sessão 4'],
    },
    {
      id: 'saude', nome: 'Saúde, esporte e bem-estar', curto: 'Saúde e bem-estar', icone: 'dumbbell', hue: 150,
      exemplo: 'Personal, nutrição, fisioterapia, psicologia, yoga, pilates, massoterapia',
      termos: { cliente: 'Aluno ou paciente', clientes: 'Alunos e pacientes', servico: 'Sessão', compromisso: 'Sessão', agenda: 'Sessões' },
      camposCliente: [
        { k: 'obj', label: 'Objetivo', ex: 'Condicionamento para corrida de 10 km' },
        { k: 'freq', label: 'Frequência combinada', ex: '3x por semana · seg, qua, sex' },
        { k: 'rest', label: 'Restrições informadas pelo cliente', ex: 'Evitar impacto no joelho esquerdo', sensivel: true },
        { k: 'plano', label: 'Plano', ex: 'Mensal recorrente' },
      ],
      ferramentas: [
        { nome: 'Sessões recorrentes', icone: 'repeat', modulo: 'agenda', desc: 'Mesmo horário toda semana, com remarcação' },
        { nome: 'Plano mensal', icone: 'doc', modulo: 'acordos', desc: 'Mensalidade = acordo com parcelas mensais' },
        { nome: 'Presença', icone: 'check', modulo: 'acompanhamento', desc: 'Faltas e reposições no histórico' },
        { nome: 'Evolução', icone: 'trend', modulo: 'historico', desc: 'Marcos combinados, sem prontuário clínico' },
      ],
      acoes: [['Nova sessão', 'plus', 'agenda'], ['Criar plano mensal', 'doc', 'orcamento'], ['Registrar presença', 'check', 'cliente']],
      widgets: [['Sessões hoje', 'hoje'], ['Presença da semana', 'acomp'], ['Mensalidades a vencer', 'receber']],
      tiposCompromisso: ['Treino', 'Avaliação', 'Reposição', 'Online'],
      modelo: { titulo: 'Plano trimestral · 3x por semana', itens: [['Treinos personalizados (3 meses)', 135000], ['Avaliação física inicial', 15000]], parcelas: 3, sinal: 0 },
      etapas: ['Avaliação', 'Mês 1', 'Mês 2', 'Mês 3 e reavaliação'],
    },
    {
      id: 'servicos', nome: 'Serviços gerais, manutenção e reformas', curto: 'Serviços e reformas', icone: 'briefcase', hue: 165,
      exemplo: 'Eletricista, encanador, pintor, pedreiro, marceneiro, técnico, diarista',
      termos: { cliente: 'Cliente', clientes: 'Clientes', servico: 'Serviço', compromisso: 'Visita', agenda: 'Visitas e obras' },
      camposCliente: [
        { k: 'end', label: 'Endereço do serviço', ex: 'Rua das Acácias, 120 · apto 32 (exemplo)' },
        { k: 'tipo', label: 'Tipo de serviço', ex: 'Reforma de banheiro' },
        { k: 'mat', label: 'Materiais', ex: 'Cliente compra o revestimento' },
        { k: 'gar', label: 'Garantia combinada', ex: '90 dias de mão de obra' },
      ],
      ferramentas: [
        { nome: 'Orçamento com itens', icone: 'list', modulo: 'orcamentos', desc: 'Mão de obra e material separados' },
        { nome: 'Visita técnica', icone: 'calendar', modulo: 'agenda', desc: 'Com endereço e fotos do local' },
        { nome: 'Etapas da obra', icone: 'layers', modulo: 'acompanhamento', desc: 'Sinal, medições e entrega' },
        { nome: 'Garantia', icone: 'shield', modulo: 'historico', desc: 'Prazo registrado no acordo' },
      ],
      acoes: [['Novo orçamento', 'list', 'orcamento'], ['Agendar visita', 'calendar', 'agenda'], ['Atualizar etapa', 'layers', 'cliente']],
      widgets: [['Visitas hoje', 'hoje'], ['Obras em andamento', 'acomp'], ['A receber no mês', 'receber']],
      tiposCompromisso: ['Visita técnica', 'Execução', 'Entrega', 'Garantia'],
      modelo: { titulo: 'Reforma do banheiro social', itens: [['Mão de obra (demolição, contrapiso, assentamento)', 420000], ['Material hidráulico', 86000], ['Rejunte e acabamento', 24000]], parcelas: 3, sinal: 159000 },
      etapas: ['Sinal', 'Demolição', 'Hidráulica', 'Revestimento', 'Entrega'],
    },
    {
      id: 'imoveis', nome: 'Imóveis', curto: 'Imóveis', icone: 'building', hue: 170,
      exemplo: 'Corretor autônomo, imobiliária, administração de aluguel, avaliação',
      termos: { cliente: 'Cliente', clientes: 'Proprietários e interessados', servico: 'Atendimento', compromisso: 'Visita', agenda: 'Visitas' },
      camposCliente: [
        { k: 'perfil', label: 'Perfil', ex: 'Interessado · compra' },
        { k: 'faixa', label: 'Faixa de valor', ex: 'R$ 450 mil a R$ 600 mil' },
        { k: 'imovel', label: 'Imóvel de interesse', ex: 'Apto 2 dorm. · Bairro Jardim (exemplo)' },
        { k: 'docs', label: 'Documentos pendentes', ex: 'Comprovante de renda' },
      ],
      ferramentas: [
        { nome: 'Visitas agendadas', icone: 'calendar', modulo: 'agenda', desc: 'Roteiro do dia com proprietário avisado' },
        { nome: 'Carteira privada', icone: 'building', modulo: 'clientes', desc: 'Imóveis que você atende, sem anúncio público' },
        { nome: 'Proposta e sinal', icone: 'handshake', modulo: 'orcamentos', desc: 'Proposta aceita vira acordo' },
        { nome: 'Comissões', icone: 'percent', modulo: 'cobrancas', desc: 'Parcelas da comissão acompanhadas' },
      ],
      acoes: [['Agendar visita', 'calendar', 'agenda'], ['Registrar proposta', 'handshake', 'orcamento'], ['Cobrar comissão', 'percent', 'cobrancas']],
      widgets: [['Visitas hoje', 'hoje'], ['Propostas em negociação', 'acomp'], ['Comissões a receber', 'receber']],
      tiposCompromisso: ['Visita', 'Captação', 'Vistoria', 'Assinatura'],
      modelo: { titulo: 'Comissão de intermediação · venda apto (exemplo)', itens: [['Comissão de corretagem (6%)', 3120000]], parcelas: 2, sinal: 0 },
      etapas: ['Proposta', 'Documentação', 'Assinatura', 'Repasse'],
    },
    {
      id: 'vendas', nome: 'Vendas', curto: 'Vendas', icone: 'store', hue: 140,
      exemplo: 'Revenda, catálogo, artesanato, confeitaria, roupas, loja pequena',
      termos: { cliente: 'Cliente', clientes: 'Clientes', servico: 'Pedido', compromisso: 'Entrega', agenda: 'Entregas' },
      camposCliente: [
        { k: 'int', label: 'Produtos de interesse', ex: 'Kits de presente, tamanho M' },
        { k: 'pag', label: 'Forma de pagamento preferida', ex: 'Pix em 3 vezes' },
        { k: 'ent', label: 'Entrega', ex: 'Retira no ponto combinado' },
        { k: 'comp', label: 'Última compra', ex: 'Kit café da manhã · 14/11' },
      ],
      ferramentas: [
        { nome: 'Catálogo privado', icone: 'tag', modulo: 'orcamentos', desc: 'Itens reutilizáveis nos pedidos' },
        { nome: 'Pedidos', icone: 'box', modulo: 'orcamentos', desc: 'Pedido confirmado vira acordo' },
        { nome: 'Venda parcelada', icone: 'wallet', modulo: 'acordos', desc: 'Crediário com aceite e comprovantes' },
        { nome: 'Entregas', icone: 'outbox', modulo: 'agenda', desc: 'Dia, horário e status da entrega' },
      ],
      acoes: [['Novo pedido', 'box', 'orcamento'], ['Agendar entrega', 'outbox', 'agenda'], ['Ver parcelas', 'wallet', 'cobrancas']],
      widgets: [['Entregas hoje', 'hoje'], ['Pedidos em preparo', 'acomp'], ['Parcelas a receber', 'receber']],
      tiposCompromisso: ['Entrega', 'Retirada', 'Prova', 'Encomenda'],
      modelo: { titulo: 'Pedido · 12 kits de presente corporativo', itens: [['12 kits café da manhã', 180000], ['Embalagem personalizada', 24000], ['Entrega', 6000]], parcelas: 3, sinal: 70000 },
      etapas: ['Pedido', 'Produção', 'Embalagem', 'Entrega'],
    },
    {
      id: 'educacao', nome: 'Educação', curto: 'Educação', icone: 'book', hue: 145,
      exemplo: 'Aulas particulares, idiomas, música, reforço, cursos livres',
      termos: { cliente: 'Aluno', clientes: 'Alunos e responsáveis', servico: 'Aula', compromisso: 'Aula', agenda: 'Aulas' },
      camposCliente: [
        { k: 'nivel', label: 'Nível ou série', ex: '9º ano · inglês intermediário' },
        { k: 'mat', label: 'Matéria', ex: 'Matemática' },
        { k: 'resp', label: 'Responsável financeiro', ex: 'Mãe é a parte do acordo (aluno menor)' },
        { k: 'meta', label: 'Objetivo', ex: 'Prova de recuperação em dezembro' },
      ],
      ferramentas: [
        { nome: 'Aulas recorrentes', icone: 'repeat', modulo: 'agenda', desc: 'Grade semanal com reposição' },
        { nome: 'Pacote de aulas', icone: 'layers', modulo: 'acordos', desc: 'Pacote ou mensalidade com parcelas' },
        { nome: 'Presença e reposição', icone: 'check', modulo: 'acompanhamento', desc: 'Saldo de aulas sempre visível' },
        { nome: 'Material e tarefas', icone: 'doc', modulo: 'historico', desc: 'Anotações por aula' },
      ],
      acoes: [['Nova aula', 'plus', 'agenda'], ['Vender pacote', 'layers', 'orcamento'], ['Marcar presença', 'check', 'cliente']],
      widgets: [['Aulas hoje', 'hoje'], ['Pacotes terminando', 'acomp'], ['Mensalidades a receber', 'receber']],
      tiposCompromisso: ['Aula', 'Reposição', 'Simulado', 'Online'],
      modelo: { titulo: 'Pacote 8 aulas de matemática', itens: [['8 aulas de 60 min', 72000], ['Material de apoio', 6000]], parcelas: 2, sinal: 0 },
      etapas: ['Aulas 1–2', 'Aulas 3–4', 'Aulas 5–6', 'Aulas 7–8'],
    },
    {
      id: 'outros', nome: 'Outros', curto: 'Outros', icone: 'grid', hue: 160,
      exemplo: 'Fotografia, eventos, consultoria, design, motorista, pet, tecnologia…',
      termos: { cliente: 'Cliente', clientes: 'Clientes', servico: 'Serviço', compromisso: 'Compromisso', agenda: 'Agenda' },
      camposCliente: [
        { k: 'c1', label: 'Campo livre 1 (você dá o nome)', ex: 'Ex.: tipo de evento — Casamento' },
        { k: 'c2', label: 'Campo livre 2', ex: 'Ex.: local — Sítio Boa Vista (exemplo)' },
        { k: 'c3', label: 'Campo livre 3', ex: 'Ex.: entregáveis — 300 fotos editadas' },
      ],
      ferramentas: [
        { nome: 'Agenda', icone: 'calendar', modulo: 'agenda', desc: 'Compromissos com cliente' },
        { nome: 'Orçamentos', icone: 'list', modulo: 'orcamentos', desc: 'Itens livres, vira acordo' },
        { nome: 'Etapas', icone: 'layers', modulo: 'acompanhamento', desc: 'Você define as etapas' },
        { nome: 'Histórico', icone: 'clock', modulo: 'historico', desc: 'Tudo o que foi combinado' },
      ],
      acoes: [['Novo orçamento', 'list', 'orcamento'], ['Novo compromisso', 'plus', 'agenda'], ['Ver cobranças', 'wallet', 'cobrancas']],
      widgets: [['Compromissos hoje', 'hoje'], ['Serviços em andamento', 'acomp'], ['A receber no mês', 'receber']],
      tiposCompromisso: ['Reunião', 'Execução', 'Entrega', 'Revisão'],
      modelo: { titulo: 'Cobertura fotográfica · aniversário 15 anos', itens: [['Cobertura de 5 horas', 260000], ['Álbum 30×30', 90000]], parcelas: 3, sinal: 100000 },
      etapas: ['Briefing', 'Evento', 'Edição', 'Entrega'],
    },
  ];
  const BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));
  root.PXCAT = { AREAS, BY_ID, MOD };
})(self);
