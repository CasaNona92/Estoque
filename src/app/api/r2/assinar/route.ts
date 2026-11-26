import type { NextRequest } from "next/server";
import { z } from "zod";
import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { assinarVarias, expiracaoLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const CHAVE = /^(produtos\/[0-9a-f-]{36}\/[0-9a-f-]{36}(_thumb)?\.webp|notas\/[0-9a-f-]{36}\.(xml|pdf))$/;
const esquema = z.object({ chaves: z.array(z.string().regex(CHAVE)).min(1).max(200) });

/**
 * Renova URLs de leitura. Só assina chaves que existem no banco E que o usuário pode ver
 * pela RLS (fotos de produtos ativos; notas só para quem dá entrada) — nada de assinar
 * qualquer caminho que o navegador mandar.
 */
export async function POST(req: NextRequest) {
  return responder(async () => {
    await autorizar("usuario");
    const r = esquema.safeParse(await req.json().catch(() => null));
    if (!r.success) throw new ErroApp("Pedido inválido.");
    const chaves = [...new Set(r.data.chaves)];
    const lista = chaves.map((c) => `"${c}"`).join(",");
    const supabase = await criarClienteServidor();

    const permitidas = new Set<string>();
    const fotos = chaves.filter((c) => c.startsWith("produtos/"));
    if (fotos.length) {
      const { data, error } = await supabase
        .from("produto_fotos")
        .select("chave_r2, chave_r2_thumb")
        .or(`chave_r2.in.(${lista}),chave_r2_thumb.in.(${lista})`);
      if (error) throw error;
      for (const f of data ?? []) {
        permitidas.add(f.chave_r2);
        permitidas.add(f.chave_r2_thumb);
      }
    }
    const notas = chaves.filter((c) => c.startsWith("notas/"));
    if (notas.length) {
      const { data } = await supabase.from("notas_entrada").select("chave_r2_arquivo").in("chave_r2_arquivo", notas);
      for (const n of data ?? []) if (n.chave_r2_arquivo) permitidas.add(n.chave_r2_arquivo);
    }

    const urls = await assinarVarias(chaves.filter((c) => permitidas.has(c)));
    return { urls, expira: expiracaoLeitura() };
  });
}
