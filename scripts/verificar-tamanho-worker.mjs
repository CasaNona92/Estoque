// Falha se o Worker passar de 3 MB (gzip) — limite do Cloudflare Workers Free.
// Usa o "dry-run" do wrangler (o mesmo empacotamento do deploy) e lê o tamanho gzip.
// Rode depois de `npm run build:cloudflare`.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const LIMITE_KIB = 3 * 1024;
const raiz = path.resolve(import.meta.dirname, "..");

if (!existsSync(path.join(raiz, ".open-next", "worker.js"))) {
  console.error("Rode antes: npm run build:cloudflare");
  process.exit(1);
}

let gzipKib = null;
try {
  const saida = execSync("npx wrangler deploy --dry-run --outdir .wrangler/tamanho", {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  const m = saida.match(/Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/i);
  if (m) {
    gzipKib = Number(m[2]);
    console.log(`Wrangler: total ${m[1]} KiB · gzip ${m[2]} KiB`);
  }
} catch (e) {
  console.warn("Não consegui rodar o dry-run do wrangler; calculando direto dos arquivos.", e.message?.split("\n")[0]);
}

if (gzipKib === null) {
  // alternativa: gzip de tudo que o wrangler empacotou
  const pasta = path.join(raiz, ".wrangler", "tamanho");
  const base = existsSync(pasta) ? pasta : path.join(raiz, ".open-next");
  let total = 0;
  const andar = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (p.includes(`${path.sep}assets`)) continue; // estáticos não contam no limite do Worker
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.(m?js|wasm|json|cjs)$/.test(f)) total += gzipSync(readFileSync(p)).length;
    }
  };
  andar(base);
  gzipKib = total / 1024;
  console.log(`Estimativa: gzip ${gzipKib.toFixed(1)} KiB`);
}

if (gzipKib > LIMITE_KIB) {
  console.error(`❌ Worker com ${gzipKib.toFixed(1)} KiB gzip — passa do limite de ${LIMITE_KIB} KiB do plano Free.`);
  process.exit(1);
}
console.log(`✅ Worker dentro do limite: ${gzipKib.toFixed(1)} KiB de ${LIMITE_KIB} KiB (gzip).`);
