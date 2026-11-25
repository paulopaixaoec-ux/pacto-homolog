/* PACTO 8.0/8.1 · dados de demonstração FICTÍCIOS. Executado só quando o banco local está vazio. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.PactoSeed = factory(root.PactoCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const DEMO_PASSWORD = 'Dm' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('') + '7';
  const DEMO = [
    { email: 'marina@demo.pacto', name: 'Marina Lopes' },
    { email: 'rafael@demo.pacto', name: 'Rafael Costa' },
    { email: 'julia@demo.pacto', name: 'Júlia Ramos' },
  ];
  /** Gera um PDF válido e mínimo com o texto informado (comprovante fictício). */
  function fakePdf(text) {
    const safe = String(text).replace(/[()\\]/g, '');
    const stream = `BT /F1 14 Tf 40 760 Td (COMPROVANTE FICTICIO - PACTO DEMO) Tj 0 -24 Td /F1 11 Tf (${safe}) Tj 0 -18 Td (Documento sem valor legal, gerado para testes.) Tj ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return new TextEncoder().encode(out);
  }
  function pdfFile(label) { const bytes = fakePdf(label); return { name: 'comprovante-ficticio.pdf', type: 'application/pdf', size: bytes.length, bytes }; }

  async function seed(api, clock) {
    const realNow = clock.now;
    const base = new Date(realNow()); base.setHours(10, 0, 0, 0);
    const day = (d) => { const x = new Date(base); x.setDate(x.getDate() + d); return x; };
    const iso = (d) => { const x = day(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const setDay = (d, h = 0) => { const t = day(d).getTime() + h * 3600000; clock.now = () => new Date(t); };
    const tok = {};
    try {
      setDay(-130);
      for (const u of DEMO) { const r = await api.signup({ ...u, password: DEMO_PASSWORD, demo: true, verified: true }); tok[u.email] = r.token; }
      const ids = {};
      for (const u of DEMO) ids[u.email] = (await api.me(tok[u.email])).id;
      const relog = async () => { for (const u of DEMO) tok[u.email] = (await api.login({ email: u.email, password: DEMO_PASSWORD })).token; };
      const M = () => tok['marina@demo.pacto'], R = () => tok['rafael@demo.pacto'], J = () => tok['julia@demo.pacto'];
      const create = async (t, meta, buyer, terms, reason) => (await api.createAgreement(t(), { meta, buyerEmail: buyer, terms, reason })).id;
      const accept = async (t, id) => { const a = await api.getAgreement(t(), id); return api.respond(t(), id, { versionNo: C.pendingVersion(a).no, action: 'accept' }); };
      const pay = async (agId, n, d, approve = true) => {
        setDay(d); await relog();
        const a = await api.getAgreement(R(), agId);
        const inst = a.schedule.filter((s) => s.status !== 'replaced').sort((x, y) => x.due.localeCompare(y.due))[n];
        const res = await api.reportPayment(R(), agId, { installmentId: inst.id, amountCents: inst.amountCents, paidAt: iso(d), comment: 'Pix enviado (fictício).', file: pdfFile(`${a.title} - parcela ${n + 1}`) });
        if (approve) { setDay(d, 5); await relog(); await api.reviewPayment(M(), agId, { installmentId: inst.id, reportId: res.report.id, decision: 'approve' }); }
      };

      // 1) Apartamento: proposta, contraproposta do comprador, aceite do vendedor
      setDay(-125); await relog();
      const apt = await create(M, { title: 'Apartamento Ed. Jardins 42', category: 'Apartamento', description: 'Unidade 42, 2 dormitórios, vaga coberta. Dados fictícios.' }, 'rafael@demo.pacto',
        { totalCents: 18000000, downCents: 3000000, downDue: iso(-110), count: 60, method: 'price', ratePct: 0.99, periodicity: 'monthly', firstDue: iso(-95), bankRef: { pct: 1.65, source: 'Referência informada pelo vendedor (exemplo fictício)' } }, 'Proposta inicial');
      setDay(-124); await relog();
      await api.propose(R(), apt, { terms: { totalCents: 18000000, downCents: 3000000, downDue: iso(-110), count: 60, method: 'price', ratePct: 0.79, periodicity: 'monthly', firstDue: iso(-95), bankRef: null }, reason: 'Peço juros menores: 0,79% a.m.' });
      setDay(-123); await relog(); await accept(M, apt);
      await pay(apt, 0, -110); await pay(apt, 1, -95); await pay(apt, 2, -65); await pay(apt, 3, -35);
      await pay(apt, 4, -4, false); // em análise

      // 2) Celular: sem juros, uma parcela atrasada
      setDay(-70); await relog();
      const cel = await create(M, { title: 'iPhone 15 Pro 256 GB', category: 'Celular', description: 'Aparelho seminovo com nota. Fictício.' }, 'rafael@demo.pacto', { totalCents: 720000, count: 12, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: iso(-60) });
      setDay(-69); await relog(); await accept(R, cel);
      await pay(cel, 0, -61);

      // 3) Camisa, 4) Empréstimo, 5) Veículo (candidatos à unificação)
      setDay(-40); await relog();
      const cam = await create(M, { title: 'Camisa oficial autografada', category: 'Camisa', description: 'Item de coleção. Fictício.' }, 'rafael@demo.pacto', { totalCents: 45000, count: 3, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: iso(10) });
      const emp = await create(M, { title: 'Empréstimo pessoal', category: 'Empréstimo', description: 'Valor emprestado para reforma. Fictício.' }, 'rafael@demo.pacto', { totalCents: 500000, count: 10, method: 'simple', ratePct: 1.5, periodicity: 'monthly', firstDue: iso(-25) });
      const vei = await create(M, { title: 'Honda CG 160 2022', category: 'Veículo', description: 'Moto com documentação em dia. Fictício.' }, 'rafael@demo.pacto', { totalCents: 1800000, downCents: 300000, downDue: iso(-38), count: 24, method: 'price', ratePct: 1.2, periodicity: 'monthly', firstDue: iso(5) });
      setDay(-39); await relog(); await accept(R, cam); await accept(R, emp); await accept(R, vei);
      await pay(vei, 0, -38); await pay(emp, 0, -25);

      // 6) Rafael também vende: bicicleta para Marina (papéis diferentes por contrato)
      setDay(-20); await relog();
      const bike = await create(R, { title: 'Bicicleta Caloi Elite', category: 'Bicicleta', description: 'Aro 29, revisada. Fictício.' }, 'marina@demo.pacto', { totalCents: 180000, count: 6, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: iso(3) });
      setDay(-19); await relog(); await accept(M, bike);

      // 7) Júlia compra de Marina (Rafael NÃO enxerga este acordo)
      setDay(-15); await relog();
      const des = await create(M, { title: 'Projeto de identidade visual', category: 'Serviço', description: 'Logo e manual de marca. Fictício.' }, 'julia@demo.pacto', { totalCents: 360000, count: 4, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: iso(-10) });
      setDay(-14); await relog(); await accept(J, des);
      setDay(-10); await relog();
      { const a = await api.getAgreement(J(), des); const inst = a.schedule[0]; const r = await api.reportPayment(J(), des, { installmentId: inst.id, amountCents: inst.amountCents, paidAt: iso(-10), comment: 'Transferência (fictícia)', file: pdfFile('Projeto - parcela 1') }); setDay(-9); await relog(); await api.reviewPayment(M(), des, { installmentId: inst.id, reportId: r.report.id, decision: 'approve' }); }

      // 8) Proposta pendente para Rafael responder
      setDay(-1); await relog();
      await create(M, { title: 'Notebook Dell Inspiron', category: 'Eletrônico', description: 'i7, 16 GB. Fictício.' }, 'rafael@demo.pacto', { totalCents: 540000, downCents: 60000, downDue: iso(2), count: 8, method: 'price', ratePct: 1.49, periodicity: 'monthly', firstDue: iso(30) }, 'Proposta com entrada pequena');

      /* ---------- 8.1: recorrência, avulso, justificativa de atraso ---------- */
      const payBy = async (buyer, seller, agId, d, approve = true) => {
        setDay(d); await relog();
        await api.runReminders(seller()); // gera a cobrança do período, se houver
        const a = await api.getAgreement(buyer(), agId);
        const inst = a.schedule.filter((x) => C.OPEN.includes(x.status)).sort((x, y) => x.due.localeCompare(y.due))[0];
        const res = await api.reportPayment(buyer(), agId, { installmentId: inst.id, amountCents: inst.amountCents, paidAt: iso(d), comment: 'Pix (fictício).', file: pdfFile(`${a.title} - período ${inst.seq}`) });
        if (approve) { setDay(d, 4); await relog(); await api.reviewPayment(seller(), agId, { installmentId: inst.id, reportId: res.report.id, decision: 'approve' }); }
      };
      // 9) Rafael é personal trainer de Marina (mensal recorrente)
      setDay(-58); await relog();
      const pt = await create(R, { title: 'Personal trainer · 3x por semana', category: 'Personal trainer', group: 'saude', billing: 'recurring', description: 'Treinos seg/qua/sex às 7h. Fictício.', fields: { plano: 'Condicionamento', inicio: iso(-55) } }, 'marina@demo.pacto', { mode: 'recurring', amountCents: 45000, periodicity: 'monthly', startDate: iso(-55) }, 'Plano mensal');
      setDay(-57); await relog(); await accept(M, pt);
      await payBy(M, R, pt, -55); await payBy(M, R, pt, -25);
      // 10) Marina presta mentoria mensal para Júlia (recorrente; 1 período em análise)
      setDay(-42); await relog();
      const men = await create(M, { title: 'Mentoria mensal de marca', category: 'Consultoria', group: 'servicos', billing: 'recurring', description: 'Encontro quinzenal + revisão de peças. Fictício.', fields: { servico: 'Mentoria de branding' } }, 'julia@demo.pacto', { mode: 'recurring', amountCents: 60000, periodicity: 'monthly', startDate: iso(-40) });
      setDay(-41); await relog(); await accept(J, men);
      await payBy(J, M, men, -40); await payBy(J, M, men, -9, false);
      // 11) Marina dá aulas de violão semanais para Rafael (com data de término)
      setDay(-23); await relog();
      const vio = await create(M, { title: 'Aulas de violão (semanal)', category: 'Aulas particulares', group: 'educacao', billing: 'recurring', description: 'Aula de 1h às terças. Fictício.', fields: { disciplina: 'Violão popular', turma: 'Terça 19h' } }, 'rafael@demo.pacto', { mode: 'recurring', amountCents: 12000, periodicity: 'weekly', startDate: iso(-21), endDate: iso(70) });
      setDay(-22); await relog(); await accept(R, vio);
      await payBy(R, M, vio, -21); await payBy(R, M, vio, -14); await payBy(R, M, vio, -7);
      // 12) Júlia é manicure: atendimento avulso para Marina
      setDay(-3); await relog();
      const man = await create(J, { title: 'Manicure + esmaltação em gel', category: 'Manicure', group: 'beleza', billing: 'single', description: 'Atendimento a domicílio. Fictício.', fields: { servico: 'Mãos em gel', dataAtendimento: iso(-3) } }, 'marina@demo.pacto', { totalCents: 9000, count: 1, method: 'none', ratePct: 0, periodicity: 'monthly', firstDue: iso(2) });
      setDay(-3, 2); await relog(); await accept(M, man);
      // 13) Rafael justifica o atraso de uma parcela do iPhone (aguarda Marina)
      setDay(-2); await relog();
      { const a = await api.getAgreement(R(), cel); const late = a.schedule.filter((x) => C.OPEN.includes(x.status) && x.due < iso(-2)).sort((x, y) => x.due.localeCompare(y.due))[0];
        if (late) await api.proposeDelay(R(), cel, { installmentId: late.id, newDate: iso(6), reason: 'Recebi o salário com atraso este mês', note: 'Consigo pagar no dia indicado (fictício).' }); }
      await api.updateProfile(R(), { prefs: { shareContact: true } }); await api.updateProfile(J(), { prefs: { shareContact: true } });
      await api.updateProfile(M(), { prefs: { customCategories: [{ label: 'Bolos sob encomenda', group: 'comercio' }] } });
    } finally {
      clock.now = realNow;
    }
    // lembretes do dia
    for (const u of DEMO) { const t = (await api.login({ email: u.email, password: DEMO_PASSWORD })).token; await api.runReminders(t); const old = (await api.listNotifications(t)).filter((n) => new Date(n.at) < day(-3)).map((n) => n.id); await api.markRead(t, old); await api.logout(t); }
    return true;
  }
  return { seed, DEMO, DEMO_PASSWORD, fakePdf, pdfFile };
});
