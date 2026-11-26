import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do SERVIDOR. Nenhuma tem prefixo NEXT_PUBLIC_, então nunca
 * vão para o bundle do navegador. Na Vercel: Project → Settings → Environment Variables.
 * No Cloudflare: `npx wrangler secret put NOME`.
 */
const esquema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/, "R2_ACCOUNT_ID deve ter 32 caracteres hexadecimais"),
  R2_ACCESS_KEY_ID: z.string().min(16),
  R2_SECRET_ACCESS_KEY: z.string().min(32),
  R2_BUCKET: z.string().min(3),
  // Código secreto para criar o PRIMEIRO administrador (tela /primeiro-acesso). Pode apagar depois.
  CODIGO_INSTALACAO: z.string().min(12).optional(),
  // Domínio usado para funcionários sem e-mail (eles entram pelo nome de usuário)
  DOMINIO_EMAIL_INTERNO: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).default("casadanona.local"),
});

export type Env = z.infer<typeof esquema>;

let cache: Env | null = null;

export function env(): Env {
  if (cache) return cache;
  const r = esquema.safeParse(process.env);
  if (!r.success) {
    // Só o NOME das variáveis vai para o log, nunca o valor.
    const faltando = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração do servidor incompleta: ${faltando}. Veja o README (variáveis de ambiente).`);
  }
  cache = r.data;
  return cache;
}
