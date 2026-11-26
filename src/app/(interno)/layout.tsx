import { Cabecalho } from "@/components/cabecalho";
import { exigirSessao } from "@/lib/auth";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        nome={s.perfil.nome}
        papel={s.perfil.papel}
        podeEntrada={s.podeEntrada}
        admin={s.admin}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
