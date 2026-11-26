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
