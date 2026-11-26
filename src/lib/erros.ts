/** Erro com mensagem já pronta para o usuário (em português). */
export class ErroApp extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ErroApp";
  }
}

export type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; erro: string };

const CODIGOS_COM_MENSAGEM = new Set(["EST01", "EST02", "EST03", "EST04"]);

/**
 * Converte qualquer erro numa mensagem segura. Mensagens das funções do banco
 * (códigos EST0x) já são escritas para o usuário; o resto vira texto genérico
 * — detalhes internos nunca chegam ao navegador.
 */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApp) return e.message;
  const erro = e as { code?: string; message?: string } | null;
  const codigo = erro?.code ?? "";
  const msg = erro?.message ?? "";

  if (CODIGOS_COM_MENSAGEM.has(codigo)) return msg;
  if (codigo === "42501") {
    return msg && !/permission denied|row-level security/i.test(msg) ? msg : "Você não tem permissão para esta ação.";
  }
  if (codigo === "23514" || codigo === "22P02" || codigo === "23502") return "Dados inválidos. Confira os campos.";
  if (codigo === "23505") return "Já existe um registro com esses dados.";
  if (codigo === "PGRST301" || codigo === "PGRST303" || /jwt/i.test(msg)) return "Sua sessão terminou. Entre novamente.";

  // Log só com o código (sem dados do usuário nem segredos)
  console.error("[erro]", codigo || (e instanceof Error ? e.name : "desconhecido"));
  return "Não foi possível concluir. Tente novamente.";
}

export function statusDeErro(e: unknown): number {
  if (e instanceof ErroApp) return e.status;
  const codigo = (e as { code?: string } | null)?.code;
  if (codigo === "42501") return 403;
  if (codigo === "EST02") return 404;
  if (codigo === "EST03") return 409;
  return 400;
}

/** Envolve uma Server Action: valida, executa e devolve { ok, dados | erro }. */
export async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    // redirect()/notFound() do Next precisam continuar subindo
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw e;
    }
    return { ok: false, erro: mensagemDeErro(e) };
  }
}
