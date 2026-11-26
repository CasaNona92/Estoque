import type { NextRequest } from "next/server";
import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { urlLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehUuid } from "@/lib/utils";

/** Itens de uma nota lançada, ou (?arquivo=1) a URL temporária do arquivo original. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    await autorizar("entrada");
    const { id } = await ctx.params;
    if (!ehUuid(id)) throw new ErroApp("Nota não encontrada.", 404);
    const supabase = await criarClienteServidor();

    if (req.nextUrl.searchParams.get("arquivo") === "1") {
      const { data } = await supabase.from("notas_entrada").select("chave_r2_arquivo").eq("id", id).maybeSingle();
      if (!data?.chave_r2_arquivo) throw new ErroApp("Arquivo não disponível.", 404);
      return { url: await urlLeitura(data.chave_r2_arquivo) };
    }

    const { data, error } = await supabase
      .from("nota_itens")
      .select(
        "n_item, codigo_fornecedor, ean, descricao, unidade, quantidade_nota, fator_conversao, quantidade_entrada, status, cor:produto_cores(nome_cor, cor_hex, produto:produtos(id, nome))",
      )
      .eq("nota_id", id)
      .order("n_item");
    if (error) throw error;
    return { itens: data ?? [] };
  });
}
