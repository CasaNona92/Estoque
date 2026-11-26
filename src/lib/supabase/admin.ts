import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente com a service_role (ignora a RLS). Usado SÓ no servidor e só para:
 * login (usuário → e-mail, limite de tentativas), gestão de usuários e revogação de sessões.
 * Antes de usar, a rota/ação SEMPRE confere a sessão e o papel de quem pediu.
 */
export function criarClienteAdmin() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
