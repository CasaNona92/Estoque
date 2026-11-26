import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * "Exportar tudo agora" (admin). Devolve uma página de 1000 linhas por vez; o navegador
 * junta tudo e monta o .xlsx (a biblioteca xlsx nunca entra no Worker).
 */
const TABELAS = {
  produtos: { tabela: "produtos", campos: "codigo, nome, categoria, descricao, especificacoes, estoque_minimo, criado_em, atualizado_em", ordem: "codigo" },
  cores: { tabela: "produto_cores", campos: "nome_cor, cor_hex, codigo_barras, estoque, produto:produtos(codigo, nome)", ordem: "id" },
  movimentacoes: {
    tabela: "movimentacoes",
    campos: "criado_em, tipo, quantidade, estoque_antes, estoque_depois, cliente_nome, observacao, produto:produtos(codigo, nome), cor:produto_cores(nome_cor), usuario:perfis(nome)",
    ordem: "criado_em",
  },
} as const;

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("admin");
    const nome = req.nextUrl.searchParams.get("tabela") as keyof typeof TABELAS | null;
    const cfg = nome ? TABELAS[nome] : undefined;
    if (!cfg) throw new ErroApp("Tabela inválida.");
    const pagina = inteiro(req.nextUrl.searchParams.get("pagina"), 0, 0, 100000);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from(cfg.tabela)
      .select(cfg.campos)
      .order(cfg.ordem)
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) throw error;
    return { linhas: data ?? [], fim: (data?.length ?? 0) < 1000 };
  });
}
