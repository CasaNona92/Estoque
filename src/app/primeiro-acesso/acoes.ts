"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { obterIp } from "@/lib/ip";
import { senhaVazada } from "@/lib/pwned";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { esquemaSenha, primeiraMensagem } from "@/lib/validacao";

export type EstadoInstalacao = { erro: string | null };

const esquema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome.").max(80),
    usuario: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,30}$/, "Usuário: 3 a 30 letras minúsculas, números, ponto, hífen ou _."),
    email: z.union([z.literal(""), z.email("E-mail inválido.").max(200)]),
    senha: esquemaSenha,
    confirmacao: z.string(),
    codigo: z.string().min(1, "Informe o código de instalação.").max(200),
  })
  .refine((d) => d.senha === d.confirmacao, { path: ["confirmacao"], message: "As senhas não conferem." });

/** Comparação em tempo constante (não revela quantos caracteres acertou). */
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

export async function instalar(_: EstadoInstalacao, fd: FormData): Promise<EstadoInstalacao> {
  const e = env();
  if (!e.CODIGO_INSTALACAO) return { erro: "Defina a variável CODIGO_INSTALACAO no servidor (veja o README)." };

  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { erro: primeiraMensagem(r.error) };
  const d = r.data;

  const admin = criarClienteAdmin();
  const ip = obterIp(await headers());
  const { data: bloqueado } = await admin.rpc("login_bloqueado", { p_usuario: "instalacao", p_ip: ip });
  if (bloqueado) return { erro: "Muitas tentativas. Aguarde 15 minutos." };

  if (!iguais(d.codigo.trim(), e.CODIGO_INSTALACAO)) {
    await admin.rpc("registrar_tentativa_login", { p_usuario: "instalacao", p_ip: ip, p_sucesso: false });
    return { erro: "Código de instalação incorreto." };
  }

  const { data: instalado } = await admin.rpc("sistema_instalado");
  if (instalado) redirect("/login");

  if (d.senha.toLowerCase().includes(d.usuario)) return { erro: "A senha não pode conter o seu usuário." };
  if (await senhaVazada(d.senha)) return { erro: "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra." };

  const email = d.email || `${d.usuario}@${e.DOMINIO_EMAIL_INTERNO}`;
  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: d.senha, email_confirm: true });
  if (error || !criado.user) {
    if (error?.code === "email_address_invalid") return { erro: "O Supabase recusou o e-mail interno. Informe um e-mail real." };
    if (error?.code === "email_exists") return { erro: "Já existe uma conta com esse e-mail." };
    return { erro: "Não foi possível criar o administrador. Tente de novo." };
  }

  const { error: erroPerfil } = await admin.rpc("instalar_primeiro_admin", {
    p_id: criado.user.id,
    p_nome: d.nome,
    p_usuario: d.usuario,
  });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { erro: erroPerfil.code === "EST04" ? erroPerfil.message : "Não foi possível concluir a instalação." };
  }
  await admin.rpc("registrar_tentativa_login", { p_usuario: "instalacao", p_ip: ip, p_sucesso: true });
  redirect("/login?motivo=instalado");
}
