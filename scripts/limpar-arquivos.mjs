// Rotina diária (GitHub Actions → limpar-arquivos.yml):
//  1) descarta rascunhos de nota com mais de 7 dias (os arquivos vão para a fila);
//  2) apaga do R2 os arquivos da fila arquivos_pendentes_exclusao;
//  3) limpa registros antigos da fila.
// Variáveis: SUPABASE_DB_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { AwsClient } from "aws4fetch";
import pg from "pg";

const env = process.env;
for (const k of ["SUPABASE_DB_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
  if (!env[k]) {
    console.error(`Falta a variável ${k}`);
    process.exit(1);
  }
}

const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  const { rows: rasc } = await db.query("select public.limpar_rascunhos_antigos() as n");
  console.log(`Rascunhos antigos descartados: ${rasc[0].n}`);

  const { rows } = await db.query(
    "select id, chave_r2 from public.arquivos_pendentes_exclusao where processado_em is null order by id limit 900",
  );
  let ok = 0;
  let falhas = 0;
  for (const r of rows) {
    // só apaga chaves com o formato do sistema
    if (!/^(produtos\/[0-9a-f-]{36}\/[0-9a-f-]{36}(_thumb)?\.webp|notas\/[0-9a-f-]{36}\.(xml|pdf))$/.test(r.chave_r2)) {
      await db.query("update public.arquivos_pendentes_exclusao set processado_em = now() where id = $1", [r.id]);
      continue;
    }
    const caminho = r.chave_r2.split("/").map(encodeURIComponent).join("/");
    const resp = await r2.fetch(`${base}/${caminho}`, { method: "DELETE" });
    if (resp.ok || resp.status === 404) {
      await db.query("update public.arquivos_pendentes_exclusao set processado_em = now() where id = $1", [r.id]);
      ok++;
    } else {
      falhas++;
      console.warn(`Falha ao apagar (${resp.status})`);
    }
  }
  await db.query("delete from public.arquivos_pendentes_exclusao where processado_em < now() - interval '30 days'");
  console.log(`Arquivos apagados do R2: ${ok} · falhas: ${falhas}`);
  if (falhas) process.exitCode = 1;
} finally {
  await db.end();
}
