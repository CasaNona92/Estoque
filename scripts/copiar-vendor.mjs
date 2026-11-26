// Copia para public/vendor os workers que rodam NO NAVEGADOR (servidos pelo próprio site,
// sem depender de CDN): pdf.js, compressão de imagens e o worker do OCR.
// Roda sozinho no "npm install" (postinstall).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const destino = path.join(raiz, "public", "vendor");
const arquivos = [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["node_modules/browser-image-compression/dist/browser-image-compression.js", "browser-image-compression.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],
];

for (const [origem, alvo] of arquivos) {
  const de = path.join(raiz, origem);
  const para = path.join(destino, alvo);
  if (!existsSync(de)) {
    console.warn(`[vendor] não encontrado: ${origem}`);
    continue;
  }
  mkdirSync(path.dirname(para), { recursive: true });
  copyFileSync(de, para);
}
console.log("[vendor] workers copiados para public/vendor");
