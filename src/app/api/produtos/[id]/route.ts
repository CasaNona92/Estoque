import type { NextRequest } from "next/server";
import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { obterProduto } from "@/lib/dados/produtos";
import { ErroApp } from "@/lib/erros";
import { ehUuid } from "@/lib/utils";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    await autorizar("usuario");
    const { id } = await ctx.params;
    if (!ehUuid(id)) throw new ErroApp("Produto não encontrado.", 404);
    const p = await obterProduto(id);
    if (!p) throw new ErroApp("Produto não encontrado.", 404);
    // Modo Cliente: sem estoque nem código de barras
    if (req.nextUrl.searchParams.get("publico") === "1") {
      return { ...p, estoque_minimo: 0, cores: p.cores.map((c) => ({ ...c, estoque: 0, codigo_barras: null })) };
    }
    return p;
  });
}
