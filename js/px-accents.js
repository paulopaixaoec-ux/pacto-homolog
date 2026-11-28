/* PX CORE · acentos dos módulos (derivados da paleta ativa; só dentro do PX CORE, em ícones, títulos e indicadores).
   Origem: PACTOX Lab modules/px-core-preview/accents.js (da prévia do PX CORE). Matiz conceitual apenas: não registra paletas, não altera tokens
   da Assinatura HINGABEXIT e não grava nenhuma chave de preferência. */
(function (root) {
  'use strict';

  var HEX = /^#[0-9a-fA-F]{6}$/;

  /* Conceptual references (not official palettes). Soft, mid, identifiable hues. */
  var CONCEPTS = {
    one:  { id: 'one',  name: 'PX ONE',  concept: 'Jade',                    h: 165, s: 0.18, sourcePalette: 'jade' },
    pro:  { id: 'pro',  name: 'PX PRO',  concept: 'Atlantic',                h: 207, s: 0.28, sourcePalette: 'atlantic' },
    lab:  { id: 'lab',  name: 'PX LAB',  concept: 'Violet',                  h: 256, s: 0.28, sourcePalette: 'violet' },
    coin: { id: 'coin', name: 'PX COIN', concept: 'Champagne',               h: 37,  s: 0.30, sourcePalette: 'champagne' },
    link: { id: 'link', name: 'PX LINK', concept: 'azul-petróleo suave',     h: 202, s: 0.20 },
    aura: { id: 'aura', name: 'PX AURA', concept: 'Terracotta suavizado',    h: 18,  s: 0.18, sourcePalette: 'terracotta' }
  };

  /* PX CORE uses the active palette's petrol — not a new accent. */
  var CORE_USES_PETROL = true;

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      var x = Math.max(0, Math.min(255, Math.round(v)));
      return (x < 16 ? '0' : '') + x.toString(16);
    }).join('');
  }
  function mixHex(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
  }
  function hexLum(p) {
    if (!HEX.test(p || '')) return 0;
    var ch = function (i) {
      var v = parseInt(p.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  }
  function contrast(a, b) {
    var la = hexLum(a), lb = hexLum(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }
  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = ((h % 360) + 360) % 360 / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = l - c / 2;
    return {
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255
    };
  }
  function hslToHex(h, s, l) {
    var rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  function blendHue(h1, h2, t) {
    var d = ((h2 - h1 + 540) % 360) - 180;
    return (h1 + d * t + 360) % 360;
  }
  function glassEffective(chroma, mode, which) {
    var paper = chroma['--paper'];
    var off = chroma['--offwhite'];
    var petrol = chroma['--brand-petrol'];
    var opacity = mode === 'dark'
      ? (which === 2 ? 0.64 : 0.44)
      : (which === 2 ? 0.74 : 0.58);
    var tint = mode === 'dark' ? mixHex(paper, petrol, 0.25) : '#ffffff';
    return mixHex(off, tint, opacity);
  }

  function surfacesOf(chroma, mode) {
    return {
      paper: chroma['--paper'],
      offwhite: chroma['--offwhite'],
      glass: glassEffective(chroma, mode, 1),
      glass2: glassEffective(chroma, mode, 2)
    };
  }

  function minContrast(hex, surfaces) {
    var keys = Object.keys(surfaces);
    var min = Infinity, detail = {};
    keys.forEach(function (k) {
      var c = contrast(hex, surfaces[k]);
      detail[k] = c;
      if (c < min) min = c;
    });
    return { min: min, detail: detail };
  }

  function fitAccent(concept, chroma, mode) {
    var petrol = chroma['--brand-petrol'];
    var muted = chroma['--muted'];
    var pHsl = rgbToHsl.apply(null, [hexToRgb(petrol).r, hexToRgb(petrol).g, hexToRgb(petrol).b]);
    var mHsl = rgbToHsl.apply(null, [hexToRgb(muted).r, hexToRgb(muted).g, hexToRgb(muted).b]);
    var surf = surfacesOf(chroma, mode);

    /* Pull hue slightly toward the active petrol so the accent sits in the same climate. */
    var huePull = 0.16;
    var h = blendHue(concept.h, pHsl.h, huePull);
    /* Keep saturation modest; borrow a little of the palette's own chroma. */
    var s = concept.s * 0.72 + pHsl.s * 0.18;
    if (s > 0.34) s = 0.34;
    if (s < 0.14) s = 0.14;
    /* Warm palettes: a touch more muted. */
    if (pHsl.h > 20 && pHsl.h < 70 && pHsl.s > 0.2) s = Math.min(s, 0.28);

    var lo = mode === 'dark' ? 0.58 : 0.18;
    var hi = mode === 'dark' ? 0.88 : 0.48;
    var step = 0.005;
    var best = null;
    for (var l = lo; l <= hi + 1e-9; l += step) {
      var hex = hslToHex(h, s, l);
      /* Glue 12% toward muted to stay grayish/soft and on-palette. */
      hex = mixHex(hex, muted, 0.12);
      var mc = minContrast(hex, surf);
      if (mc.min >= 4.5) {
        var softness = Math.abs(l - (mode === 'dark' ? 0.72 : 0.32));
        if (!best || mc.min < best.mc.min - 0.15 || (Math.abs(mc.min - best.mc.min) <= 0.15 && softness < best.softness)) {
          best = { hex: hex, h: h, s: s, l: l, mc: mc, softness: softness };
        }
      }
    }
    if (!best) {
      /* Last resort: push lightness to the extreme end (still low sat). */
      var extremeL = mode === 'dark' ? 0.9 : 0.16;
      for (var s2 = s; s2 >= 0.08; s2 -= 0.02) {
        var hex2 = mixHex(hslToHex(h, s2, extremeL), muted, 0.08);
        var mc2 = minContrast(hex2, surf);
        if (mc2.min >= 4.5) {
          best = { hex: hex2, h: h, s: s2, l: extremeL, mc: mc2, softness: 1 };
          break;
        }
      }
    }
    if (!best) {
      /* Fallback: use muted itself (already AA in official palettes) but report failure. */
      var fb = minContrast(muted, surf);
      best = { hex: muted, h: mHsl.h, s: mHsl.s, l: mHsl.l, mc: fb, softness: 99, failed: true };
    }
    return {
      id: concept.id,
      name: concept.name,
      concept: concept.concept,
      hex: best.hex,
      contrast: best.mc.detail,
      contrastMin: best.mc.min,
      aa: best.mc.min >= 4.5 && !best.failed,
      derived: { h: Math.round(best.h * 10) / 10, s: Math.round(best.s * 1000) / 1000, l: Math.round(best.l * 1000) / 1000 }
    };
  }

  function deriveAll(chroma, mode) {
    mode = mode === 'dark' ? 'dark' : 'light';
    var out = {};
    Object.keys(CONCEPTS).forEach(function (id) {
      out[id] = fitAccent(CONCEPTS[id], chroma, mode);
    });
    var surf = surfacesOf(chroma, mode);
    var petrol = chroma['--brand-petrol'];
    var pHsl = rgbToHsl.apply(null, [hexToRgb(petrol).r, hexToRgb(petrol).g, hexToRgb(petrol).b]);
    /* CORE has no conceptual accent of its own. Titles use a lightness-adjusted
       derivative of the active --brand-petrol so they meet WCAG AA. The official
       petrol token is never rewritten. */
    var coreConcept = { id: 'core', name: 'PX CORE', concept: 'paleta ativa (--brand-petrol)', h: pHsl.h, s: Math.min(0.34, Math.max(0.14, pHsl.s)) };
    var coreFit = fitAccent(coreConcept, chroma, mode);
    coreFit.usesActivePetrol = CORE_USES_PETROL;
    coreFit.sourcePetrol = petrol;
    out.core = coreFit;
    return { mode: mode, palette: chroma.palette || null, surfaces: surf, modules: out };
  }

  function report(Hingabexit, paletteIds) {
    var H = Hingabexit;
    var ids = paletteIds || H.OFFICIAL_PALETTES.concat(['original']);
    var rows = [];
    var failures = [];
    ids.forEach(function (pid) {
      ['light', 'dark'].forEach(function (mode) {
        var tokens = H.tokensOf(pid, mode);
        var d = deriveAll(tokens, mode);
        Object.keys(d.modules).forEach(function (mid) {
          var m = d.modules[mid];
          var row = {
            palette: pid,
            mode: mode,
            module: mid,
            concept: m.concept,
            hex: m.hex,
            contrast: m.contrast,
            contrastMin: m.contrastMin,
            aa: m.aa
          };
          rows.push(row);
          if (!m.aa) failures.push(row);
        });
      });
    });
    return { ok: failures.length === 0, rows: rows, failures: failures, count: rows.length };
  }

  var api = {
    CONCEPTS: CONCEPTS,
    deriveAll: deriveAll,
    fitAccent: fitAccent,
    contrast: contrast,
    mixHex: mixHex,
    glassEffective: glassEffective,
    surfacesOf: surfacesOf,
    report: report,
    hexLum: hexLum
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PxCoreAccents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
