import "server-only";
import { AwsClient, AwsV4Signer } from "aws4fetch";
import { env } from "@/lib/env";

/**
 * Acesso ao Cloudflare R2 pela API S3 com aws4fetch (leve; nada do @aws-sdk).
 * Bucket PRIVADO: leitura e gravação só por URL pré-assinada.
 * Assinar é um cálculo local (HMAC) — não conta como chamada externa.
 */

const CACHE_CONTROL = "private, max-age=86400, immutable";
const JANELA_MS = 30 * 60 * 1000; // URLs de leitura estáveis por 30 min (o navegador reaproveita o cache)
const VALIDADE_LEITURA_S = 3600; // GET vale 1 h a partir do início da janela (sempre ≥ 30 min de sobra)
const VALIDADE_UPLOAD_S = 300; // PUT vale 5 min

function base(chave: string) {
  const e = env();
  const caminho = chave.split("/").map(encodeURIComponent).join("/");
  return `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}/${caminho}`;
}

function credenciais() {
  const e = env();
  return { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" };
}

function dataAws(ms: number) {
  return new Date(ms).toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** URL de upload (PUT) para UM arquivo, com tipo e tamanho fixos na assinatura. */
export async function urlUpload(chave: string, tipo: string, tamanho: number) {
  const url = new URL(base(chave));
  url.searchParams.set("X-Amz-Expires", String(VALIDADE_UPLOAD_S));
  const assinador = new AwsV4Signer({
    ...credenciais(),
    url: url.toString(),
    method: "PUT",
    headers: { "content-type": tipo, "content-length": String(tamanho), "cache-control": CACHE_CONTROL },
    signQuery: true,
    allHeaders: true,
  });
  const assinado = await assinador.sign();
  return {
    url: assinado.url.toString(),
    // o navegador precisa mandar exatamente estes cabeçalhos (Content-Length vem do próprio arquivo)
    headers: { "Content-Type": tipo, "Cache-Control": CACHE_CONTROL },
  };
}

// Memória por isolate: a mesma chave na mesma janela gera a mesma URL (economiza CPU).
const memoria = new Map<string, { url: string; janela: number }>();

/** URL de leitura (GET) válida por pelo menos 30 min. */
export async function urlLeitura(chave: string): Promise<string> {
  const janela = Math.floor(Date.now() / JANELA_MS) * JANELA_MS;
  const emCache = memoria.get(chave);
  if (emCache && emCache.janela === janela) return emCache.url;

  const url = new URL(base(chave));
  url.searchParams.set("X-Amz-Expires", String(VALIDADE_LEITURA_S));
  const assinador = new AwsV4Signer({
    ...credenciais(),
    url: url.toString(),
    method: "GET",
    signQuery: true,
    datetime: dataAws(janela),
  });
  const assinado = (await assinador.sign()).url.toString();
  if (memoria.size > 5000) memoria.clear();
  memoria.set(chave, { url: assinado, janela });
  return assinado;
}

/** Até quando (ms epoch) a URL de leitura gerada agora vale com folga. */
export function expiracaoLeitura(): number {
  const janela = Math.floor(Date.now() / JANELA_MS) * JANELA_MS;
  return janela + (VALIDADE_LEITURA_S - 5 * 60) * 1000;
}

export async function assinarVarias(chaves: string[]): Promise<Record<string, string>> {
  const unicas = [...new Set(chaves.filter(Boolean))];
  const urls = await Promise.all(unicas.map((c) => urlLeitura(c)));
  return Object.fromEntries(unicas.map((c, i) => [c, urls[i]]));
}

let cliente: AwsClient | null = null;
function aws() {
  cliente ??= new AwsClient(credenciais());
  return cliente;
}

/**
 * Lê os primeiros bytes de um objeto já enviado (1 chamada externa): confere que ele
 * existe, o tamanho real e os "magic bytes". O servidor nunca confia no navegador.
 */
export async function lerInicio(chave: string, bytes = 32) {
  const r = await aws().fetch(base(chave), { method: "GET", headers: { Range: `bytes=0-${bytes - 1}` } });
  if (r.status === 404) return null;
  if (!r.ok && r.status !== 206) throw new Error(`R2 respondeu ${r.status}`);
  const inicio = new Uint8Array(await r.arrayBuffer());
  const faixa = r.headers.get("content-range"); // "bytes 0-31/123456"
  const tamanho = faixa ? Number(faixa.split("/")[1]) : Number(r.headers.get("content-length") ?? inicio.length);
  return { inicio, tamanho, tipo: r.headers.get("content-type") ?? "" };
}
