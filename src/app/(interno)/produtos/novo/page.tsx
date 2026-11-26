import { FormProdutoCliente as FormProduto } from "@/components/dinamicos";
import { exigirSessao } from "@/lib/auth";
import { opcoesFiltro } from "@/lib/dados/produtos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata = { title: "Novo produto" };

export default async function PaginaNovoProduto({
  searchParams,
}: {
  searchParams: Promise<{ codigo_barras?: string; nome?: string }>;
}) {
  await exigirSessao("entrada");
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ categorias }, cfg] = await Promise.all([
    opcoesFiltro(),
    supabase.from("configuracoes").select("estoque_minimo_padrao").eq("id", 1).maybeSingle(),
  ]);
  const barras = sp.codigo_barras?.replace(/\D/g, "").slice(0, 14) ?? "";
  return (
    <FormProduto
      categorias={categorias}
      estoqueMinimoPadrao={cfg.data?.estoque_minimo_padrao ?? 2}
      inicial={{
        nome: sp.nome?.slice(0, 160) ?? "",
        cores: [{ nome_cor: "Padrão", cor_hex: "#B5835A", codigo_barras: barras, estoque_inicial: 0 }],
      }}
    />
  );
}
