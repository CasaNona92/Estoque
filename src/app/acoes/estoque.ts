"use server";

import { autorizar } from "@/lib/auth";
import { executar } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validar } from "@/lib/validar";
import { esquemaAjuste, esquemaBaixa, esquemaEntradaManual, uuid } from "@/lib/validacao";

type RespostaEstoque = { movimentacao_id: string | null; estoque: number };

export async function registrarBaixa(dados: unknown) {
  return executar(async () => {
    await autorizar("usuario");
    const d = validar(esquemaBaixa, dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("registrar_baixa", {
      p_cor_id: d.corId,
      p_quantidade: d.quantidade,
      p_cliente_nome: d.cliente,
      p_observacao: d.observacao,
    });
    if (error) throw error;
    return data as RespostaEstoque;
  });
}

export async function desfazerBaixa(movimentacaoId: unknown) {
  return executar(async () => {
    await autorizar("usuario");
    const id = validar(uuid, movimentacaoId);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("desfazer_baixa", { p_movimentacao_id: id });
    if (error) throw error;
    return data as RespostaEstoque;
  });
}

export async function registrarEntradaManual(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaEntradaManual, dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("registrar_entrada_manual", {
      p_cor_id: d.corId,
      p_quantidade: d.quantidade,
      p_observacao: d.observacao,
    });
    if (error) throw error;
    return data as RespostaEstoque;
  });
}

export async function ajustarEstoque(dados: unknown) {
  return executar(async () => {
    await autorizar("admin");
    const d = validar(esquemaAjuste, dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("ajustar_estoque", {
      p_cor_id: d.corId,
      p_novo_estoque: d.novoEstoque,
      p_motivo: d.motivo,
    });
    if (error) throw error;
    return data as RespostaEstoque;
  });
}
