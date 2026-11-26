import { notFound } from "next/navigation";
import { LogoNona } from "@/components/logo";
import { env } from "@/lib/env";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FormInstalacao } from "./form";

export const metadata = { title: "Primeiro acesso" };

/** Só existe enquanto o sistema não tem nenhum usuário. Depois, some (404). */
export default async function PaginaPrimeiroAcesso() {
  const { data: instalado, error } = await criarClienteAdmin().rpc("sistema_instalado");
  if (error || instalado) notFound();
  const temCodigo = Boolean(env().CODIGO_INSTALACAO);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(120%_80%_at_50%_0%,#e8efff_0%,var(--background)_60%)] px-6 py-12">
      <div className="w-full max-w-lg space-y-7 rounded-3xl border border-border/70 bg-card p-8 shadow-media">
        <div className="space-y-4">
          <LogoNona className="h-16" prioridade />
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Primeiro acesso</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Crie o <strong>administrador principal</strong>. Depois, entre com ele e cadastre os outros funcionários em{" "}
              <strong>Administração → Usuários</strong>. Esta tela some assim que o primeiro usuário for criado.
            </p>
          </div>
        </div>
        {temCodigo ? (
          <FormInstalacao />
        ) : (
          <p role="alert" className="rounded-xl bg-alerta-suave px-4 py-3 text-alerta text-sm">
            Para liberar esta tela, defina a variável secreta <code className="font-mono">CODIGO_INSTALACAO</code> no servidor (Vercel/Cloudflare ou
            .env.local) com um código longo que só você saiba.
          </p>
        )}
      </div>
    </main>
  );
}
