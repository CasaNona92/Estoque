-- =====================================================================
-- 0009 — Primeiro acesso: criar o administrador principal pelo próprio sistema
--   Só funciona enquanto NÃO existe nenhum perfil. Depois disso, o admin cria
--   os outros usuários em Administração → Usuários.
--   Chamada apenas pelo servidor (service_role), depois de conferir o
--   CODIGO_INSTALACAO.
-- =====================================================================

create or replace function public.sistema_instalado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis)
$$;

create or replace function public.instalar_primeiro_admin(p_id uuid, p_nome text, p_usuario text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- trava a tabela: dois "primeiros acessos" ao mesmo tempo não criam dois admins
  lock table public.perfis in share row exclusive mode;
  if exists (select 1 from public.perfis) then
    raise exception 'O sistema já tem administrador. Peça a ele para criar seu usuário.' using errcode = 'EST04';
  end if;
  insert into public.perfis (id, nome, usuario, papel, pode_dar_entrada, ativo, precisa_trocar_senha)
  values (p_id, btrim(p_nome), lower(btrim(p_usuario)), 'admin', true, true, false);
  insert into public.auditoria (usuario_id, acao, tabela, registro_id, dados_depois)
  values (p_id, 'instalar_primeiro_admin', 'perfis', p_id::text, jsonb_build_object('usuario', lower(btrim(p_usuario))));
end
$$;

revoke execute on function public.sistema_instalado(), public.instalar_primeiro_admin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sistema_instalado(), public.instalar_primeiro_admin(uuid, text, text) to service_role;
