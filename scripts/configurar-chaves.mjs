// Telinha LOCAL para preencher o .env.local sem editar arquivo de texto.
// Roda só neste computador (127.0.0.1). Os valores digitados vão direto para o
// .env.local e nunca são mostrados de volta na tela nem no terminal.
// Uso: npm run configurar   → abra http://localhost:4545
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const PORTA = 4545;
const raiz = path.resolve(import.meta.dirname, "..");
const arquivo = path.join(raiz, ".env.local");
const token = randomBytes(16).toString("hex");

const CAMPOS = [
  {
    nome: "SUPABASE_ANON_KEY",
    rotulo: "Supabase — Publishable key",
    onde: "Supabase → Project Settings → API Keys → “Publishable key” (começa com sb_publishable_). Clique no ícone de copiar.",
    padrao: "^\\S{20,}$",
  },
  {
    nome: "SUPABASE_SERVICE_ROLE_KEY",
    rotulo: "Supabase — Secret key",
    onde: "Mesma página, “Secret keys” → linha default → clique no olho para revelar e copie (começa com sb_secret_).",
    padrao: "^\\S{20,}$",
  },
  {
    nome: "R2_ACCESS_KEY_ID",
    rotulo: "Cloudflare R2 — Access Key ID",
    onde: "Tela do token criado no Cloudflare → “Access Key ID” (32 letras/números).",
    padrao: "^[A-Za-z0-9]{20,}$",
  },
  {
    nome: "R2_SECRET_ACCESS_KEY",
    rotulo: "Cloudflare R2 — Secret Access Key",
    onde: "Mesma tela → “Secret Access Key” (64 letras/números).",
    padrao: "^[A-Za-z0-9]{40,}$",
  },
  {
    nome: "CODIGO_INSTALACAO",
    rotulo: "Código de instalação (invente)",
    onde: "Um código só seu, com 12 ou mais caracteres. Vai ser pedido uma vez, na tela Primeiro acesso.",
    padrao: "^\\S{12,}$",
  },
];

function lerEnv() {
  const v = {};
  if (!existsSync(arquivo)) return v;
  for (const l of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) v[m[1]] = m[2].trim();
  }
  return v;
}

function gravar(novos) {
  let texto = existsSync(arquivo) ? readFileSync(arquivo, "utf8") : "";
  for (const [k, valor] of Object.entries(novos)) {
    const linha = `${k}=${valor}`;
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, "m");
    texto = re.test(texto) ? texto.replace(re, () => linha) : `${texto.trimEnd()}\n${linha}\n`;
  }
  writeFileSync(arquivo, texto);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function pagina(mensagem = "", erro = false) {
  const atual = lerEnv();
  const campos = CAMPOS.map((c) => {
    const preenchido = Boolean(atual[c.nome]);
    return `<label>
      <span class="rotulo">${esc(c.rotulo)} ${preenchido ? '<b class="ok">já preenchido</b>' : '<b class="falta">falta</b>'}</span>
      <input name="${c.nome}" type="password" autocomplete="off" spellcheck="false"
        placeholder="${preenchido ? "deixe em branco para manter o atual" : "cole aqui"}">
      <small>${esc(c.onde)}</small>
    </label>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurar chaves — Casa da Nona</title>
<style>
  body{margin:0;font-family:system-ui,Segoe UI,sans-serif;background:#f7f6f3;color:#23262e}
  main{max-width:640px;margin:32px auto;padding:28px;background:#fff;border-radius:20px;box-shadow:0 10px 40px -20px #0003}
  h1{margin:0 0 4px;font-size:22px} p.sub{margin:0 0 20px;color:#646872;font-size:14px}
  label{display:block;margin:0 0 18px} .rotulo{display:flex;gap:8px;align-items:center;font-weight:600;font-size:14px}
  input{width:100%;box-sizing:border-box;margin:6px 0 4px;padding:12px 14px;border:1px solid #d8d7d1;border-radius:12px;font:15px monospace}
  input:invalid:not(:placeholder-shown){border-color:#b83a32;background:#fdf1f0}
  small{color:#646872;font-size:12px} b{font-size:11px;padding:2px 8px;border-radius:99px}
  .ok{background:#e3f1e8;color:#2f7d52} .falta{background:#fff1df;color:#b45309}
  button{width:100%;padding:14px;border:0;border-radius:12px;background:#0a47c9;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
  .msg{padding:12px 14px;border-radius:12px;margin:0 0 18px;font-size:14px} .sucesso{background:#e3f1e8;color:#2f7d52} .erro{background:#f9e3e1;color:#b83a32}
</style></head><body><main>
<h1>Configurar chaves</h1>
<p class="sub">Cole cada chave no campo certo e clique em Salvar. Fica gravado só neste computador, no arquivo .env.local. Os valores não aparecem de volta.</p>
${mensagem ? `<p class="msg ${erro ? "erro" : "sucesso"}">${esc(mensagem)}</p>` : ""}
<form method="post" action="/salvar"><input type="hidden" name="token" value="${token}">${campos}
<button type="submit">Salvar</button></form></main></body></html>`;
}

const servidor = createServer((req, res) => {
  const host = req.headers.host ?? "";
  if (host !== `localhost:${PORTA}` && host !== `127.0.0.1:${PORTA}`) {
    res.writeHead(403).end();
    return;
  }
  const cabecalhos = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
  };
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, cabecalhos).end(pagina());
    return;
  }
  if (req.method === "POST" && req.url === "/salvar") {
    let corpo = "";
    req.on("data", (c) => {
      corpo += c;
      if (corpo.length > 20_000) req.destroy();
    });
    req.on("end", () => {
      const dados = new URLSearchParams(corpo);
      if (dados.get("token") !== token) {
        res.writeHead(403, cabecalhos).end(pagina("Página expirada. Recarregue e tente de novo.", true));
        return;
      }
      const novos = {};
      const erros = [];
      for (const c of CAMPOS) {
        const valor = (dados.get(c.nome) ?? "").replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
        if (!valor) continue;
        if (!new RegExp(c.padrao).test(valor)) erros.push(c.rotulo);
        else novos[c.nome] = valor;
      }
      if (erros.length) {
        res.writeHead(400, cabecalhos).end(pagina(`Formato inesperado em: ${erros.join(", ")}. Confira se copiou a chave certa.`, true));
        return;
      }
      gravar(novos);
      const faltam = CAMPOS.filter((c) => !lerEnv()[c.nome]).map((c) => c.rotulo);
      // só os NOMES vão para o terminal, nunca os valores
      console.log(`Salvo: ${Object.keys(novos).join(", ") || "nada novo"}${faltam.length ? ` · faltam: ${faltam.length}` : " · tudo preenchido"}`);
      res
        .writeHead(200, cabecalhos)
        .end(pagina(faltam.length ? `Salvo! Ainda faltam: ${faltam.join(", ")}.` : "Tudo salvo! Pode voltar para a conversa.", faltam.length > 0));
    });
    return;
  }
  res.writeHead(404).end();
});

servidor.listen(PORTA, "127.0.0.1", () => console.log(`Configurar chaves: http://localhost:${PORTA}`));
