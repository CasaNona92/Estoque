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
