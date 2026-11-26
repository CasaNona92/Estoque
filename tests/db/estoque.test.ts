import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcularDvChave } from "@/lib/nfe/chave";
import { type Banco, criarBanco, criarUsuario, erroDe, type UsuarioTeste } from "./banco";

let b: Banco;
let admin: UsuarioTeste;
let vendedor: UsuarioTeste;
let estoquista: UsuarioTeste;

/** Monta uma chave de acesso válida (com DV) diferente para cada n. */
function chave(n: number) {
  const base = ("3526111234567800019955001" + String(n).padStart(9, "0") + "1" + String(n).padStart(8, "0")).slice(0, 43);
  return base + calcularDvChave(base);
}

async function novoProduto(
  codigo: string,
  cores: Array<{ nome_cor: string; estoque_inicial?: number; codigo_barras?: string }>,
) {
  const id = await b.comoUsuario(admin, async (c) => {
    const [r] = await c.query<{ id: string }>("select public.salvar_produto($1::jsonb) as id", [
      JSON.stringify({ codigo, nome: `Produto ${codigo}`, categoria: "Teste", cores }),
    ]);
    return r.id;
  });
  const coresDb = await b.query<{ id: string; nome_cor: string; estoque: number }>(
    "select id, nome_cor, estoque from produto_cores where produto_id = $1 order by ordem",
    [id],
  );
  return { id, cores: coresDb };
}

async function estoque(corId: string) {
  const [r] = await b.query<{ estoque: number }>("select estoque from produto_cores where id = $1", [corId]);
  return r.estoque;
}

beforeAll(async () => {
  b = await criarBanco();
  admin = await criarUsuario(b, { nome: "Ana Admin", papel: "admin" });
  vendedor = await criarUsuario(b, { nome: "Victor Vendedor" });
  estoquista = await criarUsuario(b, { nome: "Eva Estoque", podeDarEntrada: true });
});

afterAll(async () => {
  await b?.fechar();
});

describe("baixa", () => {
  it("reduz o estoque e grava movimentação + auditoria", async () => {
    const p = await novoProduto("BX-001", [{ nome_cor: "Branco", estoque_inicial: 5 }]);
    const cor = p.cores[0].id;
    const r = await b.comoUsuario(vendedor, (c) =>
      c.query("select public.registrar_baixa($1, 2, 'Maria Silva', null) as r", [cor]),
    );
    expect(r[0].r.estoque).toBe(3);
    expect(await estoque(cor)).toBe(3);
    const movs = await b.query("select * from movimentacoes where cor_id = $1 and tipo = 'baixa'", [cor]);
    expect(movs).toHaveLength(1);
    expect(movs[0].quantidade).toBe(-2);
    expect(movs[0].cliente_nome).toBe("Maria Silva");
    const aud = await b.query("select * from auditoria where acao = 'registrar_baixa' and registro_id = $1", [cor]);
    expect(aud).toHaveLength(1);
    expect(aud[0].usuario_id).toBe(vendedor.id);
  });

  it("impede estoque negativo", async () => {
    const p = await novoProduto("BX-002", [{ nome_cor: "Preto", estoque_inicial: 1 }]);
    const e = await erroDe(
      b.comoUsuario(vendedor, (c) => c.query("select public.registrar_baixa($1, 2, 'João', null)", [p.cores[0].id])),
    );
    expect(e.code).toBe("EST01");
    expect(await estoque(p.cores[0].id)).toBe(1);
  });

  it("recusa quantidade zero/negativa e cliente vazio", async () => {
    const p = await novoProduto("BX-003", [{ nome_cor: "Azul", estoque_inicial: 3 }]);
    const cor = p.cores[0].id;
    const baixa = (q: number, cliente: string) =>
      erroDe(b.comoUsuario(vendedor, (c) => c.query("select public.registrar_baixa($1, $2, $3)", [cor, q, cliente])));
    expect((await baixa(0, "João")).code).toBe("EST04");
    expect((await baixa(-1, "João")).code).toBe("EST04");
    expect((await baixa(1, " ")).code).toBe("EST04");
    expect(await estoque(cor)).toBe(3);
  });

  it("desfazer baixa devolve o estoque uma única vez", async () => {
    const p = await novoProduto("BX-004", [{ nome_cor: "Cinza", estoque_inicial: 4 }]);
    const cor = p.cores[0].id;
    const [r] = await b.comoUsuario(vendedor, (c) =>
      c.query("select public.registrar_baixa($1, 3, 'Cliente X') as r", [cor]),
    );
    expect(await estoque(cor)).toBe(1);
    await b.comoUsuario(vendedor, (c) => c.query("select public.desfazer_baixa($1)", [r.r.movimentacao_id]));
    expect(await estoque(cor)).toBe(4);
    const e = await erroDe(
      b.comoUsuario(vendedor, (c) => c.query("select public.desfazer_baixa($1)", [r.r.movimentacao_id])),
    );
    expect(e.code).toBe("EST04");
    expect(await estoque(cor)).toBe(4);
  });
});

