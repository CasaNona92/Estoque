"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth";
import { ErroApp, executar } from "@/lib/erros";
import { env } from "@/lib/env";
import { senhaVazada } from "@/lib/pwned";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validar } from "@/lib/validar";
import { esquemaConfiguracoes, esquemaEditarUsuario, esquemaNovoUsuario, esquemaSenha, uuid } from "@/lib/validacao";

async function auditar(adminId: string, acao: string, registro: string, depois?: Record<string, unknown>) {
  await criarClienteAdmin()
    .from("auditoria")
    .insert({ usuario_id: adminId, acao, tabela: "perfis", registro_id: registro, dados_depois: depois ?? null });
}

/** Só o admin cria contas (não existe cadastro público). */
export async function criarUsuario(dados: unknown) {
  return executar(async () => {
    const s = await autorizar("admin");
    const d = validar(esquemaNovoUsuario, dados);
    if (await senhaVazada(d.senha)) throw new ErroApp("Essa senha já apareceu em vazamentos de dados. Escolha outra.");

    const admin = criarClienteAdmin();
    const { data: existente } = await admin.from("perfis").select("id").eq("usuario", d.usuario).maybeSingle();
    if (existente) throw new ErroApp("Já existe alguém com esse usuário.");

    // funcionário sem e-mail: entra pelo usuário; o e-mail interno nunca recebe mensagens
    const email = d.email || `${d.usuario}@${env().DOMINIO_EMAIL_INTERNO}`;
    const { data: criado, error } = await admin.auth.admin.createUser({
      email,
      password: d.senha,
      email_confirm: true,
    });
    if (error || !criado.user) {
      throw new ErroApp(
        error?.code === "email_exists"
          ? "Já existe uma conta com esse e-mail."
          : error?.code === "email_address_invalid"
            ? "O Supabase recusou o e-mail interno. Informe um e-mail real para este funcionário."
            : "Não foi possível criar o usuário.",
      );
    }
    const { error: erroPerfil } = await admin.from("perfis").insert({
      id: criado.user.id,
      nome: d.nome,
      usuario: d.usuario,
      papel: d.papel,
      pode_dar_entrada: d.pode_dar_entrada,
      precisa_trocar_senha: true,
    });
    if (erroPerfil) {
      await admin.auth.admin.deleteUser(criado.user.id);
      throw erroPerfil;
    }
    await auditar(s.perfil.id, "criar_usuario", criado.user.id, { usuario: d.usuario, papel: d.papel });
    revalidatePath("/admin");
    return { id: criado.user.id };
  });
}

/** Papel, permissão de entrada e ativo ficam SÓ no banco (função com checagem de admin). */
export async function editarUsuario(dados: unknown) {
  return executar(async () => {
    const s = await autorizar("admin");
    const d = validar(esquemaEditarUsuario, dados);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("admin_atualizar_perfil", {
      p_id: d.id,
      p_nome: d.nome,
      p_papel: d.papel,
      p_pode_dar_entrada: d.pode_dar_entrada,
      p_ativo: d.ativo,
    });
    if (error) throw error;

    const admin = criarClienteAdmin();
    // Desativado não entra (ban no Auth) e as sessões caem na hora; reativado volta a poder entrar.
    await admin.auth.admin.updateUserById(d.id, { ban_duration: d.ativo ? "none" : "876000h" });
    if (!d.ativo) {
      await admin.rpc("revogar_sessoes", { p_user_id: d.id });
      await auditar(s.perfil.id, "desativar_usuario", d.id);
    }
    revalidatePath("/admin");
    return null;
  });
}

export async function redefinirSenha(dados: unknown) {
  return executar(async () => {
    const s = await autorizar("admin");
    const d = validar(z.object({ id: uuid, senha: esquemaSenha }), dados);
    if (await senhaVazada(d.senha)) throw new ErroApp("Essa senha já apareceu em vazamentos de dados. Escolha outra.");
    const admin = criarClienteAdmin();
    const { error } = await admin.auth.admin.updateUserById(d.id, { password: d.senha });
    if (error) throw new ErroApp("Não foi possível redefinir a senha.");
    await admin.from("perfis").update({ precisa_trocar_senha: true }).eq("id", d.id);
    await admin.rpc("revogar_sessoes", { p_user_id: d.id });
    await auditar(s.perfil.id, "redefinir_senha", d.id);
    return null;
  });
}

export async function salvarConfiguracoes(dados: unknown) {
  return executar(async () => {
    await autorizar("admin");
    const d = validar(esquemaConfiguracoes, dados);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("salvar_configuracoes", {
      p_exigir_pin: d.exigir_pin,
      p_pin: d.pin || null,
      p_estoque_minimo_padrao: d.estoque_minimo_padrao,
    });
    if (error) throw error;
    revalidatePath("/admin");
    return null;
  });
}
