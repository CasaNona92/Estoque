-- GERADO por scripts/juntar-migracoes.mjs — não edite à mão.
-- Cole no SQL Editor do Supabase (projeto NOVO) e rode uma vez.

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000001_estrutura.sql
-- =====================================================================
-- 0001 — Extensões, tabelas e índices
-- O banco guarda apenas texto e números. Arquivos ficam no R2 (só a chave aqui).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ---------------------------------------------------------------------
-- Usuários (perfil ligado ao auth.users do Supabase)
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  usuario text not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  papel text not null default 'vendedor' check (papel in ('admin', 'vendedor')),
  pode_dar_entrada boolean not null default false,
  ativo boolean not null default true,
  precisa_trocar_senha boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Produtos e variações (cores). O estoque é controlado POR COR.
-- ---------------------------------------------------------------------
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  categoria text not null default 'Sem categoria' check (char_length(btrim(categoria)) between 1 and 80),
  descricao text not null default '' check (char_length(descricao) <= 5000),
  especificacoes jsonb not null default '{}'::jsonb check (jsonb_typeof(especificacoes) = 'object'),
  estoque_minimo int not null default 0 check (estoque_minimo between 0 and 100000),
  ativo boolean not null default true,
  -- campos de busca mantidos por trigger (ver migração de busca)
  nome_busca text not null default '',
  busca_texto text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.perfis (id) on delete set null
);
create unique index produtos_codigo_unico on public.produtos (codigo);
create index produtos_categoria on public.produtos (categoria) where ativo;

create table public.produto_cores (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id) on delete cascade,
  nome_cor text not null check (char_length(btrim(nome_cor)) between 1 and 60),
  cor_hex text not null default '#B5835A' check (cor_hex ~ '^#[0-9A-Fa-f]{6}$'),
  codigo_barras text check (codigo_barras ~ '^[0-9]{8,14}$'),
  estoque int not null default 0 check (estoque >= 0),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index produto_cores_produto on public.produto_cores (produto_id, ordem);
create unique index produto_cores_codigo_barras_unico on public.produto_cores (codigo_barras)
  where codigo_barras is not null and ativo;
create unique index produto_cores_nome_unico on public.produto_cores (produto_id, lower(nome_cor))
  where ativo;

create table public.produto_fotos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id) on delete cascade,
  cor_id uuid references public.produto_cores (id) on delete set null,
  chave_r2 text not null unique,
  chave_r2_thumb text not null unique,
  tamanho_bytes int not null default 0 check (tamanho_bytes >= 0),
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index produto_fotos_produto on public.produto_fotos (produto_id, ordem);
create index produto_fotos_cor on public.produto_fotos (cor_id);

-- ---------------------------------------------------------------------
-- Fornecedores e notas de entrada
-- ---------------------------------------------------------------------
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  razao_social text not null check (char_length(razao_social) between 1 and 200),
  nome_fantasia text check (char_length(nome_fantasia) <= 200),
  criado_em timestamptz not null default now()
);

-- "Memória" de como cada item da nota corresponde a um produto/cor
create table public.codigos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  codigo_fornecedor text not null check (char_length(codigo_fornecedor) between 1 and 60),
  descricao_fornecedor text check (char_length(descricao_fornecedor) <= 500),
  cor_id uuid not null references public.produto_cores (id) on delete cascade,
  fator_conversao numeric(12, 4) not null default 1 check (fator_conversao > 0),
  criado_em timestamptz not null default now(),
  unique (fornecedor_id, codigo_fornecedor)
);

create table public.notas_entrada (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text check (chave_acesso ~ '^[0-9]{44}$'),
  numero text check (char_length(numero) <= 20),
  serie text check (char_length(serie) <= 5),
  fornecedor_id uuid references public.fornecedores (id),
  data_emissao date,
  valor_total numeric(14, 2) check (valor_total >= 0),
  origem text not null check (origem in ('xml', 'pdf', 'manual')),
  chave_r2_arquivo text,
  tamanho_arquivo_bytes int not null default 0 check (tamanho_arquivo_bytes >= 0),
  status text not null default 'rascunho' check (status in ('rascunho', 'confirmada', 'cancelada')),
  observacao text check (char_length(observacao) <= 500),
  usuario_id uuid not null references public.perfis (id),
  criado_em timestamptz not null default now(),
  confirmada_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid references public.perfis (id),
  motivo_cancelamento text
);
-- A chave de acesso é ÚNICA entre as notas válidas (uma nota cancelada pode ser lançada de novo).
create unique index notas_entrada_chave_unica on public.notas_entrada (chave_acesso)
  where chave_acesso is not null and status <> 'cancelada';
create index notas_entrada_criado on public.notas_entrada (criado_em desc);

create table public.nota_itens (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_entrada (id) on delete cascade,
  n_item int not null check (n_item between 1 and 990),
  codigo_fornecedor text check (char_length(codigo_fornecedor) <= 60),
  ean text check (ean ~ '^[0-9]{8,14}$'),
  descricao text not null check (char_length(descricao) between 1 and 500),
  unidade text check (char_length(unidade) <= 10),
  quantidade_nota numeric(14, 4) not null check (quantidade_nota > 0),
  fator_conversao numeric(12, 4) not null default 1 check (fator_conversao > 0),
  quantidade_entrada int not null default 0 check (quantidade_entrada >= 0),
  valor_unitario numeric(14, 4) check (valor_unitario >= 0),
  cor_id uuid references public.produto_cores (id),
  status text not null default 'novo_produto' check (status in ('vinculado', 'novo_produto', 'ignorado')),
  unique (nota_id, n_item)
);

-- ---------------------------------------------------------------------
-- Movimentações (quantidade = variação aplicada ao estoque: + entra, - sai)
-- ---------------------------------------------------------------------
create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  cor_id uuid not null references public.produto_cores (id),
  tipo text not null check (tipo in ('entrada', 'baixa', 'ajuste', 'estorno')),
  quantidade int not null check (quantidade <> 0),
  estoque_antes int not null,
  estoque_depois int not null check (estoque_depois >= 0),
  cliente_nome text check (char_length(cliente_nome) <= 120),
  nota_id uuid references public.notas_entrada (id),
  movimentacao_origem_id uuid references public.movimentacoes (id),
  observacao text check (char_length(observacao) <= 500),
  usuario_id uuid references public.perfis (id),
  criado_em timestamptz not null default now(),
  check (tipo <> 'baixa' or quantidade < 0),
  check (tipo <> 'entrada' or quantidade > 0)
);
create index movimentacoes_criado on public.movimentacoes (criado_em desc);
create index movimentacoes_tipo_criado on public.movimentacoes (tipo, criado_em desc);
create index movimentacoes_produto on public.movimentacoes (produto_id, criado_em desc);
create index movimentacoes_nota on public.movimentacoes (nota_id) where nota_id is not null;
-- Uma movimentação só pode ser estornada uma vez
create unique index movimentacoes_estorno_unico on public.movimentacoes (movimentacao_origem_id)
  where movimentacao_origem_id is not null;

-- ---------------------------------------------------------------------
-- Auditoria, fila de exclusão do R2, controle de login e configurações
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  acao text not null,
  tabela text,
  registro_id text,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_criado on public.auditoria (criado_em desc);
create index auditoria_usuario on public.auditoria (usuario_id, criado_em desc);
create index auditoria_tabela on public.auditoria (tabela, criado_em desc);

create table public.arquivos_pendentes_exclusao (
  id bigint generated always as identity primary key,
  chave_r2 text not null,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);
create index arquivos_pendentes on public.arquivos_pendentes_exclusao (criado_em) where processado_em is null;

create table public.login_tentativas (
  id bigint generated always as identity primary key,
  usuario text not null,
  ip text not null,
  sucesso boolean not null,
  criado_em timestamptz not null default now()
);
create index login_tentativas_usuario on public.login_tentativas (usuario, criado_em desc);
create index login_tentativas_ip on public.login_tentativas (ip, criado_em desc);

create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  exigir_pin_cliente boolean not null default false,
  pin_cliente_hash text,
  estoque_minimo_padrao int not null default 2 check (estoque_minimo_padrao between 0 and 100000),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into public.configuracoes (id) values (1) on conflict do nothing;

-- Escrito pelos workflows do GitHub Actions (último backup, tamanho dos backups)
create table public.sistema_status (
  chave text primary key,
  valor text,
  atualizado_em timestamptz not null default now()
);

-- Vocabulário (palavras distintas do catálogo) para Levenshtein e "Você quis dizer"
create table public.busca_vocabulario (
  palavra text primary key,
  tamanho int generated always as (char_length(palavra)) stored
);
create index busca_vocabulario_tamanho on public.busca_vocabulario (tamanho);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000002_busca.sql
-- =====================================================================
-- 0002 — Busca universal tolerante a erros
--   buscar_produtos(termo, limite) é usada por TODAS as telas.
--   Ordem: 1 código/código de barras exato · 2 começa com · 3 contém
--          4 trigramas (word_similarity >= 0,3) · 5 Levenshtein por palavra
-- =====================================================================

