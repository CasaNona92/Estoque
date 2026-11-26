import type { NextRequest } from "next/server";
import { inteiro, responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { listarProdutos } from "@/lib/dados/produtos";

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("usuario");
    const sp = req.nextUrl.searchParams;
    const filtro = sp.get("filtro");
    return listarProdutos({
      categoria: sp.get("categoria")?.slice(0, 80) || null,
      cor: sp.get("cor")?.slice(0, 60) || null,
      filtro: filtro === "sem_estoque" || filtro === "abaixo_minimo" ? filtro : null,
      offset: inteiro(sp.get("offset"), 0, 0, 100000),
      limite: inteiro(sp.get("limite"), 30, 1, 60),
    });
  });
}
