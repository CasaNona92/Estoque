import "server-only";

/** IP do cliente atrás do Cloudflare ou da Vercel (usado só no limite de tentativas de login). */
export function obterIp(h: Headers): string {
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido";
  return ip.slice(0, 64);
}
