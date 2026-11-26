"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obterIp } from "@/lib/ip";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { caminhoInternoSeguro } from "@/lib/utils";
import { esquemaLogin } from "@/lib/validacao";

export type EstadoLogin = { erro: string | null };

// Erro SEMPRE genérico: não revela se o usuário existe, se a senha está errada ou se está desativado.
const GENERICO = "Usuário ou senha inválidos.";

export async function entrar(_: EstadoLogin, fd: FormData): Promise<EstadoLogin> {
  const r = esquemaLogin.safeParse({
    identificador: fd.get("identificador"),
    senha: fd.get("senha"),
    voltar: fd.get("voltar") || undefined,
  });
  if (!r.success) return { erro: GENERICO };
  const { identificador, senha, voltar } = r.data;

  const ip = obterIp(await headers());
  const admin = criarClienteAdmin();

  // 5 falhas em 15 min por usuário OU por IP → bloqueio temporário (controle no Postgres)
  const { data: bloqueado, error: erroBloqueio } = await admin.rpc("login_bloqueado", {
    p_usuario: identificador,
    p_ip: ip,
  });
  if (erroBloqueio) return { erro: "Não foi possível entrar agora. Tente de novo em instantes." };
  if (bloqueado) return { erro: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };

  // usuário → e-mail acontece só aqui, no servidor
  let email: string | null = identificador.includes("@") ? identificador : null;
  if (!email) {
    const { data } = await admin.rpc("email_por_usuario", { p_usuario: identificador });
    email = (data as string | null) ?? null;
  }

  let destino: string | null = null;
  if (email) {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (!error && data.user) {
      const { data: perfil } = await supabase
        .rpc("meu_perfil")
        .maybeSingle<{ precisa_trocar_senha: boolean }>();
      if (perfil) {
        destino = perfil.precisa_trocar_senha ? "/trocar-senha" : caminhoInternoSeguro(voltar);
      } else {
        // desativado (ou sem perfil): derruba a sessão recém-criada
        await supabase.auth.signOut({ scope: "local" });
      }
    }
  }

  await admin.rpc("registrar_tentativa_login", { p_usuario: identificador, p_ip: ip, p_sucesso: Boolean(destino) });
  if (!destino) return { erro: GENERICO };
  redirect(destino);
}
