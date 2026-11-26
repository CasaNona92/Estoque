import { notFound } from "next/navigation";
import { FormProdutoCliente as FormProduto } from "@/components/dinamicos";
import { exigirSessao } from "@/lib/auth";
import { obterProduto, opcoesFiltro } from "@/lib/dados/produtos";
import { ehUuid } from "@/lib/utils";

export const metadata = { title: "Editar produto" };

export default async function PaginaEditarProduto({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao("entrada");
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const [produto, { categorias }] = await Promise.all([obterProduto(id), opcoesFiltro()]);
  if (!produto) notFound();
  return <FormProduto categorias={categorias} estoqueMinimoPadrao={produto.estoque_minimo} produto={produto} admin={s.admin} />;
}
