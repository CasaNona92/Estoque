-- =====================================================================
-- 0005 — Triggers de auditoria, login (limite de tentativas), administração
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditoria genérica (INSERT/UPDATE/DELETE) nas tabelas sensíveis
-- ---------------------------------------------------------------------
create or replace function public.trg_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignorar text[] := array['busca_texto', 'nome_busca', 'atualizado_em', 'pin_cliente_hash'];
  v_antes jsonb;
  v_depois jsonb;
begin
  if current_setting('estoque.sem_auditoria', true) = 'on' then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := to_jsonb(old) - v_ignorar;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_depois := to_jsonb(new) - v_ignorar;
  end if;

  if tg_op = 'UPDATE' then
    -- mudança só de estoque feita por uma função de estoque: a própria função já auditou
    if current_setting('estoque.em_funcao', true) = 'on' and tg_table_name = 'produto_cores'
       and (v_antes - 'estoque') = (v_depois - 'estoque') then
      return null;
    end if;
    if v_antes = v_depois then
      return null;
    end if;
  end if;

  insert into public.auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(v_depois ->> 'id', v_antes ->> 'id'), v_antes, v_depois);
  return null;
end
$$;

create trigger auditoria_produtos after insert or update or delete on public.produtos
  for each row execute function public.trg_auditoria();
create trigger auditoria_produto_cores after insert or update or delete on public.produto_cores
  for each row execute function public.trg_auditoria();
create trigger auditoria_produto_fotos after insert or update or delete on public.produto_fotos
  for each row execute function public.trg_auditoria();
create trigger auditoria_perfis after insert or update or delete on public.perfis
  for each row execute function public.trg_auditoria();
create trigger auditoria_notas_entrada after insert or update or delete on public.notas_entrada
  for each row execute function public.trg_auditoria();
create trigger auditoria_fornecedores after insert or update or delete on public.fornecedores
  for each row execute function public.trg_auditoria();
create trigger auditoria_codigos_fornecedor after insert or update or delete on public.codigos_fornecedor
  for each row execute function public.trg_auditoria();
create trigger auditoria_configuracoes after insert or update or delete on public.configuracoes
  for each row execute function public.trg_auditoria();

-- ---------------------------------------------------------------------
-- Login: 5 falhas em 15 minutos por usuário OU por IP → bloqueio temporário.
-- Só a service_role (servidor) chama estas funções.
-- ---------------------------------------------------------------------
create or replace function public.login_bloqueado(p_usuario text, p_ip text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.login_tentativas
           where usuario = lower(btrim(coalesce(p_usuario, ''))) and not sucesso
             and criado_em > now() - interval '15 minutes') >= 5
      or (select count(*) from public.login_tentativas
           where ip = coalesce(p_ip, '') and not sucesso
             and criado_em > now() - interval '15 minutes') >= 5
$$;

