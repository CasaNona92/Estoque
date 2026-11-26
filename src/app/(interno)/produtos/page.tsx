import { ListaProdutos } from "@/components/produtos/lista";
import { exigirSessao } from "@/lib/auth";
import { listarProdutos, opcoesFiltro } from "@/lib/dados/produtos";

export const metadata = { title: "Produtos" };

export default async function PaginaProdutos({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; cor?: string; filtro?: string; q?: string }>;
}) {
  const s = await exigirSessao();
  const sp = await searchParams;
  const filtro = sp.filtro === "sem_estoque" || sp.filtro === "abaixo_minimo" ? sp.filtro : null;
  const [opcoes, inicial] = await Promise.all([
    opcoesFiltro(),
    listarProdutos({ categoria: sp.categoria ?? null, cor: sp.cor ?? null, filtro, offset: 0, limite: 30 }),
  ]);
  return (
    <ListaProdutos
      categorias={opcoes.categorias}
      cores={opcoes.cores}
      inicial={inicial}
      filtrosIniciais={{ categoria: sp.categoria ?? "", cor: sp.cor ?? "", filtro: filtro ?? "", q: sp.q ?? "" }}
      podeCadastrar={s.podeEntrada}
    />
  );
}
