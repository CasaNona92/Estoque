import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ErroApp } from "@/lib/erros";

export type Papel = "admin" | "vendedor";

export interface Perfil {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
  pode_dar_entrada: boolean;
  precisa_trocar_senha: boolean;
}

export interface Sessao {
  perfil: Perfil;
  admin: boolean;
  podeEntrada: boolean;
}

export type Nivel = "usuario" | "entrada" | "admin";

/**
 * Sessão validada no SERVIDOR: assinatura do JWT + perfil ativo + sessão ainda existente
 * (meu_perfil só devolve linha se usuario_ativo() for verdadeiro no banco).
 * Memorizada por requisição (React cache).
 */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await criarClienteServidor();
  const { data: claims, error: erroClaims } = await supabase.auth.getClaims();
  if (erroClaims || !claims?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("meu_perfil").maybeSingle<Perfil>();
  if (error || !data) return null;
  return {
    perfil: data,
    admin: data.papel === "admin",
    podeEntrada: data.papel === "admin" || data.pode_dar_entrada,
  };
});

function permitido(s: Sessao, nivel: Nivel) {
  if (nivel === "admin") return s.admin;
  if (nivel === "entrada") return s.podeEntrada;
  return true;
}

/** Para páginas: redireciona se não houver sessão/permissão. */
export async function exigirSessao(nivel: Nivel = "usuario", opcoes: { permitirTrocaPendente?: boolean } = {}) {
  const s = await obterSessao();
  if (!s) redirect("/sair?motivo=sessao");
  if (s.perfil.precisa_trocar_senha && !opcoes.permitirTrocaPendente) redirect("/trocar-senha");
  if (!permitido(s, nivel)) redirect("/sem-permissao");
  return s;
}

/** Para Server Actions e rotas de API: lança ErroApp (401/403) em vez de redirecionar. */
export async function autorizar(nivel: Nivel = "usuario"): Promise<Sessao> {
  const s = await obterSessao();
  if (!s) throw new ErroApp("Sua sessão terminou. Entre novamente.", 401);
  if (s.perfil.precisa_trocar_senha) throw new ErroApp("Troque sua senha antes de continuar.", 403);
  if (!permitido(s, nivel)) throw new ErroApp("Você não tem permissão para esta ação.", 403);
  return s;
}
