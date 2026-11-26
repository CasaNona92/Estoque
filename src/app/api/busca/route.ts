import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { buscarProdutos } from "@/lib/dados/produtos";

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("usuario");
    const termo = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const limite = inteiro(req.nextUrl.searchParams.get("limite"), 8, 1, 50);
    if (!termo) return { resultados: [], sugestao: null, expira: Date.now() };
    const r = await buscarProdutos(termo, limite);
    // Modo Cliente: só nomes e fotos (sem estoque)
    if (req.nextUrl.searchParams.get("publico") === "1") {
      return {
        ...r,
        resultados: r.resultados.map((p) => ({
          ...p,
          estoque_total: 0,
          estoque_minimo: 0,
          cores: p.cores.map((c) => ({ ...c, estoque: 0, codigo_barras: null })),
        })),
      };
    }
    return r;
  });
}
