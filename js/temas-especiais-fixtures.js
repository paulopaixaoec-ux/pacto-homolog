/* PX AURA · catálogo do calendário do Brasil (pacote BR: sugestões de ocasião) e cenas de teste do protótipo (sceneState, usadas só pelos testes).
   O catálogo só SUGERE; nada daqui é publicado sem a aprovação do fundador (aprovação por versão, validada no servidor e no banco). */
(function (root) {
  'use strict';
  const Eng = root.SpecialThemes || (typeof require === 'function' ? require('./temas-especiais-engine.js') : null);
  const Theme = root.PactoStudioTheme || (typeof require === 'function' ? require('./studio-theme-lib.js') : null);

  /* item 6: o destaque dos temas do catálogo NÃO é mais o lima do protótipo; usa os tons do Jade (stops do Dexter) como base neutra; cada tema sugere só as suas cores próprias */
  const base = (m) => ({ ...Theme.tokensOf('original', m), '--brand-lime': m === 'light' ? '#ABC1B7' : '#899B93' });

  const natalLight = {
    ...base('light'),
    '--paper': '#fbf7f0',
    '--offwhite': '#f6f0e6',
    '--brand-petrol': '#1a5c52',
    '--brand-mint': '#6eae9a',
    palette: 'personalizada',
  };
  const natalDark = {
    ...base('dark'),
    '--paper': '#0c1f1c',
    '--offwhite': '#081614',
    '--brand-petrol': '#1a5c52',
    '--brand-mint': '#4f8f7c',
    palette: 'personalizada',
  };
  const natalDeco = [
    { asset: 'glow-corner', placement: 'corner-tr', motion: 'none' },
    { asset: 'garland-thin', placement: 'margin-top', motion: 'none' },
    { asset: 'flake-discreet', placement: 'background-wash', motion: 'gentle' },
  ];
  const natalMsgs = {
    pessoal: 'Boas festas. O combinado tem valor.',
    empresas: 'Boas festas. Também entre empresas, o combinado tem valor.',
    invite: 'Boas festas. Um convite para combinar com quem importa.',
    site: 'Boas festas. O combinado tem valor.',
  };

  function catalog() {
    return [
      {
        id: 'cat-natal',
        slug: 'natal',
        category: 'culturais_sazonais',
        name: 'Natal',
        description: 'Proposta discreta para o calendário do Brasil, com paleta um pouco mais quente e decorações só nos cantos. Não trata o Natal como data universal.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['cultural', 'seasonal'],
        culturalNote: 'Data com sentido cultural e sazonal no Brasil; o tom permanece neutro e a ativação é sempre manual.',
        audiences: ['pais'],
        occasionId: 'natal',
        windowStart: '2026-11-15T00:00:00-03:00',
        windowEnd: '2026-12-28T23:59:59-03:00',
        tokens: natalLight,
        tokensDark: natalDark,
        decorations: natalDeco,
        messages: natalMsgs,
        prompt: 'O Natal está se aproximando. Deseja visualizar uma proposta de tema especial?',
      },
      {
        id: 'cat-ano-novo',
        slug: 'ano-novo',
        category: 'culturais_sazonais',
        name: 'Ano Novo',
        description: 'Camada sóbria de virada no calendário do Brasil, com reflexo um pouco mais intenso e uma mensagem opcional.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['seasonal'],
        culturalNote: 'Virada civil no fuso America/Sao_Paulo. Não é apresentada como data universal.',
        audiences: ['pais'],
        occasionId: 'ano-novo',
        windowStart: '2026-12-10T00:00:00-03:00',
        windowEnd: '2027-01-07T23:59:59-03:00',
        tokens: { ...base('light'), palette: 'personalizada' },
        tokensDark: { ...base('dark'), palette: 'personalizada' },
        decorations: [{ asset: 'spark-soft', placement: 'corner-tr', motion: 'gentle' }],
        messages: { pessoal: 'Bom ano. Que os combinados sejam cumpridos.', empresas: 'Bom ano. Que os combinados, também no trabalho, sejam cumpridos.', site: 'Bom ano. O combinado tem valor.' },
        prompt: 'A virada do ano está próxima. Deseja visualizar uma proposta de tema especial?',
      },
      {
        id: 'cat-independencia-br',
        slug: 'sete-de-setembro',
        category: 'nacionais',
        name: '7 de Setembro (Brasil)',
        description: 'Sugestão nacional do calendário do Brasil. Não é apresentada como data universal.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['national-civic'],
        culturalNote: 'Data cívica nacional brasileira.',
        audiences: ['pais'],
        occasionId: 'br-7-setembro',
        windowStart: '2026-08-20T00:00:00-03:00',
        windowEnd: '2026-09-08T23:59:59-03:00',
        tokens: { ...base('light'), palette: 'original' },
        tokensDark: { ...base('dark'), palette: 'original' },
        decorations: [{ asset: 'ribbon-corner', placement: 'corner-tl', motion: 'none' }],
        messages: {},
        prompt: 'O 7 de Setembro está próximo no calendário do Brasil. Deseja visualizar uma proposta?',
      },
      {
        id: 'cat-maes-br',
        slug: 'dia-das-maes-br',
        category: 'nacionais',
        name: 'Dia das Mães (Brasil)',
        description: 'No calendário do Brasil, o Dia das Mães é no segundo domingo de maio. Não é tratado como data única no mundo.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['cultural'],
        culturalNote: 'A data varia de país para país; neste pacote vale só o calendário brasileiro.',
        audiences: ['pais'],
        occasionId: 'br-dia-maes',
        windowStart: '2026-04-26T00:00:00-03:00',
        windowEnd: '2026-05-11T23:59:59-03:00',
        tokens: { ...Theme.tokensOf('jade', 'light'), palette: 'jade' },
        tokensDark: { ...Theme.tokensOf('jade', 'dark'), palette: 'jade' },
        decorations: [{ asset: 'glow-corner', placement: 'corner-tr', motion: 'none' }],
        messages: { pessoal: 'Uma data para combinar com quem cuida.' },
        prompt: 'O Dia das Mães no Brasil está se aproximando. Deseja visualizar uma proposta?',
      },
      {
        id: 'cat-pais-br',
        slug: 'dia-dos-pais-br',
        category: 'nacionais',
        name: 'Dia dos Pais (Brasil)',
        description: 'No calendário do Brasil, o Dia dos Pais é no segundo domingo de agosto.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['cultural'],
        culturalNote: 'A data varia de país para país; neste pacote vale só o calendário brasileiro.',
        audiences: ['pais'],
        occasionId: 'br-dia-pais',
        windowStart: '2026-07-26T00:00:00-03:00',
        windowEnd: '2026-08-10T23:59:59-03:00',
        tokens: { ...base('light'), palette: 'original' },
        tokensDark: { ...base('dark'), palette: 'original' },
        decorations: [{ asset: 'glow-corner', placement: 'corner-tr', motion: 'none' }],
        messages: { pessoal: 'Uma data para combinar com quem importa.' },
        prompt: 'O Dia dos Pais no Brasil está se aproximando. Deseja visualizar uma proposta?',
      },
      {
        id: 'cat-aniversario-pactox',
        slug: 'aniversario-pactox',
        category: 'marcos_pactox',
        name: 'Aniversário do PACTOX',
        description: 'Marco oficial da marca PACTOX: em 27/11/2026 foi registrado o domínio pactox.com.br. Esta data é o aniversário da marca, não a criação do projeto original PACTO.',
        country: 'BR',
        countries: ['BR'],
        regions: [],
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        coverage: 'national',
        sensitivity: ['brand'],
        culturalNote: 'Evento próprio da marca, independente de calendários de outros países.',
        audiences: ['pais'],
        occasionId: 'pactox-aniversario',
        officialDate: '2026-11-27',
        windowStart: '2026-11-20T00:00:00-03:00',
        windowEnd: '2026-12-04T23:59:59-03:00',
        tokens: { ...base('light'), palette: 'personalizada' },
        tokensDark: { ...base('dark'), palette: 'personalizada' },
        decorations: [{ asset: 'spark-soft', placement: 'corner-tr', motion: 'gentle' }],
        messages: { pessoal: '27 de novembro. O combinado tem valor — desde o primeiro dia da marca.', empresas: '27 de novembro. A marca PACTOX: o combinado tem valor.', site: 'Aniversário da marca PACTOX. O combinado tem valor.', invite: 'A marca PACTOX completa um marco. O combinado tem valor.' },
        prompt: 'O aniversário da marca PACTOX (27/11/2026) está no calendário. Deseja visualizar uma proposta de tema especial?',
      },
    ];
  }

  function justif() { return 'Aprovo a proposta visual do Natal para o período comemorativo, com camada temporária.'; }

  function seedCatalog(state) {
    state.catalog = catalog();
    return state;
  }

  function openNatal(state) {
    seedCatalog(state);
    Eng.suggestFromCatalog(state, 'cat-natal');
    return state;
  }

  function draftFromCatalog(state, catalogId) {
    const cat = state.catalog.find((c) => c.id === catalogId);
    return Eng.createDraft(state, {
      name: cat.name,
      category: cat.category,
      source: 'catalog',
      catalogId: cat.id,
      tokens: cat.tokens,
      tokensDark: cat.tokensDark,
      decorations: cat.decorations,
      messages: cat.messages,
      scopes: ['app_pessoal', 'app_empresas', 'site_publico', 'convites'],
      country: cat.country || 'BR',
      countries: ['BR'],
      regions: cat.regions || [],
      locale: cat.locale || 'pt-BR',
      timeZone: cat.timeZone || 'America/Sao_Paulo',
      coverage: cat.coverage || 'national',
      sensitivity: cat.sensitivity || [],
      culturalNote: cat.culturalNote || '',
      audiences: cat.audiences,
      proposedStartAt: cat.id === 'cat-natal' ? '2026-11-27T00:00:00-03:00' : (cat.id === 'cat-aniversario-pactox' ? '2026-11-27T00:00:00-03:00' : (cat.windowStart || null)),
      proposedEndAt: cat.id === 'cat-natal' ? '2026-12-28T23:59:59-03:00' : (cat.id === 'cat-aniversario-pactox' ? '2026-12-04T23:59:59-03:00' : (cat.windowEnd || null)),
    });
  }

  function draftReadyFromCatalog(state, catalogId) {
    const r = draftFromCatalog(state, catalogId);
    if (!r.ok) return r;
    Eng.acceptAllSuggestedMessages(state, r.draft.id);
    return r;
  }

  /* Monta o estado de cada tela do protótipo a partir de um relógio fixo (27/11/2026, Brasília). */
  function sceneState(name) {
    const state = Eng.emptyState('2026-11-27T17:13:00-03:00', true);
    seedCatalog(state);
    const natal = () => draftReadyFromCatalog(state, 'cat-natal').draft;

    switch (name) {
      case 'overview':
        Eng.suggestFromCatalog(state, 'cat-natal');
        break;
      case 'suggestion':
        Eng.suggestFromCatalog(state, 'cat-natal');
        break;
      case 'editor':
      case 'protected-zones':
      case 'scopes':
      case 'approval': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        natal();
        break;
      }
      case 'reject': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        Eng.rejectDraft(state, d.id, 'Prefiro esperar o ano que vem e revisar o tom da mensagem.');
        break;
      }
      case 'schedule': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        const a = Eng.approveDraft(state, d.id, justif());
        state._pub = a.publication;
        break;
      }
      case 'active':
      case 'after-app':
      case 'after-invite':
      case 'after-site': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        const a = Eng.approveDraft(state, d.id, justif());
        Eng.schedulePublication(state, a.publication.id, { startAt: '2026-11-27T00:00:00-03:00', endAt: '2026-12-28T23:59:59-03:00', justification: justif() });
        Eng.tryActivate(state, a.publication.id);
        state._pub = a.publication;
        break;
      }
      case 'before-app':
      case 'before-invite':
      case 'before-site':
        Eng.suggestFromCatalog(state, 'cat-natal');
        natal();
        break;
      case 'campaign':
        Eng.suggestFromCatalog(state, 'cat-natal');
        break;
      case 'audit': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        const a = Eng.approveDraft(state, d.id, justif());
        Eng.schedulePublication(state, a.publication.id, { startAt: '2026-11-27T00:00:00-03:00', endAt: '2026-12-28T23:59:59-03:00', justification: justif() });
        Eng.tryActivate(state, a.publication.id);
        state._pub = a.publication;
        break;
      }
      case 'dismiss-options':
        Eng.suggestFromCatalog(state, 'cat-natal');
        break;
      case 'message-approval': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        draftFromCatalog(state, 'cat-natal');
        break;
      }
      case 'manual-no-end': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        Eng.updateDraft(state, d.id, { proposedEndAt: null, manualNoEndException: true });
        const a = Eng.approveDraft(state, d.id, justif());
        Eng.tryActivate(state, a.publication.id);
        state._pub = a.publication;
        break;
      }
      case 'conflict-resolution': {
        Eng.suggestFromCatalog(state, 'cat-natal');
        const d = natal();
        const a = Eng.approveDraft(state, d.id, justif());
        Eng.schedulePublication(state, a.publication.id);
        const c = Eng.createDraft(state, {
          name: 'Virada [TESTE]',
          category: 'culturais_sazonais',
          source: 'custom',
          tokens: base('light'),
          tokensDark: base('dark'),
          decorations: [{ asset: 'spark-soft', placement: 'corner-tr', motion: 'gentle' }],
          messages: { pessoal: 'A virada chega. O combinado segue com valor.' },
          scopes: ['app_pessoal'],
          country: 'BR', countries: ['BR'], locale: 'pt-BR', timeZone: 'America/Sao_Paulo',
          coverage: 'national', audiences: ['pais'],
          proposedStartAt: '2026-12-10T00:00:00-03:00',
          proposedEndAt: '2026-12-24T23:59:59-03:00',
        });
        Eng.acceptAllSuggestedMessages(state, c.draft.id);
        const a2 = Eng.approveDraft(state, c.draft.id, 'Aprovo a segunda campanha só para apresentar o conflito de período.');
        state._pub = a.publication;
        state._conflictPub = a2.publication;
        state._conflict = Eng.schedulePublication(state, a2.publication.id);
        break;
      }
      case 'anniversary-pactox': {
        Eng.suggestFromCatalog(state, 'cat-aniversario-pactox');
        draftReadyFromCatalog(state, 'cat-aniversario-pactox');
        break;
      }
      default:
        Eng.suggestFromCatalog(state, 'cat-natal');
    }
    return state;
  }

  const api = { catalog, natalLight, natalDark, natalDeco, natalMsgs, seedCatalog, openNatal, draftFromCatalog, draftReadyFromCatalog, sceneState, justif, pack: 'BR' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpecialThemesFixtures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
