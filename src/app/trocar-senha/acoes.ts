"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { env } from "@/lib/env";
import { senhaVazada } from "@/lib/pwned";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { esquemaTrocarSenha, primeiraMensagem } from "@/lib/validacao";

export type EstadoSenha = { erro: string | null };

export async function trocarSenha(_: EstadoSenha, fd: FormData): Promise<EstadoSenha> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/sair?motivo=sessao");

  const r = esquemaTrocarSenha.safeParse({ novaSenha: fd.get("novaSenha"), confirmacao: fd.get("confirmacao") });
  if (!r.success) return { erro: primeiraMensagem(r.error) };
  const atual = String(fd.get("senhaAtual") ?? "");
  const { novaSenha } = r.data;

  if (novaSenha.toLowerCase().includes(sessao.perfil.usuario.toLowerCase())) {
    return { erro: "A senha não pode conter o seu usuário." };
  }
  if (novaSenha === atual) return { erro: "A nova senha precisa ser diferente da atual." };
  if (await senhaVazada(novaSenha)) {
    return { erro: "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra." };
  }

  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  if (!email) redirect("/sair?motivo=sessao");

  // confere a senha atual com um cliente isolado (não mexe nos cookies)
  const e = env();
  const verificador = createClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: erroAtual } = await verificador.auth.signInWithPassword({ email, password: atual });
  if (erroAtual) return { erro: "A senha atual não confere." };

  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    if (error.code === "same_password") return { erro: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { erro: "Senha fraca. Use uma senha mais longa e variada." };
    return { erro: "Não foi possível trocar a senha. Tente de novo." };
  }

  const admin = criarClienteAdmin();
  await admin.from("perfis").update({ precisa_trocar_senha: false }).eq("id", sessao.perfil.id);
  await admin.from("auditoria").insert({
    usuario_id: sessao.perfil.id,
    acao: "trocar_senha",
    tabela: "perfis",
    registro_id: sessao.perfil.id,
  });
  // Derruba TODAS as sessões (inclusive esta e a do verificador): todo mundo entra de novo com a senha nova
  await admin.rpc("revogar_sessoes", { p_user_id: sessao.perfil.id });
  redirect("/sair?motivo=alterada");
}