-- unaccent não é IMMUTABLE; este wrapper fixa o dicionário e pode ser usado em índices/colunas.
create or replace function public.f_unaccent(t text)
returns text
language sql
immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, t) $$;

-- Normalização: minúsculas, sem acento, hífen/pontuação viram espaço e plural simples ("cadeiras" → "cadeira").
create or replace function public.normalizar_busca(t text)
returns text
language sql
immutable parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(public.f_unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'),
        '([a-z]{3,})s\M', '\1', 'g'),
      '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- busca_texto: nome + nome "colado" (guardaroupa) + código + categoria + cores + especificações.
-- Uma coluna GENERATED do Postgres não pode ler outra tabela (cores) nem usar unaccent,
-- por isso ela é mantida por triggers — o efeito para a busca é o mesmo.
-- ---------------------------------------------------------------------
create or replace function public.trg_produtos_busca()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_cores text;
  v_specs text;
begin
  v_nome := public.normalizar_busca(new.nome);

  select string_agg(c.nome_cor || ' ' || coalesce(c.codigo_barras, ''), ' ' order by c.ordem)
    into v_cores
    from public.produto_cores c
   where c.produto_id = new.id and c.ativo;

  select string_agg(e.key || ' ' || e.value, ' ')
    into v_specs
    from jsonb_each_text(coalesce(new.especificacoes, '{}'::jsonb)) e;

  new.nome_busca := v_nome;
  new.busca_texto := concat_ws(' ',
    v_nome,
    nullif(replace(v_nome, ' ', ''), v_nome),
    public.normalizar_busca(new.codigo),
    public.normalizar_busca(new.categoria),
    nullif(public.normalizar_busca(v_cores), ''),
    nullif(public.normalizar_busca(v_specs), ''));

  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;
  return new;
end
$$;

create trigger produtos_busca
  before insert or update on public.produtos
  for each row execute function public.trg_produtos_busca();

-- Quando uma cor muda, recalcula o busca_texto do produto.
create or replace function public.trg_cores_atualiza_busca()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.produtos
     set busca_texto = busca_texto
   where id = coalesce(new.produto_id, old.produto_id);
  return null;
end
$$;

create trigger produto_cores_busca
  after insert or delete or update of nome_cor, codigo_barras, ativo, ordem on public.produto_cores
  for each row execute function public.trg_cores_atualiza_busca();

-- Vocabulário para Levenshtein / "Você quis dizer"
create or replace function public.trg_produtos_vocabulario()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.busca_texto is not distinct from old.busca_texto then
    return null;
  end if;
  insert into public.busca_vocabulario (palavra)
  select distinct w
    from unnest(string_to_array(new.busca_texto, ' ')) w
   where char_length(w) between 3 and 40
     and w !~ '^[0-9]+$'
  on conflict do nothing;
  return null;
end
$$;

create trigger produtos_vocabulario
  after insert or update on public.produtos
  for each row execute function public.trg_produtos_vocabulario();

-- Índices de busca
create index produtos_busca_trgm on public.produtos using gin (busca_texto extensions.gin_trgm_ops);
create index produtos_nome_busca on public.produtos (nome_busca text_pattern_ops);
create index produtos_codigo_lower on public.produtos (lower(codigo));
create index busca_vocabulario_trgm on public.busca_vocabulario using gin (palavra extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- buscar_produtos
-- ---------------------------------------------------------------------
create or replace function public.buscar_produtos(termo text, limite int default 20)
returns table (
  produto_id uuid,
  cor_id uuid,
  codigo text,
  nome text,
  categoria text,
  estoque_total int,
  estoque_minimo int,
  relevancia int,
  pontuacao real,
  cores jsonb,
  fotos jsonb
)
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_bruto text := left(btrim(coalesce(termo, '')), 100);
  v_norm text;
  v_compacto text;
  v_tokens text[];
  v_principal text;
  v_limite int := least(greatest(coalesce(limite, 20), 1), 50);
begin
  if v_bruto = '' then
    return;
  end if;

  v_norm := public.normalizar_busca(v_bruto);
  v_compacto := replace(v_norm, ' ', '');
  v_tokens := coalesce(
    array(select distinct tk from unnest(string_to_array(v_norm, ' ')) tk where tk <> ''),
    '{}'::text[]);
  select tk into v_principal from unnest(v_tokens) tk order by char_length(tk) desc, tk limit 1;

  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  return query
  with
  -- palavras do catálogo a 1 erro (4–6 letras) ou 2 erros (7+ letras) de cada termo
  expansoes as (
    select tk.t as token, v.palavra
      from unnest(v_tokens) as tk(t)
      join public.busca_vocabulario v
        on char_length(tk.t) >= 4
       and tk.t ~ '[a-z]'
       and v.tamanho between char_length(tk.t) - (case when char_length(tk.t) >= 7 then 2 else 1 end)
                         and char_length(tk.t) + (case when char_length(tk.t) >= 7 then 2 else 1 end)
       and levenshtein(v.palavra, tk.t) <= (case when char_length(tk.t) >= 7 then 2 else 1 end)
  ),
  por_barras as (
    select c.produto_id as pid, c.id as cid
      from public.produto_cores c
     where v_bruto ~ '^[0-9]{8,14}$'
       and c.codigo_barras = v_bruto
       and c.ativo
  ),
  candidatos as (
    select p.id as pid from public.produtos p
     where p.ativo and lower(p.codigo) = lower(v_bruto)
    union
    select b.pid from por_barras b
    union
    select p.id from public.produtos p
     where p.ativo
       and v_principal is not null
       and (p.busca_texto like '%' || v_principal || '%'
            or (char_length(v_principal) >= 3 and v_principal ~ '[a-z]' and v_principal <% p.busca_texto))
    union
    select p.id from public.produtos p
      join expansoes e on e.token = v_principal
     where p.ativo and p.busca_texto like '%' || e.palavra || '%'
  ),
  classificados as (
    select p.id, p.codigo, p.nome, p.categoria, p.estoque_minimo, b.cid,
      case
        when lower(p.codigo) = lower(v_bruto) or b.cid is not null then 1
        when p.nome_busca like v_norm || '%'
          or replace(p.nome_busca, ' ', '') like v_compacto || '%' then 2
        when (select bool_and(p.busca_texto like '%' || t || '%') from unnest(v_tokens) t) then 3
        when (select bool_and(p.busca_texto like '%' || t || '%'
                              or (char_length(t) >= 3 and t ~ '[a-z]' and t <% p.busca_texto))
                from unnest(v_tokens) t) then 4
        when (select bool_and(p.busca_texto like '%' || t || '%'
                              or (char_length(t) >= 3 and t ~ '[a-z]' and t <% p.busca_texto)
                              or exists (select 1 from expansoes e
                                          where e.token = t
                                            and p.busca_texto like '%' || e.palavra || '%'))
                from unnest(v_tokens) t) then 5
      end as nivel,
      coalesce((select avg(word_similarity(t, p.busca_texto)) from unnest(v_tokens) t), 0)::real as sim
    from candidatos k
    join public.produtos p on p.id = k.pid and p.ativo
    left join lateral (select pb.cid from por_barras pb where pb.pid = p.id limit 1) b on true
  )
  select
    c.id,
    c.cid,
    c.codigo,
    c.nome,
    c.categoria,
    coalesce((select sum(pc.estoque)::int from public.produto_cores pc
               where pc.produto_id = c.id and pc.ativo), 0),
    c.estoque_minimo,
    c.nivel,
    c.sim,
    coalesce((select jsonb_agg(jsonb_build_object(
                       'id', pc.id, 'nome_cor', pc.nome_cor, 'cor_hex', pc.cor_hex, 'estoque', pc.estoque)
                     order by pc.ordem, pc.nome_cor)
                from public.produto_cores pc
               where pc.produto_id = c.id and pc.ativo), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'cor_id', f.cor_id, 'chave_thumb', f.chave_r2_thumb)
                     order by f.ordem)
                from (select f2.id, f2.cor_id, f2.chave_r2_thumb, f2.ordem
                        from public.produto_fotos f2
                       where f2.produto_id = c.id
                       order by f2.ordem
                       limit 8) f), '[]'::jsonb)
  from classificados c
  where c.nivel is not null
  order by c.nivel, c.sim desc, c.nome
  limit v_limite;
end
$$;

-- "Você quis dizer: …?" — troca cada palavra desconhecida pela palavra mais parecida do catálogo.
create or replace function public.sugestao_busca(termo text)
returns text
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_tokens text[];
  v_res text[] := '{}';
  v_t text;
  v_melhor text;
  v_mudou boolean := false;
begin
  v_tokens := string_to_array(public.normalizar_busca(left(coalesce(termo, ''), 100)), ' ');
  if v_tokens is null or cardinality(v_tokens) = 0 then
    return null;
  end if;
  perform set_config('pg_trgm.similarity_threshold', '0.3', true);

  foreach v_t in array v_tokens loop
    if char_length(v_t) < 3 or v_t ~ '^[0-9]+$'
       or exists (select 1 from public.busca_vocabulario where palavra = v_t) then
      v_res := v_res || v_t;
      continue;
    end if;

    v_melhor := null;
    select v.palavra into v_melhor
      from public.busca_vocabulario v
     where v.palavra % v_t
        or (v.tamanho between char_length(v_t) - 2 and char_length(v_t) + 2
            and levenshtein(v.palavra, v_t) <= 2)
     order by similarity(v.palavra, v_t) desc, levenshtein(v.palavra, v_t), v.palavra
     limit 1;

    if v_melhor is not null and v_melhor <> v_t then
      v_res := v_res || v_melhor;
      v_mudou := true;
    else
      v_res := v_res || v_t;
    end if;
  end loop;

  if not v_mudou then
    return null;
  end if;
  return array_to_string(v_res, ' ');
