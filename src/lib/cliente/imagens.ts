"use client";

import { detectarTipo, LIMITES, lerInicioArquivo } from "@/lib/magic-bytes";

/**
 * Compressão NO NAVEGADOR antes do upload (o Worker nunca processa imagem):
 *  - foto principal: WebP, lado maior até 1600 px, qualidade ~80, alvo 100–250 KB
 *  - miniatura: WebP 400 px
 * A biblioteca é carregada sob demanda (dynamic import) e o worker dela é servido
 * do próprio site (/vendor), sem CDN.
 */
export async function comprimirFoto(arquivo: File | Blob): Promise<{ principal: Blob; miniatura: Blob }> {
  if (arquivo.size > LIMITES.fotoOriginal) throw new Error("A foto pode ter no máximo 10 MB.");
  const tipo = detectarTipo(await lerInicioArquivo(arquivo));
  if (tipo === "svg") throw new Error("Imagens SVG não são aceitas.");
  if (!["jpeg", "png", "webp", "heic"].includes(tipo)) throw new Error("Formato não suportado. Use JPG, PNG, WebP ou HEIC.");

  const { default: comprimir } = await import("browser-image-compression");
  const base = {
    fileType: "image/webp",
    useWebWorker: true,
    libURL: "/vendor/browser-image-compression.js",
    preserveExif: false,
  };
  const entrada = arquivo instanceof File ? arquivo : new File([arquivo], "foto", { type: arquivo.type || "image/jpeg" });
  const principal = await comprimir(entrada, { ...base, maxWidthOrHeight: 1600, maxSizeMB: 0.24, initialQuality: 0.8 });
  const miniatura = await comprimir(principal, { ...base, maxWidthOrHeight: 400, maxSizeMB: 0.06, initialQuality: 0.78 });

  // Alguns navegadores antigos não geram WebP (devolvem PNG): avisamos em vez de enviar errado.
  if (detectarTipo(await lerInicioArquivo(principal)) !== "webp" || detectarTipo(await lerInicioArquivo(miniatura)) !== "webp") {
    throw new Error("Este navegador não consegue gerar WebP. Use o Chrome ou o Edge atualizado.");
  }
  if (principal.size > LIMITES.fotoComprimida) throw new Error("Não foi possível reduzir esta foto o suficiente.");
  return { principal, miniatura };
}
