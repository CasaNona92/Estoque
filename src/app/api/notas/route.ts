import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("entrada");
    const porPagina = 30;
    const pagina = inteiro(req.nextUrl.searchParams.get("pagina"), 0, 0, 10000);
    const supabase = await criarClienteServidor();
    const { data, error, count } = await supabase
      .from("notas_entrada")
      .select(
        "id, chave_acesso, numero, serie, data_emissao, valor_total, origem, status, criado_em, confirmada_em, cancelada_em, motivo_cancelamento, fornecedor:fornecedores(cnpj, razao_social), usuario:perfis!notas_entrada_usuario_id_fkey(nome)",
        { count: "exact" },
      )
      .neq("status", "rascunho")
      .order("criado_em", { ascending: false })
      .range(pagina * porPagina, pagina * porPagina + porPagina - 1);
    if (error) throw error;
    return { notas: data ?? [], total: count ?? 0, pagina, porPagina };
  });
}
