"use client";

import { detectarTipo, LIMITES, lerInicioArquivo } from "@/lib/magic-bytes";
import { esquemaLinhaImportacao, type LinhaImportacao } from "@/lib/validacao";

export const COLUNAS = [
  "codigo",
  "nome",
  "categoria",
  "descricao",
  "cor",
  "cor_hex",
  "codigo_barras",
  "estoque",
  "estoque_minimo",
  "especificacoes",
] as const;

const EXEMPLOS = [
  ["MV-0100", "Cadeira Exemplo", "Cadeiras", "Cadeira de madeira com assento estofado.", "Natural", "#C8A27A", "7890000000017", 10, 4, "Altura: 92 cm; Material: Madeira maciça"],
  ["MV-0100", "Cadeira Exemplo", "Cadeiras", "", "Preto", "#2B2A28", "7890000000024", 5, 4, ""],
  ["MV-0101", "Rack Exemplo", "Racks", "Rack com 2 portas.", "Padrão", "#B08B62", "", 3, 1, "Largura: 180 cm; Material: MDF"],
];

/** "Largura: 180 cm; Material: MDF" → { Largura: "180 cm", Material: "MDF" } */
export function lerEspecificacoes(texto: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const parte of String(texto ?? "").split(";")) {
    const i = parte.indexOf(":");
    if (i <= 0) continue;
    const k = parte.slice(0, i).trim().slice(0, 60);
    const v = parte.slice(i + 1).trim().slice(0, 200);
    if (k && v) r[k] = v;
  }
  return r;
}

const normalizarCabecalho = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Gera o modelo .xlsx no navegador (a biblioteca xlsx nunca vai para o servidor). */
export async function baixarModelo() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([[...COLUNAS], ...EXEMPLOS]);
  ws["!cols"] = COLUNAS.map((c) => ({ wch: c === "descricao" || c === "especificacoes" ? 40 : c === "nome" ? 28 : 16 }));
  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Como preencher"],
    ["• Uma linha por produto + cor. Produto sem variação: use a cor \"Padrão\"."],
    ["• codigo: obrigatório (ex.: MV-0012). Se já existir, o produto é atualizado."],
    ["• cor_hex: cor no formato #RRGGBB (ex.: #B5835A)."],
    ["• codigo_barras: 8 a 14 dígitos (EAN/GTIN). Formate a coluna como Texto para não perder zeros."],
    ["• estoque: só vale para cores NOVAS (estoque inicial). A planilha nunca altera o estoque de cores que já existem."],
    ["• especificacoes: \"Chave: valor; Chave: valor\" (ex.: Largura: 180 cm; Material: MDF)."],
  ]);
  ws["!cols"] = ws["!cols"];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções");
  XLSX.writeFile(wb, "modelo-importacao-produtos.xlsx");
}

export type LinhaLida = { linha: number; dados?: LinhaImportacao; erro?: string };

/** Lê .xlsx/.csv no navegador e valida cada linha (o servidor valida de novo). */
export async function lerPlanilha(arquivo: File): Promise<LinhaLida[]> {
  if (arquivo.size > LIMITES.planilha) throw new Error("A planilha pode ter no máximo 5 MB.");
  const tipo = detectarTipo(await lerInicioArquivo(arquivo));
  const csv = /\.csv$/i.test(arquivo.name);
  if (!csv && tipo !== "zip") throw new Error("Envie um arquivo .xlsx (ou .csv).");

  const XLSX = await import("xlsx");
  const dados = await arquivo.arrayBuffer();
  const wb = csv
    ? XLSX.read(new TextDecoder("utf-8").decode(dados), { type: "string", raw: true })
    : XLSX.read(dados, { type: "array", dense: true, cellHTML: false, cellFormula: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia.");
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false, blankrows: false });
  if (linhas.length > 5000) throw new Error("Máximo de 5.000 linhas por importação.");

  return linhas.map((bruta, i) => {
    const l: Record<string, string> = {};
    for (const [k, v] of Object.entries(bruta)) l[normalizarCabecalho(k)] = String(v ?? "").trim();
    const numero = (v: string) => (v === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
    const candidato = {
      linha: i + 2,
      codigo: l.codigo ?? "",
      nome: l.nome ?? "",
      categoria: l.categoria || null,
      descricao: l.descricao || null,
      cor: l.cor || null,
      cor_hex: l.cor_hex ? (l.cor_hex.startsWith("#") ? l.cor_hex : `#${l.cor_hex}`).toUpperCase() : null,
      codigo_barras: l.codigo_barras ? l.codigo_barras.replace(/\D/g, "") : null,
      estoque: numero(l.estoque ?? ""),
      estoque_minimo: numero(l.estoque_minimo ?? ""),
      especificacoes: lerEspecificacoes(l.especificacoes ?? ""),
    };
    const r = esquemaLinhaImportacao.safeParse(candidato);
    if (!r.success) {
      const issue = r.error.issues[0];
      return { linha: i + 2, erro: `${issue?.path.join(".") || "linha"}: ${issue?.message ?? "inválida"}` };
    }
    return { linha: i + 2, dados: r.data };
  });
}

/** CODIGO_COR_N.jpg → { codigo, cor, n } */
export function lerNomeFoto(nome: string): { codigo: string; cor: string; n: number } | null {
  const base = nome.split(/[\\/]/).pop() ?? nome;
  const m = base.match(/^(.+?)_(.+)_(\d{1,3})\.(jpe?g|png|webp|heic)$/i);
  if (!m) return null;
  return { codigo: m[1].trim().toUpperCase(), cor: m[2].replace(/_/g, " ").trim(), n: Number(m[3]) };
}

export const chaveCor = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
