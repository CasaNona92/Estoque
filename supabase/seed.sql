-- =====================================================================
-- Seed de demonstração: 20 móveis + 2 geladeiras de teste.
-- Códigos de barras fictícios na faixa "2" (uso interno, não são GTIN reais).
-- Pode rodar mais de uma vez: produtos já existentes (mesmo código) são ignorados.
-- As fotos fictícias são geradas por scripts/gerar-fotos-ficticias.mjs e enviadas
-- com scripts/enviar-fotos-seed.mjs (ou pela tela Produtos → Importar → Fotos em lote).
-- =====================================================================

select set_config('estoque.sem_auditoria', 'on', false);

create or replace function pg_temp.seed_produto(
  p_codigo text, p_nome text, p_categoria text, p_descricao text, p_specs jsonb, p_minimo int, p_cores jsonb)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  c record;
  v_cor uuid;
begin
  if exists (select 1 from public.produtos where codigo = p_codigo) then
    return;
  end if;
  insert into public.produtos (codigo, nome, categoria, descricao, especificacoes, estoque_minimo)
  values (p_codigo, p_nome, p_categoria, p_descricao, p_specs, p_minimo)
  returning id into v_id;

  for c in select x.value as j, x.ordinality::int as ord from jsonb_array_elements(p_cores) with ordinality x loop
    insert into public.produto_cores (produto_id, nome_cor, cor_hex, codigo_barras, estoque, ordem)
    values (v_id, c.j ->> 'nome', c.j ->> 'hex', nullif(c.j ->> 'barras', ''), (c.j ->> 'estoque')::int, c.ord)
    returning id into v_cor;
    if (c.j ->> 'estoque')::int > 0 then
      insert into public.movimentacoes (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, observacao, criado_em)
      values (v_id, v_cor, 'entrada', (c.j ->> 'estoque')::int, 0, (c.j ->> 'estoque')::int, 'Carga inicial (seed)', now() - interval '60 days');
    end if;
  end loop;
end
$$;

-- Baixa de demonstração (para os cards "Histórico de Baixas" e "Mais Vendidos")
create or replace function pg_temp.seed_baixa(p_codigo text, p_cor text, p_qtd int, p_dias int, p_cliente text)
returns void
language plpgsql
as $$
declare
  v_cor public.produto_cores;
begin
  select c.* into v_cor
    from public.produto_cores c join public.produtos p on p.id = c.produto_id
   where p.codigo = p_codigo and c.nome_cor = p_cor
   for update;
  if not found or v_cor.estoque < p_qtd then
    return;
  end if;
  if exists (select 1 from public.movimentacoes where cor_id = v_cor.id and tipo = 'baixa' and cliente_nome = p_cliente) then
    return;
  end if;
  update public.produto_cores set estoque = estoque - p_qtd where id = v_cor.id;
  insert into public.movimentacoes (produto_id, cor_id, tipo, quantidade, estoque_antes, estoque_depois, cliente_nome, observacao, criado_em)
  values (v_cor.produto_id, v_cor.id, 'baixa', -p_qtd, v_cor.estoque, v_cor.estoque - p_qtd, p_cliente, 'Venda (seed)',
          now() - make_interval(days => p_dias, hours => (p_qtd * 3) % 9));
end
$$;

-- ---------------------------------------------------------------------
-- Móveis
-- ---------------------------------------------------------------------
select pg_temp.seed_produto('MV-0001', 'Cadeira de Jantar Madri', 'Cadeiras',
  'Cadeira em madeira maciça com assento estofado em linho. Encosto anatômico e acabamento acetinado — combina com mesas retas e redondas.',
  '{"Altura": "92 cm", "Largura": "45 cm", "Profundidade": "52 cm", "Material": "Madeira maciça (eucalipto)", "Assento": "Linho", "Peso suportado": "120 kg"}', 4,
  '[{"nome": "Natural", "hex": "#C8A27A", "barras": "2000000000015", "estoque": 12},
    {"nome": "Tabaco", "hex": "#6B4A2F", "barras": "2000000000022", "estoque": 3},
    {"nome": "Preto", "hex": "#2B2A28", "barras": "2000000000039", "estoque": 0}]');

select pg_temp.seed_produto('MV-0002', 'Cadeira Eames Wood', 'Cadeiras',
  'Clássico do design moderno: assento em polipropileno com pés de madeira e travas metálicas.',
  '{"Altura": "82 cm", "Largura": "46 cm", "Profundidade": "53 cm", "Material": "Polipropileno e madeira faia"}', 6,
  '[{"nome": "Branco", "hex": "#F4F2EE", "barras": "2000000000046", "estoque": 24},
    {"nome": "Preto", "hex": "#262626", "barras": "2000000000053", "estoque": 10},
    {"nome": "Cinza", "hex": "#9A9A96", "barras": "2000000000060", "estoque": 5}]');

