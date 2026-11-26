/**
 * Detecta o tipo REAL do arquivo pelos primeiros bytes (magic bytes), sem confiar
 * na extensão nem no MIME informado pelo navegador. SVG é sempre recusado.
 */
export type TipoArquivo = "webp" | "jpeg" | "png" | "heic" | "pdf" | "xml" | "zip" | "svg" | "desconhecido";

function texto(b: Uint8Array, ini: number, fim: number) {
  return String.fromCharCode(...b.slice(ini, fim));
}

export function detectarTipo(b: Uint8Array): TipoArquivo {
  if (b.length >= 12 && texto(b, 0, 4) === "RIFF" && texto(b, 8, 12) === "WEBP") return "webp";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && texto(b, 1, 4) === "PNG") return "png";
  if (b.length >= 12 && texto(b, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(texto(b, 8, 12))) return "heic";
  if (b.length >= 5 && texto(b, 0, 5) === "%PDF-") return "pdf";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "zip";

  // texto: pula BOM UTF-8 e espaços
  let i = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) i++;
  if (b[i] === 0x3c /* < */) {
    const resto = texto(b, i, Math.min(b.length, i + 512)).toLowerCase();
    if (resto.includes("<svg")) return "svg";
    return "xml";
  }
  return "desconhecido";
}

export async function lerInicioArquivo(arquivo: Blob, bytes = 64): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.slice(0, bytes).arrayBuffer());
}

export const LIMITES = {
  fotoOriginal: 10 * 1024 * 1024, // 10 MB antes da compressão
  fotoComprimida: 600 * 1024, // teto depois da compressão (alvo: 100–250 KB)
  miniatura: 120 * 1024,
  nota: 5 * 1024 * 1024, // 5 MB por nota (XML/PDF)
  planilha: 5 * 1024 * 1024,
  zipFotos: 200 * 1024 * 1024,
};
