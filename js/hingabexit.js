/* HINGABEXIT | Assinatura Visual · v2.2.0
   Camadas: paletas, Liquid Glass, tipografia, iluminação, transparência, sombras, bordas, movimento, acessibilidade.
   Receita de material: PACTOX Studio / Temas Especiais (docs/reference/material-studio-temas-especiais.png).
   Sem framework. Sem rede. Sem execução de CSS/JS arbitrário. */
(function (root) {
  'use strict';

  var VERSION = '2.2.0';
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var SIGNATURE = 'powered by HINGABEXIT';

  /* Tokens fixos de aparência (receita Studio). */
  var FIXED_LIGHT = {
    '--hb-glass-opacity': 0.58, '--hb-glass-2-opacity': 0.74, '--hb-glass-edge': 0.78, '--hb-glass-edge-2': 0.20,
    '--hb-blur': 22, '--hb-blur-phone': 16, '--hb-sat': 180, '--hb-shadow-level': 2,
    '--hb-r-sm': 12, '--hb-r': 20, '--hb-r-lg': 28, '--hb-sheen': 0.32, '--hb-light-angle': 135,
    '--hb-orb-blur': 70
  };
  /* v2.2: modo escuro com mais translucidez e filete de luz mais definido (só escuro; claro intacto). */
  var FIXED_DARK = Object.assign({}, FIXED_LIGHT, {
    '--hb-glass-opacity': 0.44, '--hb-glass-2-opacity': 0.64, '--hb-glass-edge': 0.24, '--hb-glass-edge-2': 0.05, '--hb-sheen': 0.22
  });

  var ALIAS_TO_HB = {
    '--glass-opacity': '--hb-glass-opacity', '--glass-2-opacity': '--hb-glass-2-opacity',
    '--glass-edge': '--hb-glass-edge', '--blur': '--hb-blur', '--sat': '--hb-sat',
    '--shadow-level': '--hb-shadow-level', '--r-sm': '--hb-r-sm', '--r': '--hb-r',
    '--r-lg': '--hb-r-lg', '--sheen': '--hb-sheen', '--light-angle': '--hb-light-angle'
  };
  var HB_TO_ALIAS = {};
  Object.keys(ALIAS_TO_HB).forEach(function (k) { HB_TO_ALIAS[ALIAS_TO_HB[k]] = k; });

  var CHROMATIC = [
    '--brand-petrol', '--brand-lime', '--brand-mint', '--wash', '--paper', '--offwhite',
    '--ink', '--ink-2', '--muted', '--accent-ink', '--action', '--action-ink',
    '--gradient-1', '--gradient-2', '--gradient-3'
  ];
  var PROTECTED = [
    '--info', '--info-bg', '--ok', '--ok-bg', '--warn', '--warn-bg', '--danger', '--danger-bg',
    '--c-green', '--c-yellow', '--c-red', '--c-blue', '--c-gray',
    '--lock', '--security', '--money-pos', '--money-neg'
  ];
  var SEMANTIC_LIGHT = {
    '--info': '#1d5fa8', '--info-bg': '#e2edf9', '--ok': '#1f7a4f', '--ok-bg': '#dff3e6',
    '--warn': '#8a5a00', '--warn-bg': '#fbefd3', '--danger': '#a3332c', '--danger-bg': '#fbe3df',
    '--c-green': '#1f9d5c', '--c-yellow': '#e09b12', '--c-red': '#d2453b', '--c-blue': '#2f7fd0', '--c-gray': '#95a6a2'
  };
  var SEMANTIC_DARK = {
    '--info': '#8cc1f5', '--info-bg': 'rgba(80,150,230,.16)', '--ok': '#7fe0a8', '--ok-bg': 'rgba(60,180,110,.16)',
    '--warn': '#f4c96b', '--warn-bg': 'rgba(240,180,60,.14)', '--danger': '#ff9d92', '--danger-bg': 'rgba(255,110,100,.14)',
    '--c-green': '#5fd99a', '--c-yellow': '#f2c84b', '--c-red': '#ff7b70', '--c-blue': '#6cc3f0', '--c-gray': '#6f8a84'
  };

  /* Receita exacta do PACTOX Studio (Temas Especiais, modo claro). Só o H é trocado fora do Jade. */
  var RECIPE = {
    light: {
      ambient1: '#e6efe9', ambient2: '#e9f1dc',
      orb1a: '#2f8f7e', orb1b: '#145249',
      orb2a: '#c8f169', orb2b: '#9fd34a',
      orb3a: '#5fb3a3', orb3b: '#1b6b5f',
      glassTint: [255, 255, 255], glass2Tint: [255, 255, 255],
      blob1Opacity: 0.55, blob2Opacity: 0.35, blob3Opacity: 0.40
    },
    dark: {
      ambient1: '#0e3631', ambient2: '#12301a',
      orb1a: '#2f8f7e', orb1b: '#145249',
      orb2a: '#c8f169', orb2b: '#9fd34a',
      orb3a: '#5fb3a3', orb3b: '#1b6b5f',
      glassTint: [18, 52, 47], glass2Tint: [22, 60, 54],
      blob1Opacity: 0.38, blob2Opacity: 0.16, blob3Opacity: 0.38
    }
  };

  var PALETTE_ALIASES = { esmeralda: 'jade', 'azul-atlantico': 'atlantic', oceano: 'atlantic' };
  var REGISTRY = {};

  function registerPalette(def) {
    if (!def || !def.id) throw new Error('paleta: id obrigatório');
    REGISTRY[def.id] = def;
  }

  registerPalette({
    id: 'jade', name: "Jade", replaces: ["esmeralda"], official: true,
    light: { '--brand-petrol': '#3C655F', '--brand-lime': '#ABC1B7', '--brand-mint': '#ABC1B7', '--wash': '#D4DFCE', '--paper': '#F9FAF7', '--offwhite': '#F1F2EC', '--ink': '#16201E', '--ink-2': '#2A3C39', '--muted': '#415855', '--accent-ink': '#16201E', '--action': '#3C655F', '--action-ink': '#FFFFFF', '--gradient-1': '#3C655F', '--gradient-2': '#ABC1B7', '--gradient-3': '#D4DFCE' },
    dark: { '--brand-petrol': '#A6BFBB', '--brand-lime': '#899B93', '--brand-mint': '#9FB2A9', '--wash': '#4A5544', '--paper': '#171E1D', '--offwhite': '#101615', '--ink': '#EBEFEE', '--ink-2': '#C7D1CF', '--muted': '#A1AFAD', '--accent-ink': '#101817', '--action': '#3C655F', '--action-ink': '#F3F5F4', '--gradient-1': '#A6BFBB', '--gradient-2': '#9FB2A9', '--gradient-3': '#4A5544' },
    material: {"light": {"ambient1": "#E1E8DC", "ambient2": "#D6DFD8", "orb1a": "#6E8E87", "orb1b": "#3C655F", "orb2a": "#ABC1B7", "orb2b": "#8AA59D", "orb3a": "#C2D2C4", "orb3b": "#6E8E87", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#263936", "ambient2": "#222A27", "orb1a": "#668880", "orb1b": "#32544F", "orb2a": "#7C9A92", "orb2b": "#375C56", "orb3a": "#547972", "orb3b": "#2D4A46", "glassTint": [30, 47, 44], "glass2Tint": [37, 57, 54], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'champagne', name: "Champagne", official: true,
    light: { '--brand-petrol': '#93774C', '--brand-lime': '#D5C19C', '--brand-mint': '#D5C19C', '--wash': '#E5D8BA', '--paper': '#FAF8F4', '--offwhite': '#F4EFE5', '--ink': '#211C15', '--ink-2': '#3E3528', '--muted': '#5A4F3F', '--accent-ink': '#211C15', '--action': '#8C7249', '--action-ink': '#FFFFFF', '--gradient-1': '#93774C', '--gradient-2': '#D5C19C', '--gradient-3': '#E5D8BA' },
    dark: { '--brand-petrol': '#C2B6A3', '--brand-lime': '#AB9B7D', '--brand-mint': '#C3B08E', '--wash': '#605439', '--paper': '#1E1B17', '--offwhite': '#161310', '--ink': '#EFEEEB', '--ink-2': '#D1CDC7', '--muted': '#AFAAA1', '--accent-ink': '#181510', '--action': '#866C45', '--action-ink': '#F3F5F4', '--gradient-1': '#C2B6A3', '--gradient-2': '#C3B08E', '--gradient-3': '#605439' },
    material: {"light": {"ambient1": "#ECE2CD", "ambient2": "#E8DEC9", "orb1a": "#B19870", "orb1b": "#93774C", "orb2a": "#D5C19C", "orb2b": "#C1AB84", "orb3a": "#DECEAC", "orb3b": "#B19870", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#393126", "ambient2": "#2C2820", "orb1a": "#AC936A", "orb1b": "#78613F", "orb2a": "#B9A27A", "orb2b": "#846B45", "orb3a": "#A2875E", "orb3b": "#685538", "glassTint": [47, 40, 30], "glass2Tint": [57, 49, 37], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'atlantic', name: "Atlantic", official: true, aliases: ['azul-atlantico'],
    light: { '--brand-petrol': '#345970', '--brand-lime': '#ACC5D2', '--brand-mint': '#ACC5D2', '--wash': '#D0DFE6', '--paper': '#F7FAFB', '--offwhite': '#EDF2F5', '--ink': '#151C21', '--ink-2': '#28353E', '--muted': '#3F505A', '--accent-ink': '#151C21', '--action': '#345970', '--action-ink': '#FFFFFF', '--gradient-1': '#345970', '--gradient-2': '#ACC5D2', '--gradient-3': '#D0DFE6' },
    dark: { '--brand-petrol': '#A1B7C4', '--brand-lime': '#8A9EA9', '--brand-mint': '#95AEBC', '--wash': '#405159', '--paper': '#171B1E', '--offwhite': '#101416', '--ink': '#EBEEEF', '--ink-2': '#C7CDD1', '--muted': '#A1AAAF', '--accent-ink': '#101518', '--action': '#345970', '--action-ink': '#F3F5F4', '--gradient-1': '#A1B7C4', '--gradient-2': '#95AEBC', '--gradient-3': '#405159' },
    material: {"light": {"ambient1": "#DDE8ED", "ambient2": "#D4E1E8", "orb1a": "#6A8A9C", "orb1b": "#345970", "orb2a": "#ACC5D2", "orb2b": "#88A5B5", "orb3a": "#C0D3DD", "orb3b": "#6A8A9C", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#263139", "ambient2": "#20282C", "orb1a": "#628295", "orb1b": "#2C4A5C", "orb2a": "#7A98A9", "orb2b": "#305165", "orb3a": "#4E7186", "orb3b": "#284251", "glassTint": [30, 40, 47], "glass2Tint": [37, 50, 57], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'terracotta', name: "Terracotta", official: true,
    light: { '--brand-petrol': '#995E49', '--brand-lime': '#D7B4A2', '--brand-mint': '#D7B4A2', '--wash': '#E5CEBC', '--paper': '#FBF8F5', '--offwhite': '#F6EFE7', '--ink': '#211815', '--ink-2': '#3E2E28', '--muted': '#5A463F', '--accent-ink': '#211815', '--action': '#995E49', '--action-ink': '#FFFFFF', '--gradient-1': '#995E49', '--gradient-2': '#D7B4A2', '--gradient-3': '#E5CEBC' },
    dark: { '--brand-petrol': '#C3ABA2', '--brand-lime': '#AD9082', '--brand-mint': '#C2A08E', '--wash': '#5F4A3A', '--paper': '#1E1917', '--offwhite': '#161210', '--ink': '#EFECEB', '--ink-2': '#D1CAC7', '--muted': '#AFA5A1', '--accent-ink': '#181210', '--action': '#995E49', '--action-ink': '#F3F5F4', '--gradient-1': '#C3ABA2', '--gradient-2': '#C2A08E', '--gradient-3': '#5F4A3A' },
    material: {"light": {"ambient1": "#EDDDCF", "ambient2": "#EAD9CD", "orb1a": "#B58571", "orb1b": "#995E49", "orb2a": "#D7B4A2", "orb2b": "#C49A87", "orb3a": "#DFC2B0", "orb3b": "#B58571", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#392B26", "ambient2": "#2C2420", "orb1a": "#B17F6B", "orb1b": "#7C4D3C", "orb2a": "#BD907D", "orb2b": "#895542", "orb3a": "#A7715D", "orb3b": "#6C4436", "glassTint": [47, 34, 30], "glass2Tint": [57, 42, 37], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'violet', name: "Violet", official: true,
    light: { '--brand-petrol': '#645585', '--brand-lime': '#BEB0D3', '--brand-mint': '#BEB0D3', '--wash': '#DDD5E9', '--paper': '#FAF8FC', '--offwhite': '#F3EFF8', '--ink': '#19161F', '--ink-2': '#302B3B', '--muted': '#494257', '--accent-ink': '#19161F', '--action': '#645585', '--action-ink': '#FFFFFF', '--gradient-1': '#645585', '--gradient-2': '#BEB0D3', '--gradient-3': '#DDD5E9' },
    dark: { '--brand-petrol': '#AFA8BD', '--brand-lime': '#988DA9', '--brand-mint': '#A596BB', '--wash': '#4A3F5A', '--paper': '#19171E', '--offwhite': '#121015', '--ink': '#ECEBEF', '--ink-2': '#CAC7D1', '--muted': '#A6A1AF', '--accent-ink': '#131018', '--action': '#645585', '--action-ink': '#F3F5F4', '--gradient-1': '#AFA8BD', '--gradient-2': '#A596BB', '--gradient-3': '#4A3F5A' },
    material: {"light": {"ambient1": "#E7E1F0", "ambient2": "#DFD7EA", "orb1a": "#8C7EA8", "orb1b": "#645585", "orb2a": "#BEB0D3", "orb2b": "#A395BC", "orb3a": "#CFC4DF", "orb3b": "#8C7EA8", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#2C2638", "ambient2": "#25202C", "orb1a": "#8678A3", "orb1b": "#52466C", "orb2a": "#988AB2", "orb2b": "#5A4D78", "orb3a": "#786996", "orb3b": "#483E5F", "glassTint": [35, 31, 46], "glass2Tint": [44, 38, 57], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'neutral', name: "Neutral", official: true,
    light: { '--brand-petrol': '#6A717A', '--brand-lime': '#C7CACE', '--brand-mint': '#C7CACE', '--wash': '#DEE1E4', '--paper': '#FBFBFB', '--offwhite': '#F6F6F6', '--ink': '#191B1C', '--ink-2': '#303336', '--muted': '#494C50', '--accent-ink': '#191B1C', '--action': '#6A717A', '--action-ink': '#FFFFFF', '--gradient-1': '#6A717A', '--gradient-2': '#C7CACE', '--gradient-3': '#DEE1E4' },
    dark: { '--brand-petrol': '#AFB2B6', '--brand-lime': '#9FA2A5', '--brand-mint': '#A4A8AD', '--wash': '#484C51', '--paper': '#191A1C', '--offwhite': '#121314', '--ink': '#EBEDEF', '--ink-2': '#C7CBD1', '--muted': '#A1A7AF', '--accent-ink': '#101418', '--action': '#6A717A', '--action-ink': '#F3F5F4', '--gradient-1': '#AFB2B6', '--gradient-2': '#A4A8AD', '--gradient-3': '#484C51' },
    material: {"light": {"ambient1": "#E9EAEC", "ambient2": "#E4E5E7", "orb1a": "#9499A0", "orb1b": "#6A717A", "orb2a": "#C7CACE", "orb2b": "#ABAFB5", "orb3a": "#D4D7DA", "orb3b": "#9499A0", "glassTint": [255, 255, 255], "glass2Tint": [255, 255, 255], "blob1Opacity": 0.5, "blob2Opacity": 0.34, "blob3Opacity": 0.38}, "dark": {"ambient1": "#2C2F32", "ambient2": "#242628", "orb1a": "#8D939A", "orb1b": "#575C64", "orb2a": "#A0A5AB", "orb2b": "#5F666E", "orb3a": "#7E858C", "orb3b": "#4C5157", "glassTint": [36, 38, 41], "glass2Tint": [44, 47, 50], "blob1Opacity": 0.46, "blob2Opacity": 0.22, "blob3Opacity": 0.4}}
  });
  registerPalette({
    id: 'grafite', name: "Grafite", legacy: true,
    light: { '--brand-petrol': '#2e3a40', '--brand-lime': '#c8f169', '--brand-mint': '#8d9ba3', '--wash': '#8d9ba3', '--paper': '#fafafa', '--offwhite': '#eef0f1', '--ink': '#14181b', '--ink-2': '#2a3034', '--muted': '#42494e', '--accent-ink': '#1d3a10', '--action': '#2e3a40', '--action-ink': '#FFFFFF', '--gradient-1': '#2e3a40', '--gradient-2': '#8d9ba3', '--gradient-3': '#fafafa' },
    dark: { '--brand-petrol': '#4a5a62', '--brand-lime': '#c8f169', '--brand-mint': '#3c474d', '--wash': '#3c474d', '--paper': '#1a1d1f', '--offwhite': '#111315', '--ink': '#eef1f2', '--ink-2': '#cfd5d8', '--muted': '#a6aeb2', '--accent-ink': '#1d3a10', '--action': '#4a5a62', '--action-ink': '#eef1f2', '--gradient-1': '#4a5a62', '--gradient-2': '#3c474d', '--gradient-3': '#1a1d1f' }
  });
  registerPalette({
    id: 'verde-floresta', name: "Verde Floresta", legacy: true,
    light: { '--brand-petrol': '#0b4d3e', '--brand-lime': '#c8f169', '--brand-mint': '#6fbf7a', '--wash': '#6fbf7a', '--paper': '#f3f7f2', '--offwhite': '#e7f0e6', '--ink': '#0a2418', '--ink-2': '#1a3a28', '--muted': '#2c4a38', '--accent-ink': '#1d3a10', '--action': '#0b4d3e', '--action-ink': '#FFFFFF', '--gradient-1': '#0b4d3e', '--gradient-2': '#6fbf7a', '--gradient-3': '#f3f7f2' },
    dark: { '--brand-petrol': '#0e5c4a', '--brand-lime': '#c8f169', '--brand-mint': '#4e9a62', '--wash': '#4e9a62', '--paper': '#071a12', '--offwhite': '#04110c', '--ink': '#e6f3ea', '--ink-2': '#c0d8c6', '--muted': '#96b6a0', '--accent-ink': '#1d3a10', '--action': '#0e5c4a', '--action-ink': '#e6f3ea', '--gradient-1': '#0e5c4a', '--gradient-2': '#4e9a62', '--gradient-3': '#071a12' }
  });
  registerPalette({
    id: 'neutros-claros', name: "Neutros claros", legacy: true,
    light: { '--brand-petrol': '#5a5a56', '--brand-lime': '#d4c9a8', '--brand-mint': '#c5c0b4', '--wash': '#c5c0b4', '--paper': '#f7f6f3', '--offwhite': '#eeeeea', '--ink': '#1a1a18', '--ink-2': '#2e2e2a', '--muted': '#4a4a44', '--accent-ink': '#2a2414', '--action': '#5a5a56', '--action-ink': '#FFFFFF', '--gradient-1': '#5a5a56', '--gradient-2': '#c5c0b4', '--gradient-3': '#f7f6f3' },
    dark: { '--brand-petrol': '#8a8a82', '--brand-lime': '#d4c9a8', '--brand-mint': '#6e6e66', '--wash': '#6e6e66', '--paper': '#1b1b18', '--offwhite': '#121211', '--ink': '#f2f1ec', '--ink-2': '#d4d3cc', '--muted': '#a8a79e', '--accent-ink': '#2a2414', '--action': '#8a8a82', '--action-ink': '#f2f1ec', '--gradient-1': '#8a8a82', '--gradient-2': '#6e6e66', '--gradient-3': '#1b1b18' }
  });
  registerPalette({
    id: 'original', name: "PACTOX institucional", legacy: true, product: 'pactox',
    light: { '--brand-petrol': '#1b6b5f', '--brand-lime': '#c8f169', '--brand-mint': '#5fb3a3', '--wash': '#5fb3a3', '--paper': '#fbfaf6', '--offwhite': '#f5f4ee', '--ink': '#0c2a26', '--ink-2': '#1e3f3a', '--muted': '#2f4b46', '--accent-ink': '#1d3a10', '--action': '#1b6b5f', '--action-ink': '#1d3a10', '--gradient-1': '#1b6b5f', '--gradient-2': '#5fb3a3', '--gradient-3': '#fbfaf6' },
    dark: { '--brand-petrol': '#1b6b5f', '--brand-lime': '#c8f169', '--brand-mint': '#5fb3a3', '--wash': '#5fb3a3', '--paper': '#0b2421', '--offwhite': '#071a18', '--ink': '#eaf3ef', '--ink-2': '#c3d6d0', '--muted': '#9db3ad', '--accent-ink': '#1d3a10', '--action': '#1b6b5f', '--action-ink': '#eaf3ef', '--gradient-1': '#1b6b5f', '--gradient-2': '#5fb3a3', '--gradient-3': '#0b2421' }
  });


  var OFFICIAL = ['jade', 'champagne', 'atlantic', 'terracotta', 'violet', 'neutral'];
  var LEGACY = ['grafite', 'verde-floresta', 'neutros-claros', 'original'];

  function mapPaletteId(id) {
    if (id == null || id === '') return id;
    var key = String(id).trim();
    var lower = key.toLowerCase();
    if (PALETTE_ALIASES[lower]) return PALETTE_ALIASES[lower];
    return key;
  }
  function hasPalette(id) { return !!REGISTRY[mapPaletteId(id)]; }

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
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }
  function mix(hex, hex2, f) {
    var a = parseInt(hex.slice(1), 16), b = parseInt(hex2.slice(1), 16);
    var c = [16, 8, 0].map(function (s) {
      return Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
    });
    return 'rgb(' + c.join(',') + ')';
  }
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
  function rgbToHsl(hex) {
    var c = hexToRgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
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
  function hslToHex(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = (((h % 360) + 360) % 360) / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = l - c / 2;
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  /* Troca só o H; preserva S e L da receita (arejamento do Studio). */
  function rehue(recipeHex, hueFrom) {
    if (!HEX.test(recipeHex) || !HEX.test(hueFrom)) return recipeHex;
    var rec = rgbToHsl(recipeHex), src = rgbToHsl(hueFrom);
    var h = src.s >= 0.02 ? src.h : rec.h;
    return hslToHex(h, rec.s, rec.l);
  }
  function rgbArrToHex(arr) {
    return rgbToHex(arr[0], arr[1], arr[2]);
  }

  function isFixedKey(k) {
    return Object.prototype.hasOwnProperty.call(FIXED_LIGHT, k) || Object.prototype.hasOwnProperty.call(ALIAS_TO_HB, k);
  }
  function canonicalFixed(k, mode) {
    var src = mode === 'dark' ? FIXED_DARK : FIXED_LIGHT;
    if (src[k] != null) return src[k];
    var hb = ALIAS_TO_HB[k];
    return hb != null ? src[hb] : undefined;
  }
  function chromaticOnly(tokens) {
    var out = {};
    if (!tokens || typeof tokens !== 'object') return out;
    CHROMATIC.forEach(function (k) { if (tokens[k] != null) out[k] = tokens[k]; });
    if (typeof tokens.palette === 'string') out.palette = mapPaletteId(tokens.palette);
    return out;
  }

  function detectAdaptations(opts) {
    opts = opts || {};
    var forced = opts.force || {};
    var mm = function (q) {
      try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch (e) { return false; }
    };
    var width = opts.width;
    if (width == null && typeof window !== 'undefined') width = window.innerWidth;
    var phone = width != null && width <= 759;
    var reducedMotion = forced.reducedMotion != null ? !!forced.reducedMotion : mm('(prefers-reduced-motion: reduce)');
    var reducedTransparency = forced.reducedTransparency != null ? !!forced.reducedTransparency : mm('(prefers-reduced-transparency: reduce)');
    var contrastMore = forced.contrast != null ? !!forced.contrast : mm('(prefers-contrast: more)');
    var supportsBlur = true;
    if (forced.weakDevice != null) {
      supportsBlur = !forced.weakDevice;
    } else {
      try {
        if (typeof CSS !== 'undefined' && CSS.supports) {
          supportsBlur = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
        } else { supportsBlur = true; }
      } catch (e) { supportsBlur = true; }
      if (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 2) supportsBlur = false;
    }
    var weakDevice = forced.weakDevice != null ? !!forced.weakDevice : !supportsBlur;
    return {
      reducedMotion: reducedMotion,
      reducedTransparency: reducedTransparency,
      contrast: contrastMore,
      weakDevice: weakDevice,
      phone: !!phone,
      supportsBlur: supportsBlur && !weakDevice && !reducedTransparency
    };
  }

  function appearanceTokens(mode, adapt) {
    var src = mode === 'dark' ? FIXED_DARK : FIXED_LIGHT;
    var out = {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    if (adapt && (adapt.weakDevice || adapt.reducedTransparency)) {
      out['--hb-blur'] = 0;
      out['--hb-sat'] = 100;
      out['--hb-glass-opacity'] = mode === 'dark' ? 0.94 : 0.96;
      out['--hb-glass-2-opacity'] = 0.98;
    } else if (adapt && adapt.phone) {
      out['--hb-blur'] = src['--hb-blur-phone'];
    }
    return out;
  }

  function tokensOf(palette, mode, adapt) {
    var id = mapPaletteId(palette) || 'jade';
    var pal = REGISTRY[id] || REGISTRY.jade;
    var chroma = pal[mode === 'dark' ? 'dark' : 'light'];
    var fixed = appearanceTokens(mode, adapt);
    var out = Object.assign({}, fixed, chroma, { palette: id });
    Object.keys(ALIAS_TO_HB).forEach(function (legacy) {
      var hb = ALIAS_TO_HB[legacy];
      if (out[hb] != null) out[legacy] = out[hb];
    });
    return out;
  }

  function looksUnsafe(obj) {
    var raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return /<script|javascript:|expression\s*\(|url\s*\(\s*['"]?\s*https?:|@import/i.test(raw || '');
  }

  function validateTokens(tokens, opts) {
    opts = opts || {};
    var mode = opts.mode === 'dark' ? 'dark' : (opts.mode === 'light' ? 'light' : null);
    var role = opts.role || 'palette';
    var errs = [];
    var warns = [];
    if (!mode) return { ok: false, errors: ['modo inválido'], warnings: [] };
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return { ok: false, errors: ['tokens deve ser um objeto'], warnings: [] };
    if (looksUnsafe(tokens)) return { ok: false, errors: ['tokens não podem conter CSS, JavaScript ou URL externa'], warnings: [] };
    var raw = JSON.stringify(tokens);
    if (raw.length > 4000) return { ok: false, errors: ['tema grande demais'], warnings: [] };
    var mapped = Object.assign({}, tokens);
    if (typeof mapped.palette === 'string') mapped.palette = mapPaletteId(mapped.palette);
    Object.keys(mapped).forEach(function (k) {
      var v = mapped[k];
      if (PROTECTED.indexOf(k) >= 0) {
        errs.push(k + ' é protegido (cores de estado, inclusive o azul de “Em análise”, não se personalizam)');
        return;
      }
      if (isFixedKey(k)) {
        var canon = canonicalFixed(k, mode);
        if (v !== canon) errs.push(k + ' é token fixo da Assinatura Visual e não pode ser alterado (valor do sistema: ' + canon + ')');
        return;
      }
      if (CHROMATIC.indexOf(k) >= 0) {
        if (typeof v !== 'string' || !HEX.test(v)) errs.push(k + ': use cor hex #RRGGBB');
        return;
      }
      if (k === 'palette') {
        if (typeof v !== 'string' || !hasPalette(v)) errs.push('palette: nome desconhecido');
        return;
      }
      if (k === 'reduceMotion' || k === 'bg') {
        if (role === 'special-theme' && k === 'bg') errs.push('bg legado não é permitido na camada de Temas Especiais; use tokens cromáticos');
        return;
      }
      errs.push('chave desconhecida: ' + k);
    });
    var baseChroma = (REGISTRY[mapped.palette] || REGISTRY.jade)[mode];
    var t = Object.assign({}, baseChroma, chromaticOnly(mapped));
    ['--paper', '--offwhite'].forEach(function (surf) {
      ['--ink', '--ink-2', '--muted'].forEach(function (ink) {
        var c = contrast(t[ink], t[surf]);
        if (c < 4.5) errs.push('contraste ' + ink + ' × ' + surf + ' = ' + c + ':1 (mín. 4,5 — WCAG AA)');
      });
    });
    var ca = contrast(t['--brand-lime'], t['--accent-ink'] || '#1d3a10');
    if (ca < 4.5) errs.push('contraste texto do acento × --brand-lime = ' + ca + ':1 (mín. 4,5 — WCAG AA)');
    return { ok: errs.length === 0, errors: errs, warnings: warns, schemaVersion: 3, role: role, palette: mapped.palette || null };
  }

  function validatePaletteDef(def) {
    var errs = [];
    if (!def || !def.id) return { ok: false, errors: ['id obrigatório'] };
    if (PROTECTED.some(function (k) { return def.light && def.light[k] != null || def.dark && def.dark[k] != null; })) {
      errs.push('paleta não pode definir cores semânticas protegidas');
    }
    ['light', 'dark'].forEach(function (mode) {
      var tokens = Object.assign({ palette: def.id }, def[mode] || {});
      var r = validateTokens(tokens, { mode: mode, role: 'palette' });
      if (!r.ok) errs.push.apply(errs, r.errors.map(function (e) { return mode + ': ' + e; }));
    });
    return { ok: errs.length === 0, errors: errs };
  }

  function migrateSavedPrefs(saved) {
    if (saved == null) return saved;
    if (typeof saved === 'string') return mapPaletteId(saved);
    if (typeof saved !== 'object') return saved;
    var out = Array.isArray(saved) ? saved.slice() : Object.assign({}, saved);
    var walk = function (obj) {
      if (!obj || typeof obj !== 'object') return;
      if (typeof obj.palette === 'string') obj.palette = mapPaletteId(obj.palette);
      if (typeof obj.id === 'string' && mapPaletteId(obj.id) !== obj.id && PALETTE_ALIASES[String(obj.id).toLowerCase()]) {
        obj.id = mapPaletteId(obj.id);
      }
      Object.keys(obj).forEach(function (k) {
        if (k === 'tokens' || k === 'tokensDark' || k === 'themes' || k === 'founderPersonal' || k === 'light' || k === 'dark') walk(obj[k]);
      });
      if (Array.isArray(obj)) obj.forEach(walk);
    };
    walk(out);
    return out;
  }

  function materialOf(palette, mode) {
    mode = mode === 'dark' ? 'dark' : 'light';
    var id = mapPaletteId(palette) || 'jade';
    var rec = RECIPE[mode];
    var def = REGISTRY[id] || REGISTRY.jade;
    if (def.material && def.material[mode]) {
      /* v2.1: orbs, ambient e vidro derivados dos 4 stops da própria paleta (sem lima, sem turquesa). */
      var m = def.material[mode];
      return {
        palette: id, mode: mode, exact: false, fromStops: true,
        ambient1: m.ambient1, ambient2: m.ambient2,
        orb1a: m.orb1a, orb1b: m.orb1b, orb2a: m.orb2a, orb2b: m.orb2b, orb3a: m.orb3a, orb3b: m.orb3b,
        glassTint: m.glassTint.slice(), glass2Tint: m.glass2Tint.slice(),
        blob1Opacity: m.blob1Opacity, blob2Opacity: m.blob2Opacity, blob3Opacity: m.blob3Opacity
      };
    }
    var exact = false;
    var chroma = def[mode];
    var huePetrol = chroma['--brand-petrol'];
    var hueMint = chroma['--brand-mint'] || huePetrol;
    var hueLime = chroma['--brand-lime'] || rec.orb2a;
    var rh = function (recipeHex, hue) { return exact ? recipeHex : rehue(recipeHex, hue); };
    var asArr = function (recipeArr, hue) {
      if (exact) return recipeArr.slice();
      var c = hexToRgb(rehue(rgbArrToHex(recipeArr), hue));
      return [c.r, c.g, c.b];
    };
    var g1 = asArr(rec.glassTint, huePetrol);
    var g2 = asArr(rec.glass2Tint, huePetrol);
    if (mode === 'light') { g1 = [255, 255, 255]; g2 = [255, 255, 255]; }
    return {
      palette: id, mode: mode, exact: exact,
      ambient1: rh(rec.ambient1, hueMint),
      ambient2: rh(rec.ambient2, hueLime),
      orb1a: rh(rec.orb1a, huePetrol), orb1b: rh(rec.orb1b, huePetrol),
      orb2a: exact ? rec.orb2a : (HEX.test(hueLime) ? hueLime : rh(rec.orb2a, hueLime)),
      orb2b: rh(rec.orb2b, hueLime),
      orb3a: rh(rec.orb3a, hueMint), orb3b: rh(rec.orb3b, huePetrol),
      glassTint: g1, glass2Tint: g2,
      blob1Opacity: rec.blob1Opacity, blob2Opacity: rec.blob2Opacity, blob3Opacity: rec.blob3Opacity
    };
  }

  function applyTo(el, tokens, mode, adapt) {
    if (!el || !el.style) return [];
    adapt = adapt || detectAdaptations();
    mode = mode === 'dark' ? 'dark' : 'light';
    var fixed = appearanceTokens(mode, adapt);
    var chroma = chromaticOnly(tokens);
    var palId = chroma.palette || 'jade';
    var mat = materialOf(palId, mode);
    var done = [];
    var set = function (k, v) { el.style.setProperty(k, v); done.push(k); };
    Object.keys(fixed).forEach(function (k) {
      var v = fixed[k];
      var css;
      if (k === '--hb-sat') css = v + '%';
      else if (k === '--hb-light-angle') css = v + 'deg';
      else if (k.indexOf('opacity') >= 0 || k.indexOf('sheen') >= 0 || k.indexOf('level') >= 0) css = String(v);
      else if (typeof v === 'number') css = v + 'px';
      else css = String(v);
      set(k, css);
      var alias = HB_TO_ALIAS[k];
      if (alias) set(alias, css);
    });
    var paper = chroma['--paper'] || (mode === 'dark' ? '#0b2421' : '#fbfaf6');
    var ink = chroma['--ink'] || (mode === 'dark' ? '#eaf3ef' : '#0c2a26');
    set('--glass', 'rgba(' + mat.glassTint.join(',') + ', ' + fixed['--hb-glass-opacity'] + ')');
    set('--glass-2', 'rgba(' + mat.glass2Tint.join(',') + ', ' + fixed['--hb-glass-2-opacity'] + ')');
    set('--glass-edge', 'rgba(255,255,255,' + fixed['--hb-glass-edge'] + ')');
    set('--glass-edge-2', 'rgba(255,255,255,' + (fixed['--hb-glass-edge-2'] != null ? fixed['--hb-glass-edge-2'] : (mode === 'dark' ? 0.04 : 0.2)) + ')');
    var sh = mode === 'dark'
      ? '0 1px 0 rgba(255,255,255,.18) inset, 0 -1px 0 rgba(0,0,0,.34) inset, 0 0 26px rgba(255,255,255,.028) inset, 0 26px 54px -22px rgba(0,0,0,.62), 0 2px 8px -2px rgba(0,0,0,.4)'
      : '0 1px 0 rgba(255,255,255,.9) inset, 0 -1px 0 rgba(255,255,255,.25) inset, 0 18px 40px -18px ' + hexA(ink, 0.26) + ', 0 2px 6px -2px ' + hexA(ink, 0.1);
    set('--glass-shadow', sh);
    set('--line', hexA(ink, mode === 'dark' ? 0.16 : 0.1));
    set('--line-2', hexA(ink, mode === 'dark' ? 0.22 : 0.16));
    set('--hb-ambient-1', mat.ambient1);
    set('--hb-ambient-2', mat.ambient2);
    set('--hb-orb-1a', mat.orb1a); set('--hb-orb-1b', mat.orb1b);
    set('--hb-orb-2a', mat.orb2a); set('--hb-orb-2b', mat.orb2b);
    set('--hb-orb-3a', mat.orb3a); set('--hb-orb-3b', mat.orb3b);
    set('--hb-blob-1-opacity', String(mat.blob1Opacity));
    set('--hb-blob-2-opacity', String(mat.blob2Opacity));
    set('--hb-blob-3-opacity', String(mat.blob3Opacity));
    CHROMATIC.forEach(function (k) { if (chroma[k]) set(k, chroma[k]); });
    var sem = mode === 'dark' ? SEMANTIC_DARK : SEMANTIC_LIGHT;
    Object.keys(sem).forEach(function (k) { set(k, sem[k]); });
    if (adapt.weakDevice || adapt.reducedTransparency) {
      set('--hb-backdrop', 'none');
    }
    if (el.setAttribute) {
      var flags = [];
      if (adapt.reducedMotion) flags.push('reduced-motion');
      if (adapt.reducedTransparency) flags.push('reduced-transparency');
      if (adapt.contrast) flags.push('contrast');
      if (adapt.weakDevice) flags.push('weak');
      if (adapt.phone) flags.push('phone');
      el.setAttribute('data-hb-adapt', flags.join(' '));
      el.setAttribute('data-hb-palette', palId);
      el.setAttribute('data-hb-mode', mode);
    }
    return done;
  }

  function applyPalette(el, palette, mode, adapt) {
    return applyTo(el, tokensOf(palette, mode, adapt), mode, adapt);
  }
  function applySpecialTheme(el, themeTokens, mode, adapt) {
    var v = validateTokens(themeTokens, { mode: mode, role: 'special-theme' });
    if (!v.ok) return { ok: false, errors: v.errors, applied: [] };
    var applied = applyTo(el, themeTokens, mode, adapt);
    return { ok: true, errors: [], applied: applied };
  }
  function applyAdapt(el, force) {
    var adapt = detectAdaptations({ force: force });
    if (!el) return adapt;
    var mode = (el.getAttribute && el.getAttribute('data-hb-mode')) || 'light';
    var pal = (el.getAttribute && el.getAttribute('data-hb-palette')) || 'jade';
    applyPalette(el, pal, mode, adapt);
    return adapt;
  }
  function renderSignature(attrs) {
    attrs = attrs || {};
    return { tag: 'p', className: 'hb-signature', text: SIGNATURE, approved: attrs.approved !== false };
  }
  function legacyTokensOf(id, mode) {
    /* Snapshots v0.1 ficam no JSON; este runtime serve as paletas ativas. */
    return null;
  }

  var api = {
    version: VERSION,
    SIGNATURE: SIGNATURE,
    FIXED_LIGHT: FIXED_LIGHT,
    FIXED_DARK: FIXED_DARK,
    CHROMATIC: CHROMATIC,
    PROTECTED: PROTECTED,
    OFFICIAL_PALETTES: OFFICIAL,
    LEGACY_PALETTES: LEGACY,
    PALETTE_ALIASES: PALETTE_ALIASES,
    RECIPE: RECIPE,
    registry: REGISTRY,
    registerPalette: registerPalette,
    mapPaletteId: mapPaletteId,
    hasPalette: hasPalette,
    tokensOf: tokensOf,
    chromaticOnly: chromaticOnly,
    appearanceTokens: appearanceTokens,
    detectAdaptations: detectAdaptations,
    validateTokens: validateTokens,
    validatePaletteDef: validatePaletteDef,
    migrateSavedPrefs: migrateSavedPrefs,
    applyTo: applyTo,
    applyPalette: applyPalette,
    applySpecialTheme: applySpecialTheme,
    applyAdapt: applyAdapt,
    contrast: contrast,
    hexLum: hexLum,
    hexA: hexA,
    mix: mix,
    rehue: rehue,
    materialOf: materialOf,
    looksUnsafe: looksUnsafe,
    renderSignature: renderSignature,
    legacyTokensOf: legacyTokensOf,
    SEMANTIC_LIGHT: SEMANTIC_LIGHT,
    SEMANTIC_DARK: SEMANTIC_DARK
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Hingabexit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