select pg_temp.seed_produto('MV-0003', 'Sofá Retrátil e Reclinável Lisboa 3 Lugares', 'Sofás',
  'Assento retrátil e encosto reclinável em 3 posições. Espuma D33 com molas ensacadas e tecido suede de toque macio.',
  '{"Largura": "230 cm", "Profundidade": "100 a 160 cm (aberto)", "Altura": "98 cm", "Tecido": "Suede", "Espuma": "D33", "Lugares": "3"}', 2,
  '[{"nome": "Cinza Grafite", "hex": "#4A4B4D", "barras": "2000000000077", "estoque": 4},
    {"nome": "Bege", "hex": "#D8C7AE", "barras": "2000000000084", "estoque": 1},
    {"nome": "Azul Petróleo", "hex": "#2F4F5A", "barras": "2000000000091", "estoque": 2}]');

select pg_temp.seed_produto('MV-0004', 'Sofá de Canto Veneza', 'Sofás',
  'Sofá de canto modulável com chaise. Almofadas soltas e pés em madeira.',
  '{"Largura": "280 x 200 cm", "Altura": "85 cm", "Tecido": "Linho rústico", "Lugares": "5"}', 1,
  '[{"nome": "Off White", "hex": "#EEE8DD", "barras": "2000000000107", "estoque": 2},
    {"nome": "Terracota", "hex": "#B5654A", "barras": "2000000000114", "estoque": 0}]');

select pg_temp.seed_produto('MV-0005', 'Guarda-Roupa Casal 6 Portas Toscana', 'Guarda-Roupas',
  'Guarda-roupa casal com 6 portas, 4 gavetas com corrediças telescópicas e 2 maleiros. Puxadores em alumínio.',
  '{"Largura": "240 cm", "Altura": "220 cm", "Profundidade": "53 cm", "Material": "MDF e MDP", "Portas": "6", "Gavetas": "4"}', 2,
  '[{"nome": "Branco", "hex": "#F7F7F5", "barras": "2000000000121", "estoque": 3},
    {"nome": "Freijó com Off White", "hex": "#B08B62", "barras": "2000000000138", "estoque": 5},
    {"nome": "Carvalho", "hex": "#9C7A54", "barras": "2000000000145", "estoque": 1}]');

select pg_temp.seed_produto('MV-0006', 'Guarda-Roupa Solteiro 3 Portas Aurora', 'Guarda-Roupas',
  'Ideal para quartos compactos: 3 portas, cabideiro e 2 gavetas.',
  '{"Largura": "120 cm", "Altura": "190 cm", "Profundidade": "47 cm", "Material": "MDP"}', 2,
  '[{"nome": "Branco", "hex": "#F7F7F5", "barras": "2000000000152", "estoque": 6},
    {"nome": "Rosa", "hex": "#E8B9B5", "barras": "2000000000169", "estoque": 2}]');

select pg_temp.seed_produto('MV-0007', 'Rack para TV Bari', 'Racks',
  'Rack baixo com 2 portas basculantes e nicho para aparelhos. Comporta TV de até 75 polegadas.',
  '{"Largura": "180 cm", "Altura": "50 cm", "Profundidade": "40 cm", "Material": "MDF", "TV": "até 75\""}', 2,
  '[{"nome": "Freijó", "hex": "#B08B62", "barras": "2000000000176", "estoque": 7},
    {"nome": "Preto", "hex": "#232323", "barras": "2000000000183", "estoque": 3}]');

select pg_temp.seed_produto('MV-0008', 'Rack Suspenso Nápoles', 'Racks',
  'Rack suspenso com porta de correr e passa-fios. Fixação na parede inclusa.',
  '{"Largura": "136 cm", "Altura": "35 cm", "Profundidade": "35 cm", "Material": "MDF"}', 2,
  '[{"nome": "Off White", "hex": "#EEE8DD", "barras": "2000000000190", "estoque": 4},
    {"nome": "Cinamomo", "hex": "#8A5A3C", "barras": "2000000000206", "estoque": 0}]');

select pg_temp.seed_produto('MV-0009', 'Mesa de Jantar Florença 6 Lugares', 'Mesas',
  'Mesa retangular com tampo de vidro temperado e base em madeira maciça.',
  '{"Comprimento": "180 cm", "Largura": "90 cm", "Altura": "76 cm", "Tampo": "Vidro temperado 8 mm", "Lugares": "6"}', 1,
  '[{"nome": "Natural", "hex": "#C8A27A", "barras": "2000000000213", "estoque": 3},
    {"nome": "Nogueira", "hex": "#5E4130", "barras": "2000000000220", "estoque": 2}]');

