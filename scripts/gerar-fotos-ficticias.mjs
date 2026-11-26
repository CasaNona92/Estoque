// Gera FOTOS FICTÍCIAS (ilustrações) para os produtos do seed, uma por cor, no padrão
// CODIGO_COR_N.jpg — prontas para a tela Produtos → Importar → "Fotos em lote" (pasta ou .zip)
// ou para o script enviar-fotos-seed.mjs. Uso: npm run gerar:fotos
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const saida = path.join(raiz, "seed", "fotos");
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

// --------------------------------------------------------------- lê os produtos do seed.sql
const sql = readFileSync(path.join(raiz, "supabase", "seed.sql"), "utf8");
const produtos = [...sql.matchAll(/seed_produto\('([^']+)', '([^']+)', '([^']+)',[\s\S]*?'(\[[\s\S]*?\])'\);/g)].map((m) => ({
  codigo: m[1],
  nome: m[2],
  categoria: m[3],
  cores: JSON.parse(m[4]),
}));

// --------------------------------------------------------------- cores
const hexRgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const rgbHex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const misturar = (h, alvo, t) => rgbHex(hexRgb(h).map((v, i) => v + (hexRgb(alvo)[i] - v) * t));
const claro = (h, t) => misturar(h, "#ffffff", t);
const escuro = (h, t) => misturar(h, "#000000", t);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// --------------------------------------------------------------- desenhos (viewBox 1600x1200, chão em y=980)
function geladeira(c, frenchDoor) {
  const corpo = `linearGradient id="inox" x1="0" x2="1"><stop offset="0" stop-color="${escuro(c, 0.12)}"/><stop offset="0.45" stop-color="${claro(c, 0.25)}"/><stop offset="1" stop-color="${escuro(c, 0.18)}"/></linearGradient`;
  const x = frenchDoor ? 520 : 590;
  const w = frenchDoor ? 560 : 420;
  const topo = 210;
  const alt = 770;
  const puxador = escuro(c, 0.45);
  const portas = frenchDoor
    ? `<rect x="${x + 14}" y="${topo + 14}" width="${w / 2 - 20}" height="470" rx="14" fill="url(#inox)" stroke="${escuro(c, 0.3)}" stroke-width="3"/>
       <rect x="${x + w / 2 + 6}" y="${topo + 14}" width="${w / 2 - 20}" height="470" rx="14" fill="url(#inox)" stroke="${escuro(c, 0.3)}" stroke-width="3"/>
       <rect x="${x + 14}" y="${topo + 498}" width="${w - 28}" height="${alt - 512}" rx="14" fill="url(#inox)" stroke="${escuro(c, 0.3)}" stroke-width="3"/>
       <rect x="${x + w / 2 - 30}" y="${topo + 120}" width="12" height="230" rx="6" fill="${puxador}"/>
       <rect x="${x + w / 2 + 18}" y="${topo + 120}" width="12" height="230" rx="6" fill="${puxador}"/>
       <rect x="${x + w / 2 - 110}" y="${topo + 530}" width="220" height="12" rx="6" fill="${puxador}"/>
       <rect x="${x + 70}" y="${topo + 90}" width="110" height="150" rx="10" fill="${escuro(c, 0.55)}" opacity="0.85"/>
       <rect x="${x + 92}" y="${topo + 112}" width="66" height="70" rx="6" fill="#9fd3ff" opacity="0.5"/>`
    : `<rect x="${x + 12}" y="${topo + 12}" width="${w - 24}" height="230" rx="14" fill="url(#inox)" stroke="${escuro(c, 0.3)}" stroke-width="3"/>
       <rect x="${x + 12}" y="${topo + 256}" width="${w - 24}" height="${alt - 268}" rx="14" fill="url(#inox)" stroke="${escuro(c, 0.3)}" stroke-width="3"/>
       <rect x="${x + 40}" y="${topo + 150}" width="12" height="80" rx="6" fill="${puxador}"/>
       <rect x="${x + 40}" y="${topo + 280}" width="12" height="190" rx="6" fill="${puxador}"/>
       <rect x="${x + w - 130}" y="${topo + 300}" width="80" height="34" rx="6" fill="${escuro(c, 0.6)}"/>
       <text x="${x + w - 90}" y="${topo + 324}" font-family="Arial" font-size="20" fill="#7fe0a0" text-anchor="middle">4°C</text>`;
  return {
    defs: `<${corpo}>`,
    corpo: `<ellipse cx="${x + w / 2}" cy="982" rx="${w * 0.62}" ry="26" fill="#000" opacity="0.18"/>
      <rect x="${x}" y="${topo}" width="${w}" height="${alt}" rx="26" fill="${escuro(c, 0.08)}"/>
      ${portas}
      <rect x="${x + 30}" y="${topo + alt - 6}" width="40" height="10" rx="4" fill="#333"/><rect x="${x + w - 70}" y="${topo + alt - 6}" width="40" height="10" rx="4" fill="#333"/>`,
  };
}

