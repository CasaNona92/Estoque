// Prepara o logo da Casa da Nona a partir do original em marca/ (PNG/WebP com fundo
// transparente — ou JPG com fundo branco, que é recortado automaticamente):
//  - limpa a "poeira" quase invisível do fundo e deixa o corpo do logo 100% opaco;
//  - recorta as sobras em volta;
//  - gera as versões usadas no site (public/marca) e os ícones do PWA.
// Uso: npm run preparar:logo
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const candidatos = ["logo-casa-da-nona.webp", "logo-casa-da-nona.png", "logo-casa-da-nona-original.jpg"];
const nome = candidatos.find((c) => existsSync(path.join(raiz, "marca", c)));
if (!nome) throw new Error("Coloque o logo em marca/logo-casa-da-nona.webp (ou .png)");
const original = path.join(raiz, "marca", nome);
const saida = path.join(raiz, "public", "marca");
mkdirSync(saida, { recursive: true });

const meta = await sharp(original).metadata();
let png;

if (meta.hasAlpha) {
  // ---- logo já transparente: limpa o alfa
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) data[i] = 0; // poeira do fundo
    else if (data[i] >= 240) data[i] = 255; // corpo do logo: opaco de verdade
  }
  png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 0 })
    .png()
    .toBuffer();
} else {
  // ---- JPG com fundo branco: recorta e deixa transparente só o branco de FORA
  const recortado = await sharp(original).trim({ background: "#ffffff", threshold: 18 }).toBuffer();
  const { data, info } = await sharp(recortado).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: L, height: A } = info;
  const claro = (i) => data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;
  const visto = new Uint8Array(L * A);
  const fila = [];
  for (let x = 0; x < L; x++) fila.push(x, (A - 1) * L + x);
  for (let y = 0; y < A; y++) fila.push(y * L, y * L + L - 1);
  while (fila.length) {
    const p = fila.pop();
    if (visto[p] || !claro(p * 4)) continue;
    visto[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % L;
    if (x > 0) fila.push(p - 1);
    if (x < L - 1) fila.push(p + 1);
    if (p >= L) fila.push(p - L);
    if (p < (A - 1) * L) fila.push(p + L);
  }
  png = await sharp(data, { raw: { width: L, height: A, channels: 4 } }).png().toBuffer();
}

const final = await sharp(png).metadata();

// versões do site
await sharp(png).resize({ width: 1200 }).webp({ quality: 90, alphaQuality: 100, smartSubsample: true }).toFile(path.join(saida, "logo.webp"));
await sharp(png).resize({ height: 96 }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(saida, "logo-cabecalho.webp"));

// ícones do PWA (logo centralizado num quadrado branco)
const icone = async (lado, margem, arquivo) => {
  const larg = Math.round(lado * (1 - 2 * margem));
  const logo = await sharp(png).resize({ width: larg }).toBuffer();
  const m = await sharp(logo).metadata();
  await sharp({ create: { width: lado, height: lado, channels: 4, background: "#ffffff" } })
    .composite([{ input: logo, left: Math.round((lado - larg) / 2), top: Math.round((lado - (m.height ?? 0)) / 2) }])
    .png()
    .toFile(arquivo);
};
mkdirSync(path.join(raiz, "public", "icons"), { recursive: true });
await icone(192, 0.04, path.join(raiz, "public", "icons", "icone-192.png"));
await icone(512, 0.04, path.join(raiz, "public", "icons", "icone-512.png"));
await icone(512, 0.14, path.join(raiz, "public", "icons", "icone-maskable-512.png"));
await icone(64, 0.02, path.join(raiz, "src", "app", "icon.png"));

console.log(`Logo ${nome}: ${final.width}x${final.height} (proporção ${(final.width / final.height).toFixed(3)}) → public/marca`);
