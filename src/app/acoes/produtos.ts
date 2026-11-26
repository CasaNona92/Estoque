"use server";

import { revalidatePath } from "next/cache";
import { autorizar } from "@/lib/auth";
import { ErroApp, executar } from "@/lib/erros";
import { detectarTipo } from "@/lib/magic-bytes";
import { lerInicio, urlUpload } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validar } from "@/lib/validar";
import { esquemaConfirmarFoto, esquemaPedidoUploadFoto, esquemaProduto, uuid } from "@/lib/validacao";
import { z } from "zod";

export async function salvarProduto(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaProduto, dados);
    const especificacoes = Object.fromEntries(d.especificacoes.filter((e) => e.chave).map((e) => [e.chave, e.valor]));
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("salvar_produto", {
      p: { ...d, especificacoes },
    });
    if (error) throw error;
    revalidatePath(`/produtos/${data}`);
    return { id: data as string };
  });
}

export async function excluirProduto(id: unknown) {
  return executar(async () => {
    await autorizar("admin");
    const produtoId = validar(uuid, id);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("excluir_produto", { p_produto_id: produtoId });
    if (error) throw error;
    return null;
  });
}

/** 1) pede as URLs de upload (uma para a foto, outra para a miniatura) — 5 min, tipo e tamanho fixos. */
export async function pedirUploadFoto(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaPedidoUploadFoto, dados);
    const supabase = await criarClienteServidor();
    const { data: produto } = await supabase.from("produtos").select("id").eq("id", d.produtoId).maybeSingle();
    if (!produto) throw new ErroApp("Produto não encontrado.", 404);

    const arquivoId = crypto.randomUUID();
    const chave = `produtos/${d.produtoId}/${arquivoId}.webp`;
    const chaveThumb = `produtos/${d.produtoId}/${arquivoId}_thumb.webp`;
    const [foto, miniatura] = await Promise.all([
      urlUpload(chave, "image/webp", d.tamanho),
      urlUpload(chaveThumb, "image/webp", d.tamanhoMiniatura),
    ]);
    return { arquivoId, foto, miniatura };
  });
}

/** 2) depois do PUT direto no R2: o servidor confere o que chegou (tamanho e magic bytes) e registra. */
export async function confirmarFoto(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(esquemaConfirmarFoto, dados);
    const chave = `produtos/${d.produtoId}/${d.arquivoId}.webp`;
    const chaveThumb = `produtos/${d.produtoId}/${d.arquivoId}_thumb.webp`;
    const [a, b] = await Promise.all([lerInicio(chave), lerInicio(chaveThumb)]);
    if (!a || !b) throw new ErroApp("O envio da foto não terminou. Tente de novo.");
    if (detectarTipo(a.inicio) !== "webp" || detectarTipo(b.inicio) !== "webp") {
      throw new ErroApp("Arquivo de foto inválido.");
    }
    if (a.tamanho > 600 * 1024 || b.tamanho > 120 * 1024) throw new ErroApp("Foto grande demais.");

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("registrar_foto", {
      p_produto_id: d.produtoId,
      p_cor_id: d.corId ?? null,
      p_chave: chave,
      p_chave_thumb: chaveThumb,
      p_tamanho: a.tamanho + b.tamanho,
    });
    if (error) throw error;
    revalidatePath(`/produtos/${d.produtoId}`);
    return { id: data as string };
  });
}

export async function removerFoto(fotoId: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const id = validar(uuid, fotoId);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("remover_foto", { p_foto_id: id });
    if (error) throw error;
    return null;
  });
}

export async function reordenarFotos(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(z.object({ produtoId: uuid, ids: z.array(uuid).max(60) }), dados);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("reordenar_fotos", { p_produto_id: d.produtoId, p_ids: d.ids });
    if (error) throw error;
    return null;
  });
}

export async function definirCorFoto(dados: unknown) {
  return executar(async () => {
    await autorizar("entrada");
    const d = validar(z.object({ fotoId: uuid, corId: uuid.nullable() }), dados);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("definir_cor_foto", { p_foto_id: d.fotoId, p_cor_id: d.corId });
    if (error) throw error;
    return null;
  });
}