select pg_temp.seed_produto('MV-0010', 'Mesa de Centro Oslo', 'Mesas',
  'Mesa de centro com tampo arredondado e pés palito.',
  '{"Diâmetro": "80 cm", "Altura": "40 cm", "Material": "MDF laminado"}', 2,
  '[{"nome": "Carvalho", "hex": "#9C7A54", "barras": "2000000000237", "estoque": 8},
    {"nome": "Preto", "hex": "#232323", "barras": "2000000000244", "estoque": 5}]');

select pg_temp.seed_produto('MV-0011', 'Cama Box Casal Prime', 'Camas',
  'Base box casal com tecido antiderrapante e pés reforçados.',
  '{"Largura": "138 cm", "Comprimento": "188 cm", "Altura": "35 cm"}', 2,
  '[{"nome": "Cinza", "hex": "#8E8E8A", "barras": "2000000000251", "estoque": 6},
    {"nome": "Bege", "hex": "#D8C7AE", "barras": "2000000000268", "estoque": 4}]');

select pg_temp.seed_produto('MV-0012', 'Cama Queen Siena com Cabeceira', 'Camas',
  'Cama queen com cabeceira estofada em capitonê e estrado de madeira.',
  '{"Largura": "168 cm", "Comprimento": "208 cm", "Altura da cabeceira": "120 cm", "Tecido": "Linho"}', 1,
  '[{"nome": "Linho Cru", "hex": "#DCCFB8", "barras": "2000000000275", "estoque": 2},
    {"nome": "Grafite", "hex": "#4A4B4D", "barras": "2000000000282", "estoque": 1}]');

select pg_temp.seed_produto('MV-0013', 'Colchão Queen Molas Ensacadas Descanso', 'Colchões',
  'Colchão de molas ensacadas individualmente com pillow top e tecido antialérgico.',
  '{"Largura": "158 cm", "Comprimento": "198 cm", "Altura": "30 cm", "Suporta": "150 kg por pessoa"}', 2,
  '[{"nome": "Padrão", "hex": "#F2EFE8", "barras": "2000000000299", "estoque": 5}]');

select pg_temp.seed_produto('MV-0014', 'Painel para TV Milão', 'Painéis',
  'Painel ripado com prateleiras laterais e LED embutido. Para TVs de até 65 polegadas.',
  '{"Largura": "180 cm", "Altura": "160 cm", "Material": "MDF", "TV": "até 65\""}', 1,
  '[{"nome": "Freijó com Off White", "hex": "#B08B62", "barras": "2000000000305", "estoque": 3}]');

select pg_temp.seed_produto('MV-0015', 'Cômoda 5 Gavetas Ilha', 'Cômodas',
  'Cômoda com 5 gavetas amplas e puxadores cava.',
  '{"Largura": "80 cm", "Altura": "110 cm", "Profundidade": "42 cm", "Gavetas": "5"}', 2,
  '[{"nome": "Branco", "hex": "#F7F7F5", "barras": "2000000000312", "estoque": 4},
    {"nome": "Amêndoa", "hex": "#C9A77F", "barras": "2000000000329", "estoque": 1}]');

select pg_temp.seed_produto('MV-0016', 'Poltrona Decorativa Luna', 'Poltronas',
  'Poltrona com braços curvos, pés de madeira e tecido bouclê.',
  '{"Largura": "75 cm", "Altura": "80 cm", "Profundidade": "78 cm", "Tecido": "Bouclê"}', 2,
  '[{"nome": "Mostarda", "hex": "#C9962E", "barras": "2000000000336", "estoque": 3},
    {"nome": "Verde Musgo", "hex": "#5E6B45", "barras": "2000000000343", "estoque": 2},
    {"nome": "Rosé", "hex": "#D7A9A1", "barras": "2000000000350", "estoque": 0}]');

select pg_temp.seed_produto('MV-0017', 'Buffet Aparador Verona', 'Buffets',
  'Buffet com 4 portas ripadas e prateleiras internas reguláveis.',
  '{"Largura": "160 cm", "Altura": "80 cm", "Profundidade": "40 cm", "Material": "MDF"}', 1,
  '[{"nome": "Freijó", "hex": "#B08B62", "barras": "2000000000367", "estoque": 2},
    {"nome": "Off White", "hex": "#EEE8DD", "barras": "2000000000374", "estoque": 3}]');

select pg_temp.seed_produto('MV-0018', 'Escrivaninha Home Office Tóquio', 'Escritório',
  'Escrivaninha com gaveta e nicho para CPU. Pés em aço carbono.',
  '{"Largura": "120 cm", "Altura": "75 cm", "Profundidade": "55 cm", "Material": "MDP e aço"}', 2,
  '[{"nome": "Branco", "hex": "#F7F7F5", "barras": "2000000000381", "estoque": 9},
    {"nome": "Carvalho", "hex": "#9C7A54", "barras": "2000000000398", "estoque": 4}]');

