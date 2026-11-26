import { Inicio } from "@/components/inicio/inicio";
import { exigirSessao } from "@/lib/auth";
import { maisVendidos, ultimasBaixas } from "@/lib/dados/produtos";

export default async function PaginaInicial() {
  const s = await exigirSessao();
  const [baixas, vendidos] = await Promise.all([
    ultimasBaixas().catch(() => []),
    maisVendidos(30).catch(() => []),
  ]);
  return <Inicio baixas={baixas} maisVendidos={vendidos} podeCadastrar={s.podeEntrada} />;
}
