import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco, criarBanco, criarUsuario, type UsuarioTeste } from "./banco";

let b: Banco;
let vendedor: UsuarioTeste;

type Resultado = { produto_id: string; cor_id: string | null; nome: string; codigo: string; relevancia: number };

async function buscar(termo: string, limite = 10) {
  return b.comoUsuario(vendedor, (c) =>
    c.query<Resultado>("select * from public.buscar_produtos($1, $2)", [termo, limite]),
  );
}

beforeAll(async () => {
  b = await criarBanco();
  await b.exec(readFileSync(path.resolve(__dirname, "..", "..", "supabase", "seed.sql"), "utf8"));
  vendedor = await criarUsuario(b, { nome: "Vendedor Busca" });
});

afterAll(async () => {
  await b?.fechar();
});

// Tabela obrigatória da seção 5 do enunciado
const casos: Array<[string, RegExp]> = [
  ["cadera", /^Cadeira/],
  ["cadeiraa", /^Cadeira/],
  ["cadeora", /^Cadeira/],
  ["sofa retratil", /^Sofá Retrátil/],
  ["guardaroupa", /^Guarda-Roupa/],
  ["rack 180", /^Rack para TV Bari/],
  ["mesa jantra", /^Mesa de Jantar/],
  ["geladeira inox", /^Geladeira/],
  ["geladera", /^Geladeira/],
  ["retratil sofa", /^Sofá Retrátil/],
  ["CADEIRAS", /^Cadeira/],
];

describe("busca universal", () => {
  it.each(casos)("'%s' encontra o produto certo em 1º lugar", async (termo, esperado) => {
    const r = await buscar(termo);
    expect(r.length, `sem resultados para "${termo}"`).toBeGreaterThan(0);
    expect(r[0].nome).toMatch(esperado);
  });

  it("código de barras bipado abre o produto/cor exato (relevância 1)", async () => {
    const r = await buscar("2000000000022");
    expect(r[0].nome).toBe("Cadeira de Jantar Madri");
    expect(r[0].relevancia).toBe(1);
    const [cor] = await b.query("select nome_cor from produto_cores where id = $1", [r[0].cor_id]);
    expect(cor.nome_cor).toBe("Tabaco");
  });

  it("código do produto exato vem primeiro", async () => {
    const r = await buscar("gel-0002");
    expect(r[0].codigo).toBe("GEL-0002");
    expect(r[0].relevancia).toBe(1);
  });

  it("'rack 180' não confunde com o rack de 136 cm", async () => {
    const r = await buscar("rack 180");
    expect(r.map((x) => x.nome)).not.toContain("Rack Suspenso Nápoles");
  });

  it("número parecido não conta como match (004 ≠ 001)", async () => {
    const r = await buscar("MV-9999");
    expect(r).toHaveLength(0);
  });

  it("'Você quis dizer' sugere a grafia do catálogo", async () => {
    const [s] = await b.comoUsuario(vendedor, (c) => c.query("select public.sugestao_busca('mesa jantra') as s"));
    expect(s.s).toBe("mesa jantar");
    const [nada] = await b.comoUsuario(vendedor, (c) => c.query("select public.sugestao_busca('mesa jantar') as s"));
    expect(nada.s).toBeNull();
  });

  it("responde rápido com 10 mil produtos (< 300 ms no Postgres real)", async () => {
    await b.exec(`
      select set_config('estoque.sem_auditoria', 'on', false);
      insert into produtos (codigo, nome, categoria, especificacoes)
      select 'GEN-' || g,
             (array['Cadeira','Mesa','Sofá','Rack','Estante','Cama','Poltrona','Banco'])[1 + g % 8] || ' Modelo ' ||
             (array['Alfa','Beta','Gama','Delta','Ômega','Sigma','Zeta','Kappa','Lambda','Teta'])[1 + (g / 8) % 10] || ' ' || g,
             (array['Cadeiras','Mesas','Sofás','Racks'])[1 + g % 4],
             jsonb_build_object('Largura', (60 + g % 200) || ' cm')
        from generate_series(1, 10000) g;
      insert into produto_cores (produto_id, nome_cor, estoque)
      select id, 'Padrão', 3 from produtos where codigo like 'GEN-%';
      select set_config('estoque.sem_auditoria', '', false);
      analyze;
    `);
    // aquece
    await buscar("cadeira alfa");
    const termos = ["cadera", "sofa retratil", "mesa jantra", "rack 180", "estnte gama", "2000000000022"];
    const inicio = performance.now();
    for (const t of termos) await buscar(t, 10);
    const media = (performance.now() - inicio) / termos.length;
    // PGlite (WASM) é bem mais lento que um Postgres real; o limite de 300 ms vale no CI (Postgres real).
    expect(media).toBeLessThan(b.real ? 300 : 3000);
    const r = await buscar("cadera");
    expect(r[0].nome).toMatch(/^Cadeira de Jantar Madri|^Cadeira/);
  });
});
