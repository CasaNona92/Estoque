import { EntradaCliente } from "@/components/dinamicos";
import { exigirSessao } from "@/lib/auth";

export const metadata = { title: "Entrada de Mercadorias" };

export default async function PaginaEntrada() {
  const s = await exigirSessao("entrada");
  return <EntradaCliente admin={s.admin} />;
}
