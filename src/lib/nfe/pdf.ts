"use client";

import { chaveNfeValida } from "./chave";
import { type ItemLido, limparTexto, lerNumero, type NotaLida } from "./tipos";

/**
 * Leitura APROXIMADA do DANFE em PDF, no navegador:
 *  1) pdfjs-dist extrai o texto (agrupado em linhas pela posição);
 *  2) se o PDF for escaneado (sem texto), OCR com tesseract.js em português;
 *  3) regex localizam chave, número, série, CNPJ, data, total e a tabela de itens.
 * O XML é sempre preferível — o resultado aqui precisa ser conferido pelo usuário.
 */

// biome-ignore lint/suspicious/noExplicitAny: tipos do pdfjs carregado dinamicamente
type PdfDoc = any;

export async function abrirPdf(arquivo: File): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  return pdfjs.getDocument({ data: dados, enableXfa: false }).promise;
}

async function textoDaPagina(doc: PdfDoc, n: number): Promise<string[]> {
  const pagina = await doc.getPage(n);
  const conteudo = await pagina.getTextContent();
  const linhas = new Map<number, Array<{ x: number; s: string }>>();
  for (const item of conteudo.items as Array<{ str: string; transform: number[] }>) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5] / 3) * 3; // tolerância de 3 pt
    const lista = linhas.get(y) ?? [];
    lista.push({ x: item.transform[4], s: item.str });
    linhas.set(y, lista);
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, itens]) =>
      itens
        .sort((a, b) => a.x - b.x)
        .map((i) => i.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
}

async function ocrDaPagina(doc: PdfDoc, n: number, aoProgresso?: (p: string) => void): Promise<string[]> {
  const pagina = await doc.getPage(n);
  const viewport = pagina.getViewport({ scale: 2.2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvas, viewport }).promise;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    workerPath: new URL("/vendor/tesseract/worker.min.js", window.location.href).href,
    logger: (m: { status: string; progress: number }) => aoProgresso?.(`OCR página ${n}: ${Math.round((m.progress ?? 0) * 100)}%`),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return String(data.text ?? "")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  } finally {
    await worker.terminate();
  }
}

const RE_ITEM =
  /^(?<cod>[A-Z0-9][\w./-]{0,59})\s+(?<desc>.+?)\s+(?<ncm>\d{8})\s+(?<cst>\d{3,4})\s+(?<cfop>\d{4})\s+(?<un>[A-Za-z]{1,6})\s+(?<qtd>\d{1,3}(?:\.\d{3})*,\d{2,4}|\d+(?:\.\d{1,4})?)\s+(?<vunit>\d{1,3}(?:\.\d{3})*,\d{2,10})\s+(?<vtot>\d{1,3}(?:\.\d{3})*,\d{2})/;

export function interpretarTextoDanfe(linhas: string[]): NotaLida {
  const texto = linhas.join("\n");
  const avisos = ["Leitura do PDF é aproximada: confira cada item. Prefira o XML sempre que tiver."];

  let chave: string | null = null;
  for (const m of texto.matchAll(/(?:\d[\s.]?){44}/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length === 44 && chaveNfeValida(d)) {
      chave = d;
      break;
    }
  }
  if (!chave) {
    // chave quebrada em várias linhas ("4126 1109 ..." / "1000 0009 ..."): junta os blocos de 4 dígitos em ordem
    const blocos = linhas.flatMap((l) => [...l.matchAll(/(?:\d{4} ){1,10}\d{4}/g)].map((m) => m[0].replace(/\D/g, "")));
    for (let i = 0; i < blocos.length && !chave; i++) {
      let acumulado = "";
      for (let j = i; j < blocos.length && acumulado.length < 44; j++) acumulado += blocos[j];
      if (acumulado.length === 44 && chaveNfeValida(acumulado)) chave = acumulado;
    }
  }
  if (!chave) avisos.push("Não encontrei uma chave de acesso válida (44 dígitos). Digite-a se souber.");

  const numero = texto.match(/N[º°o]\.?\s*:?\s*(\d{1,3}(?:\.\d{3}){0,3}|\d{1,9})/i)?.[1]?.replace(/\D/g, "") ?? null;
  const serie = texto.match(/S[ÉE]RIE\s*:?\s*(\d{1,3})/i)?.[1] ?? null;
  const cnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0]?.replace(/\D/g, "") ?? null;
  const dataBr =
    texto.match(/DATA\s+(?:DA\s+)?EMISS[ÃA]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1] ?? null;
  const data = dataBr ? `${dataBr.slice(6, 10)}-${dataBr.slice(3, 5)}-${dataBr.slice(0, 2)}` : null;
  const total = lerNumero(texto.match(/VALOR\s+TOTAL\s+DA\s+NOTA\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i)?.[1]);

  // razão social: primeiro nome com sufixo de empresa (o emitente vem antes do destinatário);
  // senão, a primeira linha com letras depois de "IDENTIFICAÇÃO DO EMITENTE"
  let razao: string | null = null;
  for (const l of linhas) {
    const m = l.match(/^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&/-]{6,}?\b(LTDA|S\/A|S\.A\.|EIRELI|ME|EPP)\b\.?/);
    if (m) {
      razao = m[0];
      break;
    }
  }
  if (!razao) {
    const iEmit = linhas.findIndex((l) => /IDENTIFICA[ÇC][ÃA]O\s+DO\s+EMITENTE/i.test(l));
    razao = linhas.slice(iEmit + 1).find((l) => /[A-Za-zÀ-ú]{3,}/.test(l)) ?? null;
  }

  const itens: ItemLido[] = [];
  for (const l of linhas) {
    const m = l.match(RE_ITEM);
    if (!m?.groups) continue;
    const g = m.groups;
    itens.push({
      n_item: itens.length + 1,
      codigo_fornecedor: limparTexto(g.cod, 60),
      ean: null,
      descricao: limparTexto(g.desc, 500),
      unidade: limparTexto(g.un, 10),
      quantidade: lerNumero(g.qtd) ?? 0,
      valor_unitario: lerNumero(g.vunit),
    });
  }
  if (!itens.length) avisos.push("Não consegui ler a tabela de itens. Adicione os itens manualmente.");

  return {
    origem: "pdf",
    chave_acesso: chave,
    numero,
    serie,
    data_emissao: data,
    valor_total: total,
    fornecedor: cnpj ? { cnpj, razao_social: razao ? limparTexto(razao, 200) : null, nome_fantasia: null } : null,
    itens,
    avisos,
  };
}

export async function lerDanfePdf(arquivo: File, aoProgresso?: (p: string) => void): Promise<{ nota: NotaLida; doc: PdfDoc; usouOcr: boolean }> {
  const doc = await abrirPdf(arquivo);
  const paginas = Math.min(doc.numPages, 10);
  let linhas: string[] = [];
  for (let n = 1; n <= paginas; n++) {
    aoProgresso?.(`Lendo página ${n} de ${paginas}…`);
    linhas = linhas.concat(await textoDaPagina(doc, n));
  }
  let usouOcr = false;
  if (linhas.join("").replace(/\s/g, "").length < 80) {
    // PDF escaneado: OCR em português
    usouOcr = true;
    linhas = [];
    for (let n = 1; n <= Math.min(paginas, 4); n++) linhas = linhas.concat(await ocrDaPagina(doc, n, aoProgresso));
  }
  const nota = interpretarTextoDanfe(linhas);
  if (usouOcr) nota.avisos.push("PDF escaneado: o texto foi lido por OCR e pode ter erros.");
  return { nota, doc, usouOcr };
}
