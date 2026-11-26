import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { opcoesCookieSessao } from "./cookies";

/**
 * Renova a sessão no middleware lendo os cookies por `req.cookies` (NextRequest).
 * Não usa `cookies()` do next/headers aqui (regra de compatibilidade com o Workers).
 */
export async function atualizarSessao(req: NextRequest) {
  let resposta = NextResponse.next({ request: req });
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_ANON_KEY;
  if (!url || !chave) return { resposta, logado: false };

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista, cabecalhos) => {
        for (const { name, value } of lista) req.cookies.set(name, value);
        resposta = NextResponse.next({ request: req });
        for (const { name, value, options } of lista) {
          resposta.cookies.set(name, value, { ...options, ...opcoesCookieSessao });
        }
        if (cabecalhos) {
          for (const [k, v] of Object.entries(cabecalhos)) resposta.headers.set(k, String(v));
        }
      },
    },
  });

  // getClaims valida a assinatura do JWT (e renova o token se expirou).
  const { data, error } = await supabase.auth.getClaims();
  const logado = !error && Boolean(data?.claims?.sub);
  return { resposta, logado };
}