describe("permissões", () => {
  it("vendedor não ajusta estoque; admin ajusta com motivo", async () => {
    const p = await novoProduto("PM-001", [{ nome_cor: "Bege", estoque_inicial: 2 }]);
    const cor = p.cores[0].id;
    const e = await erroDe(
      b.comoUsuario(vendedor, (c) => c.query("select public.ajustar_estoque($1, 10, 'contagem')", [cor])),
    );
    expect(e.code).toBe("42501");
    await b.comoUsuario(admin, (c) => c.query("select public.ajustar_estoque($1, 10, 'Inventário anual')", [cor]));
    expect(await estoque(cor)).toBe(10);
    const [m] = await b.query("select * from movimentacoes where cor_id = $1 and tipo = 'ajuste'", [cor]);
    expect(m.quantidade).toBe(8);
  });

  it("vendedor não dá entrada nem cadastra; estoquista sim", async () => {
    const p = await novoProduto("PM-002", [{ nome_cor: "Verde" }]);
    const cor = p.cores[0].id;
    const e1 = await erroDe(
      b.comoUsuario(vendedor, (c) => c.query("select public.registrar_entrada_manual($1, 5)", [cor])),
    );
    expect(e1.code).toBe("42501");
    const e2 = await erroDe(
      b.comoUsuario(vendedor, (c) =>
        c.query("select public.salvar_produto($1::jsonb)", [JSON.stringify({ codigo: "X-1", nome: "Xis" })]),
      ),
    );
    expect(e2.code).toBe("42501");
    await b.comoUsuario(estoquista, (c) => c.query("select public.registrar_entrada_manual($1, 5)", [cor]));
    expect(await estoque(cor)).toBe(5);
  });

  it("ninguém faz UPDATE direto no estoque", async () => {
    const p = await novoProduto("PM-003", [{ nome_cor: "Roxo", estoque_inicial: 1 }]);
    const e = await erroDe(
      b.comoUsuario(admin, (c) => c.query("update produto_cores set estoque = 999 where id = $1", [p.cores[0].id])),
    );
    expect(e.code).toBe("42501");
    expect(await estoque(p.cores[0].id)).toBe(1);
  });

  it("anon não lê nada", async () => {
    await b.exec("set role anon");
    try {
      const e = await erroDe(b.query("select * from produtos"));
      expect(e.code).toBe("42501");
      const e2 = await erroDe(b.query("select public.buscar_produtos('cadeira', 5)"));
      expect(e2.code).toBe("42501");
    } finally {
      await b.exec("reset role");
    }
  });

  it("vendedor não vê notas nem auditoria (RLS)", async () => {
    const notas = await b.comoUsuario(vendedor, (c) => c.query("select * from notas_entrada"));
    expect(notas).toHaveLength(0);
    const aud = await b.comoUsuario(vendedor, (c) => c.query("select * from auditoria"));
    expect(aud).toHaveLength(0);
    const audAdmin = await b.comoUsuario(admin, (c) => c.query("select count(*)::int as n from auditoria"));
    expect(audAdmin[0].n).toBeGreaterThan(0);
  });

  it("usuário desativado e sessão revogada perdem o acesso na hora", async () => {
    const u = await criarUsuario(b, { nome: "Temporário" });
    const antes = await b.comoUsuario(u, (c) => c.query("select * from produtos"));
    expect(antes.length).toBeGreaterThan(0);

    await b.query("select public.revogar_sessoes($1)", [u.id]);
    const semSessao = await b.comoUsuario(u, (c) => c.query("select * from produtos"));
    expect(semSessao).toHaveLength(0);

    const [s] = await b.query<{ id: string }>("insert into auth.sessions (user_id) values ($1) returning id", [u.id]);
    const u2 = { ...u, sessao: s.id };
    expect((await b.comoUsuario(u2, (c) => c.query("select * from produtos"))).length).toBeGreaterThan(0);

    await b.query("update perfis set ativo = false where id = $1", [u.id]);
    expect(await b.comoUsuario(u2, (c) => c.query("select * from produtos"))).toHaveLength(0);
    expect(await b.comoUsuario(u2, (c) => c.query("select * from public.meu_perfil()"))).toHaveLength(0);
  });

  it("usuário não altera o próprio perfil (papel/ativo ficam só no banco)", async () => {
    const e = await erroDe(
      b.comoUsuario(vendedor, (c) => c.query("update perfis set papel = 'admin' where id = $1", [vendedor.id])),
    );
    expect(e.code).toBe("42501");
    const e2 = await erroDe(
      b.comoUsuario(vendedor, (c) =>
        c.query("select public.admin_atualizar_perfil($1, 'Eu', 'admin', true, true)", [vendedor.id]),
      ),
    );
    expect(e2.code).toBe("42501");
  });

  it("produto excluído some (exclusão lógica filtrada na RLS)", async () => {
    const p = await novoProduto("PM-004", [{ nome_cor: "Única" }]);
    await b.comoUsuario(admin, (c) => c.query("select public.excluir_produto($1)", [p.id]));
    const r = await b.comoUsuario(vendedor, (c) => c.query("select * from produtos where id = $1", [p.id]));
    expect(r).toHaveLength(0);
    const busca = await b.comoUsuario(vendedor, (c) => c.query("select * from public.buscar_produtos('PM-004', 5)"));
    expect(busca.find((x) => x.produto_id === p.id)).toBeUndefined();
  });
});

