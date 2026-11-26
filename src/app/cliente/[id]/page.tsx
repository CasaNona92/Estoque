import { notFound } from "next/navigation";
import { ModoCliente } from "@/components/cliente/modo-cliente";
import { exigirSessao } from "@/lib/auth";
import { obterProduto } from "@/lib/dados/produtos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { ProdutoCompleto } from "@/lib/tipos";
import { NOME_LOJA } from "@/lib/loja";
import { ehUuid } from "@/lib/utils";

export const metadata = { title: "Modo cliente" };

/** O Modo Cliente nunca recebe estoque, código de barras nem histórico. */
function semDadosInternos(p: ProdutoCompleto): ProdutoCompleto {
  return { ...p, estoque_minimo: 0, cores: p.cores.map((c) => ({ ...c, estoque: 0, codigo_barras: null })) };
}

export default async function PaginaModoCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cor?: string }>;
}) {
  await exigirSessao();
  const { id } = await params;
  const { cor } = await searchParams;
  if (!ehUuid(id)) notFound();
  const [produto, cfg] = await Promise.all([
    obterProduto(id),
    criarClienteServidor().then((s) => s.from("configuracoes").select("exigir_pin_cliente").eq("id", 1).maybeSingle()),
  ]);
  if (!produto) notFound();
  return (
    <ModoCliente
      produtoInicial={semDadosInternos(produto)}
      corInicial={cor}
      exigirPin={Boolean(cfg.data?.exigir_pin_cliente)}
      nomeLoja={NOME_LOJA}
    />
  );
}
