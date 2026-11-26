// Envia as fotos fictícias de seed/fotos (CODIGO_COR_N.jpg) para o R2 e registra no banco.
// Uso (depois de preencher o .env.local e rodar o seed.sql): npm run enviar:fotos
// Produtos/cores que já têm fotos são pulados (rode com --forcar para enviar de novo).
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";

const env = process.env;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
  if (!env[k]) {
    console.error(`Falta ${k} no .env.local`);
    process.exit(1);
  }
}
const forcar = process.argv.includes("--forcar");
const raiz = path.resolve(import.meta.dirname, "..");
const pasta = path.join(raiz, "seed", "fotos");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
const chaveCor = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function put(chave, corpo) {
  const r = await r2.fetch(`${base}/${chave}`, {
    method: "PUT",
    body: corpo,
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400, immutable" },
  });
  if (!r.ok) throw new Error(`R2 ${r.status}: ${await r.text()}`);
}

const arquivos = readdirSync(pasta)
  .filter((f) => /\.jpe?g$/i.test(f))
  .map((f) => {
    const m = f.match(/^(.+?)_(.+)_(\d+)\.jpe?g$/i);
    return m ? { arquivo: f, codigo: m[1], cor: m[2], n: Number(m[3]) } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.cor.localeCompare(b.cor) || a.n - b.n);

const { data: produtos, error } = await supabase
  .from("produtos")
  .select("id, codigo, produto_cores(id, nome_cor), produto_fotos(id, cor_id)")
  .in("codigo", [...new Set(arquivos.map((a) => a.codigo))]);
if (error) throw error;
const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));

let enviadas = 0;
const pulados = new Set();
for (const a of arquivos) {
  const p = porCodigo.get(a.codigo);
  const cor = p?.produto_cores.find((c) => chaveCor(c.nome_cor) === chaveCor(a.cor));
  if (!p || !cor) {
    console.warn(`Sem produto/cor para ${a.arquivo}`);
    continue;
  }
  if (!forcar && p.produto_fotos.some((f) => f.cor_id === cor.id)) {
    pulados.add(`${a.codigo} ${a.cor}`);
    continue;
  }
  const original = readFileSync(path.join(pasta, a.arquivo));
  const principal = await sharp(original).resize(1440, 1440, { fit: "inside" }).webp({ quality: 68, effort: 6, smartSubsample: true }).toBuffer();
  const miniatura = await sharp(original).resize(400, 400, { fit: "inside" }).webp({ quality: 60, effort: 6, smartSubsample: true }).toBuffer();
  const id = randomUUID();
  const chave = `produtos/${p.id}/${id}.webp`;
  const chaveThumb = `produtos/${p.id}/${id}_thumb.webp`;
  await put(chave, principal);
  await put(chaveThumb, miniatura);
  const { error: e } = await supabase.from("produto_fotos").insert({
    produto_id: p.id,
    cor_id: cor.id,
    chave_r2: chave,
    chave_r2_thumb: chaveThumb,
    tamanho_bytes: principal.length + miniatura.length,
    ordem: a.n,
  });
  if (e) throw e;
  enviadas++;
  process.stdout.write(`\r${enviadas} foto(s) enviada(s)…`);
}
console.log(`\nConcluído: ${enviadas} enviada(s). ${pulados.size ? `${pulados.size} cor(es) já tinham fotos (use --forcar).` : ""}`);
