-- Contagens gravadas junto com cada backup; o teste de restauração confere contra elas.
select json_build_object(
  'gerado_em', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'produtos', (select count(*) from public.produtos),
  'cores', (select count(*) from public.produto_cores),
  'movimentacoes', (select count(*) from public.movimentacoes),
  'estoque_total', (select coalesce(sum(estoque), 0) from public.produto_cores)
);