create or replace function public.registrar_tentativa_login(p_usuario text, p_ip text, p_sucesso boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario text := lower(left(btrim(coalesce(p_usuario, '')), 120));
begin
  delete from public.login_tentativas where criado_em < now() - interval '1 day';
  if p_sucesso then
    delete from public.login_tentativas where usuario = v_usuario and not sucesso;
  end if;
  insert into public.login_tentativas (usuario, ip, sucesso)
  values (v_usuario, left(coalesce(p_ip, ''), 64), coalesce(p_sucesso, false));
end
$$;

-- Converte usuário → e-mail (só no servidor, nunca exposto ao navegador)
create or replace function public.email_por_usuario(p_usuario text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
    from auth.users u
    join public.perfis p on p.id = u.id
   where p.usuario = lower(btrim(coalesce(p_usuario, '')))
   limit 1
$$;

-- Derruba TODAS as sessões de um usuário (troca/redefinição de senha, desativação).
-- Apagar auth.sessions invalida os refresh tokens; a RLS (sessao_valida) bloqueia
-- na hora qualquer access token que ainda não expirou.
create or replace function public.revogar_sessoes(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------
-- Administração de perfis (admin logado; a auditoria registra quem fez)
-- ---------------------------------------------------------------------
create or replace function public.admin_atualizar_perfil(
  p_id uuid, p_nome text, p_papel text, p_pode_dar_entrada boolean, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.perfis;
begin
  if not public.eh_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_perfil from public.perfis where id = p_id for update;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'EST02';
  end if;
  if p_papel not in ('admin', 'vendedor') then
    raise exception 'Papel inválido.' using errcode = 'EST04';
  end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 2 and 80 then
    raise exception 'Nome inválido.' using errcode = 'EST04';
  end if;
  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o próprio acesso de administrador.' using errcode = 'EST04';
  end if;
  update public.perfis
     set nome = btrim(p_nome), papel = p_papel, pode_dar_entrada = coalesce(p_pode_dar_entrada, false),
         ativo = coalesce(p_ativo, true)
   where id = p_id;
end
$$;

-- ---------------------------------------------------------------------
-- Configurações (PIN do modo cliente e estoque mínimo padrão)
-- ---------------------------------------------------------------------
create or replace function public.salvar_configuracoes(
  p_exigir_pin boolean, p_pin text, p_estoque_minimo_padrao int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salt text;
  v_hash text;
  v_atual public.configuracoes;
begin
  if not public.eh_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_atual from public.configuracoes where id = 1 for update;
  if p_estoque_minimo_padrao is null or p_estoque_minimo_padrao not between 0 and 100000 then
    raise exception 'Estoque mínimo padrão inválido.' using errcode = 'EST04';
  end if;
  if nullif(p_pin, '') is not null then
    if p_pin !~ '^[0-9]{4,8}$' then
      raise exception 'O PIN deve ter de 4 a 8 números.' using errcode = 'EST04';
    end if;
    v_salt := replace(gen_random_uuid()::text, '-', '');
    v_hash := v_salt || ':' || encode(sha256(convert_to(v_salt || p_pin, 'UTF8')), 'hex');
  else
    v_hash := v_atual.pin_cliente_hash;
  end if;
  if coalesce(p_exigir_pin, false) and v_hash is null then
    raise exception 'Defina um PIN para exigir no modo cliente.' using errcode = 'EST04';
  end if;
  update public.configuracoes
     set exigir_pin_cliente = coalesce(p_exigir_pin, false),
         pin_cliente_hash = v_hash,
         estoque_minimo_padrao = p_estoque_minimo_padrao,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = 1;
end
$$;

-- Confere o PIN para sair do modo cliente (5 erros em 15 min → bloqueia por 15 min)
create or replace function public.verificar_pin_cliente(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg public.configuracoes;
  v_chave text := 'pin:' || coalesce(auth.uid()::text, '');
  v_ok boolean;
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_cfg from public.configuracoes where id = 1;
  if not v_cfg.exigir_pin_cliente or v_cfg.pin_cliente_hash is null then
    return true;
  end if;
  if (select count(*) from public.login_tentativas
       where usuario = v_chave and not sucesso and criado_em > now() - interval '15 minutes') >= 5 then
    raise exception 'Muitas tentativas. Aguarde 15 minutos.' using errcode = '42501';
  end if;
  v_ok := split_part(v_cfg.pin_cliente_hash, ':', 2) =
          encode(sha256(convert_to(split_part(v_cfg.pin_cliente_hash, ':', 1) || coalesce(p_pin, ''), 'UTF8')), 'hex');
  if not v_ok then
    insert into public.login_tentativas (usuario, ip, sucesso) values (v_chave, 'pin', false);
  else
    delete from public.login_tentativas where usuario = v_chave;
  end if;
  return v_ok;
end
$$;

-- ---------------------------------------------------------------------
-- Uso do plano grátis (tela de Administração → Backup)
-- O espaço do R2 é calculado pelo tamanho registrado de cada arquivo
-- (sem listar o bucket, para não gastar chamadas externas).
-- ---------------------------------------------------------------------
create or replace function public.uso_plano()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'fotos_bytes', (select coalesce(sum(tamanho_bytes), 0) from public.produto_fotos),
    'fotos_qtd', (select count(*) from public.produto_fotos),
    'notas_bytes', (select coalesce(sum(tamanho_arquivo_bytes), 0) from public.notas_entrada where status <> 'cancelada'),
    'backups_bytes', (select nullif(valor, '')::bigint from public.sistema_status where chave = 'backups_bytes'),
    'ultimo_backup', (select valor from public.sistema_status where chave = 'ultimo_backup'),
    'ultimo_backup_erro', (select valor from public.sistema_status where chave = 'ultimo_backup_erro'),
    'produtos', (select count(*) from public.produtos where ativo),
    'pendentes_exclusao', (select count(*) from public.arquivos_pendentes_exclusao where processado_em is null)
  );
end
$$;

-- ---------------------------------------------------------------------
-- Rotinas (chamadas pelo GitHub Actions com a connection string do banco)
-- ---------------------------------------------------------------------
create or replace function public.limpar_rascunhos_antigos()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  insert into public.arquivos_pendentes_exclusao (chave_r2)
  select chave_r2_arquivo from public.notas_entrada
   where status = 'rascunho' and criado_em < now() - interval '7 days' and chave_r2_arquivo is not null;
  delete from public.notas_entrada where status = 'rascunho' and criado_em < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

create or replace function public.registrar_status(p_chave text, p_valor text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sistema_status (chave, valor, atualizado_em) values (p_chave, p_valor, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
$$;
