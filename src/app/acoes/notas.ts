"use server";

import { z } from "zod";
import { autorizar } from "@/lib/auth";
import { ErroApp, executar } from "@/lib/erros";
import { formatarData } from "@/lib/formatacao";
import { detectarTipo } from "@/lib/magic-bytes";
import { lerInicio, urlUpload } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validar } from "@/lib/validar";
import {
  esquemaCabecalhoNota,
  esquemaLoteItens,
  esquemaPedidoUploadNota,
  TAMANHO_LOTE,
  uuid,
} from "@/lib/validacao";

/** Logo depois de ler o arquivo: avisa se a nota já deu entrada. */
export async function consultarNota(chave: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const c = validar(z.string().regex(/^\d{44}$/), chave);
    const supabase = await criarClienteServidor();
    const { data } = await supabase
      .from("notas_entrada")
      .select("id, status, confirmada_em, usuario:perfis!notas_entrada_usuario_id_fkey(nome)")
      .eq("chave_acesso", c)
      .eq("status", "confirmada")
      .maybeSingle();
    if (!data) return { duplicada: false as const };
    const usuario = data.usuario as unknown as { nome: string } | null;
    return {
      duplicada: true as const,
      mensagem: `Esta nota já deu entrada em ${formatarData(data.confirmada_em)} por ${usuario?.nome ?? "usuário removido"}.`,
    };
  });
}

const esquemaResolver = z.object({
  cnpj: z.string().max(20).nullable(),
  itens: z
    .array(
      z.object({
        n_item: z.number().int().min(1).max(990),
        codigo_fornecedor: z.string().max(60).nullable().optional(),
        ean: z.string().max(14).nullable().optional(),
        descricao: z.string().max(500),
      }),
    )
    .min(1)
    .max(TAMANHO_LOTE),
});

export type VinculoSugerido = {
  n_item: number;
  cor_id: string | null;
  origem: "memoria" | "ean" | "sugestao" | null;
  fator_conversao: number;
  produto: { id: string; nome: string; codigo: string; nome_cor: string; cor_hex: string; estoque: number } | null;
};

/** Vínculo automático em lote: memória do fornecedor → EAN → sugestão pela busca. */
export async function resolverVinculos(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaResolver, dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("resolver_vinculos_nota", { p_cnpj: d.cnpj ?? "", p_itens: d.itens });
    if (error) throw error;
    return ((data ?? []) as VinculoSugerido[]).map((v) => ({ ...v, fator_conversao: Number(v.fator_conversao) }));
  });
}

/** URL de upload do arquivo original da nota (pasta notas/ no R2). */
export async function pedirUploadNota(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaPedidoUploadNota, dados);
    const chave = `notas/${crypto.randomUUID()}.${d.tipo}`;
    const tipo = d.tipo === "xml" ? "application/xml" : "application/pdf";
    return { chave, ...(await urlUpload(chave, tipo, d.tamanho)) };
  });
}

/** Cria/reaproveita o rascunho. Se veio arquivo, confere no R2 o que realmente chegou. */
export async function salvarCabecalhoNota(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const cab = validar(esquemaCabecalhoNota, dados);
    let tamanho = 0;
    if (cab.chave_r2_arquivo) {
      const ini = await lerInicio(cab.chave_r2_arquivo, 64);
      if (!ini) throw new ErroApp("O arquivo da nota não chegou ao armazenamento. Tente de novo.");
      const tipo = detectarTipo(ini.inicio);
      const esperado = cab.chave_r2_arquivo.endsWith(".xml") ? "xml" : "pdf";
      if (tipo !== esperado) throw new ErroApp("O arquivo enviado não é um XML/PDF válido.");
      if (ini.tamanho > 5 * 1024 * 1024) throw new ErroApp("A nota pode ter no máximo 5 MB.");
      tamanho = ini.tamanho;
    }
    if (cab.origem === "xml" && !cab.chave_acesso) throw new ErroApp("A nota em XML precisa da chave de acesso.");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("criar_nota_rascunho", {
      p_cab: { ...cab, tamanho_arquivo_bytes: tamanho },
    });
    if (error) throw error;
    return { notaId: data as string };
  });
}

/** Itens em lotes de até 25 (uma função Postgres por lote). */
export async function salvarItensNota(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(z.object({ notaId: uuid, itens: esquemaLoteItens }), dados);
    for (const i of d.itens) {
      if (i.status === "vinculado" && !i.cor_id) throw new ErroApp(`Item ${i.n_item}: escolha o produto/cor.`);
      const qtd = i.quantidade_nota * i.fator_conversao;
      if (i.status === "vinculado" && Math.abs(qtd - Math.round(qtd)) > 1e-9) {
        throw new ErroApp(`Item ${i.n_item}: a quantidade de entrada precisa ser inteira. Ajuste o fator.`);
      }
    }
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("salvar_itens_nota", { p_nota_id: d.notaId, p_itens: d.itens });
    if (error) throw error;
    return { salvos: data as number };
  });
}

/** Confirmação atômica: ou a nota inteira entra, ou nada entra. */
export async function confirmarNota(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(z.object({ notaId: uuid, totalItens: z.number().int().min(1).max(990) }), dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("confirmar_nota_entrada", {
      p_nota_id: d.notaId,
      p_total_itens: d.totalItens,
    });
    if (error) throw error;
    return data as { nota_id: string; itens: number; unidades: number };
  });
}

export async function descartarRascunho(notaId: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const id = validar(uuid, notaId);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("descartar_rascunho", { p_nota_id: id });
    if (error) throw error;
    return null;
  });
}

export async function cancelarNota(dados: unknown) {
  return executar(async () => {
    await autorizar("admin");
    const d = validar(z.object({ notaId: uuid, motivo: z.string().trim().min(3, "Informe o motivo.").max(300) }), dados);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("cancelar_nota_entrada", { p_nota_id: d.notaId, p_motivo: d.motivo });
    if (error) throw error;
    return data as { estornos: number };
  });
}

/** Bipou um código desconhecido e escolheu "Vincular a produto existente". */
export async function definirCodigoBarras(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(z.object({ corId: uuid, codigo: z.string().regex(/^\d{8,14}$/, "Código de barras inválido.") }), dados);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("definir_codigo_barras", { p_cor_id: d.corId, p_codigo: d.codigo });
    if (error) throw error;
    return null;
  });
}
