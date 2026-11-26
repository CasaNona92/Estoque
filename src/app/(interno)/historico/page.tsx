import Link from "next/link";
import { TabelaMovimentacoes } from "@/components/movimentacoes";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/campos";
import { exigirSessao } from "@/lib/auth";
import { listarMovimentacoes } from "@/lib/dados/movimentacoes";
import { formatarNumero } from "@/lib/formatacao";
import type { TipoMovimentacao } from "@/lib/tipos";
import { ehUuid } from "@/lib/utils";

export const metadata = { title: "Histórico" };

const TIPOS = ["entrada", "baixa", "ajuste", "estorno"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function PaginaHistorico({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; de?: string; ate?: string; produto?: string; pagina?: string }>;
}) {
  await exigirSessao();
  const sp = await searchParams;
  const filtros = {
    tipo: sp.tipo && TIPOS.includes(sp.tipo) ? (sp.tipo as TipoMovimentacao) : null,
    de: sp.de && DATA.test(sp.de) ? sp.de : null,
    ate: sp.ate && DATA.test(sp.ate) ? sp.ate : null,
    produtoId: ehUuid(sp.produto) ? sp.produto : null,
    pagina: Math.max(0, Number.parseInt(sp.pagina ?? "0", 10) || 0),
    porPagina: 50,
  };
  const { movimentacoes, total, pagina, porPagina } = await listarMovimentacoes(filtros);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const link = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ tipo: filtros.tipo, de: filtros.de, ate: filtros.ate, produto: filtros.produtoId })) if (v) qs.set(k, v);
    qs.set("pagina", String(p));
    return `/historico?${qs}`;
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 md:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Histórico</h1>
          <p className="text-muted-foreground text-sm">{formatarNumero(total)} movimentação(ões) de estoque</p>
        </div>
        <form className="flex w-full flex-wrap items-end gap-2 sm:w-auto" method="get">
          {filtros.produtoId && <input type="hidden" name="produto" value={filtros.produtoId} />}
          <label className="grid min-w-0 flex-1 gap-1 text-muted-foreground text-xs sm:flex-none">
            Tipo
            <Select name="tipo" defaultValue={filtros.tipo ?? ""} className="w-full sm:w-40">
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="baixa">Baixas</option>
              <option value="ajuste">Ajustes</option>
              <option value="estorno">Estornos</option>
            </Select>
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-muted-foreground text-xs sm:flex-none">
            De
            <Input type="date" name="de" defaultValue={filtros.de ?? ""} className="w-full sm:w-40" />
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-muted-foreground text-xs sm:flex-none">
            Até
            <Input type="date" name="ate" defaultValue={filtros.ate ?? ""} className="w-full sm:w-40" />
          </label>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          {(filtros.tipo || filtros.de || filtros.ate || filtros.produtoId) && (
            <Button asChild variant="ghost">
              <Link href="/historico">Limpar</Link>
            </Button>
          )}
        </form>
      </div>
      <TabelaMovimentacoes movimentacoes={movimentacoes} />
      {paginas > 1 && (
        <nav className="flex items-center justify-end gap-2" aria-label="Páginas">
          {pagina > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(pagina - 1)}>Anterior</Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground text-sm">
            página {pagina + 1} de {paginas}
          </span>
          {pagina + 1 < paginas ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(pagina + 1)}>Próxima</Link>
            </Button>
          ) : null}
        </nav>
      )}
    </div>
  );
}
