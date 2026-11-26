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
    <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-suave">
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
  );
}
