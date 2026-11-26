import { ImportacaoCliente } from "@/components/dinamicos";
import { exigirSessao } from "@/lib/auth";

export const metadata = { title: "Importar produtos" };

export default async function PaginaImportar() {
  await exigirSessao("entrada");
  return <ImportacaoCliente />;
}
