import { Administracao, type Uso } from "@/components/admin/administracao";
import { exigirSessao } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata = { title: "Administração" };

export default async function PaginaAdmin() {
  const s = await exigirSessao("admin");
  const supabase = await criarClienteServidor();
  const [usuarios, cfg, uso] = await Promise.all([
    supabase.from("perfis").select("id, nome, usuario, papel, pode_dar_entrada, ativo, precisa_trocar_senha, criado_em").order("nome"),
    supabase.from("configuracoes").select("exigir_pin_cliente, estoque_minimo_padrao").eq("id", 1).maybeSingle(),
    supabase.rpc("uso_plano"),
  ]);
  return (
    <Administracao
      eu={s.perfil.id}
      usuarios={usuarios.data ?? []}
      configuracoes={{ exigir_pin: cfg.data?.exigir_pin_cliente ?? false, estoque_minimo_padrao: cfg.data?.estoque_minimo_padrao ?? 2 }}
      uso={(uso.data as Uso | null) ?? null}
    />
  );
}