describe("nota de entrada", () => {
  async function prepararNota(u: UsuarioTeste, n: number, itens: unknown[]) {
    return b.comoUsuario(u, async (c) => {
      const [r] = await c.query<{ id: string }>("select public.criar_nota_rascunho($1::jsonb) as id", [
        JSON.stringify({
          chave_acesso: chave(n),
          numero: String(n),
          serie: "1",
          origem: "xml",
          data_emissao: "2026-11-20",
          valor_total: 100,
          fornecedor: { cnpj: "12345678000199", razao_social: "Fornecedor Teste Ltda" },
        }),
      ]);
      await c.query("select public.salvar_itens_nota($1, $2::jsonb)", [r.id, JSON.stringify(itens)]);
      return r.id;
    });
  }

  const confirmar = (u: UsuarioTeste, notaId: string, total: number) =>
    b.comoUsuario(u, (c) => c.query("select public.confirmar_nota_entrada($1, $2) as r", [notaId, total]));

  it("confirma, soma o estoque com fator de conversão e memoriza o vínculo", async () => {
    const p = await novoProduto("NF-001", [{ nome_cor: "Natural" }, { nome_cor: "Mel" }]);
    const [natural, mel] = p.cores;
    const notaId = await prepararNota(estoquista, 1, [
      { n_item: 1, codigo_fornecedor: "F-10", descricao: "CADEIRA NATURAL", quantidade_nota: 2, fator_conversao: 4, cor_id: natural.id, status: "vinculado" },
      { n_item: 2, codigo_fornecedor: "F-11", descricao: "CADEIRA MEL", quantidade_nota: 3, fator_conversao: 1, cor_id: mel.id, status: "vinculado" },
      { n_item: 3, codigo_fornecedor: "F-99", descricao: "BRINDE", quantidade_nota: 1, status: "ignorado" },
    ]);
    const [r] = await confirmar(estoquista, notaId, 3);
    expect(r.r.unidades).toBe(11);
    expect(await estoque(natural.id)).toBe(8);
    expect(await estoque(mel.id)).toBe(3);

    const vinc = await b.comoUsuario(estoquista, (c) =>
      c.query("select public.resolver_vinculos_nota('12.345.678/0001-99', $1::jsonb) as r", [
        JSON.stringify([{ n_item: 1, codigo_fornecedor: "F-10", descricao: "x" }]),
      ]),
    );
    expect(vinc[0].r[0].cor_id).toBe(natural.id);
    expect(vinc[0].r[0].origem).toBe("memoria");
    expect(Number(vinc[0].r[0].fator_conversao)).toBe(4);
  });

  it("é atômica: se um item falha, nada entra", async () => {
    const p = await novoProduto("NF-002", [{ nome_cor: "A" }, { nome_cor: "B" }]);
    const [a, bb] = p.cores;
    const notaId = await prepararNota(estoquista, 2, [
      { n_item: 1, descricao: "ITEM A", quantidade_nota: 5, cor_id: a.id, status: "vinculado" },
      { n_item: 2, descricao: "ITEM B", quantidade_nota: 5, cor_id: bb.id, status: "vinculado" },
    ]);
    // corrompe o item 2 por fora (simula falha no meio da confirmação)
    await b.query("update nota_itens set quantidade_entrada = 0 where nota_id = $1 and n_item = 2", [notaId]);
    const e = await erroDe(confirmar(estoquista, notaId, 2));
    expect(e.code).toBe("EST04");
    expect(await estoque(a.id)).toBe(0);
    expect(await estoque(bb.id)).toBe(0);
    const movs = await b.query("select * from movimentacoes where nota_id = $1", [notaId]);
    expect(movs).toHaveLength(0);
    const [nota] = await b.query("select status from notas_entrada where id = $1", [notaId]);
    expect(nota.status).toBe("rascunho");
  });

  it("bloqueia nota duplicada com data e nome de quem lançou", async () => {
    const p = await novoProduto("NF-003", [{ nome_cor: "C" }]);
    const itens = [{ n_item: 1, descricao: "ITEM C", quantidade_nota: 1, cor_id: p.cores[0].id, status: "vinculado" }];
    const notaId = await prepararNota(estoquista, 3, itens);
    await confirmar(estoquista, notaId, 1);
    const e = await erroDe(prepararNota(admin, 3, itens));
    expect(e.code).toBe("EST03");
    expect(e.message).toMatch(/já deu entrada em \d{2}\/\d{2}\/\d{4} por Eva Estoque/);
    expect(await estoque(p.cores[0].id)).toBe(1);
  });

  it("não confirma com item 'produto novo' pendente nem com itens faltando", async () => {
    const p = await novoProduto("NF-004", [{ nome_cor: "D" }]);
    const notaId = await prepararNota(estoquista, 4, [
      { n_item: 1, descricao: "ITEM D", quantidade_nota: 1, cor_id: p.cores[0].id, status: "vinculado" },
      { n_item: 2, descricao: "NOVO", quantidade_nota: 1, status: "novo_produto" },
    ]);
    expect((await erroDe(confirmar(estoquista, notaId, 2))).code).toBe("EST04");
    expect((await erroDe(confirmar(estoquista, notaId, 3))).code).toBe("EST04");
  });

  it("recusa quantidade fracionada (fator de conversão errado)", async () => {
    const p = await novoProduto("NF-005", [{ nome_cor: "E" }]);
    const e = await erroDe(
      prepararNota(estoquista, 5, [
        { n_item: 1, descricao: "CAIXA", quantidade_nota: 1.5, fator_conversao: 1, cor_id: p.cores[0].id, status: "vinculado" },
      ]),
    );
    expect(e.code).toBe("EST04");
  });

  it("cancelamento pelo admin gera estornos, mas não deixa estoque negativo", async () => {
    const p = await novoProduto("NF-006", [{ nome_cor: "F" }]);
    const cor = p.cores[0].id;
    const itens = [{ n_item: 1, descricao: "ITEM F", quantidade_nota: 3, cor_id: cor, status: "vinculado" }];
    const notaId = await prepararNota(estoquista, 6, itens);
    await confirmar(estoquista, notaId, 1);
    await b.comoUsuario(vendedor, (c) => c.query("select public.registrar_baixa($1, 2, 'Cliente')", [cor]));
    const e = await erroDe(
      b.comoUsuario(admin, (c) => c.query("select public.cancelar_nota_entrada($1, 'Nota errada')", [notaId])),
    );
    expect(e.code).toBe("EST01");
    expect(await estoque(cor)).toBe(1);

    await b.comoUsuario(admin, (c) => c.query("select public.ajustar_estoque($1, 3, 'Contagem')", [cor]));
    const e2 = await erroDe(
      b.comoUsuario(estoquista, (c) => c.query("select public.cancelar_nota_entrada($1, 'xxxx')", [notaId])),
    );
    expect(e2.code).toBe("42501");
    await b.comoUsuario(admin, (c) => c.query("select public.cancelar_nota_entrada($1, 'Nota errada')", [notaId]));
    expect(await estoque(cor)).toBe(0);
    const [n] = await b.query("select status from notas_entrada where id = $1", [notaId]);
    expect(n.status).toBe("cancelada");
    // depois de cancelada, a mesma chave pode ser lançada de novo
    await prepararNota(estoquista, 6, itens);
  });

  it("chave de acesso com dígito verificador errado é recusada", async () => {
    const boa = chave(7);
    const ruim = boa.slice(0, 43) + ((Number(boa[43]) + 1) % 10);
    const e = await erroDe(
      b.comoUsuario(estoquista, (c) =>
        c.query("select public.criar_nota_rascunho($1::jsonb)", [JSON.stringify({ chave_acesso: ruim, origem: "xml" })]),
      ),
    );
    expect(e.code).toBe("EST04");
  });
});

