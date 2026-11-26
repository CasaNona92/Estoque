import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehUuid } from "@/lib/utils";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("admin");
    const sp = req.nextUrl.searchParams;
    const porPagina = 50;
    const pagina = inteiro(sp.get("pagina"), 0, 0, 10000);
    const supabase = await criarClienteServidor();
    let q = supabase
      .from("auditoria")
      .select("id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois, criado_em", { count: "exact" })
      .order("criado_em", { ascending: false })
      .range(pagina * porPagina, pagina * porPagina + porPagina - 1);
    const usuario = sp.get("usuario");
    const tabela = sp.get("tabela");
    const acao = sp.get("acao");
    const de = sp.get("de");
    const ate = sp.get("ate");
    if (ehUuid(usuario)) q = q.eq("usuario_id", usuario);
    if (tabela && /^[a-z_]{2,40}$/.test(tabela)) q = q.eq("tabela", tabela);
    if (acao && /^[a-z_]{2,40}$/.test(acao)) q = q.eq("acao", acao);
    if (de && DATA.test(de)) q = q.gte("criado_em", `${de}T00:00:00-03:00`);
    if (ate && DATA.test(ate)) q = q.lte("criado_em", `${ate}T23:59:59-03:00`);
    const { data, error, count } = await q;
    if (error) throw error;
    return { registros: data ?? [], total: count ?? 0, pagina, porPagina };
  });
}
