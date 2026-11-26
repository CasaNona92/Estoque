"use client";

import { confirmarFoto, pedirUploadFoto } from "@/app/acoes/produtos";
import { comprimirFoto } from "./imagens";

type Destino = { url: string; headers: Record<string, string> };

/** PUT direto do navegador para o R2 (URL pré-assinada; a gravação não passa pelo Worker). */
export async function enviarParaR2(destino: Destino, corpo: Blob) {
  const r = await fetch(destino.url, { method: "PUT", headers: destino.headers, body: corpo });
  if (!r.ok) throw new Error(`O armazenamento recusou o arquivo (${r.status}).`);
}

/** Comprime → pede URLs → envia foto e miniatura → servidor confere e registra. */
export async function enviarFoto(produtoId: string, corId: string | null, arquivo: File | Blob) {
  const { principal, miniatura } = await comprimirFoto(arquivo);
  const pedido = await pedirUploadFoto({ produtoId, tamanho: principal.size, tamanhoMiniatura: miniatura.size });
  if (!pedido.ok) throw new Error(pedido.erro);
  await Promise.all([enviarParaR2(pedido.dados.foto, principal), enviarParaR2(pedido.dados.miniatura, miniatura)]);
  const conf = await confirmarFoto({ produtoId, corId, arquivoId: pedido.dados.arquivoId });
  if (!conf.ok) throw new Error(conf.erro);
  return { id: conf.dados.id, tamanho: principal.size };
}
