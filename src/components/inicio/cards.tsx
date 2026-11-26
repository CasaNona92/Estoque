"use client";

import { HistoryIcon, TrendingUpIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BolinhaCor } from "@/components/estoque";
import { FotoR2 } from "@/components/foto";
import { Badge, Card, CardCabecalho, CardConteudo, CardTitulo, EstadoVazio, Skeleton } from "@/components/ui/basicos";
import { formatarNumero, formatarQuando } from "@/lib/formatacao";
import { cn } from "@/lib/utils";

export type Baixa = {
  movimentacao_id: string;
  produto_id: string;
  produto_nome: string;
  cor_id: string;
  nome_cor: string;
  cor_hex: string;
  quantidade: number;
  cliente_nome: string | null;
  criado_em: string;
  usuario_nome: string | null;
  desfeita: boolean;
};

export type Vendido = { produto_id: string; codigo: string; nome: string; quantidade: number; foto: string | null };

export function CardHistoricoBaixas({ baixas }: { baixas: Baixa[] }) {
  return (
    <Card>
      <CardCabecalho>
        <CardTitulo className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-accent" /> Histórico de Baixas
        </CardTitulo>
        <Link href="/historico?tipo=baixa" className="text-accent-texto text-sm hover:underline">
          Ver tudo
        </Link>
      </CardCabecalho>
      <CardConteudo className="px-2 pb-2">
        {baixas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma baixa ainda" descricao="As vendas registradas aparecem aqui." className="py-8" />
        ) : (
          <ul>
            {baixas.map((b) => (
              <li key={b.movimentacao_id}>
                <Link
                  href={`/produtos/${b.produto_id}?cor=${b.cor_id}`}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/70",
                    b.desfeita && "opacity-55",
                  )}
                >
                  <BolinhaCor hex={b.cor_hex} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{b.produto_nome}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {b.nome_cor}
                      {b.cliente_nome ? ` · ${b.cliente_nome}` : ""}
                    </p>
                  </div>
                  {b.desfeita ? (
                    <Badge variant="neutro">
                      <Undo2Icon className="size-3" /> desfeita
                    </Badge>
                  ) : (
                    <span className="font-semibold text-sm tabular">−{formatarNumero(b.quantidade)}</span>
                  )}
                  <span className="w-16 shrink-0 text-right text-muted-foreground text-xs tabular sm:w-24">{formatarQuando(b.criado_em)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardConteudo>
    </Card>
  );
}

const PERIODOS = [7, 30, 90] as const;

export function CardMaisVendidos({ inicial }: { inicial: Vendido[] }) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [itens, setItens] = useState(inicial);
  const [carregando, setCarregando] = useState(false);

  async function trocar(d: (typeof PERIODOS)[number]) {
    setDias(d);
    setCarregando(true);
    try {
      const r = await fetch(`/api/mais-vendidos?dias=${d}`);
      if (r.ok) setItens((await r.json()).itens);
    } finally {
      setCarregando(false);
    }
  }

  const maximo = Math.max(1, ...itens.map((i) => i.quantidade));

  return (
    <Card>
      <CardCabecalho>
        <CardTitulo className="flex items-center gap-2">
          <TrendingUpIcon className="size-4 text-accent" /> Mais Vendidos
        </CardTitulo>
        <div role="radiogroup" aria-label="Período" className="flex rounded-xl bg-muted p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={dias === p}
              onClick={() => trocar(p)}
              className={cn(
                "h-9 min-w-12 rounded-lg px-2.5 font-medium text-muted-foreground text-xs transition",
                dias === p && "bg-card text-foreground shadow-suave",
              )}
            >
              {p} dias
            </button>
          ))}
        </div>
      </CardCabecalho>
      <CardConteudo className="px-2 pb-2">
        {carregando ? (
          <div className="space-y-2 px-3 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : itens.length === 0 ? (
          <EstadoVazio titulo="Sem vendas no período" className="py-8" />
        ) : (
          <ol>
            {itens.map((v, i) => (
              <li key={v.produto_id}>
                <Link
                  href={`/produtos/${v.produto_id}`}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-1.5 transition-colors hover:bg-muted/70"
                >
                  <span className="w-5 text-center font-semibold text-muted-foreground text-xs tabular">{i + 1}</span>
                  <FotoR2 url={v.foto} alt="" className="size-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{v.nome}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${(v.quantidade / maximo) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-14 text-right font-semibold text-sm tabular">
                    {formatarNumero(v.quantidade)}
                    <span className="ml-0.5 font-normal text-muted-foreground text-xs">un.</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardConteudo>
    </Card>
  );
}
