"use server";

import { cookies } from "next/headers";
import { autorizar } from "@/lib/auth";
import { executar } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export async function definirTema(tema: "claro" | "escuro") {
  const loja = await cookies();
  loja.set("tema", tema === "escuro" ? "escuro" : "claro", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Confere o PIN para sair do Modo Cliente (o hash nunca sai do banco). */
export async function verificarPin(pin: string) {
  return executar(async () => {
    await autorizar("usuario");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("verificar_pin_cliente", { p_pin: String(pin).slice(0, 8) });
    if (error) throw error;
    return Boolean(data);
  });
}
