/**
 * Concorrência real: precisa de várias conexões → só roda com TEST_DATABASE_URL (Postgres do CI).
 * Localmente (PGlite) o arquivo é pulado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco, criarBanco, criarUsuario, type UsuarioTeste } from "./banco";

const real = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!real)("concorrência (Postgres real)", () => {
  let b: Banco;
  let admin: UsuarioTeste;
  const vendedores: UsuarioTeste[] = [];

  beforeAll(async () => {
    b = await criarBanco();
    admin = await criarUsuario(b, { papel: "admin" });
    for (let i = 0; i < 8; i++) vendedores.push(await criarUsuario(b));
  });

  afterAll(async () => {
    await b?.fechar();
  });

  async function produtoCom(estoque: number) {
    const id = await b.comoUsuario(admin, async (c) => {
      const [r] = await c.query<{ id: string }>("select public.salvar_produto($1::jsonb) as id", [
        JSON.stringify({
          codigo: `CC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          nome: "Produto concorrência",
          cores: [{ nome_cor: "Única", estoque_inicial: estoque }],
        }),
      ]);
      return r.id;
    });
    const [cor] = await b.query<{ id: string }>("select id from produto_cores where produto_id = $1", [id]);
    return cor.id;
  }

  it("8 vendedores baixando ao mesmo tempo nunca deixam o estoque negativo", async () => {
    const cor = await produtoCom(5);
    const resultados = await Promise.allSettled(
      vendedores.map((v) =>
        b.comoUsuario(v, (c) => c.query("select public.registrar_baixa($1, 1, 'Cliente simultâneo')", [cor])),
      ),
    );
    const ok = resultados.filter((r) => r.status === "fulfilled").length;
    const falhas = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toBe(5);
    expect(falhas).toHaveLength(3);
    for (const f of falhas) expect(f.reason.code).toBe("EST01");
    const [r] = await b.query<{ estoque: number }>("select estoque from produto_cores where id = $1", [cor]);
    expect(r.estoque).toBe(0);
    const [m] = await b.query<{ n: number }>(
      "select count(*)::int as n from movimentacoes where cor_id = $1 and tipo = 'baixa'",
      [cor],
    );
    expect(m.n).toBe(5);
  });

  it("baixas de 2 unidades concorrentes respeitam o saldo", async () => {
    const cor = await produtoCom(7);
    const resultados = await Promise.allSettled(
      vendedores.map((v) => b.comoUsuario(v, (c) => c.query("select public.registrar_baixa($1, 2, 'Cliente')", [cor]))),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const [r] = await b.query<{ estoque: number }>("select estoque from produto_cores where id = $1", [cor]);
    expect(r.estoque).toBe(1);
  });
});
