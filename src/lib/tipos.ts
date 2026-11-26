/** Tipos compartilhados entre servidor e navegador (formas devolvidas pelas rotas). */

export interface CorResumo {
  id: string;
  nome_cor: string;
  cor_hex: string;
  estoque: number;
  codigo_barras?: string | null;
}

export interface FotoResumo {
  id: string;
  cor_id: string | null;
  chave_thumb: string;
  /** URL pré-assinada (GET) da miniatura */
  url: string;
}

export interface ProdutoResumo {
  produto_id: string;
  cor_id?: string | null;
  codigo: string;
  nome: string;
  categoria: string;
  estoque_total: number;
  estoque_minimo: number;
  relevancia?: number;
  cores: CorResumo[];
  fotos: FotoResumo[];
}

export interface RespostaBusca {
  resultados: ProdutoResumo[];
  sugestao: string | null;
  /** até quando (epoch ms) as URLs das fotos valem */
  expira: number;
}

export interface FotoCompleta {
  id: string;
  cor_id: string | null;
  ordem: number;
  chave_r2: string;
  chave_r2_thumb: string;
  url: string;
  urlThumb: string;
}

export interface CorCompleta extends CorResumo {
  ordem: number;
  codigo_barras: string | null;
}

export interface ProdutoCompleto {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  descricao: string;
  especificacoes: Record<string, string>;
  estoque_minimo: number;
  cores: CorCompleta[];
  fotos: FotoCompleta[];
  expira: number;
}

export type TipoMovimentacao = "entrada" | "baixa" | "ajuste" | "estorno";

export interface Movimentacao {
  id: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  estoque_antes: number;
  estoque_depois: number;
  cliente_nome: string | null;
  observacao: string | null;
  criado_em: string;
  nota_id: string | null;
  produto: { id: string; nome: string; codigo: string } | null;
  cor: { id: string; nome_cor: string; cor_hex: string } | null;
  usuario: { nome: string } | null;
}

export type SituacaoEstoque = "ok" | "baixo" | "zerado";

export function situacaoEstoque(total: number, minimo: number): SituacaoEstoque {
  if (total <= 0) return "zerado";
  if (total < minimo) return "baixo";
  return "ok";
}
