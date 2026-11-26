"use client";

import { detectarTipo, LIMITES, lerInicioArquivo } from "@/lib/magic-bytes";

/**
 * Compressão MÁXIMA no navegador antes do upload (o Worker nunca processa imagem):
 *  - foto principal: WebP, lado maior até 1440 px, alvo ~120 KB (a qualidade desce
 *    sozinha até caber; nítida em tela cheia no tablet/PC);
 *  - miniatura: WebP 400 px, alvo ~30 KB (gerada do ORIGINAL, sem dupla compressão);
 *  - metadados (EXIF/GPS) removidos.
 * As fotos vão para o R2 — o banco guarda só o endereço. 10 GB ≈ 70 mil fotos.
 * A biblioteca é carregada sob demanda e o worker dela é servido do próprio site (/vendor).
 */
export const COMPRESSAO = {
  principal: { maxWidthOrHeight: 1440, maxSizeMB: 0.12, initialQuality: 0.72 },
  miniatura: { maxWidthOrHeight: 400, maxSizeMB: 0.03, initialQuality: 0.62 },
};

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
  const principal = await comprimir(entrada, { ...base, ...COMPRESSAO.principal, maxIteration: 12 });
  const miniatura = await comprimir(entrada, { ...base, ...COMPRESSAO.miniatura, maxIteration: 12 });

  // Alguns navegadores antigos não geram WebP (devolvem PNG): avisamos em vez de enviar errado.
  if (detectarTipo(await lerInicioArquivo(principal)) !== "webp" || detectarTipo(await lerInicioArquivo(miniatura)) !== "webp") {
    throw new Error("Este navegador não consegue gerar WebP. Use o Chrome ou o Edge atualizado.");
  }
  if (principal.size > LIMITES.fotoComprimida) throw new Error("Não foi possível reduzir esta foto o suficiente.");
  return { principal, miniatura };
}
