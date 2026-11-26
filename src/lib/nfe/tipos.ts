export interface ItemLido {
  n_item: number;
  codigo_fornecedor: string | null;
  ean: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number | null;
}

export interface NotaLida {
  origem: "xml" | "pdf" | "manual";
  chave_acesso: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null; // aaaa-mm-dd
  valor_total: number | null;
  fornecedor: { cnpj: string; razao_social: string | null; nome_fantasia: string | null } | null;
  itens: ItemLido[];
  avisos: string[];
}

/** Texto extraído de arquivo é entrada do usuário: limpa caracteres de controle e limita o tamanho. */
export function limparTexto(v: unknown, max = 500): string {
  return String(v ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: remoção intencional de caracteres de controle
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "1.234,56" ou "1234.56" → 1234.56 */
export function lerNumero(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
