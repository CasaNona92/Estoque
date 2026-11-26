import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { listarMovimentacoes } from "@/lib/dados/movimentacoes";
import type { TipoMovimentacao } from "@/lib/tipos";
import { ehUuid } from "@/lib/utils";

const TIPOS = ["entrada", "baixa", "ajuste", "estorno"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("usuario");
    const sp = req.nextUrl.searchParams;
    const produto = sp.get("produto");
    const tipo = sp.get("tipo");
    const de = sp.get("de");
    const ate = sp.get("ate");
    return listarMovimentacoes({
      produtoId: ehUuid(produto) ? produto : null,
      tipo: tipo && TIPOS.includes(tipo) ? (tipo as TipoMovimentacao) : null,
      de: de && DATA.test(de) ? de : null,
      ate: ate && DATA.test(ate) ? ate : null,
      pagina: inteiro(sp.get("pagina"), 0, 0, 10000),
      porPagina: inteiro(sp.get("porPagina"), 50, 1, 200),
    });
  });
}
