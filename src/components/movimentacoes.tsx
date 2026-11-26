import { ArrowDownLeftIcon, ArrowUpRightIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { BolinhaCor } from "@/components/estoque";
import { EstadoVazio } from "@/components/ui/basicos";
import { formatarDataHora, formatarNumero } from "@/lib/formatacao";
import type { Movimentacao, TipoMovimentacao } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const ROTULOS: Record<TipoMovimentacao, { texto: string; icone: typeof ArrowUpRightIcon; cor: string }> = {
  entrada: { texto: "Entrada", icone: ArrowDownLeftIcon, cor: "text-sucesso bg-sucesso-suave" },
  baixa: { texto: "Baixa", icone: ArrowUpRightIcon, cor: "text-accent-texto bg-accent-suave" },
  ajuste: { texto: "Ajuste", icone: SlidersHorizontalIcon, cor: "text-alerta bg-alerta-suave" },
  estorno: { texto: "Estorno", icone: RotateCcwIcon, cor: "text-muted-foreground bg-muted" },
};

export function TabelaMovimentacoes({ movimentacoes, semProduto = false }: { movimentacoes: Movimentacao[]; semProduto?: boolean }) {
  if (movimentacoes.length === 0) {
    return <EstadoVazio titulo="Nenhuma movimentação" descricao="Entradas, baixas e ajustes aparecem aqui." />;
  }
  return (
    <>
    {/* Celular: um cartão por movimentação, sem rolagem para o lado */}
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-suave md:hidden">
      {movimentacoes.map((m) => {
        const r = ROTULOS[m.tipo];
        const Icone = r.icone;
        return (
          <li key={m.id} className="space-y-1.5 px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs", r.cor)}>
                <Icone className="size-3" /> {r.texto}
              </span>
              <span className="text-muted-foreground text-xs tabular">{formatarDataHora(m.criado_em)}</span>
              <span className={cn("ml-auto font-semibold tabular", m.quantidade > 0 ? "text-sucesso" : "text-foreground")}>
                {m.quantidade > 0 ? "+" : "−"}
                {formatarNumero(Math.abs(m.quantidade))}
              </span>
            </div>
            {!semProduto && m.produto ? (
              <Link href={`/produtos/${m.produto.id}`} className="block truncate font-medium hover:underline">
                {m.produto.nome}
              </Link>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
              {m.cor ? (
                <span className="inline-flex items-center gap-1.5">
                  <BolinhaCor hex={m.cor.cor_hex} />
                  {m.cor.nome_cor}
                </span>
              ) : null}
              <span className="tabular">
                Estoque {formatarNumero(m.estoque_antes)} → <span className="text-foreground">{formatarNumero(m.estoque_depois)}</span>
              </span>
              <span>{m.usuario?.nome ?? "Sistema"}</span>
            </div>
            {m.cliente_nome || m.observacao ? <p className="truncate text-xs">{m.cliente_nome ?? m.observacao}</p> : null}
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-suave md:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-border border-b text-left text-muted-foreground text-xs">
          <tr>
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            {!semProduto && <th className="px-4 py-3 font-medium">Produto</th>}
            <th className="px-4 py-3 font-medium">Cor</th>
            <th className="px-4 py-3 text-right font-medium">Qtd.</th>
            <th className="px-4 py-3 text-right font-medium">Estoque</th>
            <th className="px-4 py-3 font-medium">Cliente / observação</th>
            <th className="px-4 py-3 font-medium">Usuário</th>
          </tr>
        </thead>
        <tbody>
          {movimentacoes.map((m) => {
            const r = ROTULOS[m.tipo];
            const Icone = r.icone;
            return (
              <tr key={m.id} className="border-border/60 border-b last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular">{formatarDataHora(m.criado_em)}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs", r.cor)}>
                    <Icone className="size-3" /> {r.texto}
                  </span>
                </td>
                {!semProduto && (
                  <td className="max-w-56 truncate px-4 py-3">
                    {m.produto ? (
                      <Link href={`/produtos/${m.produto.id}`} className="hover:underline">
                        {m.produto.nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    {m.cor ? <BolinhaCor hex={m.cor.cor_hex} /> : null}
                    {m.cor?.nome_cor ?? "—"}
                  </span>
                </td>
                <td className={cn("px-4 py-3 text-right font-semibold tabular", m.quantidade > 0 ? "text-sucesso" : "text-foreground")}>
                  {m.quantidade > 0 ? "+" : "−"}
                  {formatarNumero(Math.abs(m.quantidade))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground tabular">
                  {formatarNumero(m.estoque_antes)} → <span className="text-foreground">{formatarNumero(m.estoque_depois)}</span>
                </td>
                <td className="max-w-64 truncate px-4 py-3" title={m.observacao ?? undefined}>
                  {m.cliente_nome ?? m.observacao ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{m.usuario?.nome ?? "Sistema"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
