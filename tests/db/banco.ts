/**
 * Banco de testes: aplica o "shim" do Supabase + todas as migrações.
 *  - Sem TEST_DATABASE_URL → PGlite (Postgres em WASM, roda em qualquer máquina).
 *  - Com TEST_DATABASE_URL  → Postgres real (CI). Cria um banco temporário e permite
 *    o teste de concorrência com várias conexões ao mesmo tempo.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type Linha = Record<string, any>;

export interface Conexao {
  query<T extends Linha = Linha>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  liberar(): Promise<void>;
}

export interface Banco extends Conexao {
  real: boolean;
  /** Executa fn como um usuário logado (role authenticated + claims do JWT). */
  comoUsuario<T>(u: UsuarioTeste, fn: (c: Conexao) => Promise<T>): Promise<T>;
  /** Nova conexão independente (só no Postgres real). */
  novaConexao(): Promise<Conexao>;
  fechar(): Promise<void>;
}

export interface UsuarioTeste {
  id: string;
  sessao: string;
  usuario: string;
}

const RAIZ = path.resolve(__dirname, "..", "..");

function sqlMigracoes(): string[] {
  const dir = path.join(RAIZ, "supabase", "migrations");
  const shim = readFileSync(path.join(RAIZ, "tests", "db", "supabase-shim.sql"), "utf8");
  return [
    shim,
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8")),
  ];
}

function claims(u: UsuarioTeste) {
  return JSON.stringify({ sub: u.id, session_id: u.sessao, role: "authenticated" });
}

export async function criarBanco(): Promise<Banco> {
  const url = process.env.TEST_DATABASE_URL;
  return url ? criarBancoReal(url) : criarBancoPglite();
}

async function criarBancoPglite(): Promise<Banco> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { unaccent } = await import("@electric-sql/pglite/contrib/unaccent");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { fuzzystrmatch } = await import("@electric-sql/pglite/contrib/fuzzystrmatch");
  const db = await PGlite.create({ extensions: { unaccent, pg_trgm, fuzzystrmatch } });
  for (const sql of sqlMigracoes()) await db.exec(sql);

  const conexao: Conexao = {
    async query(sql, params) {
      const r = await db.query(sql, params as any[]);
      return r.rows as any[];
    },
    async exec(sql) {
      await db.exec(sql);
    },
    async liberar() {},
  };

  // PGlite tem uma única conexão: serializamos o "comoUsuario" numa fila.
  let fila: Promise<unknown> = Promise.resolve();
  return {
    ...conexao,
    real: false,
    comoUsuario(u, fn) {
      const exec = async () => {
        await db.query("select set_config('request.jwt.claims', $1, false)", [claims(u)]);
        await db.exec("set role authenticated");
        try {
          return await fn(conexao);
        } finally {
          await db.exec("reset role");
          await db.query("select set_config('request.jwt.claims', '', false)");
        }
      };
      const p = fila.then(exec, exec);
      fila = p.catch(() => undefined);
      return p;
    },
    async novaConexao() {
      throw new Error("PGlite não suporta várias conexões; use TEST_DATABASE_URL");
    },
    async fechar() {
      await db.close();
    },
  };
}

async function criarBancoReal(url: string): Promise<Banco> {
  const pg = await import("pg");
  const nomeBanco = `estoque_teste_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.default.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${nomeBanco}`);
  const u = new URL(url);
  u.pathname = `/${nomeBanco}`;
  const pool = new pg.default.Pool({ connectionString: u.toString(), max: 10 });
  for (const sql of sqlMigracoes()) await pool.query(sql);

  const embrulhar = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, liberar: () => void | Promise<void>): Conexao => ({
    async query(sql, params) {
      return (await c.query(sql, params as any[])).rows;
    },
    async exec(sql) {
      await c.query(sql);
    },
    async liberar() {
      await liberar();
    },
  });

  const base = embrulhar(pool, () => {});
  return {
    ...base,
    real: true,
    async comoUsuario(usuario, fn) {
      const client = await pool.connect();
      try {
        await client.query("select set_config('request.jwt.claims', $1, false)", [claims(usuario)]);
        await client.query("set role authenticated");
        return await fn(embrulhar(client, () => {}));
      } finally {
        await client.query("reset role").catch(() => {});
        client.release();
      }
    },
    async novaConexao() {
      const client = await pool.connect();
      return embrulhar(client, () => client.release());
    },
    async fechar() {
      await pool.end();
      await admin.query(`drop database if exists ${nomeBanco} with (force)`);
      await admin.end();
    },
  };
}

let contador = 0;
export async function criarUsuario(
  b: Banco,
  opcoes: { nome?: string; papel?: "admin" | "vendedor"; podeDarEntrada?: boolean } = {},
): Promise<UsuarioTeste> {
  contador += 1;
  const usuario = `teste${contador}_${Math.floor(Math.random() * 1e5)}`;
  const [u] = await b.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${usuario}@teste.local`]);
  const [s] = await b.query<{ id: string }>("insert into auth.sessions (user_id) values ($1) returning id", [u.id]);
  await b.query(
    `insert into public.perfis (id, nome, usuario, papel, pode_dar_entrada, precisa_trocar_senha)
     values ($1, $2, $3, $4, $5, false)`,
    [u.id, opcoes.nome ?? `Usuário ${contador}`, usuario, opcoes.papel ?? "vendedor", opcoes.podeDarEntrada ?? false],
  );
  return { id: u.id, sessao: s.id, usuario };
}

/** Captura o erro do Postgres (código SQLSTATE + mensagem). */
export async function erroDe(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e: any) {
    return { code: e?.code ?? "", message: e?.message ?? String(e) };
  }
  throw new Error("Era esperado um erro, mas a operação deu certo");
}