end
$$;

-- Mais vendidos no período (baixas menos estornos de baixas)
create or replace function public.mais_vendidos(dias int default 30, limite int default 10)
returns table (produto_id uuid, codigo text, nome text, quantidade bigint, foto_thumb text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id, p.codigo, p.nome, sum(-m.quantidade)::bigint as qtd,
         (select f.chave_r2_thumb from public.produto_fotos f
           where f.produto_id = p.id order by f.ordem limit 1)
    from public.movimentacoes m
    join public.produtos p on p.id = m.produto_id
    left join public.movimentacoes o on o.id = m.movimentacao_origem_id
   where m.criado_em >= now() - make_interval(days => least(greatest(coalesce(dias, 30), 1), 365))
     and (m.tipo = 'baixa' or (m.tipo = 'estorno' and o.tipo = 'baixa'))
   group by p.id, p.codigo, p.nome
  having sum(-m.quantidade) > 0
   order by qtd desc, p.nome
   limit least(greatest(coalesce(limite, 10), 1), 50)
$$;

-- Últimas baixas (card "Histórico de Baixas")
create or replace function public.ultimas_baixas(limite int default 10)
returns table (
  movimentacao_id uuid, produto_id uuid, produto_nome text, cor_id uuid, nome_cor text, cor_hex text,
  quantidade int, cliente_nome text, criado_em timestamptz, usuario_nome text, desfeita boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.id, p.id, p.nome, c.id, c.nome_cor, c.cor_hex, -m.quantidade, m.cliente_nome, m.criado_em,
         u.nome,
         exists (select 1 from public.movimentacoes e where e.movimentacao_origem_id = m.id)
    from public.movimentacoes m
    join public.produtos p on p.id = m.produto_id
    join public.produto_cores c on c.id = m.cor_id
    left join public.perfis u on u.id = m.usuario_id
   where m.tipo = 'baixa'
   order by m.criado_em desc
   limit least(greatest(coalesce(limite, 10), 1), 50)
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000003_seguranca_rls.sql
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000004_funcoes_estoque.sql
-- =====================================================================
-- 0004 — Funções de estoque (TODA alteração de estoque passa por aqui)
--
-- Regras comuns:
--   * SECURITY DEFINER + checagem explícita de permissão no início;
--   * cada função é uma transação; as cores são travadas com SELECT ... FOR UPDATE;
--   * estoque nunca fica negativo (checagem + CHECK na tabela);
--   * toda mudança grava movimentação e auditoria.
--
-- Códigos de erro (SQLSTATE) usados pelo servidor para montar mensagens:
--   42501 acesso negado · EST01 estoque insuficiente · EST02 não encontrado
--   EST03 nota duplicada/em uso · EST04 dados inválidos
-- =====================================================================

create or replace function public._auditar(p_acao text, p_tabela text, p_registro text, p_antes jsonb, p_depois jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  values (auth.uid(), p_acao, p_tabela, p_registro, p_antes, p_depois);
$$;

-- Dígito verificador da chave de acesso da NF-e (módulo 11)
create or replace function public.chave_nfe_valida(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  s int := 0;
  peso int := 2;
  i int;
  dv int;
begin
  if p is null or p !~ '^[0-9]{44}$' then
    return false;
  end if;
  for i in reverse 43..1 loop
    s := s + substr(p, i, 1)::int * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  dv := 11 - (s % 11);
  if dv >= 10 then
    dv := 0;
  end if;
  return dv = substr(p, 44, 1)::int;
end
$$;

-- ---------------------------------------------------------------------
-- Baixa (venda)
-- ---------------------------------------------------------------------
create or replace function public.registrar_baixa(
  p_cor_id uuid, p_quantidade int, p_cliente_nome text, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cor public.produto_cores;
  v_prod public.produtos;
  v_mov uuid;
  v_cliente text := btrim(coalesce(p_cliente_nome, ''));
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100000 then
    raise exception 'Quantidade inválida.' using errcode = 'EST04';
  end if;
  if char_length(v_cliente) < 2 or char_length(v_cliente) > 120 then
    raise exception 'Informe o nome do cliente.' using errcode = 'EST04';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_cor from public.produto_cores where id = p_cor_id and ativo for update;
  if not found then
    raise exception 'Cor não encontrada.' using errcode = 'EST02';
  end if;
  select * into v_prod from public.produtos where id = v_cor.produto_id and ativo;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'EST02';
  end if;
  if v_cor.estoque < p_quantidade then
    raise exception 'Estoque insuficiente: há apenas % unidade(s) de % — %.',
      v_cor.estoque, v_prod.nome, v_cor.nome_cor using errcode = 'EST01';
  end if;

  update public.produto_cores set estoque = estoque - p_quantidade where id = v_cor.id;

  insert into public.movimentacoes
    (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, cliente_nome, observacao, usuario_id)
  values
    (v_prod.id, v_cor.id, 'baixa', -p_quantidade, v_cor.estoque, v_cor.estoque - p_quantidade,
     v_cliente, nullif(btrim(p_observacao), ''), auth.uid())
  returning id into v_mov;

  perform public._auditar('registrar_baixa', 'produto_cores', v_cor.id::text,
    jsonb_build_object('estoque', v_cor.estoque),
    jsonb_build_object('estoque', v_cor.estoque - p_quantidade, 'movimentacao_id', v_mov,
                       'quantidade', p_quantidade, 'cliente', v_cliente));

  return jsonb_build_object('movimentacao_id', v_mov, 'estoque', v_cor.estoque - p_quantidade);
end
$$;

-- Desfazer baixa: o próprio vendedor em até 5 minutos, ou o admin a qualquer momento.
create or replace function public.desfazer_baixa(p_movimentacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mov public.movimentacoes;
  v_cor public.produto_cores;
  v_novo uuid;
  v_qtd int;
begin
  if not public.usuario_ativo() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_mov from public.movimentacoes where id = p_movimentacao_id for update;
  if not found or v_mov.tipo <> 'baixa' then
    raise exception 'Baixa não encontrada.' using errcode = 'EST02';
  end if;
  if not (public.eh_admin()
          or (v_mov.usuario_id = auth.uid() and v_mov.criado_em > now() - interval '5 minutes')) then
    raise exception 'O prazo para desfazer esta baixa terminou. Peça ao administrador.' using errcode = '42501';
  end if;
  if exists (select 1 from public.movimentacoes where movimentacao_origem_id = v_mov.id) then
    raise exception 'Esta baixa já foi desfeita.' using errcode = 'EST04';
  end if;

  v_qtd := -v_mov.quantidade;
  select * into v_cor from public.produto_cores where id = v_mov.cor_id for update;
  update public.produto_cores set estoque = estoque + v_qtd where id = v_cor.id;

  insert into public.movimentacoes
    (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, cliente_nome,
     movimentacao_origem_id, observacao, usuario_id)
  values
    (v_mov.produto_id, v_mov.cor_id, 'estorno', v_qtd, v_cor.estoque, v_cor.estoque + v_qtd, v_mov.cliente_nome,
     v_mov.id, 'Baixa desfeita', auth.uid())
  returning id into v_novo;

  perform public._auditar('desfazer_baixa', 'movimentacoes', v_mov.id::text,
    jsonb_build_object('estoque', v_cor.estoque),
    jsonb_build_object('estoque', v_cor.estoque + v_qtd, 'estorno_id', v_novo));

  return jsonb_build_object('movimentacao_id', v_novo, 'estoque', v_cor.estoque + v_qtd);
end
$$;

-- ---------------------------------------------------------------------
-- Entrada manual (uma cor) e ajuste de inventário
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrada_manual(
  p_cor_id uuid, p_quantidade int, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cor public.produto_cores;
  v_mov uuid;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100000 then
    raise exception 'Quantidade inválida.' using errcode = 'EST04';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_cor from public.produto_cores where id = p_cor_id and ativo for update;
  if not found or not exists (select 1 from public.produtos where id = v_cor.produto_id and ativo) then
    raise exception 'Cor não encontrada.' using errcode = 'EST02';
  end if;

  update public.produto_cores set estoque = estoque + p_quantidade where id = v_cor.id;
  insert into public.movimentacoes
    (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, observacao, usuario_id)
  values
    (v_cor.produto_id, v_cor.id, 'entrada', p_quantidade, v_cor.estoque, v_cor.estoque + p_quantidade,
     coalesce(nullif(btrim(p_observacao), ''), 'Entrada manual'), auth.uid())
  returning id into v_mov;

  perform public._auditar('registrar_entrada_manual', 'produto_cores', v_cor.id::text,
    jsonb_build_object('estoque', v_cor.estoque),
    jsonb_build_object('estoque', v_cor.estoque + p_quantidade, 'movimentacao_id', v_mov));

  return jsonb_build_object('movimentacao_id', v_mov, 'estoque', v_cor.estoque + p_quantidade);
end
$$;

create or replace function public.ajustar_estoque(p_cor_id uuid, p_novo_estoque int, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cor public.produto_cores;
  v_delta int;
  v_mov uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode ajustar o estoque.' using errcode = '42501';
  end if;
  if p_novo_estoque is null or p_novo_estoque < 0 or p_novo_estoque > 1000000 then
    raise exception 'O estoque não pode ficar negativo.' using errcode = 'EST04';
  end if;
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 500 then
    raise exception 'Informe o motivo do ajuste.' using errcode = 'EST04';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_cor from public.produto_cores where id = p_cor_id and ativo for update;
  if not found then
    raise exception 'Cor não encontrada.' using errcode = 'EST02';
  end if;
  v_delta := p_novo_estoque - v_cor.estoque;
  if v_delta = 0 then
    return jsonb_build_object('movimentacao_id', null, 'estoque', v_cor.estoque);
  end if;

  update public.produto_cores set estoque = p_novo_estoque where id = v_cor.id;
  insert into public.movimentacoes
    (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, observacao, usuario_id)
  values
    (v_cor.produto_id, v_cor.id, 'ajuste', v_delta, v_cor.estoque, p_novo_estoque, v_motivo, auth.uid())
  returning id into v_mov;

  perform public._auditar('ajustar_estoque', 'produto_cores', v_cor.id::text,
    jsonb_build_object('estoque', v_cor.estoque),
    jsonb_build_object('estoque', p_novo_estoque, 'motivo', v_motivo, 'movimentacao_id', v_mov));

  return jsonb_build_object('movimentacao_id', v_mov, 'estoque', p_novo_estoque);
end
$$;

-- ---------------------------------------------------------------------
-- Cadastro de produto (produto + cores + estoque inicial, numa transação)
-- p = { id?, codigo, nome, categoria, descricao, especificacoes{}, estoque_minimo,
--       cores: [{ id?, nome_cor, cor_hex, codigo_barras, estoque_inicial }] }
-- ---------------------------------------------------------------------
create or replace function public.salvar_produto(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_codigo text := upper(btrim(coalesce(p ->> 'codigo', '')));
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_categoria text := coalesce(nullif(btrim(p ->> 'categoria'), ''), 'Sem categoria');
  v_descricao text := coalesce(p ->> 'descricao', '');
  v_specs jsonb := coalesce(p -> 'especificacoes', '{}'::jsonb);
  v_cores jsonb := coalesce(p -> 'cores', '[]'::jsonb);
  v_min int;
  v_prod public.produtos;
  v_cor public.produto_cores;
  c record;
  v_cor_id uuid;
  v_nome_cor text;
  v_hex text;
  v_barras text;
  v_inicial int;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_codigo !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
    raise exception 'Código inválido. Use letras, números, ponto, hífen ou barra (até 40).' using errcode = 'EST04';
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 160 then
    raise exception 'Informe o nome do produto.' using errcode = 'EST04';
  end if;
  if jsonb_typeof(v_specs) <> 'object'
     or (select count(*) from jsonb_object_keys(v_specs)) > 40
     or exists (select 1 from jsonb_each(v_specs) e
                 where jsonb_typeof(e.value) <> 'string'
                    or char_length(e.key) not between 1 and 60
                    or char_length(e.value #>> '{}') > 200) then
    raise exception 'Especificações inválidas.' using errcode = 'EST04';
  end if;
  if jsonb_typeof(v_cores) <> 'array' or jsonb_array_length(v_cores) > 50 then
    raise exception 'Cores inválidas.' using errcode = 'EST04';
  end if;
  v_min := coalesce(nullif(p ->> 'estoque_minimo', '')::int,
                    (select estoque_minimo_padrao from public.configuracoes where id = 1), 0);
  perform set_config('estoque.em_funcao', 'on', true);

  if v_id is null then
    if exists (select 1 from public.produtos where codigo = v_codigo) then
      raise exception 'Já existe um produto com o código %.', v_codigo using errcode = 'EST04';
    end if;
    insert into public.produtos (codigo, nome, categoria, descricao, especificacoes, estoque_minimo, criado_por)
    values (v_codigo, v_nome, v_categoria, v_descricao, v_specs, v_min, auth.uid())
    returning * into v_prod;
  else
    select * into v_prod from public.produtos where id = v_id and ativo for update;
    if not found then
      raise exception 'Produto não encontrado.' using errcode = 'EST02';
    end if;
    if v_codigo <> v_prod.codigo and exists (select 1 from public.produtos where codigo = v_codigo) then
      raise exception 'Já existe um produto com o código %.', v_codigo using errcode = 'EST04';
    end if;
    update public.produtos
       set codigo = v_codigo, nome = v_nome, categoria = v_categoria, descricao = v_descricao,
           especificacoes = v_specs, estoque_minimo = v_min
     where id = v_id
    returning * into v_prod;
  end if;

  if jsonb_array_length(v_cores) = 0 then
    v_cores := '[{"nome_cor": "Padrão"}]'::jsonb;
  end if;

  -- 1) cores removidas da lista → desativadas (só se o estoque estiver zerado)
  for v_cor in
    select * from public.produto_cores pc
     where pc.produto_id = v_prod.id and pc.ativo
       and pc.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(v_cores) x
                          where nullif(x ->> 'id', '') is not null)
     for update
  loop
    if v_cor.estoque > 0 then
      raise exception 'Não é possível remover a cor "%": ainda há % em estoque. Ajuste para 0 antes.',
        v_cor.nome_cor, v_cor.estoque using errcode = 'EST04';
    end if;
    update public.produto_cores set ativo = false where id = v_cor.id;
    update public.produto_fotos set cor_id = null where cor_id = v_cor.id;
  end loop;

  -- 2) cores novas / alteradas
  for c in select x.value as j, x.ordinality::int as ord from jsonb_array_elements(v_cores) with ordinality x loop
    v_cor_id := nullif(c.j ->> 'id', '')::uuid;
    v_nome_cor := btrim(coalesce(c.j ->> 'nome_cor', ''));
    v_hex := coalesce(nullif(btrim(c.j ->> 'cor_hex'), ''), '#B5835A');
    v_barras := nullif(regexp_replace(coalesce(c.j ->> 'codigo_barras', ''), '[^0-9]', '', 'g'), '');
    v_inicial := coalesce(nullif(c.j ->> 'estoque_inicial', '')::int, 0);

    if char_length(v_nome_cor) < 1 or char_length(v_nome_cor) > 60 then
      raise exception 'Informe o nome de cada cor.' using errcode = 'EST04';
    end if;
    if v_hex !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Cor "%": código de cor inválido.', v_nome_cor using errcode = 'EST04';
    end if;
    if v_barras is not null and v_barras !~ '^[0-9]{8,14}$' then
      raise exception 'Cor "%": código de barras deve ter de 8 a 14 dígitos.', v_nome_cor using errcode = 'EST04';
    end if;
    if v_inicial < 0 or v_inicial > 100000 then
      raise exception 'Cor "%": estoque inicial inválido.', v_nome_cor using errcode = 'EST04';
    end if;

    if v_cor_id is null then
      insert into public.produto_cores (produto_id, nome_cor, cor_hex, codigo_barras, ordem)
      values (v_prod.id, v_nome_cor, upper(v_hex), v_barras, c.ord)
      returning * into v_cor;
      if v_inicial > 0 then
        update public.produto_cores set estoque = v_inicial where id = v_cor.id;
        insert into public.movimentacoes
          (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, observacao, usuario_id)
        values (v_prod.id, v_cor.id, 'entrada', v_inicial, 0, v_inicial, 'Estoque inicial (cadastro)', auth.uid());
      end if;
    else
      update public.produto_cores
         set nome_cor = v_nome_cor, cor_hex = upper(v_hex), codigo_barras = v_barras, ordem = c.ord
       where id = v_cor_id and produto_id = v_prod.id and ativo;
      if not found then
        raise exception 'Cor "%" não encontrada neste produto.', v_nome_cor using errcode = 'EST02';
      end if;
    end if;
  end loop;

  return v_prod.id;
exception
  when unique_violation then
    raise exception 'Código de barras ou nome de cor repetido. Cada código de barras só pode estar em uma cor.'
      using errcode = 'EST04';
end
$$;

-- Exclusão lógica (admin). As fotos vão para a fila de exclusão do R2.
create or replace function public.excluir_produto(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod public.produtos;
  v_total int;
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode excluir produtos.' using errcode = '42501';
  end if;
  select * into v_prod from public.produtos where id = p_produto_id and ativo for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'EST02';
  end if;
  select coalesce(sum(estoque), 0) into v_total from public.produto_cores where produto_id = p_produto_id and ativo;
  if v_total > 0 then
    raise exception 'Este produto ainda tem % unidade(s) em estoque. Ajuste para 0 antes de excluir.', v_total
      using errcode = 'EST04';
  end if;

  insert into public.arquivos_pendentes_exclusao (chave_r2)
  select k from public.produto_fotos f, lateral (values (f.chave_r2), (f.chave_r2_thumb)) as v(k)
   where f.produto_id = p_produto_id;
  delete from public.produto_fotos where produto_id = p_produto_id;
  update public.produto_cores set ativo = false where produto_id = p_produto_id;
  update public.produtos set ativo = false where id = p_produto_id;

  perform public._auditar('excluir_produto', 'produtos', p_produto_id::text, to_jsonb(v_prod) - 'busca_texto' - 'nome_busca', null);
end
$$;

-- ---------------------------------------------------------------------
-- Fotos (o arquivo já está no R2; o servidor conferiu tamanho e magic bytes)
-- ---------------------------------------------------------------------
create or replace function public.registrar_foto(
  p_produto_id uuid, p_cor_id uuid, p_chave text, p_chave_thumb text, p_tamanho int)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.produtos where id = p_produto_id and ativo) then
    raise exception 'Produto não encontrado.' using errcode = 'EST02';
  end if;
  if p_cor_id is not null and not exists (
       select 1 from public.produto_cores where id = p_cor_id and produto_id = p_produto_id and ativo) then
    raise exception 'Cor não encontrada neste produto.' using errcode = 'EST02';
  end if;
  if p_chave is null or p_chave !~ ('^produtos/' || p_produto_id::text || '/[0-9a-f-]{36}\.webp$')
     or p_chave_thumb is distinct from regexp_replace(p_chave, '\.webp$', '_thumb.webp') then
    raise exception 'Arquivo de foto inválido.' using errcode = 'EST04';
  end if;
  if (select count(*) from public.produto_fotos where produto_id = p_produto_id) >= 60 then
    raise exception 'Limite de 60 fotos por produto.' using errcode = 'EST04';
  end if;

  insert into public.produto_fotos (produto_id, cor_id, chave_r2, chave_r2_thumb, tamanho_bytes, ordem)
  values (p_produto_id, p_cor_id, p_chave, p_chave_thumb, greatest(coalesce(p_tamanho, 0), 0),
          coalesce((select max(ordem) + 1 from public.produto_fotos where produto_id = p_produto_id), 0))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.remover_foto(p_foto_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_foto public.produto_fotos;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  delete from public.produto_fotos where id = p_foto_id returning * into v_foto;
  if not found then
    raise exception 'Foto não encontrada.' using errcode = 'EST02';
  end if;
  insert into public.arquivos_pendentes_exclusao (chave_r2) values (v_foto.chave_r2), (v_foto.chave_r2_thumb);
end
$$;

create or replace function public.reordenar_fotos(p_produto_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.produto_fotos f
     set ordem = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where f.id = x.id and f.produto_id = p_produto_id;
end
$$;

create or replace function public.definir_cor_foto(p_foto_id uuid, p_cor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_produto uuid;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select produto_id into v_produto from public.produto_fotos where id = p_foto_id;
  if v_produto is null then
    raise exception 'Foto não encontrada.' using errcode = 'EST02';
  end if;
  if p_cor_id is not null and not exists (
       select 1 from public.produto_cores where id = p_cor_id and produto_id = v_produto and ativo) then
    raise exception 'Cor não encontrada neste produto.' using errcode = 'EST02';
  end if;
  update public.produto_fotos set cor_id = p_cor_id where id = p_foto_id;
end
$$;

-- ---------------------------------------------------------------------
-- Entrada por nota: rascunho → itens em lotes de até 25 → confirmação ATÔMICA
-- ---------------------------------------------------------------------
create or replace function public.criar_nota_rascunho(p_cab jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chave text := nullif(btrim(p_cab ->> 'chave_acesso'), '');
  v_origem text := p_cab ->> 'origem';
  v_cnpj text := nullif(regexp_replace(coalesce(p_cab #>> '{fornecedor,cnpj}', ''), '[^0-9]', '', 'g'), '');
  v_razao text := nullif(btrim(p_cab #>> '{fornecedor,razao_social}'), '');
  v_arquivo text := nullif(p_cab ->> 'chave_r2_arquivo', '');
  v_id uuid := nullif(p_cab ->> 'nota_id', '')::uuid;
  v_forn uuid;
  v_existente public.notas_entrada;
  v_nome text;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_origem is null or v_origem not in ('xml', 'pdf', 'manual') then
    raise exception 'Origem da nota inválida.' using errcode = 'EST04';
  end if;
  if v_origem = 'xml' and v_chave is null then
    raise exception 'A nota em XML precisa da chave de acesso.' using errcode = 'EST04';
  end if;
  if v_chave is not null and not public.chave_nfe_valida(v_chave) then
    raise exception 'Chave de acesso inválida (confira os 44 dígitos).' using errcode = 'EST04';
  end if;
  if v_arquivo is not null and v_arquivo !~ '^notas/[0-9a-f-]{36}\.(xml|pdf)$' then
    raise exception 'Arquivo da nota inválido.' using errcode = 'EST04';
  end if;

  if v_cnpj is not null then
    if v_cnpj !~ '^([0-9]{11}|[0-9]{14})$' then
      raise exception 'CNPJ/CPF do fornecedor inválido.' using errcode = 'EST04';
    end if;
    insert into public.fornecedores (cnpj, razao_social, nome_fantasia)
    values (v_cnpj, coalesce(left(v_razao, 200), 'Fornecedor ' || v_cnpj),
            nullif(left(btrim(p_cab #>> '{fornecedor,nome_fantasia}'), 200), ''))
    on conflict (cnpj) do update
      set razao_social = coalesce(left(v_razao, 200), public.fornecedores.razao_social),
          nome_fantasia = coalesce(excluded.nome_fantasia, public.fornecedores.nome_fantasia)
    returning id into v_forn;
  end if;

  if v_chave is not null then
    select * into v_existente from public.notas_entrada
     where chave_acesso = v_chave and status <> 'cancelada' for update;
    if found then
      if v_existente.status = 'confirmada' then
        select nome into v_nome from public.perfis where id = v_existente.usuario_id;
        raise exception 'Esta nota já deu entrada em % por %.',
          to_char(v_existente.confirmada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
          coalesce(v_nome, 'usuário removido') using errcode = 'EST03';
      end if;
      if v_existente.usuario_id <> auth.uid() and v_existente.criado_em > now() - interval '30 minutes' then
        select nome into v_nome from public.perfis where id = v_existente.usuario_id;
        raise exception 'Esta nota está sendo conferida por % agora. Tente de novo em alguns minutos.',
          coalesce(v_nome, 'outro usuário') using errcode = 'EST03';
      end if;
      v_id := v_existente.id;
    else
      v_id := null;
    end if;
  elsif v_id is not null then
    select * into v_existente from public.notas_entrada
     where id = v_id and status = 'rascunho' and usuario_id = auth.uid() for update;
    if not found then
      v_id := null;
    end if;
  end if;

  if v_id is not null then
    if v_existente.chave_r2_arquivo is not null and v_existente.chave_r2_arquivo is distinct from v_arquivo then
      insert into public.arquivos_pendentes_exclusao (chave_r2) values (v_existente.chave_r2_arquivo);
    end if;
    delete from public.nota_itens where nota_id = v_id;
    update public.notas_entrada
       set numero = nullif(btrim(p_cab ->> 'numero'), ''),
           serie = nullif(btrim(p_cab ->> 'serie'), ''),
           fornecedor_id = v_forn,
           data_emissao = nullif(p_cab ->> 'data_emissao', '')::date,
           valor_total = nullif(p_cab ->> 'valor_total', '')::numeric,
           origem = v_origem,
           chave_r2_arquivo = v_arquivo,
           tamanho_arquivo_bytes = greatest(coalesce(nullif(p_cab ->> 'tamanho_arquivo_bytes', '')::int, 0), 0),
           observacao = nullif(btrim(p_cab ->> 'observacao'), ''),
           usuario_id = auth.uid(),
           criado_em = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.notas_entrada
    (chave_acesso, numero, serie, fornecedor_id, data_emissao, valor_total, origem,
     chave_r2_arquivo, tamanho_arquivo_bytes, observacao, usuario_id)
  values
    (v_chave, nullif(btrim(p_cab ->> 'numero'), ''), nullif(btrim(p_cab ->> 'serie'), ''), v_forn,
     nullif(p_cab ->> 'data_emissao', '')::date, nullif(p_cab ->> 'valor_total', '')::numeric, v_origem,
     v_arquivo, greatest(coalesce(nullif(p_cab ->> 'tamanho_arquivo_bytes', '')::int, 0), 0),
     nullif(btrim(p_cab ->> 'observacao'), ''), auth.uid())
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Esta nota acabou de ser lançada por outro usuário.' using errcode = 'EST03';
end
$$;

create or replace function public.salvar_itens_nota(p_nota_id uuid, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota public.notas_entrada;
  r record;
  v_qtd numeric;
  v_n int := 0;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_nota from public.notas_entrada where id = p_nota_id for update;
  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'EST02';
  end if;
  if v_nota.status <> 'rascunho' then
    raise exception 'Esta nota não está mais em rascunho.' using errcode = 'EST04';
  end if;
  if v_nota.usuario_id <> auth.uid() then
    raise exception 'Esta nota está com outro usuário.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 25 then
    raise exception 'Envie entre 1 e 25 itens por lote.' using errcode = 'EST04';
  end if;

  for r in
    select * from jsonb_to_recordset(p_itens) as x(
      n_item int, codigo_fornecedor text, ean text, descricao text, unidade text,
      quantidade_nota numeric, fator_conversao numeric, valor_unitario numeric, cor_id uuid, status text)
  loop
    if r.n_item is null or r.n_item not between 1 and 990 then
      raise exception 'Item com número inválido.' using errcode = 'EST04';
    end if;
    if r.status is null or r.status not in ('vinculado', 'novo_produto', 'ignorado') then
      raise exception 'Item %: situação inválida.', r.n_item using errcode = 'EST04';
    end if;
    if coalesce(r.quantidade_nota, 0) <= 0 or r.quantidade_nota > 1000000 then
      raise exception 'Item %: quantidade inválida.', r.n_item using errcode = 'EST04';
    end if;
    if coalesce(r.fator_conversao, 1) <= 0 or coalesce(r.fator_conversao, 1) > 10000 then
      raise exception 'Item %: fator de conversão inválido.', r.n_item using errcode = 'EST04';
    end if;
    v_qtd := r.quantidade_nota * coalesce(r.fator_conversao, 1);

    if r.status = 'vinculado' then
      if r.cor_id is null or not exists (
           select 1 from public.produto_cores c join public.produtos p on p.id = c.produto_id
            where c.id = r.cor_id and c.ativo and p.ativo) then
        raise exception 'Item %: produto/cor não encontrado.', r.n_item using errcode = 'EST04';
      end if;
      if v_qtd <> trunc(v_qtd) or v_qtd < 1 or v_qtd > 1000000 then
        raise exception 'Item %: a quantidade de entrada (% × %) precisa ser um número inteiro. Ajuste o fator de conversão.',
          r.n_item, trim_scale(r.quantidade_nota), trim_scale(coalesce(r.fator_conversao, 1)) using errcode = 'EST04';
      end if;
    end if;

    insert into public.nota_itens
      (nota_id, n_item, codigo_fornecedor, ean, descricao, unidade, quantidade_nota, fator_conversao,
       quantidade_entrada, valor_unitario, cor_id, status)
    values
      (p_nota_id, r.n_item, nullif(left(btrim(r.codigo_fornecedor), 60), ''),
       case when r.ean ~ '^[0-9]{8,14}$' then r.ean end,
       coalesce(nullif(left(btrim(r.descricao), 500), ''), 'Item ' || r.n_item),
       nullif(left(btrim(r.unidade), 10), ''), r.quantidade_nota, coalesce(r.fator_conversao, 1),
       case when r.status = 'vinculado' then v_qtd::int else 0 end,
       case when r.valor_unitario >= 0 then r.valor_unitario end,
       case when r.status = 'vinculado' then r.cor_id end, r.status)
    on conflict (nota_id, n_item) do update
      set codigo_fornecedor = excluded.codigo_fornecedor, ean = excluded.ean, descricao = excluded.descricao,
          unidade = excluded.unidade, quantidade_nota = excluded.quantidade_nota,
          fator_conversao = excluded.fator_conversao, quantidade_entrada = excluded.quantidade_entrada,
          valor_unitario = excluded.valor_unitario, cor_id = excluded.cor_id, status = excluded.status;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- Confirmação ATÔMICA: ou a nota inteira entra, ou nada entra.
create or replace function public.confirmar_nota_entrada(p_nota_id uuid, p_total_itens int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota public.notas_entrada;
  r record;
  v_antes int;
  v_depois int;
  v_itens int := 0;
  v_unidades int := 0;
  v_qtd_itens int;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_nota from public.notas_entrada where id = p_nota_id for update;
  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'EST02';
  end if;
  if v_nota.status <> 'rascunho' then
    raise exception 'Esta nota não está em rascunho (situação: %).', v_nota.status using errcode = 'EST04';
  end if;
  if v_nota.usuario_id <> auth.uid() then
    raise exception 'Esta nota está com outro usuário.' using errcode = '42501';
  end if;

  select count(*) into v_qtd_itens from public.nota_itens where nota_id = p_nota_id;
  if p_total_itens is null or v_qtd_itens <> p_total_itens then
    raise exception 'Itens incompletos (% de %). Envie a nota novamente.', v_qtd_itens, p_total_itens
      using errcode = 'EST04';
  end if;
  if exists (select 1 from public.nota_itens where nota_id = p_nota_id and status = 'novo_produto') then
    raise exception 'Há itens marcados como produto novo sem cadastro. Cadastre ou ignore antes de confirmar.'
      using errcode = 'EST04';
  end if;
  if not exists (select 1 from public.nota_itens where nota_id = p_nota_id and status = 'vinculado') then
    raise exception 'Nenhum item vinculado para dar entrada.' using errcode = 'EST04';
  end if;

  -- trava as cores em ordem fixa (evita deadlock entre duas notas ao mesmo tempo)
  perform 1 from public.produto_cores c
   where c.id in (select cor_id from public.nota_itens where nota_id = p_nota_id and status = 'vinculado')
   order by c.id
   for update;

  if exists (select 1 from public.nota_itens i
               join public.produto_cores c on c.id = i.cor_id
               join public.produtos p on p.id = c.produto_id
              where i.nota_id = p_nota_id and i.status = 'vinculado' and (not c.ativo or not p.ativo)) then
    raise exception 'Um dos produtos vinculados foi excluído. Revise os vínculos.' using errcode = 'EST04';
  end if;

  for r in
    select i.*, c.produto_id
      from public.nota_itens i join public.produto_cores c on c.id = i.cor_id
     where i.nota_id = p_nota_id and i.status = 'vinculado'
     order by i.n_item
  loop
    if r.quantidade_entrada < 1 or r.quantidade_nota * r.fator_conversao <> r.quantidade_entrada then
      raise exception 'Item %: quantidade de entrada inconsistente.', r.n_item using errcode = 'EST04';
    end if;

    update public.produto_cores
       set estoque = estoque + r.quantidade_entrada
     where id = r.cor_id
    returning estoque - r.quantidade_entrada, estoque into v_antes, v_depois;

    insert into public.movimentacoes
      (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, nota_id, observacao, usuario_id)
    values
      (r.produto_id, r.cor_id, 'entrada', r.quantidade_entrada, v_antes, v_depois, p_nota_id,
       left('NF ' || coalesce(v_nota.numero, 's/n') || ' · item ' || r.n_item || ' · ' || r.descricao, 500), auth.uid());

    -- memória do fornecedor: a próxima nota vincula sozinha
    if v_nota.fornecedor_id is not null and r.codigo_fornecedor is not null then
      insert into public.codigos_fornecedor (fornecedor_id, codigo_fornecedor, descricao_fornecedor, cor_id, fator_conversao)
      values (v_nota.fornecedor_id, r.codigo_fornecedor, r.descricao, r.cor_id, r.fator_conversao)
      on conflict (fornecedor_id, codigo_fornecedor) do update
        set cor_id = excluded.cor_id, fator_conversao = excluded.fator_conversao,
            descricao_fornecedor = excluded.descricao_fornecedor;
    end if;

    v_itens := v_itens + 1;
    v_unidades := v_unidades + r.quantidade_entrada;
  end loop;

  update public.notas_entrada set status = 'confirmada', confirmada_em = now() where id = p_nota_id;

  perform public._auditar('confirmar_nota_entrada', 'notas_entrada', p_nota_id::text, null,
    jsonb_build_object('chave_acesso', v_nota.chave_acesso, 'numero', v_nota.numero,
                       'itens', v_itens, 'unidades', v_unidades));

  return jsonb_build_object('nota_id', p_nota_id, 'itens', v_itens, 'unidades', v_unidades);
end
$$;

-- Cancelamento (admin): gera estornos de todas as entradas da nota.
create or replace function public.cancelar_nota_entrada(p_nota_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota public.notas_entrada;
  m record;
  v_antes int;
  v_depois int;
  v_n int := 0;
  v_desc text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode cancelar notas.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 3 or char_length(v_motivo) > 300 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'EST04';
  end if;
  perform set_config('estoque.em_funcao', 'on', true);

  select * into v_nota from public.notas_entrada where id = p_nota_id for update;
  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'EST02';
  end if;
  if v_nota.status = 'cancelada' then
    raise exception 'Esta nota já está cancelada.' using errcode = 'EST04';
  end if;

  if v_nota.status = 'confirmada' then
    perform 1 from public.produto_cores c
     where c.id in (select cor_id from public.movimentacoes where nota_id = p_nota_id and tipo = 'entrada')
     order by c.id
     for update;

    for m in
      select * from public.movimentacoes
       where nota_id = p_nota_id and tipo = 'entrada'
         and not exists (select 1 from public.movimentacoes e where e.movimentacao_origem_id = movimentacoes.id)
       order by criado_em
    loop
      update public.produto_cores
         set estoque = estoque - m.quantidade
       where id = m.cor_id and estoque >= m.quantidade
      returning estoque + m.quantidade, estoque into v_antes, v_depois;
      if not found then
        select p.nome || ' — ' || c.nome_cor into v_desc
          from public.produto_cores c join public.produtos p on p.id = c.produto_id where c.id = m.cor_id;
        raise exception 'Não é possível cancelar: o estoque de "%" ficaria negativo (parte já foi vendida). Faça um ajuste antes.',
          v_desc using errcode = 'EST01';
      end if;
      insert into public.movimentacoes
        (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, nota_id, movimentacao_origem_id,
         observacao, usuario_id)
      values
        (m.produto_id, m.cor_id, 'estorno', -m.quantidade, v_antes, v_depois, p_nota_id, m.id,
         left('Cancelamento da NF ' || coalesce(v_nota.numero, 's/n') || ': ' || v_motivo, 500), auth.uid());
      v_n := v_n + 1;
    end loop;
  end if;

  update public.notas_entrada
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = v_motivo
   where id = p_nota_id;

  perform public._auditar('cancelar_nota_entrada', 'notas_entrada', p_nota_id::text,
    jsonb_build_object('status', v_nota.status),
    jsonb_build_object('status', 'cancelada', 'estornos', v_n, 'motivo', v_motivo));

  return jsonb_build_object('nota_id', p_nota_id, 'estornos', v_n);
end
$$;

-- Descartar rascunho (dono ou admin)
create or replace function public.descartar_rascunho(p_nota_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nota public.notas_entrada;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_nota from public.notas_entrada where id = p_nota_id and status = 'rascunho' for update;
  if not found then
    return;
  end if;
  if v_nota.usuario_id <> auth.uid() and not public.eh_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_nota.chave_r2_arquivo is not null then
    insert into public.arquivos_pendentes_exclusao (chave_r2) values (v_nota.chave_r2_arquivo);
  end if;
  delete from public.notas_entrada where id = p_nota_id;
end
$$;

-- Vínculo automático: 1) memória do fornecedor  2) EAN  3) sugestão pela busca (o usuário confirma)
create or replace function public.resolver_vinculos_nota(p_cnpj text, p_itens jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_forn uuid;
  r record;
  v_res jsonb := '[]'::jsonb;
  v_cor uuid;
  v_fator numeric;
  v_origem text;
  v_desc text;
  v_pid uuid;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 25 then
    raise exception 'Envie até 25 itens por lote.' using errcode = 'EST04';
  end if;
  select id into v_forn from public.fornecedores
   where cnpj = regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  for r in
    select * from jsonb_to_recordset(p_itens) as x(n_item int, codigo_fornecedor text, ean text, descricao text)
  loop
    v_cor := null; v_fator := 1; v_origem := null; v_pid := null;

    if v_forn is not null and nullif(btrim(r.codigo_fornecedor), '') is not null then
      select cf.cor_id, cf.fator_conversao into v_cor, v_fator
        from public.codigos_fornecedor cf
        join public.produto_cores c on c.id = cf.cor_id and c.ativo
       where cf.fornecedor_id = v_forn and cf.codigo_fornecedor = btrim(r.codigo_fornecedor);
      if v_cor is not null then
        v_origem := 'memoria';
      else
        v_fator := 1;
      end if;
    end if;

    if v_cor is null and r.ean ~ '^[0-9]{8,14}$' then
      select c.id into v_cor from public.produto_cores c where c.codigo_barras = r.ean and c.ativo;
      if v_cor is not null then
        v_origem := 'ean';
      end if;
    end if;

    if v_cor is null and nullif(btrim(r.descricao), '') is not null then
      v_desc := public.normalizar_busca(r.descricao);
      select p.id into v_pid
        from public.produtos p
       where p.ativo and p.nome_busca <> '' and p.nome_busca <% v_desc
       order by word_similarity(p.nome_busca, v_desc) desc, char_length(p.nome_busca) desc
       limit 1;
      if v_pid is not null then
        select c.id into v_cor
          from public.produto_cores c
         where c.produto_id = v_pid and c.ativo
         order by (v_desc like '%' || public.normalizar_busca(c.nome_cor) || '%') desc, c.ordem
         limit 1;
        if v_cor is not null then
          v_origem := 'sugestao';
        end if;
      end if;
    end if;

    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'n_item', r.n_item,
      'cor_id', v_cor,
      'origem', v_origem,
      'fator_conversao', coalesce(v_fator, 1),
      'produto', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'codigo', p.codigo,
                                            'nome_cor', c.nome_cor, 'cor_hex', c.cor_hex, 'estoque', c.estoque)
                    from public.produto_cores c join public.produtos p on p.id = c.produto_id
                   where c.id = v_cor)));
  end loop;
  return v_res;
end
$$;

-- ---------------------------------------------------------------------
-- Importação em massa (planilha) — lote de até 25 linhas, upsert por código + cor.
-- O lote inteiro é atômico: se uma linha falhar, nada do lote é gravado.
-- ---------------------------------------------------------------------
create or replace function public.importar_lote_produtos(p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_prod public.produtos;
  v_cor public.produto_cores;
  v_codigo text;
  v_nome text;
  v_nome_cor text;
  v_hex text;
  v_barras text;
  v_specs jsonb;
  v_min int;
  v_min_padrao int;
  v_acao_prod text;
  v_acao_cor text;
  v_aviso text;
  v_res jsonb := '[]'::jsonb;
  v_linha int;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 25 then
    raise exception 'Envie entre 1 e 25 linhas por lote.' using errcode = 'EST04';
  end if;
  select estoque_minimo_padrao into v_min_padrao from public.configuracoes where id = 1;
  perform set_config('estoque.em_funcao', 'on', true);

  for r in
    select * from jsonb_to_recordset(p_linhas) as x(
      linha int, codigo text, nome text, categoria text, descricao text, cor text, cor_hex text,
      codigo_barras text, estoque int, estoque_minimo int, especificacoes jsonb)
  loop
    v_linha := r.linha;
    v_codigo := upper(btrim(coalesce(r.codigo, '')));
    v_nome := btrim(coalesce(r.nome, ''));
    v_nome_cor := coalesce(nullif(btrim(r.cor), ''), 'Padrão');
    v_hex := upper(coalesce(nullif(btrim(r.cor_hex), ''), '#B5835A'));
    v_barras := nullif(regexp_replace(coalesce(r.codigo_barras, ''), '[^0-9]', '', 'g'), '');
    v_specs := coalesce(r.especificacoes, '{}'::jsonb);
    v_aviso := null;

    if v_codigo !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
      raise exception 'Linha %: código inválido.', v_linha using errcode = 'EST04';
    end if;
    if char_length(v_nome) not between 2 and 160 then
      raise exception 'Linha %: informe o nome.', v_linha using errcode = 'EST04';
    end if;
    if v_hex !~ '^#[0-9A-F]{6}$' then
      raise exception 'Linha %: cor_hex inválido (use #RRGGBB).', v_linha using errcode = 'EST04';
    end if;
    if v_barras is not null and v_barras !~ '^[0-9]{8,14}$' then
      raise exception 'Linha %: código de barras deve ter de 8 a 14 dígitos.', v_linha using errcode = 'EST04';
    end if;
    if coalesce(r.estoque, 0) < 0 or coalesce(r.estoque, 0) > 100000 then
      raise exception 'Linha %: estoque inválido.', v_linha using errcode = 'EST04';
    end if;
    if jsonb_typeof(v_specs) <> 'object'
       or exists (select 1 from jsonb_each(v_specs) e where jsonb_typeof(e.value) <> 'string') then
      raise exception 'Linha %: especificações inválidas.', v_linha using errcode = 'EST04';
    end if;
    v_min := coalesce(r.estoque_minimo, v_min_padrao, 0);
    if v_min < 0 then
      raise exception 'Linha %: estoque mínimo inválido.', v_linha using errcode = 'EST04';
    end if;

    -- produto
    select * into v_prod from public.produtos where codigo = v_codigo for update;
    if not found then
      insert into public.produtos (codigo, nome, categoria, descricao, especificacoes, estoque_minimo, criado_por)
      values (v_codigo, v_nome, coalesce(nullif(btrim(r.categoria), ''), 'Sem categoria'),
              coalesce(r.descricao, ''), v_specs, v_min, auth.uid())
      returning * into v_prod;
      v_acao_prod := 'criado';
    else
      update public.produtos
         set nome = v_nome,
             categoria = coalesce(nullif(btrim(r.categoria), ''), categoria),
             descricao = coalesce(nullif(r.descricao, ''), descricao),
             especificacoes = case when v_specs = '{}'::jsonb then especificacoes else v_specs end,
             estoque_minimo = coalesce(r.estoque_minimo, estoque_minimo),
             ativo = true
       where id = v_prod.id
      returning * into v_prod;
      v_acao_prod := 'atualizado';
    end if;

    -- cor
    select * into v_cor from public.produto_cores
     where produto_id = v_prod.id and lower(nome_cor) = lower(v_nome_cor) and ativo
     for update;
    if not found then
      insert into public.produto_cores (produto_id, nome_cor, cor_hex, codigo_barras, ordem)
      values (v_prod.id, v_nome_cor, v_hex, v_barras,
              coalesce((select max(ordem) + 1 from public.produto_cores where produto_id = v_prod.id), 1))
      returning * into v_cor;
      v_acao_cor := 'criada';
      if coalesce(r.estoque, 0) > 0 then
        update public.produto_cores set estoque = r.estoque where id = v_cor.id;
        insert into public.movimentacoes
          (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, observacao, usuario_id)
        values (v_prod.id, v_cor.id, 'entrada', r.estoque, 0, r.estoque, 'Importação de planilha (estoque inicial)', auth.uid());
      end if;
    else
      update public.produto_cores
         set cor_hex = v_hex, codigo_barras = coalesce(v_barras, codigo_barras)
       where id = v_cor.id;
      v_acao_cor := 'atualizada';
      -- A planilha NUNCA altera o estoque de uma cor que já existe (baixa só pela janela "Fazer Baixa";
      -- entrada pela tela de Entrada de Mercadorias).
      if r.estoque is not null and r.estoque <> v_cor.estoque then
        v_aviso := 'Estoque não alterado: a planilha só define o estoque inicial de cores novas.';
      end if;
    end if;

    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'linha', v_linha, 'codigo', v_codigo, 'cor', v_nome_cor,
      'produto', v_acao_prod, 'acao_cor', v_acao_cor, 'aviso', v_aviso));
  end loop;

  perform public._auditar('importar_lote_produtos', 'produtos', null, null,
    jsonb_build_object('linhas', jsonb_array_length(p_linhas)));
  return jsonb_build_object('resultados', v_res);
exception
  when unique_violation then
    raise exception 'Linha %: código de barras já usado em outra cor.', v_linha using errcode = 'EST04';
end
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000005_auditoria_admin.sql
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000006_permissoes.sql
-- =====================================================================
-- 0006 — Permissões (GRANT/REVOKE). Rode por último.
--   anon           → nada
--   authenticated  → SELECT (filtrado pela RLS) + EXECUTE nas funções públicas do app
--   service_role   → funções internas do servidor (login, sessões, e-mail)
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Objetos criados no futuro também nascem fechados
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

-- Leitura (a RLS decide as linhas)
grant select on
  public.perfis, public.produtos, public.produto_cores, public.produto_fotos,
  public.fornecedores, public.codigos_fornecedor, public.notas_entrada, public.nota_itens,
  public.movimentacoes, public.auditoria, public.sistema_status, public.busca_vocabulario
to authenticated;
-- configurações: o hash do PIN nunca é legível
grant select (id, exigir_pin_cliente, estoque_minimo_padrao, atualizado_em) on public.configuracoes to authenticated;

-- Funções usadas pela RLS e pela busca (precisam de EXECUTE para o usuário logado)
grant execute on function
  public.sessao_valida(), public.usuario_ativo(), public.eh_admin(), public.pode_lancar_entrada(),
  public.meu_perfil(), public.f_unaccent(text), public.normalizar_busca(text), public.chave_nfe_valida(text)
to authenticated;

-- Funções do app
grant execute on function
  public.buscar_produtos(text, int),
  public.sugestao_busca(text),
  public.mais_vendidos(int, int),
  public.ultimas_baixas(int),
  public.registrar_baixa(uuid, int, text, text),
  public.desfazer_baixa(uuid),
  public.registrar_entrada_manual(uuid, int, text),
  public.ajustar_estoque(uuid, int, text),
  public.salvar_produto(jsonb),
  public.excluir_produto(uuid),
  public.registrar_foto(uuid, uuid, text, text, int),
  public.remover_foto(uuid),
  public.reordenar_fotos(uuid, uuid[]),
  public.definir_cor_foto(uuid, uuid),
  public.criar_nota_rascunho(jsonb),
  public.salvar_itens_nota(uuid, jsonb),
  public.confirmar_nota_entrada(uuid, int),
  public.cancelar_nota_entrada(uuid, text),
  public.descartar_rascunho(uuid),
  public.resolver_vinculos_nota(text, jsonb),
  public.importar_lote_produtos(jsonb),
  public.admin_atualizar_perfil(uuid, text, text, boolean, boolean),
  public.salvar_configuracoes(boolean, text, int),
  public.verificar_pin_cliente(text),
  public.uso_plano()
to authenticated;

-- Só o servidor (service_role)
grant execute on function
  public.login_bloqueado(text, text),
  public.registrar_tentativa_login(text, text, boolean),
  public.email_por_usuario(text),
  public.revogar_sessoes(uuid),
  public.registrar_status(text, text),
  public.limpar_rascunhos_antigos()
to service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000007_listagem.sql
-- =====================================================================
-- 0007 — Listagem de produtos (filtros + paginação) e listas auxiliares
-- =====================================================================

create or replace function public._cores_json(p_produto_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nome_cor', c.nome_cor, 'cor_hex', c.cor_hex, 'estoque', c.estoque, 'codigo_barras', c.codigo_barras)
           order by c.ordem, c.nome_cor), '[]'::jsonb)
    from public.produto_cores c
   where c.produto_id = p_produto_id and c.ativo
$$;

create or replace function public._fotos_json(p_produto_id uuid, p_limite int default 8)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'cor_id', f.cor_id, 'chave_thumb', f.chave_r2_thumb)
           order by f.ordem), '[]'::jsonb)
    from (select id, cor_id, chave_r2_thumb, ordem from public.produto_fotos
           where produto_id = p_produto_id order by ordem limit p_limite) f
$$;

-- p_filtro: null | 'sem_estoque' | 'abaixo_minimo'
create or replace function public.listar_produtos(
  p_categoria text default null, p_cor text default null, p_filtro text default null,
  p_offset int default 0, p_limite int default 30)
returns table (
  produto_id uuid, codigo text, nome text, categoria text,
  estoque_total int, estoque_minimo int, cores jsonb, fotos jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select p.id, p.codigo, p.nome, p.categoria, p.estoque_minimo,
           coalesce((select sum(c.estoque) from public.produto_cores c
                      where c.produto_id = p.id and c.ativo), 0)::int as total
      from public.produtos p
     where p.ativo
       and (nullif(p_categoria, '') is null or p.categoria = p_categoria)
       and (nullif(p_cor, '') is null or exists (
             select 1 from public.produto_cores c
              where c.produto_id = p.id and c.ativo and lower(c.nome_cor) = lower(p_cor)))
  )
  select b.id, b.codigo, b.nome, b.categoria, b.total, b.estoque_minimo,
         public._cores_json(b.id), public._fotos_json(b.id, 8)
    from base b
   where nullif(p_filtro, '') is null
      or (p_filtro = 'sem_estoque' and b.total = 0)
      or (p_filtro = 'abaixo_minimo' and b.total > 0 and b.total < b.estoque_minimo)
   order by b.nome, b.codigo
  offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limite, 30), 1), 60)
$$;

create or replace function public.categorias_produtos()
returns table (categoria text, quantidade bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select categoria, count(*) from public.produtos where ativo group by categoria order by categoria
$$;

create or replace function public.nomes_cores()
returns table (nome_cor text, cor_hex text, quantidade bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select min(c.nome_cor), min(c.cor_hex), count(*)
    from public.produto_cores c
    join public.produtos p on p.id = c.produto_id and p.ativo
   where c.ativo
   group by lower(c.nome_cor)
   order by min(c.nome_cor)
$$;

grant execute on function
  public._cores_json(uuid), public._fotos_json(uuid, int),
  public.listar_produtos(text, text, text, int, int),
  public.categorias_produtos(), public.nomes_cores()
to authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000008_codigo_barras.sql
-- =====================================================================
-- 0008 — Vincular um código de barras bipado a uma cor existente
--        (Entrada → Código de barras → "Vincular a produto existente")
-- =====================================================================
create or replace function public.definir_codigo_barras(p_cor_id uuid, p_codigo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  v_outro text;
begin
  if not public.pode_lancar_entrada() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_codigo !~ '^[0-9]{8,14}$' then
    raise exception 'O código de barras deve ter de 8 a 14 dígitos.' using errcode = 'EST04';
  end if;
  select p.nome || ' — ' || c.nome_cor into v_outro
    from public.produto_cores c join public.produtos p on p.id = c.produto_id
   where c.codigo_barras = v_codigo and c.ativo and c.id <> p_cor_id;
  if v_outro is not null then
    raise exception 'Este código já está em "%".', v_outro using errcode = 'EST04';
  end if;
  update public.produto_cores set codigo_barras = v_codigo where id = p_cor_id and ativo;
  if not found then
    raise exception 'Cor não encontrada.' using errcode = 'EST02';
  end if;
end
$$;

grant execute on function public.definir_codigo_barras(uuid, text) to authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000009_primeiro_acesso.sql
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 20261125000010_service_role.sql
-- =====================================================================
-- 0010 — Permissões explícitas da service_role (usada SÓ pelo servidor:
--        login, criação de usuários, rotinas). Projetos Supabase criados com
--        "Grant API access to new tables automatically" desligado não dão
--        essas permissões sozinhos.
-- =====================================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

