/* PACTOX · núcleo reutilizável do Estúdio Visual — v2 (item 6: Assinatura HINGABEXIT v2.2).
   Espelho em JS de private.validate_theme_tokens v2 (migração 20261128040000): MATERIAL FIXO, personalização SÓ cromática, seis paletas oficiais + legadas.
   Paridade com o SQL provada em backend/supabase-8.2/tests/aura.test.mjs. Sem execução de CSS/JS arbitrário. */
(function (root) {
  'use strict';

  const BASE = { '--glass-opacity': 0.58, '--glass-2-opacity': 0.74, '--blur': 22, '--sat': 180, '--glass-edge': 0.78, '--shadow-level': 2, '--r-sm': 12, '--r': 20, '--r-lg': 28, '--sheen': 0.32, '--light-angle': 135 };
  const BASE_D = { ...BASE, '--glass-opacity': 0.44, '--glass-2-opacity': 0.64, '--glass-edge': 0.24, '--sheen': 0.22 };
  const C = (p, l, m, pa, o, i, i2, mu) => ({ '--brand-petrol': p, '--brand-lime': l, '--brand-mint': m, '--paper': pa, '--offwhite': o, '--ink': i, '--ink-2': i2, '--muted': mu });
  const PAL = {
    original: { name: 'Original', light: C('#1b6b5f', '#c8f169', '#5fb3a3', '#fbfaf6', '#f5f4ee', '#0c2a26', '#1e3f3a', '#2f4b46'), dark: C('#1b6b5f', '#c8f169', '#5fb3a3', '#0b2421', '#071a18', '#eaf3ef', '#c3d6d0', '#9db3ad') },
    jade: { name: 'Jade', light: C('#0e6b56', '#c8f169', '#46c19a', '#f8fcf9', '#edf6f1', '#0a2a22', '#1b3d33', '#2c4a40'), dark: C('#12806a', '#c8f169', '#2fa384', '#08241d', '#051a15', '#e6f5ef', '#c0dcd2', '#95b8ac') },
    oceano: { name: 'Oceano', light: C('#1a5f86', '#bff3dd', '#59a7d9', '#f7fafd', '#ebf2f8', '#0a2236', '#1b3a52', '#2d4b63'), dark: C('#2878a8', '#bff3dd', '#2f6f9e', '#0a1d2c', '#06141f', '#e6f1fa', '#c2d6e6', '#97afc2') },
    lavanda: { name: 'Lavanda', light: C('#5a4a8c', '#d6f59a', '#b6a3ea', '#fbf9fe', '#f2eefa', '#211a38', '#342a53', '#483e64'), dark: C('#7a68b8', '#d6f59a', '#6b58a8', '#1a1626', '#120f1c', '#efeaf9', '#d6cdee', '#b4a9d1') },
    grafite: { name: 'Grafite', light: C('#2e3a40', '#c8f169', '#8d9ba3', '#fafafa', '#eef0f1', '#14181b', '#2a3034', '#42494e'), dark: C('#4a5a62', '#c8f169', '#3c474d', '#1a1d1f', '#111315', '#eef1f2', '#cfd5d8', '#a6aeb2') },
  };
  const tokensOf = (pal, mode) => ({ ...(mode === 'dark' ? BASE_D : BASE), ...PAL[pal][mode], palette: pal });
  const DEF = { light: tokensOf('original', 'light'), dark: tokensOf('original', 'dark') };
  const PROTECTED = ['--info', '--info-bg', '--ok', '--ok-bg', '--warn', '--warn-bg', '--danger', '--danger-bg'];
  const PROTECTED_SQL = ['--info', '--c-blue', '--ok', '--c-green', '--warn', '--c-yellow', '--danger', '--c-red', '--c-gray', '--info-bg', '--ok-bg', '--warn-bg', '--danger-bg', '--lock', '--security', '--money-pos', '--money-neg'];
  const COLORS = ['--brand-petrol', '--brand-lime', '--brand-mint', '--paper', '--offwhite', '--ink', '--ink-2', '--muted'];
  const NUMS = ['--glass-opacity', '--glass-2-opacity', '--blur', '--sat', '--glass-edge', '--shadow-level', '--r-sm', '--r', '--r-lg', '--sheen', '--light-angle'];
  const PALETTES = ['jade', 'champagne', 'atlantic', 'terracotta', 'violet', 'neutral', 'azul-atlantico', 'oceano', 'esmeralda', 'original', 'grafite', 'verde-floresta', 'neutros-claros', 'lavanda', 'areia', 'noite', 'personalizada'];
  const HEX = /^#[0-9a-fA-F]{6}$/;

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
  function mix(hex, hex2, f) { const a = parseInt(hex.slice(1), 16), b = parseInt(hex2.slice(1), 16); const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f)); return `rgb(${c.join(',')})`; }

  function hexLum(p) {
    if (!HEX.test(p || '')) return 0;
    const ch = (i) => {
      let v = parseInt(p.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  }
  function contrast(a, b) {
    const la = hexLum(a), lb = hexLum(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  }

  function applyTokens(el, t, mode) {
    if (!el || !el.style) return [];
    const done = []; const set = (k, v) => { done.push(k); el.style.setProperty(k, v); };
    const tint = mode === 'dark' ? mix(t['--paper'], t['--brand-petrol'], 0.25) : '#ffffff';
    const tn = tint.startsWith('#') ? [255, 255, 255] : tint.slice(4, -1).split(',').map(Number);
    set('--petrol-600', t['--brand-petrol']); set('--petrol-700', mix(t['--brand-petrol'], '#000000', 0.25)); set('--petrol-800', mix(t['--brand-petrol'], '#000000', 0.45)); set('--petrol-500', mix(t['--brand-petrol'], '#ffffff', 0.12)); set('--lime', t['--brand-lime']); set('--lime-strong', t['--brand-lime']); set('--st-mint', t['--brand-mint']);
    ['--paper', '--offwhite', '--ink', '--ink-2', '--muted'].forEach((k) => set(k, t[k]));
    set('--glass', `rgba(${tn.join(',')}, ${t['--glass-opacity']})`); set('--glass-2', `rgba(${tn.join(',')}, ${t['--glass-2-opacity']})`);
    set('--glass-edge', `rgba(255,255,255,${t['--glass-edge']})`); set('--blur', t['--blur'] + 'px'); set('--sat', t['--sat'] + '%');
    const lv = t['--shadow-level'], sh = [0, 0.12, 0.28, 0.42][lv];
    set('--glass-shadow', `0 1px 0 rgba(255,255,255,${mode === 'dark' ? 0.12 : 0.9}) inset, 0 ${10 + 6 * lv}px ${24 + 10 * lv}px -18px ${hexA(mode === 'dark' ? '#000000' : t['--ink'], sh * (mode === 'dark' ? 2 : 1.2))}`);
    set('--r-sm', t['--r-sm'] + 'px'); set('--r', t['--r'] + 'px'); set('--r-lg', t['--r-lg'] + 'px');
    set('--st-sheen', String(t['--sheen'] ?? 0.3)); set('--st-light', (t['--light-angle'] ?? 135) + 'deg');
    set('--st-hero-a', t['--brand-petrol']); set('--st-hero-b', mix(t['--brand-petrol'], mode === 'dark' ? '#000000' : t['--ink'], 0.55));
    set('--st-bg', `radial-gradient(120% 90% at 0% 0%, ${hexA(t['--brand-mint'], mode === 'dark' ? 0.35 : 0.55)}, transparent 55%), radial-gradient(90% 80% at 100% 10%, ${hexA(t['--brand-lime'], mode === 'dark' ? 0.16 : 0.45)}, transparent 55%), ${t['--offwhite']}`);
    if (typeof document !== 'undefined' && el === document.documentElement) PROTECTED.forEach((k) => el.style.removeProperty(k));
    else if (typeof document !== 'undefined' && document.documentElement) {
      const cs = getComputedStyle(document.documentElement);
      PROTECTED.forEach((k) => set(k, cs.getPropertyValue(k).trim()));
    }
    return done;
  }

  function validateThemeTokens(tokens, mode) {
    const errs = [], warns = [];
    if (mode !== 'light' && mode !== 'dark') return { ok: false, errors: ['modo inválido'] };
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return { ok: false, errors: ['tokens deve ser um objeto'] };
    const raw = JSON.stringify(tokens);
    if (raw.length > 4000) return { ok: false, errors: ['tema grande demais'] };
    if (/<script|javascript:|expression\s*\(|url\s*\(\s*['"]?\s*https?:|@import/i.test(raw)) {
      return { ok: false, errors: ['tokens não podem conter CSS, JavaScript ou URL externa'] };
    }
    for (const [k, v] of Object.entries(tokens)) {
      if (PROTECTED_SQL.includes(k) || PROTECTED.includes(k)) errs.push(`${k} é protegido (cores de estado/segurança/valores não se personalizam)`);
      else if (COLORS.includes(k)) {
        if (typeof v !== 'string' || !HEX.test(v)) errs.push(`${k}: use cor hex #RRGGBB`);
      } else if (NUMS.includes(k)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${k}: número obrigatório`);
        else if (v !== (mode === 'dark' ? BASE_D : BASE)[k]) errs.push(`${k} faz parte do material fixo da Assinatura HINGABEXIT (Liquid Glass); só as cores se personalizam`);
      } else if (k === 'bg') {
        if (!v || typeof v !== 'object' || !['solid', 'gradient'].includes(v.type)) errs.push('bg: {type: solid|gradient}');
        else if (!Array.isArray(v.stops) || v.stops.length < 1 || v.stops.length > 3) errs.push('bg: 1 a 3 paradas');
        else if (v.stops.some((s) => typeof s !== 'string' || !HEX.test(s))) errs.push('bg: paradas em hex #RRGGBB (sem imagens/URLs)');
        else if (v.angle != null && (typeof v.angle !== 'number' || v.angle < 0 || v.angle > 360)) errs.push('bg: ângulo 0 a 360');
        else if (Object.keys(v).some((x) => !['type', 'stops', 'angle'].includes(x))) errs.push('bg: chave desconhecida');
      } else if (k === 'palette') {
        if (typeof v !== 'string' || !PALETTES.includes(v)) errs.push('palette: nome desconhecido');
      } else if (k === 'reduceMotion') {
        if (typeof v !== 'boolean') errs.push('reduceMotion: true/false');
      } else errs.push(`chave desconhecida: ${k}`);
    }
    if (errs.length) return { ok: false, errors: errs, warnings: warns };
    const base = mode === 'light'
      ? { '--paper': '#fbfaf6', '--offwhite': '#f5f4ee', '--ink': '#0c2a26', '--ink-2': '#1e3f3a', '--muted': '#2f4b46', '--brand-lime': '#c8f169' }
      : { '--paper': '#0b2421', '--offwhite': '#071a18', '--ink': '#eaf3ef', '--ink-2': '#c3d6d0', '--muted': '#9db3ad', '--brand-lime': '#c8f169' };
    const t = { ...base, ...tokens };
    for (const k of ['--paper', '--offwhite']) {
      const c1 = contrast(t['--ink'], t[k]); if (c1 < 4.5) errs.push(`contraste --ink × ${k} = ${c1}:1 (mín. 4,5)`);
      const c2 = contrast(t['--ink-2'], t[k]); if (c2 < 4.5) errs.push(`contraste --ink-2 × ${k} = ${c2}:1 (mín. 4,5)`);
      const c3 = contrast(t['--muted'], t[k]); if (c3 < 4.5) errs.push(`contraste --muted × ${k} = ${c3}:1 (mín. 4,5)`);
    }
    const cb = Math.max(contrast(t['--brand-lime'], '#10181a'), contrast(t['--brand-lime'], '#ffffff'));
    if (cb < 4.5) errs.push(`contraste do destaque da paleta com texto = ${cb}:1 (mín. 4,5)`);
    if (mode === 'dark') { const cp = contrast(t['--brand-lime'], t['--paper']); if (cp < 4.5) errs.push(`contraste --brand-lime × --paper (escuro) = ${cp}:1 (mín. 4,5)`); }
    if (errs.length) return { ok: false, errors: errs, warnings: warns };
    return { ok: true, errors: [], warnings: warns, schemaVersion: 2 };
  }

  const lib = { BASE, BASE_D, C, PAL, tokensOf, DEF, PROTECTED, PROTECTED_SQL, COLORS, NUMS, PALETTES, HEX, hexA, mix, hexLum, contrast, applyTokens, validateThemeTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  root.PactoStudioTheme = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this);
