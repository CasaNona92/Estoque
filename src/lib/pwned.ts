import "server-only";

/**
 * Consulta a "Pwned Passwords" por k-anonymity: só os 5 primeiros caracteres do
 * SHA-1 saem do servidor; a senha (e o hash completo) nunca são enviados.
 * Se o serviço estiver fora do ar, não bloqueia (fail-open) — a regra de tamanho continua valendo.
 */
export async function senhaVazada(senha: string): Promise<boolean> {
  const dados = new TextEncoder().encode(senha);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", dados)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefixo = hash.slice(0, 5);
  const sufixo = hash.slice(5);
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true", "User-Agent": "estoque-interno" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return false;
    const texto = await r.text();
    return texto.split("\n").some((linha) => {
      const [suf, qtd] = linha.trim().split(":");
      return suf === sufixo && Number(qtd) > 0;
    });
  } catch {
    return false;
  }
}
