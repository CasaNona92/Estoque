"use server";

import { autorizar } from "@/lib/auth";
import { executar } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validar } from "@/lib/validar";
import { esquemaLoteImportacao } from "@/lib/validacao";

export type ResultadoLinha = {
  linha: number;
  codigo: string;
  cor: string;
  produto: "criado" | "atualizado";
  acao_cor: "criada" | "atualizada";
  aviso: string | null;
};

/** Um lote (até 25 linhas) = uma chamada a importar_lote_produtos. Se falhar, só este lote volta. */
export async function importarLote(linhas: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const lote = validar(esquemaLoteImportacao, linhas);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("importar_lote_produtos", {
      p_linhas: lote.map((l) => ({ ...l, codigo_barras: l.codigo_barras?.replace(/\D/g, "") || null })),
    });
    if (error) throw error;
    return (data as { resultados: ResultadoLinha[] }).resultados;
  });
}