function cadeira(c) {
  const m = escuro(c, 0.25);
  return {
    defs: "",
    corpo: `<ellipse cx="800" cy="982" rx="260" ry="22" fill="#000" opacity="0.15"/>
      <rect x="640" y="300" width="320" height="300" rx="40" fill="${c}"/>
      <rect x="660" y="320" width="280" height="40" rx="18" fill="${claro(c, 0.15)}"/>
      <rect x="610" y="600" width="380" height="70" rx="24" fill="${claro(c, 0.08)}"/>
      <rect x="640" y="670" width="26" height="310" rx="10" fill="${m}"/>
      <rect x="934" y="670" width="26" height="310" rx="10" fill="${m}"/>
      <rect x="700" y="660" width="20" height="300" rx="8" fill="${escuro(c, 0.4)}"/>
      <rect x="880" y="660" width="20" height="300" rx="8" fill="${escuro(c, 0.4)}"/>`,
  };
}

function sofa(c, poltrona) {
  const w = poltrona ? 480 : 1100;
  const x = 800 - w / 2;
  return {
    defs: "",
    corpo: `<ellipse cx="800" cy="982" rx="${w * 0.58}" ry="26" fill="#000" opacity="0.16"/>
      <rect x="${x + 40}" y="430" width="${w - 80}" height="300" rx="50" fill="${escuro(c, 0.06)}"/>
      ${poltrona ? `<rect x="${x + 70}" y="610" width="${w - 140}" height="150" rx="36" fill="${claro(c, 0.1)}"/>` : [0, 1, 2].map((i) => `<rect x="${x + 90 + i * ((w - 180) / 3)}" y="610" width="${(w - 180) / 3 - 12}" height="150" rx="36" fill="${claro(c, 0.1)}"/>`).join("")}
      ${poltrona ? "" : [0, 1, 2].map((i) => `<rect x="${x + 100 + i * ((w - 200) / 3)}" y="470" width="${(w - 200) / 3 - 20}" height="160" rx="40" fill="${claro(c, 0.14)}"/>`).join("")}
      <rect x="${x}" y="560" width="110" height="300" rx="44" fill="${c}"/>
      <rect x="${x + w - 110}" y="560" width="110" height="300" rx="44" fill="${c}"/>
      <rect x="${x + 60}" y="740" width="${w - 120}" height="120" rx="30" fill="${c}"/>
      <rect x="${x + 90}" y="860" width="22" height="120" rx="8" fill="#5b4632"/>
      <rect x="${x + w - 112}" y="860" width="22" height="120" rx="8" fill="#5b4632"/>`,
  };
}