describe("cadastro e importação", () => {
  it("salvar_produto grava estoque inicial como entrada e recusa código de barras repetido", async () => {
    const p = await novoProduto("CD-001", [{ nome_cor: "Branco", estoque_inicial: 7, codigo_barras: "7891234567895" }]);
    expect(p.cores[0].estoque).toBe(7);
    const [m] = await b.query("select * from movimentacoes where cor_id = $1", [p.cores[0].id]);
    expect(m.tipo).toBe("entrada");
    const e = await erroDe(novoProduto("CD-002", [{ nome_cor: "Preto", codigo_barras: "7891234567895" }]));
    expect(e.code).toBe("EST04");
  });

  it("não remove cor que ainda tem estoque", async () => {
    const p = await novoProduto("CD-003", [{ nome_cor: "A", estoque_inicial: 1 }, { nome_cor: "B" }]);
    const e = await erroDe(
      b.comoUsuario(admin, (c) =>
        c.query("select public.salvar_produto($1::jsonb)", [
          JSON.stringify({ id: p.id, codigo: "CD-003", nome: "Produto CD-003", cores: [{ id: p.cores[1].id, nome_cor: "B" }] }),
        ]),
      ),
    );
    expect(e.code).toBe("EST04");
  });

  it("importa lote com upsert por código + cor e o lote é atômico", async () => {
    const linhas = [
      { linha: 2, codigo: "IMP-1", nome: "Sofá Importado", categoria: "Sofás", cor: "Cinza", cor_hex: "#888888", estoque: 3, especificacoes: { Largura: "200 cm" } },
      { linha: 3, codigo: "IMP-1", nome: "Sofá Importado", categoria: "Sofás", cor: "Azul", estoque: 1 },
    ];
    const importar = (u: UsuarioTeste, l: unknown[]) =>
      b.comoUsuario(u, (c) => c.query("select public.importar_lote_produtos($1::jsonb) as r", [JSON.stringify(l)]));

    const [r] = await importar(estoquista, linhas);
    expect(r.r.resultados).toHaveLength(2);
    const cores = await b.query(
      "select c.nome_cor, c.estoque from produto_cores c join produtos p on p.id = c.produto_id where p.codigo = 'IMP-1' order by c.nome_cor",
    );
    expect(cores.map((c) => [c.nome_cor, c.estoque])).toEqual([["Azul", 1], ["Cinza", 3]]);

    // reimporta com estoque menor/maior: a planilha NUNCA mexe no estoque de cor existente (nem para o admin)
    const [r2] = await importar(estoquista, [{ ...linhas[0], estoque: 9 }]);
    expect(r2.r.resultados[0].aviso).toMatch(/estoque inicial de cores novas/);
    await importar(admin, [{ ...linhas[0], estoque: 0 }]);
    const [cinza] = await b.query(
      "select c.estoque from produto_cores c join produtos p on p.id = c.produto_id where p.codigo = 'IMP-1' and c.nome_cor = 'Cinza'",
    );
    expect(cinza.estoque).toBe(3);
    const ajustes = await b.query("select * from movimentacoes where observacao like 'Importação%ajuste%'");
    expect(ajustes).toHaveLength(0);

    // lote com uma linha ruim: nada do lote é gravado
    const ruim = [
      { linha: 2, codigo: "IMP-2", nome: "Mesa Boa", cor: "Natural", estoque: 1 },
      { linha: 3, codigo: "IMP-3", nome: "M", cor: "Natural", estoque: 1 },
    ];
    const e = await erroDe(importar(estoquista, ruim));
    expect(e.message).toMatch(/Linha 3/);
    expect(await b.query("select * from produtos where codigo = 'IMP-2'")).toHaveLength(0);
  });
});

describe("PIN do modo cliente", () => {
  it("salva com hash e confere", async () => {
    await b.comoUsuario(admin, (c) => c.query("select public.salvar_configuracoes(true, '4321', 2)"));
    const [ok] = await b.comoUsuario(vendedor, (c) => c.query("select public.verificar_pin_cliente('4321') as ok"));
    expect(ok.ok).toBe(true);
    const [nok] = await b.comoUsuario(vendedor, (c) => c.query("select public.verificar_pin_cliente('0000') as ok"));
    expect(nok.ok).toBe(false);
    const e = await erroDe(b.comoUsuario(vendedor, (c) => c.query("select pin_cliente_hash from configuracoes")));
    expect(e.code).toBe("42501");
  });
});
