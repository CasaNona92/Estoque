import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco, criarBanco, criarUsuario, erroDe } from "./banco";

let b: Banco;

beforeAll(async () => {
  b = await criarBanco();
});
afterAll(async () => {
  await b?.fechar();
});

describe("primeiro acesso (administrador principal)", () => {
  it("cria o primeiro admin uma única vez", async () => {
    const [vazio] = await b.query("select public.sistema_instalado() as ok");
    expect(vazio.ok).toBe(false);

    const [u] = await b.query<{ id: string }>("insert into auth.users (email) values ('dono@loja.local') returning id");
    await b.query("select public.instalar_primeiro_admin($1, 'Dono da Loja', 'Dono')", [u.id]);
    const [p] = await b.query("select * from perfis where id = $1", [u.id]);
    expect(p).toMatchObject({ papel: "admin", usuario: "dono", pode_dar_entrada: true, ativo: true, precisa_trocar_senha: false });
    const [inst] = await b.query("select public.sistema_instalado() as ok");
    expect(inst.ok).toBe(true);

    const [u2] = await b.query<{ id: string }>("insert into auth.users (email) values ('intruso@x.local') returning id");
    const e = await erroDe(b.query("select public.instalar_primeiro_admin($1, 'Intruso', 'intruso')", [u2.id]));
    expect(e.code).toBe("EST04");
    expect(await b.query("select * from perfis where id = $1", [u2.id])).toHaveLength(0);
  });

  it("usuário logado não consegue chamar a instalação", async () => {
    const qualquer = await criarUsuario(b);
    const e = await erroDe(
      b.comoUsuario(qualquer, (c) => c.query("select public.instalar_primeiro_admin($1, 'X', 'xyz')", [qualquer.id])),
    );
    expect(e.code).toBe("42501");
  });
});