function movel(c, tipo) {
  // armário genérico: guarda-roupa, rack, cômoda, buffet, estante, painel
  const cfg = {
    alto: { x: 420, y: 160, w: 760, h: 820, portas: 4, gavetas: 0 },
    baixo: { x: 340, y: 690, w: 920, h: 250, portas: 2, gavetas: 0, pes: true },
    comoda: { x: 600, y: 420, w: 400, h: 540, portas: 0, gavetas: 5, pes: true },
    buffet: { x: 420, y: 560, w: 760, h: 360, portas: 4, gavetas: 0, pes: true },
    estante: { x: 560, y: 180, w: 480, h: 800, portas: 0, gavetas: 0, prateleiras: 5 },
  }[tipo];
  const { x, y, w, h } = cfg;
  let interno = "";
  if (cfg.portas) {
    const pw = (w - 40) / cfg.portas;
    for (let i = 0; i < cfg.portas; i++) {
      interno += `<rect x="${x + 20 + i * pw + 4}" y="${y + 20}" width="${pw - 8}" height="${h - 40}" rx="8" fill="${claro(c, 0.06 + (i % 2) * 0.04)}" stroke="${escuro(c, 0.18)}" stroke-width="2"/>`;
      interno += `<rect x="${x + 20 + i * pw + (i % 2 ? 18 : pw - 30)}" y="${y + h / 2 - 40}" width="8" height="80" rx="4" fill="${escuro(c, 0.5)}"/>`;
    }
  }
  if (cfg.gavetas) {
    const gh = (h - 40) / cfg.gavetas;
    for (let i = 0; i < cfg.gavetas; i++) {
      interno += `<rect x="${x + 20}" y="${y + 20 + i * gh + 4}" width="${w - 40}" height="${gh - 8}" rx="8" fill="${claro(c, 0.06)}" stroke="${escuro(c, 0.18)}" stroke-width="2"/>`;
      interno += `<rect x="${x + w / 2 - 50}" y="${y + 20 + i * gh + gh / 2 - 4}" width="100" height="8" rx="4" fill="${escuro(c, 0.5)}"/>`;
    }
  }
  if (cfg.prateleiras) {
    for (let i = 1; i < cfg.prateleiras; i++) interno += `<rect x="${x + 10}" y="${y + (i * h) / cfg.prateleiras}" width="${w - 20}" height="16" fill="${claro(c, 0.15)}"/>`;
    interno += `<rect x="${x + 60}" y="${y + h / 5 - 110}" width="40" height="110" fill="#8a5a3c"/><rect x="${x + 104}" y="${y + h / 5 - 90}" width="34" height="90" fill="#3f5b6b"/><circle cx="${x + w - 110}" cy="${y + (2 * h) / 5 - 50}" r="44" fill="#9aa88a"/>`;
  }
  return {
    defs: "",
    corpo: `<ellipse cx="${x + w / 2}" cy="982" rx="${w * 0.6}" ry="22" fill="#000" opacity="0.15"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${c}"/>${interno}
      ${cfg.pes ? `<rect x="${x + 30}" y="${y + h}" width="20" height="${980 - y - h}" fill="#3a3029"/><rect x="${x + w - 50}" y="${y + h}" width="20" height="${980 - y - h}" fill="#3a3029"/>` : ""}
      ${tipo === "baixo" ? `<rect x="${x + 110}" y="${y - 400}" width="${w - 220}" height="360" rx="10" fill="#1c1c1c"/><rect x="${x + 124}" y="${y - 386}" width="${w - 248}" height="332" rx="6" fill="#2d3b48"/>` : ""}`,
  };
}

function mesa(c) {
  return {
    defs: "",
    corpo: `<ellipse cx="800" cy="982" rx="520" ry="24" fill="#000" opacity="0.15"/>
      <rect x="330" y="560" width="940" height="44" rx="14" fill="${claro(c, 0.1)}"/>
      <rect x="330" y="560" width="940" height="16" rx="8" fill="#ffffff" opacity="0.35"/>
      <path d="M420 604 L470 980 L500 980 L470 604 Z" fill="${escuro(c, 0.2)}"/>
      <path d="M1180 604 L1130 980 L1100 980 L1130 604 Z" fill="${escuro(c, 0.2)}"/>
      <rect x="760" y="470" width="60" height="90" rx="12" fill="#e9e4dc"/><circle cx="790" cy="440" r="42" fill="#7d9a6a"/>`,
  };
}

