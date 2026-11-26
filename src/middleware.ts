import { type NextRequest, NextResponse } from "next/server";
import { atualizarSessao } from "@/lib/supabase/middleware";

/**
 * Checagem "otimista" de sessão em todas as rotas. A autorização de verdade acontece
 * em cada página/Server Action/rota (obterSessao → meu_perfil) e na RLS do banco.
 *
 * Obs.: no Next 16 este arquivo se chama "proxy". Mantemos middleware.ts (runtime edge)
 * porque é o formato suportado oficialmente pelo @opennextjs/cloudflare; o mesmo
 * código roda na Vercel e no Cloudflare Workers.
 */
const PUBLICAS = ["/login", "/sair", "/primeiro-acesso"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const { resposta, logado } = await atualizarSessao(req);

  if (!logado && !publica) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { erro: "Não autenticado." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("voltar", pathname + search);
    return NextResponse.redirect(url);
  }

  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|icons/|marca/|manifest.webmanifest|sw.js|vendor/|robots.txt).*)",
  ],
};
