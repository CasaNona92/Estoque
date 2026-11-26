import { LogoNona } from "@/components/logo";
import { exigirSessao } from "@/lib/auth";
import { FormTrocarSenha } from "./form";

export const metadata = { title: "Trocar senha" };

export default async function PaginaTrocarSenha() {
  const s = await exigirSessao("usuario", { permitirTrocaPendente: true });
  const primeiroAcesso = s.perfil.precisa_trocar_senha;
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-border/70 bg-card p-8 shadow-media">
        <div className="space-y-3">
          <LogoNona prioridade className="h-14" />
          <h1 className="font-semibold text-2xl tracking-tight">
            {primeiroAcesso ? `Bem-vindo(a), ${s.perfil.nome.split(" ")[0]}!` : "Trocar senha"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {primeiroAcesso
              ? "Por segurança, crie uma senha só sua antes de começar. Depois você entra de novo com ela."
              : "Depois de trocar, todas as suas sessões (em qualquer aparelho) serão encerradas."}
          </p>
        </div>
        <FormTrocarSenha podeCancelar={!primeiroAcesso} />
      </div>
    </main>
  );
}
