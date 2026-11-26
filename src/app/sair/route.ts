import { type NextRequest, NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Sai do sistema: encerra a sessão no Supabase e apaga os cookies.
 * POST = botão "Sair" do menu. GET = usado quando a sessão já não vale (ex.: senha trocada).
 */
async function sair(req: NextRequest, motivo: string) {
  try {
    const supabase = await criarClienteServidor();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // mesmo com erro, os cookies são apagados abaixo
  }
  const url = new URL("/login", req.url);
  url.searchParams.set("motivo", motivo);
  const resposta = NextResponse.redirect(url, { status: 303 });
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-")) resposta.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  resposta.headers.set("Cache-Control", "no-store");
  resposta.headers.set("Clear-Site-Data", '"cache"');
  return resposta;
}

export async function GET(req: NextRequest) {
  const pedido = req.nextUrl.searchParams.get("motivo");
  const motivo = pedido === "sessao" || pedido === "alterada" ? pedido : "saiu";
  return sair(req, motivo);
}

export async function POST(req: NextRequest) {
  return sair(req, "saiu");
}
