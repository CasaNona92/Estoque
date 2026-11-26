import { notFound } from "next/navigation";
import { DetalheProduto } from "@/components/produto/detalhe";
import { exigirSessao } from "@/lib/auth";
import { listarMovimentacoes } from "@/lib/dados/movimentacoes";
import { obterProduto } from "@/lib/dados/produtos";
import { ehUuid } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) return { title: "Produto" };
  const p = await obterProduto(id).catch(() => null);
  return { title: p?.nome ?? "Produto" };
}

export default async function PaginaProduto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cor?: string }>;
}) {
  const s = await exigirSessao();
  const { id } = await params;
  const { cor } = await searchParams;
  // IDOR: id inválido ou que a RLS não deixa ver → 404 (nunca "acesso negado" revelando que existe)
  if (!ehUuid(id)) notFound();
  const produto = await obterProduto(id);
  if (!produto) notFound();
  const historico = s.podeEntrada ? await listarMovimentacoes({ produtoId: id, porPagina: 20 }) : null;

  return (
    <DetalheProduto
      produto={produto}
      corInicial={cor && produto.cores.some((c) => c.id === cor) ? cor : produto.cores[0]?.id}
      podeEntrada={s.podeEntrada}
      admin={s.admin}
      historico={historico?.movimentacoes ?? null}
    />
  );
}
