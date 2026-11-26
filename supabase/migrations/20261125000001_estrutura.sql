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
