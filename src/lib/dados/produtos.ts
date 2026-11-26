import "server-only";
import { assinarVarias, expiracaoLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { CorCompleta, FotoCompleta, ProdutoCompleto, ProdutoResumo, RespostaBusca } from "@/lib/tipos";

type LinhaResumo = Omit<ProdutoResumo, "fotos"> & {
  fotos: Array<{ id: string; cor_id: string | null; chave_thumb: string }>;
};

/** Assina as miniaturas (cálculo local) e devolve no formato da tela. */
async function comUrls(linhas: LinhaResumo[], fotosPorProduto = 8): Promise<ProdutoResumo[]> {
  const chaves = linhas.flatMap((l) => l.fotos.slice(0, fotosPorProduto).map((f) => f.chave_thumb));
  const urls = await assinarVarias(chaves);
  return linhas.map((l) => ({
    ...l,
    fotos: l.fotos
      .slice(0, fotosPorProduto)
      .map((f) => ({ ...f, url: urls[f.chave_thumb] }))
      .filter((f) => f.url),
  }));
}

export async function buscarProdutos(termo: string, limite = 8): Promise<RespostaBusca> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar_produtos", { termo, limite });
  if (error) throw error;
  const linhas = (data ?? []) as LinhaResumo[];
  let sugestao: string | null = null;
  if (linhas.length === 0 || (linhas[0]?.relevancia ?? 0) >= 4) {
    const { data: s } = await supabase.rpc("sugestao_busca", { termo });
    sugestao = (s as string | null) ?? null;
  }
  return { resultados: await comUrls(linhas, 6), sugestao, expira: expiracaoLeitura() };
}

export interface FiltrosLista {
  categoria?: string | null;
  cor?: string | null;
  filtro?: "sem_estoque" | "abaixo_minimo" | null;
  offset?: number;
  limite?: number;
}

export async function listarProdutos(f: FiltrosLista) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("listar_produtos", {
    p_categoria: f.categoria ?? null,
    p_cor: f.cor ?? null,
    p_filtro: f.filtro ?? null,
    p_offset: f.offset ?? 0,
    p_limite: f.limite ?? 30,
  });
  if (error) throw error;
  return { produtos: await comUrls((data ?? []) as LinhaResumo[], 5), expira: expiracaoLeitura() };
}

export async function opcoesFiltro() {
  const supabase = await criarClienteServidor();
  const [cat, cores] = await Promise.all([supabase.rpc("categorias_produtos"), supabase.rpc("nomes_cores")]);
  return {
    categorias: ((cat.data ?? []) as Array<{ categoria: string }>).map((c) => c.categoria),
    cores: (cores.data ?? []) as Array<{ nome_cor: string; cor_hex: string }>,
  };
}

export async function obterProduto(id: string): Promise<ProdutoCompleto | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("produtos")
    .select(
      "id, codigo, nome, categoria, descricao, especificacoes, estoque_minimo, produto_cores(id, nome_cor, cor_hex, codigo_barras, estoque, ordem), produto_fotos(id, cor_id, chave_r2, chave_r2_thumb, ordem)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const cores = ((data.produto_cores ?? []) as CorCompleta[]).sort((a, b) => a.ordem - b.ordem);
  const fotosBrutas = ((data.produto_fotos ?? []) as Omit<FotoCompleta, "url" | "urlThumb">[]).sort(
    (a, b) => a.ordem - b.ordem,
  );
  const urls = await assinarVarias(fotosBrutas.flatMap((f) => [f.chave_r2, f.chave_r2_thumb]));
  return {
    id: data.id,
    codigo: data.codigo,
    nome: data.nome,
    categoria: data.categoria,
    descricao: data.descricao,
    especificacoes: (data.especificacoes ?? {}) as Record<string, string>,
    estoque_minimo: data.estoque_minimo,
    cores,
    fotos: fotosBrutas.map((f) => ({ ...f, url: urls[f.chave_r2], urlThumb: urls[f.chave_r2_thumb] })),
    expira: expiracaoLeitura(),
  };
}

export async function maisVendidos(dias: number) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("mais_vendidos", { dias, limite: 10 });
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ produto_id: string; codigo: string; nome: string; quantidade: number; foto_thumb: string | null }>;
  const urls = await assinarVarias(linhas.map((l) => l.foto_thumb ?? "").filter(Boolean));
  return linhas.map((l) => ({ ...l, quantidade: Number(l.quantidade), foto: l.foto_thumb ? urls[l.foto_thumb] : null }));
}

export async function ultimasBaixas() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("ultimas_baixas", { limite: 10 });
  if (error) throw error;
  return (data ?? []) as Array<{
    movimentacao_id: string;
    produto_id: string;
    produto_nome: string;
    cor_id: string;
    nome_cor: string;
    cor_hex: string;
    quantidade: number;
    cliente_nome: string | null;
    criado_em: string;
    usuario_nome: string | null;
    desfeita: boolean;
  }>;
}
