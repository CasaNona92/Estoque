import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Movimentacao, TipoMovimentacao } from "@/lib/tipos";

const SELECT =
  "id, tipo, quantidade, estoque_antes, estoque_depois, cliente_nome, observacao, criado_em, nota_id, produto:produtos(id, nome, codigo), cor:produto_cores(id, nome_cor, cor_hex), usuario:perfis(nome)";

export interface FiltrosMov {
  produtoId?: string | null;
  tipo?: TipoMovimentacao | null;
  de?: string | null; // aaaa-mm-dd
  ate?: string | null;
  pagina?: number;
  porPagina?: number;
}

export async function listarMovimentacoes(f: FiltrosMov = {}) {
  const supabase = await criarClienteServidor();
  const porPagina = Math.min(Math.max(f.porPagina ?? 50, 1), 200);
  const pagina = Math.max(f.pagina ?? 0, 0);
  let q = supabase
    .from("movimentacoes")
    .select(SELECT, { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(pagina * porPagina, pagina * porPagina + porPagina - 1);
  if (f.produtoId) q = q.eq("produto_id", f.produtoId);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.de) q = q.gte("criado_em", `${f.de}T00:00:00-03:00`);
  if (f.ate) q = q.lte("criado_em", `${f.ate}T23:59:59-03:00`);
  const { data, error, count } = await q;
  if (error) throw error;
  return { movimentacoes: (data ?? []) as unknown as Movimentacao[], total: count ?? 0, pagina, porPagina };
}
