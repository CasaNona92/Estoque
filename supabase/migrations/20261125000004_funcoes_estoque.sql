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
