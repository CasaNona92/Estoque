// Gera seed/modelo-importacao.xlsx (mesmo modelo do botão "Baixar modelo" da tela).
// Uso: node scripts/gerar-modelo-xlsx.mjs
import * as fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);
const RAIZ = path.resolve(import.meta.dirname, "..");

const colunas = ["codigo", "nome", "categoria", "descricao", "cor", "cor_hex", "codigo_barras", "estoque", "estoque_minimo", "especificacoes"];
const linhas = [
  ["MV-0100", "Cadeira Exemplo", "Cadeiras", "Cadeira de madeira com assento estofado.", "Natural", "#C8A27A", "2000000005017", 10, 4, "Altura: 92 cm; Material: Madeira maciça"],
  ["MV-0100", "Cadeira Exemplo", "Cadeiras", "", "Preto", "#2B2A28", "2000000005024", 5, 4, ""],
  ["MV-0101", "Rack Exemplo", "Racks", "Rack com 2 portas.", "Padrão", "#B08B62", "", 3, 1, "Largura: 180 cm; Material: MDF"],
];
const ws = XLSX.utils.aoa_to_sheet([colunas, ...linhas]);
ws["!cols"] = colunas.map((c) => ({ wch: c === "descricao" || c === "especificacoes" ? 40 : c === "nome" ? 28 : 16 }));
const instrucoes = XLSX.utils.aoa_to_sheet([
  ["Como preencher"],
  ['• Uma linha por produto + cor. Produto sem variação: use a cor "Padrão".'],
  ["• codigo: obrigatório (ex.: MV-0012). Se já existir, o produto é atualizado."],
  ["• cor_hex: cor no formato #RRGGBB (ex.: #B5835A)."],
  ["• codigo_barras: 8 a 14 dígitos (EAN/GTIN). Formate a coluna como Texto para não perder zeros."],
  ["• estoque: só vale para cores NOVAS (estoque inicial). A planilha nunca altera o estoque de cores que já existem."],
  ['• especificacoes: "Chave: valor; Chave: valor" (ex.: Largura: 180 cm; Material: MDF).'],
]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Produtos");
XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções");
fs.mkdirSync(path.join(RAIZ, "seed"), { recursive: true });
XLSX.writeFile(wb, path.join(RAIZ, "seed", "modelo-importacao.xlsx"));
console.log("seed/modelo-importacao.xlsx gerado");
