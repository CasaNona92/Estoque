import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { opcoesCookieSessao } from "./cookies";

/** Cliente Supabase com a sessão do usuário logado (RLS aplicada). */
export async function criarClienteServidor() {
  const loja = await cookies();
  const e = env();
  return createServerClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) {
            loja.set(name, value, { ...options, ...opcoesCookieSessao });
          }
        } catch {
          // Chamado de um Server Component (não pode gravar cookie). O middleware renova a sessão.
        }
      },
    },
  });
}
