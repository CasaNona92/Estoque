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
