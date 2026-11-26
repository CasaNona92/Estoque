// Build para o Cloudflare Workers SEM embutir segredos.
// O @opennextjs/cloudflare copia variáveis dos arquivos .env* para dentro do Worker;
// por isso tiramos .env.local/.dev.vars do caminho durante o build e devolvemos no fim.
// Os segredos de produção ficam só em `wrangler secret` (criptografados no Cloudflare).
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const escondidos = [".env.local", ".env", ".env.production", ".env.production.local", ".dev.vars"]
  .filter((f) => existsSync(path.join(raiz, f)))
  .map((f) => [path.join(raiz, f), path.join(raiz, `${f}.fora-do-build`)]);

for (const [de, para] of escondidos) renameSync(de, para);
try {
  execSync("npx opennextjs-cloudflare build", { cwd: raiz, stdio: "inherit" });
} finally {
  for (const [de, para] of escondidos) renameSync(para, de);
}

// Conferência: nenhum valor secreto do .env.local pode estar dentro do build
const arquivoEnv = path.join(raiz, ".env.local");
if (existsSync(arquivoEnv)) {
  const segredos = [];
  for (const l of readFileSync(arquivoEnv, "utf8").split(/\r?\n/)) {
    const m = l.match(/^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|CODIGO_INSTALACAO)=(.{8,})$/);
    if (m) segredos.push([m[1], m[2].trim()]);
  }
  const vazou = new Set();
  const andar = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      const s = statSync(p);
      if (s.isDirectory()) andar(p);
      else if (s.size < 30e6) {
        const t = readFileSync(p, "latin1");
        for (const [k, v] of segredos) if (t.includes(v)) vazou.add(k);
      }
    }
  };
  andar(path.join(raiz, ".open-next"));
  if (vazou.size) {
    console.error(`❌ Segredos dentro do build: ${[...vazou].join(", ")}. Abortando.`);
    process.exit(1);
  }
  console.log("✅ Nenhum segredo dentro do build.");
}
