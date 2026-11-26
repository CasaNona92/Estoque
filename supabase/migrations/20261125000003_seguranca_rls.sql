-- =====================================================================
-- 0003 — Funções de permissão e Row Level Security (RLS em TODAS as tabelas)
--
-- Modelo:
--   * anon: não acessa nada.
--   * authenticated: só LÊ (SELECT) o que a RLS permite. Nenhum INSERT/UPDATE/DELETE
--     direto — toda escrita passa por funções SECURITY DEFINER que checam permissão,
--     validam os dados e gravam auditoria.
--   * service_role: usada só no servidor (criação de usuários, login, rotinas).
-- =====================================================================

-- A sessão do JWT ainda existe? (cai quando a senha é trocada ou o usuário é desativado)
create or replace function public.sessao_valida()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select exists (
       select 1 from auth.sessions s
        where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
          and s.user_id = auth.uid())),
    false)
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo)
     and public.sessao_valida()
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'admin')
     and public.sessao_valida()
$$;

-- Admin ou usuário com pode_dar_entrada = true
create or replace function public.pode_lancar_entrada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p
                  where p.id = auth.uid() and p.ativo
                    and (p.papel = 'admin' or p.pode_dar_entrada))
     and public.sessao_valida()
$$;

-- Perfil do usuário logado (null se a sessão não for válida ou o usuário estiver desativado)
create or replace function public.meu_perfil()
returns table (id uuid, nome text, usuario text, papel text, pode_dar_entrada boolean, precisa_trocar_senha boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.usuario, p.papel, p.pode_dar_entrada, p.precisa_trocar_senha
    from public.perfis p
   where p.id = auth.uid() and p.ativo and public.sessao_valida()
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.perfis                       enable row level security;
alter table public.produtos                     enable row level security;
alter table public.produto_cores                enable row level security;
alter table public.produto_fotos                enable row level security;
alter table public.fornecedores                 enable row level security;
alter table public.codigos_fornecedor           enable row level security;
alter table public.notas_entrada                enable row level security;
alter table public.nota_itens                   enable row level security;
alter table public.movimentacoes                enable row level security;
alter table public.auditoria                    enable row level security;
alter table public.arquivos_pendentes_exclusao  enable row level security;
alter table public.login_tentativas             enable row level security;
alter table public.configuracoes                enable row level security;
alter table public.sistema_status               enable row level security;
alter table public.busca_vocabulario            enable row level security;

-- Obs.: não usamos FORCE ROW LEVEL SECURITY de propósito: as funções SECURITY DEFINER
-- (donas = postgres) precisam gravar; elas fazem a checagem de permissão por conta própria.

-- perfis: qualquer usuário ativo vê nomes/papéis (sem e-mail: e-mail fica só no auth.users).
-- Ninguém altera o próprio perfil (sem políticas de escrita).
create policy perfis_leitura on public.perfis
  for select to authenticated
  using ((select public.usuario_ativo()));

-- Exclusão lógica filtrada na RLS: produto inativo some para todo mundo.
create policy produtos_leitura on public.produtos
  for select to authenticated
  using (ativo and (select public.usuario_ativo()));

create policy cores_leitura on public.produto_cores
  for select to authenticated
  using (ativo
         and (select public.usuario_ativo())
         and exists (select 1 from public.produtos p where p.id = produto_id and p.ativo));

create policy fotos_leitura on public.produto_fotos
  for select to authenticated
  using ((select public.usuario_ativo())
         and exists (select 1 from public.produtos p where p.id = produto_id and p.ativo));

create policy movimentacoes_leitura on public.movimentacoes
  for select to authenticated
  using ((select public.usuario_ativo()));

create policy fornecedores_leitura on public.fornecedores
  for select to authenticated
  using ((select public.pode_lancar_entrada()));

create policy codigos_fornecedor_leitura on public.codigos_fornecedor
  for select to authenticated
  using ((select public.pode_lancar_entrada()));

create policy notas_leitura on public.notas_entrada
  for select to authenticated
  using ((select public.pode_lancar_entrada()));

create policy nota_itens_leitura on public.nota_itens
  for select to authenticated
  using ((select public.pode_lancar_entrada()));

create policy auditoria_leitura on public.auditoria
  for select to authenticated
  using ((select public.eh_admin()));

create policy configuracoes_leitura on public.configuracoes
  for select to authenticated
  using ((select public.usuario_ativo()));

create policy sistema_status_leitura on public.sistema_status
  for select to authenticated
  using ((select public.eh_admin()));

create policy vocabulario_leitura on public.busca_vocabulario
  for select to authenticated
  using ((select public.usuario_ativo()));

-- arquivos_pendentes_exclusao e login_tentativas: RLS ligada e NENHUMA política
-- → só service_role (servidor/rotinas) acessa.