function cama(c, colchao) {
  return {
    defs: "",
    corpo: `<ellipse cx="800" cy="982" rx="620" ry="26" fill="#000" opacity="0.15"/>
      ${colchao ? "" : `<rect x="300" y="330" width="1000" height="420" rx="40" fill="${c}"/>`}
      <rect x="240" y="${colchao ? 700 : 690}" width="1120" height="${colchao ? 200 : 150}" rx="40" fill="${colchao ? "#f4f1ea" : "#f2efe8"}" stroke="#ddd6cb" stroke-width="4"/>
      ${colchao ? `<rect x="240" y="700" width="1120" height="40" rx="20" fill="${c}" opacity="0.5"/>` : `<rect x="380" y="620" width="300" height="110" rx="40" fill="#fbfaf7"/><rect x="920" y="620" width="300" height="110" rx="40" fill="#fbfaf7"/>`}
      <rect x="260" y="${colchao ? 900 : 840}" width="1080" height="${colchao ? 60 : 110}" rx="16" fill="${colchao ? "#d9d2c6" : escuro(c, 0.1)}"/>`,
  };
}

function desenho(p, hex) {
  const cat = p.categoria.toLowerCase();
  const nome = p.nome.toLowerCase();
  if (cat.includes("eletro")) return geladeira(hex, nome.includes("french"));
  if (cat.includes("cadeira") || cat.includes("banqueta")) return cadeira(hex);
  if (cat.includes("poltrona")) return sofa(hex, true);
  if (cat.includes("sof")) return sofa(hex, false);
  if (cat.includes("guarda")) return movel(hex, "alto");
  if (cat.includes("rack") || cat.includes("painé") || cat.includes("paine")) return movel(hex, "baixo");
  if (cat.includes("cômoda") || cat.includes("comoda")) return movel(hex, "comoda");
  if (cat.includes("buffet")) return movel(hex, "buffet");
  if (cat.includes("estante")) return movel(hex, "estante");
  if (cat.includes("mesa") || cat.includes("escrit")) return mesa(hex);
  if (cat.includes("colch")) return cama(hex, true);
  if (cat.includes("cama")) return cama(hex, false);
  return movel(hex, "buffet");
}

function svg(p, cor, n) {
  const d = desenho(p, cor.hex);
  const ambiente = n === 2;
  const fundo = ambiente
    ? `<rect width="1600" height="980" fill="#e9e2d6"/><rect y="980" width="1600" height="220" fill="#c9b79c"/>
       <rect x="1290" y="300" width="180" height="250" fill="#f6f2ea" stroke="#d2c6b3" stroke-width="6"/><rect x="1310" y="320" width="140" height="210" fill="#b7c4b0"/>
       <circle cx="190" cy="760" r="110" fill="#7f9a6c"/><rect x="150" y="800" width="80" height="180" rx="12" fill="#d8cfc0"/>`
    : `<radialGradient id="estudio" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8e3db"/></radialGradient>
       <rect width="1600" height="1200" fill="url(#estudio)"/>`;
  const zoom = n === 3 ? `transform="translate(-560 -260) scale(1.7)"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
    <defs>${d.defs}${ambiente ? "" : '<radialGradient id="estudio" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8e3db"/></radialGradient>'}</defs>
    ${ambiente ? fundo : '<rect width="1600" height="1200" fill="url(#estudio)"/>'}
    <g ${zoom}>${d.corpo}</g>
    <text x="48" y="1160" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#6b655d" opacity="0.8">IMAGEM ILUSTRATIVA · ${esc(p.nome)} · ${esc(cor.nome)}</text>
  </svg>`;
}

let total = 0;
for (const p of produtos) {
  for (const cor of p.cores) {
    const fotos = p.categoria.toLowerCase().includes("eletro") ? 3 : 2;
    for (let n = 1; n <= fotos; n++) {
      const arquivo = `${p.codigo}_${cor.nome}_${n}.jpg`;
      await sharp(Buffer.from(svg(p, cor, n))).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(saida, arquivo));
      total++;
    }
  }
}
console.log(`${total} fotos fictícias geradas em seed/fotos (${produtos.length} produtos)`);