select pg_temp.seed_produto('MV-0019', 'Estante Livreiro Berlim', 'Estantes',
  'Estante industrial com 5 prateleiras e estrutura metálica.',
  '{"Largura": "90 cm", "Altura": "180 cm", "Profundidade": "35 cm", "Material": "MDP e aço"}', 1,
  '[{"nome": "Preto com Carvalho", "hex": "#3A3029", "barras": "2000000000404", "estoque": 3}]');

select pg_temp.seed_produto('MV-0020', 'Banqueta Alta Industrial Detroit', 'Banquetas',
  'Banqueta alta com apoio para os pés e assento giratório.',
  '{"Altura": "75 cm", "Diâmetro do assento": "35 cm", "Material": "Aço"}', 4,
  '[{"nome": "Preto", "hex": "#232323", "estoque": 10},
    {"nome": "Cobre", "hex": "#B87333", "estoque": 3}]');

-- ---------------------------------------------------------------------
-- Geladeiras de teste (modelos fictícios)
-- ---------------------------------------------------------------------
select pg_temp.seed_produto('GEL-0001', 'Geladeira Frost Free Duplex Polar 410 L', 'Eletrodomésticos',
  'Geladeira duplex frost free com freezer superior, prateleiras de vidro temperado, gaveta de legumes com controle de umidade e painel eletrônico na porta. Modelo fictício para testes.',
  '{"Capacidade": "410 L", "Altura": "186 cm", "Largura": "70 cm", "Profundidade": "72 cm", "Voltagem": "127 V", "Eficiência energética": "A", "Degelo": "Frost Free", "Garantia": "1 ano"}', 2,
  '[{"nome": "Inox", "hex": "#C9CCCF", "barras": "2000000001012", "estoque": 4},
    {"nome": "Branca", "hex": "#F2F2F0", "barras": "2000000001029", "estoque": 2},
    {"nome": "Preta", "hex": "#1E1E1E", "barras": "2000000001036", "estoque": 1}]');

select pg_temp.seed_produto('GEL-0002', 'Geladeira French Door Inverter Glacial 540 L', 'Eletrodomésticos',
  'Geladeira French Door com freezer inferior em gaveta, compressor inverter silencioso, dispenser de água na porta e iluminação LED. Modelo fictício para testes.',
  '{"Capacidade": "540 L", "Altura": "192 cm", "Largura": "83,5 cm", "Profundidade": "75 cm", "Voltagem": "220 V", "Eficiência energética": "A+++", "Compressor": "Inverter", "Garantia": "2 anos"}', 1,
  '[{"nome": "Inox", "hex": "#C9CCCF", "barras": "2000000001043", "estoque": 2},
    {"nome": "Preto Fosco", "hex": "#2A2A2A", "barras": "2000000001050", "estoque": 0}]');

-- ---------------------------------------------------------------------
-- Vendas de demonstração (últimos 30 dias)
-- ---------------------------------------------------------------------
select pg_temp.seed_baixa('MV-0002', 'Branco', 4, 1, 'Mariana Costa');
select pg_temp.seed_baixa('MV-0001', 'Natural', 4, 2, 'Carlos Pereira');
select pg_temp.seed_baixa('MV-0003', 'Cinza Grafite', 1, 2, 'Fernanda Lima');
select pg_temp.seed_baixa('MV-0007', 'Freijó', 1, 3, 'Ricardo Alves');
select pg_temp.seed_baixa('GEL-0001', 'Inox', 1, 3, 'Patrícia Souza');
select pg_temp.seed_baixa('MV-0010', 'Carvalho', 2, 5, 'Juliana Rocha');
select pg_temp.seed_baixa('MV-0002', 'Preto', 2, 6, 'Bruno Martins');
select pg_temp.seed_baixa('MV-0018', 'Branco', 1, 8, 'Aline Ferreira');
select pg_temp.seed_baixa('MV-0005', 'Freijó com Off White', 1, 10, 'Rodrigo Nunes');
select pg_temp.seed_baixa('MV-0016', 'Mostarda', 1, 12, 'Camila Ribeiro');
select pg_temp.seed_baixa('MV-0001', 'Tabaco', 2, 15, 'Gustavo Melo');
select pg_temp.seed_baixa('MV-0020', 'Preto', 4, 20, 'Lúcia Barros');
select pg_temp.seed_baixa('GEL-0002', 'Inox', 1, 25, 'Eduardo Pinto');

select set_config('estoque.sem_auditoria', '', false);
