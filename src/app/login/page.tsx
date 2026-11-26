import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoNona } from "@/components/logo";
import { obterSessao } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FormLogin } from "./form-login";

export const metadata = { title: "Entrar" };

const AVISOS: Record<string, string> = {
  sessao: "Sua sessão terminou. Entre novamente.",
  saiu: "Você saiu do sistema.",
  alterada: "Senha alterada. Entre com a nova senha.",
  instalado: "Administrador criado! Entre com o usuário e a senha que você escolheu.",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string; motivo?: string }>;
}) {
  const sp = await searchParams;
  const sessao = await obterSessao();
  if (sessao) redirect(sessao.perfil.precisa_trocar_senha ? "/trocar-senha" : "/");

  // Sistema novo (nenhum usuário ainda)? Mostra o caminho para criar o administrador principal.
  const { data: instalado, error } = await criarClienteAdmin()
    .rpc("sistema_instalado")
    .then((r) => r, () => ({ data: true, error: null }));
  const semUsuarios = !error && instalado === false;
  const aviso = sp.motivo ? AVISOS[sp.motivo] : undefined;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_15%_0%,#2f6bff_0%,#0a47c9_40%,#06308c_75%,#041f5c_100%)]" />
        <div className="absolute -right-40 -bottom-48 size-[620px] rounded-full bg-[#FE8F01]/30 blur-3xl" />
        <div className="absolute -top-24 -left-24 size-[380px] rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="text-sm text-white/70 tracking-wide">Sistema interno de estoque</span>
          <div className="space-y-10">
            <LogoNona prioridade className="h-auto w-full max-w-[560px] drop-shadow-[0_24px_40px_rgba(0,0,0,0.35)]" />
            <div className="max-w-md space-y-3">
              <p className="font-serif text-5xl leading-[1.05]">Cada peça, no lugar certo.</p>
              <p className="text-white/75">Estoque, vitrine e entrada de mercadorias num só lugar — feito para o balcão da loja.</p>
            </div>
          </div>
          <p className="text-white/50 text-xs">Acesso restrito a funcionários.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-4">
            <LogoNona prioridade className="h-20 lg:hidden" />
            <h1 className="font-semibold text-2xl tracking-tight">Entrar</h1>
            <p className="text-muted-foreground text-sm">Use seu usuário (ou e-mail) e a senha que o administrador criou para você.</p>
          </div>
          {aviso ? (
            <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-primary text-sm">
              {aviso}
            </p>
          ) : null}
          <FormLogin voltar={sp.voltar ?? ""} />
          {semUsuarios && (
            <Link href="/primeiro-acesso" className="block rounded-xl border border-accent/60 border-dashed bg-accent-suave px-4 py-3 text-center text-accent-texto text-sm hover:bg-accent-suave/70">
              Primeiro acesso? <strong>Criar o administrador principal</strong>
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
