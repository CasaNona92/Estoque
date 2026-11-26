import type { z } from "zod";
import { ErroApp } from "@/lib/erros";
import { primeiraMensagem } from "@/lib/validacao";

/** Valida no servidor; erro vira mensagem amigável. Nunca confia no que veio do navegador. */
export function validar<S extends z.ZodType>(esquema: S, dados: unknown): z.output<S> {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroApp(primeiraMensagem(r.error));
  return r.data;
}
