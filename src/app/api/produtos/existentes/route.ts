import type { NextRequest } from "next/server";
import { z } from "zod";
import { responder } from "@/lib/api";
import { autorizar } from "@/lib/auth";
import { ErroApp } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { REGEX_CODIGO } from "@/lib/validacao";

const esquema = z.object({ codigos: z.array(z.string().regex(REGEX_CODIGO)).min(1).max(200) });

/** Para a pré-visualização da importação e das fotos em lote: quais códigos (e cores) já existem. */
export async function POST(req: NextRequest) {
  return responder(async () => {
    await autorizar("entrada");
    const r = esquema.safeParse(await req.json().catch(() => null));
    if (!r.success) throw new ErroApp("Pedido inválido.");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("produtos")
      .select("id, codigo, produto_cores(id, nome_cor)")
      .in("codigo", [...new Set(r.data.codigos)]);
    if (error) throw error;
    return {
      produtos: Object.fromEntries(
        (data ?? []).map((p) => [p.codigo, { id: p.id, cores: (p.produto_cores ?? []) as Array<{ id: string; nome_cor: string }> }]),
      ),
    };
  });
}
