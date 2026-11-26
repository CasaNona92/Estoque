import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Lista de usuários — SÓ admin. Nunca devolve e-mails, hashes ou tokens
 * (o e-mail fica no auth.users e não é exposto em massa).
 */
export async function GET() {
  return responder(async () => {
    await autorizar("admin");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("perfis")
      .select("id, nome, usuario, papel, pode_dar_entrada, ativo, precisa_trocar_senha, criado_em")
      .order("nome");
    if (error) throw error;
    return { usuarios: data ?? [] };
  });
}
