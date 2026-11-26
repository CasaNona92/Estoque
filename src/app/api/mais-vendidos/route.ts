import type { NextRequest } from "next/server";
import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { maisVendidos } from "@/lib/dados/produtos";

export async function GET(req: NextRequest) {
  return responder(async () => {
    await autorizar("usuario");
    const pedido = Number(req.nextUrl.searchParams.get("dias"));
    const dias = [7, 30, 90].includes(pedido) ? pedido : 30;
    return { itens: await maisVendidos(dias) };
  });
}
