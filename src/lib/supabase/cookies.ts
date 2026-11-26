/**
 * Os cookies de sessão do Supabase ficam httpOnly: o navegador não usa o cliente
 * Supabase (todo acesso a dados passa pelo servidor), então nenhum script da página
 * consegue ler o token.
 */
export const opcoesCookieSessao = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
